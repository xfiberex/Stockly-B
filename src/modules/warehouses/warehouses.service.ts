import { prisma } from "@/shared/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "./warehouses.validator";

/**
 * T5-14 — los almacenes: las sucursales, bodegas o sitios que guardan stock por separado.
 *
 * No hay ruta que borre uno, y es a propósito: los movimientos, las órdenes y los conteos
 * apuntan a él, y su historia tiene que seguir diciendo dónde pasó cada cosa. Lo que deja de
 * usarse se **desactiva**.
 */

type Cifras = { products: number; units: number; costValue: number; unitsWithoutCost: number };

const SIN_CIFRAS: Cifras = { products: 0, units: 0, costValue: 0, unitsWithoutCost: 0 };

function noEncontrado(): HttpError {
    return new HttpError(404, "Almacén no encontrado", "WAREHOUSE_NOT_FOUND");
}

/** El nombre es único; el índice es quien decide, y aquí se traduce su error (como el SKU, T5-08). */
function traducirUnicidad(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "Ya existe un almacén con ese nombre", "WAREHOUSE_NAME_EXISTS");
    }
    throw error;
}

/**
 * Lo que guarda cada almacén, en una consulta para todos. Solo productos activos, como el
 * valor de inventario del panel; y a coste solo los que tienen coste: las unidades de los
 * que no lo tienen se cuentan aparte en vez de sumar cero sin decirlo (T5-02).
 */
async function cifrasPorAlmacen(): Promise<Map<string, Cifras>> {
    const filas = await prisma.$queryRaw<Array<Cifras & { warehouseId: string }>>`
        SELECT l."warehouseId",
               COUNT(*) FILTER (WHERE l.stock > 0)::int AS "products",
               COALESCE(SUM(l.stock), 0)::int AS "units",
               COALESCE(SUM(l.stock * p."costPrice") FILTER (WHERE p."costPrice" IS NOT NULL), 0)::float8 AS "costValue",
               COALESCE(SUM(l.stock) FILTER (WHERE p."costPrice" IS NULL), 0)::int AS "unitsWithoutCost"
        FROM stock_levels l
        JOIN products p ON p.id = l."productId"
        WHERE p."isActive" = true
        GROUP BY l."warehouseId"`;
    return new Map(filas.map(({ warehouseId, ...cifras }) => [warehouseId, cifras]));
}

export const warehousesService = {
    /**
     * Todos, sin paginar: son los locales de un negocio, no un catálogo, y de esta lista sale
     * el selector de almacén de cada formulario. El predeterminado va primero.
     *
     * **Sin cifras, a propósito.** La pide casi cada pantalla, y lo que guarda cada almacén
     * cuesta recorrer todos los niveles: eso es `getResumen`, que solo pide la suya.
     */
    async getAll() {
        return prisma.warehouse.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
    },

    /** Los mismos, con lo que guarda cada uno: la pantalla de almacenes. */
    async getResumen() {
        const [almacenes, cifras] = await Promise.all([warehousesService.getAll(), cifrasPorAlmacen()]);
        return almacenes.map((a) => ({ ...a, ...(cifras.get(a.id) ?? SIN_CIFRAS) }));
    },

    async getById(id: string) {
        const almacen = await prisma.warehouse.findUnique({ where: { id } });
        if (!almacen) throw noEncontrado();
        return almacen;
    },

    /** Uno nuevo nace activo, vacío y sin ser el predeterminado. */
    async create(dto: CreateWarehouseInput) {
        return prisma.warehouse
            .create({ data: { name: dto.name, address: dto.address || null } })
            .catch(traducirUnicidad);
    },

    async update(id: string, dto: UpdateWarehouseInput) {
        await warehousesService.getById(id);
        return prisma.warehouse
            .update({
                where: { id },
                data: {
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.address !== undefined && { address: dto.address || null }),
                },
            })
            .catch(traducirUnicidad);
    },

    /**
     * Cambia el predeterminado: pone la marca en este y la quita de los demás **en una sola
     * sentencia**, así que no hay instante con dos predeterminados ni con ninguno.
     *
     * **Y con un bloqueo consultivo, porque la sentencia sola no basta.** Dos cambios a la vez
     * —uno hacia A y otro hacia C, siendo B el actual— ven los dos la misma foto: cada uno
     * quita la marca de B y se la pone al suyo, y ninguno toca el del otro. Acababan A y C
     * marcados; lo cazó el test de veinte cambios simultáneos. Puestos en fila, el segundo ve
     * lo que dejó el primero.
     */
    async hacerPredeterminado(id: string) {
        const almacen = await warehousesService.getById(id);
        if (!almacen.isActive) {
            throw new HttpError(409, `El almacén «${almacen.name}» está desactivado`, "WAREHOUSE_INACTIVE", { almacen: almacen.name });
        }

        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('warehouses:predeterminado'))`;
            await tx.$executeRaw`
                UPDATE warehouses SET "isDefault" = (id = ${id}), "updatedAt" = NOW() AT TIME ZONE 'UTC'
                WHERE "isDefault" <> (id = ${id})`;
        });
        return warehousesService.getById(id);
    },

    async activar(id: string) {
        await warehousesService.getById(id);
        return prisma.warehouse.update({ where: { id }, data: { isActive: true } });
    },

    /**
     * Desactiva un almacén: deja de admitir operaciones nuevas y sale de los selectores. Tres
     * cosas lo impiden, y las tres por lo mismo —algo se quedaría sin sitio—:
     *
     * - es el predeterminado: lo que no diga almacén no tendría adónde ir;
     * - le quedan existencias: seguirían en el total del producto sin poderse vender ni mover;
     * - tiene ventas pendientes, compras por recibir o conteos abiertos: no se podrían terminar.
     */
    async desactivar(id: string) {
        const almacen = await warehousesService.getById(id);
        if (almacen.isDefault) {
            throw new HttpError(409, "El almacén predeterminado no se puede desactivar: elige antes otro", "DEFAULT_WAREHOUSE_REQUIRED");
        }

        const [existencias, ventas, compras, conteos] = await Promise.all([
            prisma.stockLevel.aggregate({ where: { warehouseId: id }, _sum: { stock: true } }),
            prisma.saleOrder.count({ where: { warehouseId: id, status: "PENDING" } }),
            prisma.purchaseOrder.count({ where: { warehouseId: id, status: { in: ["PENDING", "PARTIALLY_RECEIVED"] } } }),
            prisma.inventoryCount.count({ where: { warehouseId: id, status: "OPEN" } }),
        ]);

        const unidades = existencias._sum.stock ?? 0;
        if (unidades !== 0) {
            throw new HttpError(
                409,
                `«${almacen.name}» todavía guarda ${unidades} unidades: transfiérelas antes de desactivarlo`,
                "WAREHOUSE_NOT_EMPTY",
                { almacen: almacen.name, unidades },
            );
        }
        if (ventas + compras + conteos > 0) {
            throw new HttpError(
                409,
                `«${almacen.name}» tiene ${ventas} ventas pendientes, ${compras} compras por recibir y ${conteos} conteos abiertos`,
                "WAREHOUSE_HAS_PENDING",
                { almacen: almacen.name, ventas, compras, conteos },
            );
        }

        return prisma.warehouse.update({ where: { id }, data: { isActive: false } });
    },
};
