import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { parsePagination } from "@/shared/lib/pagination";
import { normalizarCorreo } from "@/shared/lib/correo";
import { Prisma } from "@/generated/prisma/client";
import type { CreateCustomerInput, UpdateCustomerInput } from "@/modules/customers/customers.validator";

/**
 * El índice único del correo es quien decide, no una consulta previa: entre «¿existe?» y
 * «créalo» otra petición puede adelantarse, y esa segunda acabaría en un 500 (ver
 * `traducirUnicidad` en `product.service.ts`, T5-08).
 */
function traducirUnicidad(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "Ya existe un cliente con ese email", "CUSTOMER_EMAIL_EXISTS");
    }
    throw error;
}

/** Vacío borra el campo (`null`); ausente no lo toca (`undefined`). */
function textoOpcional(valor: string | undefined): string | null | undefined {
    return valor === undefined ? undefined : valor.trim() || null;
}

async function existente(id: string) {
    const cliente = await prisma.customer.findUnique({ where: { id } });
    if (!cliente) throw new HttpError(404, "Cliente no encontrado", "CUSTOMER_NOT_FOUND");
    return cliente;
}

export const customersService = {
    /**
     * Paginado y por nombre. `search` busca en nombre, correo y teléfono: es lo que se tiene a
     * mano cuando el cliente llama o escribe.
     */
    async getAll(query: { page?: string; limit?: string; search?: unknown }) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });

        // Un `?search=` repetido llega como array: se ignora en vez de romper con un 500.
        const busqueda = typeof query.search === "string" ? query.search.trim() : "";
        const where: Prisma.CustomerWhereInput = busqueda
            ? {
                OR: [
                    { name: { contains: busqueda, mode: "insensitive" } },
                    // El correo está guardado en minúsculas: basta con bajar lo buscado.
                    { email: { contains: busqueda.toLowerCase() } },
                    { phone: { contains: busqueda } },
                ],
            }
            : {};

        const [clientes, total] = await prisma.$transaction([
            prisma.customer.findMany({
                where,
                skip,
                take: limit,
                // El desempate por `id` da un orden total: dos clientes con el mismo nombre no
                // pueden cambiar de página entre una consulta y la siguiente.
                orderBy: [{ name: "asc" }, { id: "asc" }],
                include: { _count: { select: { saleOrders: true } } },
            }),
            prisma.customer.count({ where }),
        ]);

        return {
            data: clientes.map(({ _count, ...cliente }) => ({ ...cliente, ordersCount: _count.saleOrders })),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    },

    /**
     * La ficha: el cliente y sus cifras. **El importe suma solo las órdenes enviadas**: una
     * pendiente todavía puede cancelarse y una cancelada no se cobró. Las órdenes en sí van por
     * `GET /sale-orders?customerId=`, paginadas.
     */
    async getById(id: string) {
        const cliente = await existente(id);

        const [porEstado, [ingresos]] = await Promise.all([
            prisma.saleOrder.groupBy({
                by: ["status"],
                where: { customerId: id },
                _count: { _all: true },
                _max: { createdAt: true },
            }),
            prisma.$queryRaw<Array<{ total: Prisma.Decimal | null }>>`
                SELECT SUM(i."quantity" * i."unitPrice") AS total
                FROM "sale_order_items" i
                JOIN "sale_orders" o ON o."id" = i."saleOrderId"
                WHERE o."customerId" = ${id} AND o."status" = 'SHIPPED'
            `,
        ]);

        const cuantas = (estado: string) => porEstado.find((g) => g.status === estado)?._count._all ?? 0;
        const fechas = porEstado.map((g) => g._max.createdAt).filter((f): f is Date => f !== null);

        return {
            ...cliente,
            summary: {
                orders: porEstado.reduce((n, g) => n + g._count._all, 0),
                pending: cuantas("PENDING"),
                shipped: cuantas("SHIPPED"),
                cancelled: cuantas("CANCELLED"),
                shippedRevenue: Math.round(Number(ingresos?.total ?? 0) * 100) / 100,
                lastOrderAt: fechas.length > 0 ? new Date(Math.max(...fechas.map((f) => f.getTime()))) : null,
            },
        };
    },

    async create(dto: CreateCustomerInput) {
        return prisma.customer
            .create({
                data: {
                    name: dto.name,
                    email: normalizarCorreo(dto.email),
                    phone: textoOpcional(dto.phone) ?? null,
                    notes: textoOpcional(dto.notes) ?? null,
                },
            })
            .catch(traducirUnicidad);
    },

    /**
     * Editar el cliente **no reescribe sus órdenes**: cada una guarda a quién se vendió en el
     * momento de la venta, igual que el nombre del producto en sus ítems.
     */
    async update(id: string, dto: UpdateCustomerInput) {
        await existente(id);

        return prisma.customer
            .update({
                where: { id },
                data: {
                    name: dto.name,
                    ...(dto.email !== undefined && { email: normalizarCorreo(dto.email) }),
                    ...(dto.phone !== undefined && { phone: textoOpcional(dto.phone) }),
                    ...(dto.notes !== undefined && { notes: textoOpcional(dto.notes) }),
                },
            })
            .catch(traducirUnicidad);
    },

    /** Sus órdenes se quedan, sin cliente y con la instantánea de a quién se vendió (`SetNull`). */
    async delete(id: string) {
        await existente(id);
        await prisma.customer.delete({ where: { id } });
    },
};
