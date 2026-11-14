import { prisma } from "@/shared/lib/prisma";
import { parsePagination } from "@/shared/lib/pagination";
import { $Enums, type Prisma } from "@/generated/prisma/client";
import { filtroDeEnum } from "@/shared/lib/enums";
import { rangoDeDias } from "@/shared/lib/diasDelNegocio";
import { TAM_LOTE_EXPORTACION } from "@/shared/lib/exportacion";
import { escribirNumeroDeVenta } from "@/contratos/api";
import { settingsService } from "@/modules/settings/settings.service";

// T3-02 — los valores viven en `schema.prisma` y se importan de ahí. Antes se declaraban
// aquí como uniones y en la base como `String`: dos listas sin nada que las obligara a
// coincidir, y ningún error si dejaban de hacerlo. Ahora añadir una acción es tocar el
// enum y migrar; olvidarlo lo detecta `tsc`, no la producción.
//
// (`REFRESH_REUSE`, de T2-31, es el único que no lo provoca una acción del usuario sino
// una anomalía; por eso se registra sin actor conocido.)
export type AuditAction = $Enums.AuditAction;
export type AuditEntity = $Enums.AuditEntity;

export interface AuditContext {
    userId?: string;
    userEmail?: string;
}

/** Los filtros del listado y de la exportación: los mismos en los dos. */
export interface ConsultaDeAuditoria {
    page?: string;
    limit?: string;
    entity?: string;
    action?: string;
    userId?: string;
    from?: string;
    to?: string;
}

type Fila = { entity: AuditEntity; entityId: string | null; details: Prisma.JsonValue | null };

const clave = (entity: AuditEntity, id: string) => `${entity}:${id}`;

/**
 * AUD-017 — el nombre legible de cada entidad: el producto, la persona, el número de venta.
 *
 * La bitácora decía «Usuario #8652010f»: para saber sobre quién se actuó había que copiar el id
 * y buscarlo. Se resuelve **al leer**, con una consulta por tipo de entidad (no una por fila), así
 * que dice el nombre de ahora: un producto renombrado se lee con su nombre actual.
 *
 * Lo que ya no existe —clientes, compras y ventas se borran de verdad— no se puede leer: para
 * esos, el controlador guarda la etiqueta en `details.label` **antes** de borrar (ver
 * `etiquetaDe`), y aquí se usa como respaldo, junto al `name` o el `email` que ya guardaban
 * algunas acciones.
 */
async function etiquetasActuales(filas: Fila[]): Promise<Map<string, string>> {
    const ids = new Map<AuditEntity, Set<string>>();
    for (const { entity, entityId } of filas) {
        if (!entityId) continue;
        if (!ids.has(entity)) ids.set(entity, new Set());
        ids.get(entity)!.add(entityId);
    }
    const de = (entity: AuditEntity) => ({ in: [...(ids.get(entity) ?? [])] });
    const hay = (entity: AuditEntity) => (ids.get(entity)?.size ?? 0) > 0;

    const etiquetas = new Map<string, string>();
    const poner = (entity: AuditEntity, pares: Array<[string, string]>) => {
        for (const [id, texto] of pares) etiquetas.set(clave(entity, id), texto);
    };
    const porNombre = async (
        entity: AuditEntity,
        buscar: (where: { id: { in: string[] } }) => Promise<Array<{ id: string; name: string }>>,
    ) => {
        if (hay(entity)) poner(entity, (await buscar({ id: de(entity) })).map((f) => [f.id, f.name]));
    };

    const sel = { id: true, name: true } as const;
    await Promise.all([
        porNombre("Product", (where) => prisma.product.findMany({ where, select: sel })),
        porNombre("Customer", (where) => prisma.customer.findMany({ where, select: sel })),
        porNombre("Warehouse", (where) => prisma.warehouse.findMany({ where, select: sel })),
        porNombre("Tag", (where) => prisma.tag.findMany({ where, select: sel })),
        porNombre("Category", (where) => prisma.category.findMany({ where, select: sel })),
        porNombre("Brand", (where) => prisma.brand.findMany({ where, select: sel })),
        porNombre("Supplier", (where) => prisma.supplier.findMany({ where, select: sel })),
        hay("User") &&
            prisma.user
                .findMany({ where: { id: de("User") }, select: { id: true, name: true, email: true } })
                .then((us) => poner("User", us.map((u) => [u.id, u.name || u.email]))),
        hay("SaleOrder") &&
            prisma.saleOrder
                .findMany({ where: { id: de("SaleOrder") }, select: { id: true, number: true } })
                .then((os) => poner("SaleOrder", os.map((o) => [o.id, escribirNumeroDeVenta(o.number)]))),
        // Las compras no tienen número: se nombran por su proveedor, que es como se buscan.
        hay("PurchaseOrder") &&
            prisma.purchaseOrder
                .findMany({ where: { id: de("PurchaseOrder") }, select: { id: true, supplier: { select: { name: true } } } })
                .then((os) => poner("PurchaseOrder", os.flatMap((o) => (o.supplier ? [[o.id, o.supplier.name] as [string, string]] : [])))),
        hay("InventoryCount") &&
            prisma.inventoryCount
                .findMany({
                    where: { id: de("InventoryCount") },
                    select: { id: true, warehouse: { select: { name: true } }, category: { select: { name: true } } },
                })
                .then((cs) => poner("InventoryCount", cs.map((c) => [c.id, c.category ? `${c.warehouse.name} · ${c.category.name}` : c.warehouse.name]))),
        hay("StockTransfer") &&
            prisma.stockTransfer
                .findMany({
                    where: { id: de("StockTransfer") },
                    select: { id: true, fromWarehouse: { select: { name: true } }, toWarehouse: { select: { name: true } } },
                })
                .then((ts) => poner("StockTransfer", ts.map((t) => [t.id, `${t.fromWarehouse.name} → ${t.toWarehouse.name}`]))),
    ]);
    return etiquetas;
}

/** Lo que la propia fila guardó al registrarse: la etiqueta de antes de borrar, o un nombre o un correo. */
function etiquetaGuardada(details: Prisma.JsonValue | null): string | null {
    if (!details || typeof details !== "object" || Array.isArray(details)) return null;
    for (const campo of ["label", "name", "email"]) {
        const valor = details[campo];
        if (typeof valor === "string" && valor) return valor;
    }
    return null;
}

/**
 * Cada fila con `entityLabel` (el nombre legible, o `null` si no hay ninguno) y `entityExists`
 * (si sigue existiendo: la interfaz solo enlaza lo que se puede abrir).
 */
async function conEtiquetas<T extends Fila>(filas: T[]): Promise<Array<T & { entityLabel: string | null; entityExists: boolean }>> {
    const actuales = await etiquetasActuales(filas);
    return filas.map((f) => {
        const actual = f.entityId ? actuales.get(clave(f.entity, f.entityId)) : undefined;
        return { ...f, entityLabel: actual ?? etiquetaGuardada(f.details), entityExists: actual !== undefined };
    });
}

async function filtros(query: ConsultaDeAuditoria): Promise<Prisma.AuditLogWhereInput> {
    const entity = filtroDeEnum($Enums.AuditEntity, query.entity, "entity");
    const action = filtroDeEnum($Enums.AuditAction, query.action, "action");
    // AUD-017 — un rango de días **del negocio**, como el de las ventas: el día 5 en Santo
    // Domingo no es el día 5 UTC.
    const creados = await rangoDeDias(query, await settingsService.zonaHoraria());
    return {
        ...(entity && { entity }),
        ...(action && { action }),
        ...(query.userId && { userId: query.userId }),
        ...(creados && { createdAt: creados }),
    };
}

export const auditService = {
    async log(
        ctx: AuditContext,
        action: AuditAction,
        entity: AuditEntity,
        entityId?: string,
        details?: Record<string, unknown>,
    ) {
        try {
            await prisma.auditLog.create({
                data: {
                    userId: ctx.userId ?? null,
                    userEmail: ctx.userEmail ?? null,
                    action,
                    entity,
                    entityId: entityId ?? null,
                    ...(details !== undefined && { details: details as Prisma.InputJsonObject }),
                },
            });
        } catch {
            // El registro de auditoría nunca debe romper el flujo principal
        }
    },

    /**
     * AUD-017 — la etiqueta de una entidad **antes de borrarla**, para guardarla en el registro
     * del borrado (`{ label }`). Después ya no hay de dónde leerla. Nunca falla: sin etiqueta, la
     * fila se lee como antes.
     */
    async etiquetaDe(entity: AuditEntity, entityId: string): Promise<{ label: string } | undefined> {
        try {
            const label = (await etiquetasActuales([{ entity, entityId, details: null }])).get(clave(entity, entityId));
            return label ? { label } : undefined;
        } catch {
            return undefined;
        }
    },

    async getAll(query: ConsultaDeAuditoria) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 50 });
        const where = await filtros(query);

        const [logs, total] = await prisma.$transaction([
            prisma.auditLog.findMany({ where, skip, take: limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
            prisma.auditLog.count({ where }),
        ]);

        return { data: await conEtiquetas(logs), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    },

    /**
     * AUD-017 — quién aparece en la bitácora, para el filtro por usuario. Sale de la propia
     * bitácora y no de `/users`: así están también las cuentas que ya no existen, por su correo,
     * y no salen las que nunca hicieron nada. El nombre es el de ahora, si la cuenta sigue.
     * Una fila por cuenta: es una lista corta —las personas del negocio—, no un listado que paginar.
     */
    async actores() {
        const grupos = await prisma.auditLog.groupBy({
            by: ["userId"],
            where: { userId: { not: null } },
            _max: { createdAt: true },
        });
        const ids = grupos.map((g) => g.userId!);
        const [usuarios, correos] = await Promise.all([
            prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }),
            // El último correo con el que firmó cada cuenta, para las que ya no existen.
            prisma.auditLog.findMany({
                where: { userId: { in: ids }, userEmail: { not: null } },
                distinct: ["userId"],
                orderBy: [{ userId: "asc" }, { createdAt: "desc" }],
                select: { userId: true, userEmail: true },
            }),
        ]);
        const porId = new Map(usuarios.map((u) => [u.id, u]));
        const correoDe = new Map(correos.map((c) => [c.userId!, c.userEmail!]));
        return ids
            .map((id) => {
                const u = porId.get(id);
                return { userId: id, name: u?.name ?? null, email: u?.email ?? correoDe.get(id) ?? null };
            })
            .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", "es"));
    },

    async contarParaExportar(query: ConsultaDeAuditoria) {
        return prisma.auditLog.count({ where: await filtros(query) });
    },

    /** AUD-017 — la exportación, por lotes (`enviarExportacion`) y con los filtros del listado. */
    async *exportarPorLotes(query: ConsultaDeAuditoria) {
        const where = await filtros(query);
        let cursor: string | undefined;
        for (;;) {
            const pagina = await prisma.auditLog.findMany({
                where,
                take: TAM_LOTE_EXPORTACION,
                ...(cursor && { cursor: { id: cursor }, skip: 1 }),
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            });
            if (pagina.length === 0) return;
            const filas = await conEtiquetas(pagina);
            yield filas.map((l) => ({
                createdAt: l.createdAt.toISOString(),
                action: l.action,
                entity: l.entity,
                entityId: l.entityId ?? "",
                entityLabel: l.entityLabel ?? "",
                userEmail: l.userEmail ?? "",
                details: l.details === null ? "" : JSON.stringify(l.details),
            }));
            cursor = pagina[pagina.length - 1]!.id;
        }
    },
};
