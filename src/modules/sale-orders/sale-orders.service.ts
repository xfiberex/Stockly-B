import { prisma } from "@/shared/lib/prisma";
import { $Enums } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { dispararAlertaStock, dispararAvisoDeVentaSinStock, type ProductoEnAlerta } from "@/shared/lib/stockAlerts";
import { parsePagination } from "@/shared/lib/pagination";
import { TAM_LOTE_EXPORTACION } from "@/shared/lib/exportacion";
import { filtroDeEnum } from "@/shared/lib/enums";
import { comprometidoPorProducto } from "@/shared/lib/stockComprometido";
import { normalizarCorreo } from "@/shared/lib/correo";
import { rangoDeDias } from "@/shared/lib/diasDelNegocio";
import { numeroDeVentaDelFiltro, siguienteNumeroDeVenta } from "@/shared/lib/numeroDeVenta";
import { escribirNumeroDeVenta, tieneComprobante } from "@/contratos/api";
import { conTotales, totalesDeLinea } from "@/shared/lib/totalesDeVenta";
import { settingsService } from "@/modules/settings/settings.service";
import { Prisma } from "@/generated/prisma/client";
import type { CounterSaleDto, CreateSaleOrderDto, UpdateSaleOrderDto } from "./sale-orders.types";

const ORDER_INCLUDE = {
    items: {
        include: { product: { select: { id: true, name: true, sku: true } } },
    },
} as const;

// T3-02 — antes esto era `status in $Enums.SaleOrderStatus`, y la guarda tenía un agujero:
// los enums generados son objetos literales, así que heredan de `Object.prototype` y
// `"toString" in $Enums.SaleOrderStatus` devuelve **verdadero**. `?status=toString` pasaba
// el filtro, se casteaba a enum y reventaba dentro de Prisma con un 500. Reproducido antes
// de cambiarlo. `filtroDeEnum` usa `Object.hasOwn` y responde 400.
function parseStatusFilter(status?: string): $Enums.SaleOrderStatus | undefined {
    return filtroDeEnum($Enums.SaleOrderStatus, status, "status");
}

function clienteNoEncontrado(): HttpError {
    return new HttpError(404, "Cliente no encontrado", "CUSTOMER_NOT_FOUND");
}

/**
 * T5-06 — a qué cliente va una venta nueva.
 *
 * - Con `customerId`, a ese, que tiene que existir.
 * - Sin él, **por su correo normalizado**: al cliente que ya lo tiene, o a uno nuevo con el nombre
 *   y el teléfono de la venta. Es la misma regla con la que la migración agrupó las órdenes
 *   antiguas, así que el pasado y lo nuevo se agrupan igual, y quien llama a la API sin saber
 *   nada de clientes sigue viendo sus ventas juntas en la ficha.
 * - Sin correo, a nadie. **No se agrupa por nombre**: dos «Juan Pérez» no son la misma persona.
 */
async function clienteDeLaVenta(
    tx: Prisma.TransactionClient,
    dto: Pick<CreateSaleOrderDto, "customerId" | "customerName" | "customerEmail" | "customerPhone" | "customerDocument">,
) {
    if (dto.customerId) {
        const cliente = await tx.customer.findUnique({ where: { id: dto.customerId } });
        if (!cliente) throw clienteNoEncontrado();
        return cliente;
    }

    const email = normalizarCorreo(dto.customerEmail);
    if (!email) return null;

    return tx.customer.upsert({
        where: { email },
        update: {},
        create: {
            name: dto.customerName?.trim() || email,
            email,
            phone: dto.customerPhone?.trim() || null,
            // T6-06 — el cliente nace con el documento de la venta. Pero no se **busca** por él.
            document: dto.customerDocument?.trim() || null,
        },
    });
}

/** Cuánto se pide de cada producto, **sumando las líneas**: dos de 3 sobre 5 disponibles son 6. */
function pedidoPorProducto(items: Array<{ productId?: string; quantity: number }>): Map<string, number> {
    const pedido = new Map<string, number>();
    for (const item of items) {
        if (item.productId) pedido.set(item.productId, (pedido.get(item.productId) ?? 0) + item.quantity);
    }
    return pedido;
}

/**
 * T5-03 — la primera mitad de una venta: comprobar que cabe en lo **disponible**, stock menos
 * lo comprometido en ventas pendientes. La usan `create` y la venta de mostrador (T6-08).
 *
 * Se bloquean las filas de los productos **antes** de contar lo comprometido. Sin el bloqueo,
 * dos ventas simultáneas de las mismas unidades leerían el mismo disponible y pasarían las
 * dos. Ordenadas por id, para que dos ventas con productos en distinto orden no se esperen
 * mutuamente. El bloqueo dura lo que la transacción: lo que se lea aquí —el precio, el stock—
 * sigue siendo verdad cuando se escriba la orden.
 */
async function reservarDisponible(tx: Prisma.TransactionClient, pedido: Map<string, number>) {
    const ids = [...pedido.keys()].sort();
    if (ids.length === 0) return [];

    await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;

    const productos = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, stock: true, price: true, isActive: true },
    });
    const comprometido = await comprometidoPorProducto(ids, tx);

    for (const id of ids) {
        const producto = productos.find((p) => p.id === id);
        if (!producto) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

        const disponible = producto.stock - (comprometido.get(id) ?? 0);
        const requerido = pedido.get(id)!;
        if (requerido > disponible) {
            throw new HttpError(
                409,
                `No hay suficiente disponible de "${producto.name}". Disponible: ${Math.max(disponible, 0)}, requerido: ${requerido}`,
                "INSUFFICIENT_AVAILABLE_STOCK",
                { producto: producto.name, disponible: Math.max(disponible, 0), requerido },
            );
        }
    }
    return productos;
}

/**
 * La segunda mitad: **el envío**. Descuenta el stock, congela el coste, escribe un movimiento
 * por línea y deja la orden enviada. Vivía dentro de `update`; T6-08 la saca para que la venta
 * de mostrador haga exactamente lo mismo y no una copia.
 *
 * Tiene que correr dentro de una transacción: el decremento condicional (stock >= cantidad)
 * cierra la ventana entre «comprobar» y «descontar», y si cualquier ítem falla, todo se
 * revierte. Los productos que quedan en su mínimo o por debajo se apuntan en `bajoMinimos`,
 * para avisar **después** del `commit`.
 */
async function despachar(
    tx: Prisma.TransactionClient,
    orden: { id: string; number: number },
    opciones: { datos?: Prisma.SaleOrderUpdateInput; concepto: string; bajoMinimos: ProductoEnAlerta[] },
) {
    const items = await tx.saleOrderItem.findMany({
        where: { saleOrderId: orden.id, productId: { not: null } },
        include: { product: true },
    });

    for (const item of items) {
        if (!item.productId || !item.product) continue;

        const res = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
        });
        if (res.count === 0) {
            throw new HttpError(
                400,
                `Stock insuficiente para "${item.product.name}". Disponible: ${item.product.stock}, requerido: ${item.quantity}`,
                "INSUFFICIENT_STOCK",
                { producto: item.product.name, disponible: item.product.stock, requerido: item.quantity },
            );
        }

        const refreshed = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });

        // T5-02 — el coste se congela en el ítem **al enviar**, que es cuando la
        // mercancía sale. Se lee de `refreshed` y no del `include` de arriba: esa
        // lectura es anterior al `updateMany` que bloquea la fila, y entre las dos una
        // recepción podría haber cambiado el coste medio.
        await tx.saleOrderItem.update({ where: { id: item.id }, data: { unitCost: refreshed.costPrice } });

        await tx.stockMovement.create({
            data: {
                productId: item.productId,
                type: "OUT",
                delta: -item.quantity,
                stockAfter: refreshed.stock,
                note: `${opciones.concepto} #${escribirNumeroDeVenta(orden.number)}`,
            },
        });

        if (refreshed.stock <= item.product.minStock) {
            opciones.bajoMinimos.push({
                id: item.productId,
                name: item.product.name,
                stock: refreshed.stock,
                minStock: item.product.minStock,
            });
        }
    }

    return tx.saleOrder.update({
        where: { id: orden.id },
        data: { ...opciones.datos, status: "SHIPPED", shippedAt: new Date() },
        include: ORDER_INCLUDE,
    });
}

export const saleOrderService = {
    async getAll(query: { page?: string; limit?: string; status?: string; customerId?: unknown; number?: unknown; from?: unknown; to?: unknown }) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 10 });

        const statusFilter = parseStatusFilter(query.status);
        // T5-06 — el historial de la ficha del cliente. Un `customerId` repetido llega como array
        // y se ignora, como el `search` de clientes.
        const customerId = typeof query.customerId === "string" && query.customerId ? query.customerId : undefined;
        // T6-01 — `from` y `to` son días del negocio, por la fecha de creación. La zona solo se
        // lee si hay rango: el listado sin filtro sigue costando las dos consultas de siempre.
        // T6-04 — por número, exacto: `123` y `000123` son la misma venta. Se suma a los demás
        // filtros en vez de anularlos, así que en la ficha de un cliente solo encuentra las suyas.
        const number = numeroDeVentaDelFiltro(query.number);
        const hayRango = Boolean(query.from) || Boolean(query.to);
        const creadas = hayRango ? await rangoDeDias(query, await settingsService.zonaHoraria()) : undefined;
        const where = {
            ...(statusFilter && { status: statusFilter }),
            ...(customerId && { customerId }),
            ...(number !== undefined && { number }),
            ...(creadas && { createdAt: creadas }),
        };

        const [orders, total] = await prisma.$transaction([
            prisma.saleOrder.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, include: ORDER_INCLUDE }),
            prisma.saleOrder.count({ where }),
        ]);

        return { data: orders.map(conTotales), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    },

    async getById(id: string) {
        const order = await prisma.saleOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
        if (!order) throw new HttpError(404, "Orden de venta no encontrada", "SALE_ORDER_NOT_FOUND");
        return conTotales(order);
    },

    /**
     * T6-07 — la orden de la que se va a hacer el comprobante. Solo las enviadas lo tienen
     * (`tieneComprobante`, en el contrato): pedir el de una pendiente es 409, no 404 —la orden
     * existe, lo que no hay todavía es una venta—.
     */
    async paraComprobante(id: string) {
        const orden = await saleOrderService.getById(id);
        if (!tieneComprobante(orden)) {
            throw new HttpError(409, "La orden no se ha enviado: todavía no tiene comprobante", "SALE_ORDER_NOT_SHIPPED");
        }
        return orden;
    },

    /**
     * T5-03 — una venta no puede pedir más de lo **disponible**: stock menos lo comprometido
     * en ventas pendientes. Antes solo se comprobaba al enviar, así que se aceptaban dos
     * ventas por las mismas unidades y la segunda fallaba cuando ya se le había prometido al
     * cliente. La decisión de la ficha fue **bloquear**, no avisar: la interfaz lo dice
     * mientras se escribe la cantidad y aquí se rechaza con 409.
     *
     * El mismo producto en varias líneas **suma**: dos líneas de 3 sobre 5 disponibles son 6.
     */
    async create(dto: CreateSaleOrderDto, actorEmail?: string) {
        const pedido = pedidoPorProducto(dto.items);

        // T6-05 — la tasa vigente **ahora**, que se congela en cada línea como `unitPrice`. Los
        // importes no vienen en `dto`: se calculan al responder, de lo que queda guardado.
        const taxRate = await settingsService.tasaDeImpuesto();

        const orden = await prisma.$transaction(async (tx) => {
            await reservarDisponible(tx, pedido);

            const cliente = await clienteDeLaVenta(tx, dto);

            // T6-04 — lo último antes de crear, y dentro de la transacción: un 409 de más arriba
            // no llega aquí, y si algo falla después el incremento se deshace con todo lo demás.
            const number = await siguienteNumeroDeVenta(tx);

            return tx.saleOrder.create({
                data: {
                    number,
                    customerId: cliente?.id ?? null,
                    // La instantánea: lo que diga la venta y, si calla, lo que diga el cliente.
                    customerName: dto.customerName ?? cliente?.name,
                    customerEmail: dto.customerEmail ?? cliente?.email,
                    customerPhone: dto.customerPhone ?? cliente?.phone,
                    customerDocument: dto.customerDocument ?? cliente?.document,
                    // T6-06 — quién la registra, de la sesión. No viene en `dto`, y el `PATCH`
                    // no lo toca: quien edita una orden no pasa a ser quien la vendió.
                    createdByEmail: actorEmail ?? null,
                    notes: dto.notes,
                    items: {
                        create: dto.items.map((item) => ({
                            productId: item.productId ?? null,
                            productName: item.productName,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            taxRate,
                        })),
                    },
                },
                include: ORDER_INCLUDE,
            });
        });

        return conTotales(orden);
    },

    /**
     * T6-08 — la venta de mostrador: **creada y enviada en una sola transacción**. Es `create`
     * y el envío seguidos, con sus mismas dos mitades, y con dos diferencias que son la razón
     * de que exista:
     *
     * - **El precio y el nombre salen del producto, no de la petición.** Quien vende en el
     *   mostrador no fija precios: `dto` trae un producto y una cantidad por línea, y nada más.
     *   Se leen con la fila ya bloqueada, así que son los del instante de la venta.
     * - **Todas las líneas son del catálogo**, y de productos activos: un ítem escrito a mano
     *   no movería stock, y aquí vender es mover stock.
     *
     * Si algo falla —no hay disponible, el producto no existe—, no queda ni la orden, ni el
     * número gastado, ni el cliente que se hubiera creado por su correo.
     */
    async ventaDeMostrador(dto: CounterSaleDto, actorEmail?: string) {
        const pedido = pedidoPorProducto(dto.items);
        const taxRate = await settingsService.tasaDeImpuesto();
        const bajoMinimos: ProductoEnAlerta[] = [];

        const orden = await prisma.$transaction(async (tx) => {
            const productos = new Map((await reservarDisponible(tx, pedido)).map((p) => [p.id, p]));

            const inactivo = [...productos.values()].find((p) => !p.isActive);
            if (inactivo) {
                throw new HttpError(409, `"${inactivo.name}" está descatalogado y no se puede vender`, "INACTIVE_PRODUCT_SALE", {
                    producto: inactivo.name,
                });
            }

            const cliente = await clienteDeLaVenta(tx, dto);
            const number = await siguienteNumeroDeVenta(tx);

            const creada = await tx.saleOrder.create({
                data: {
                    number,
                    customerId: cliente?.id ?? null,
                    customerName: dto.customerName ?? cliente?.name,
                    customerEmail: dto.customerEmail ?? cliente?.email,
                    customerPhone: dto.customerPhone ?? cliente?.phone,
                    customerDocument: dto.customerDocument ?? cliente?.document,
                    createdByEmail: actorEmail ?? null,
                    items: {
                        create: dto.items.map((item) => {
                            const producto = productos.get(item.productId)!;
                            return {
                                productId: producto.id,
                                productName: producto.name,
                                quantity: item.quantity,
                                unitPrice: producto.price,
                                taxRate,
                            };
                        }),
                    },
                },
            });

            return despachar(tx, creada, { concepto: "Venta de mostrador", bajoMinimos });
        });

        // Después del `commit` y sin esperarlas, como en el envío.
        for (const producto of bajoMinimos) dispararAlertaStock(producto);

        return conTotales(orden);
    },

    /** `actorId` es quien hace el cambio: si el envío falla por stock, es a quien **no** se avisa (T5-12). */
    async update(id: string, dto: UpdateSaleOrderDto, actorId?: string) {
        const existing = await prisma.saleOrder.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Orden de venta no encontrada", "SALE_ORDER_NOT_FOUND");
        if (existing.status === "CANCELLED") throw new HttpError(400, "No se puede modificar una orden cancelada", "CANNOT_MODIFY_CANCELLED_ORDER");
        if (existing.status === "SHIPPED" && dto.status === "SHIPPED") {
            throw new HttpError(400, "La orden ya fue enviada", "ORDER_ALREADY_SHIPPED");
        }

        if (dto.customerId) {
            const cliente = await prisma.customer.findUnique({ where: { id: dto.customerId } });
            if (!cliente) throw clienteNoEncontrado();
        }

        const customerData = {
            // T5-06 — cambiar el vínculo no toca la instantánea: son dos cosas distintas.
            ...(dto.customerId !== undefined && { customerId: dto.customerId }),
            ...(dto.customerName !== undefined && { customerName: dto.customerName }),
            ...(dto.customerEmail !== undefined && { customerEmail: dto.customerEmail }),
            ...(dto.customerPhone !== undefined && { customerPhone: dto.customerPhone }),
            ...(dto.customerDocument !== undefined && { customerDocument: dto.customerDocument }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
        };

        const beingShipped = existing.status !== "SHIPPED" && dto.status === "SHIPPED";
        // Cancelar una orden ya enviada debe devolver al inventario lo que salió con ella.
        const beingCancelled = existing.status === "SHIPPED" && dto.status === "CANCELLED";

        // Sin envío ni cancelación de un envío: actualización simple de campos / estado.
        if (!beingShipped && !beingCancelled) {
            return conTotales(await prisma.saleOrder.update({
                where: { id },
                data: { ...customerData, ...(dto.status !== undefined && { status: dto.status }) },
                include: ORDER_INCLUDE,
            }));
        }

        // Cancelación de una orden enviada: reposición de stock, movimientos compensatorios
        // y cambio de estado en UNA sola transacción, simétrica al envío.
        if (beingCancelled) {
            const cancelada = await prisma.$transaction(async (tx) => {
                const items = await tx.saleOrderItem.findMany({
                    where: { saleOrderId: id, productId: { not: null } },
                });

                for (const item of items) {
                    if (!item.productId) continue;

                    const product = await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: { increment: item.quantity } },
                    });

                    await tx.stockMovement.create({
                        data: {
                            productId: item.productId,
                            type: "IN",
                            delta: item.quantity,
                            stockAfter: product.stock,
                            note: `Cancelación de orden de venta #${escribirNumeroDeVenta(existing.number)}`,
                        },
                    });
                }

                return tx.saleOrder.update({
                    where: { id },
                    data: { ...customerData, status: "CANCELLED" },
                    include: ORDER_INCLUDE,
                });
            });
            return conTotales(cancelada);
        }

        // Envío: verificación de stock, descuento, movimientos y cambio de estado ocurren
        // en UNA sola transacción (`despachar`).
        const lowStockTargets: ProductoEnAlerta[] = [];

        const updated = await prisma.$transaction((tx) =>
            despachar(tx, existing, { datos: customerData, concepto: "Orden de venta", bajoMinimos: lowStockTargets }),
        ).catch((error: unknown) => {
            // T5-12        }).catch((error: unknown) => {
            // T5-12 — fuera de la transacción, que ya se ha deshecho: un aviso creado dentro
            // se habría ido con ella. El error sigue su camino tal cual.
            if (error instanceof HttpError && error.code === "INSUFFICIENT_STOCK" && error.params) {
                dispararAvisoDeVentaSinStock(id, {
                    orderNumber: existing.number,
                    productName: String(error.params.producto),
                    available: Number(error.params.disponible),
                    required: Number(error.params.requerido),
                }, actorId);
            }
            throw error;
        });

        // Alertas best-effort, fuera de la transacción y **sin esperarlas** (T2-07):
        // aquí eran una por producto y en serie, así que enviar la orden costaba
        // tantas idas y vueltas al SMTP como productos bajaran de mínimo.
        for (const target of lowStockTargets) dispararAlertaStock(target);

        return conTotales(updated);
    },

    async delete(id: string) {
        const existing = await prisma.saleOrder.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Orden de venta no encontrada", "SALE_ORDER_NOT_FOUND");
        if (existing.status === "SHIPPED") throw new HttpError(400, "No se puede eliminar una orden ya enviada", "CANNOT_DELETE_SHIPPED_ORDER");

        await prisma.saleOrder.delete({ where: { id } });
    },

    /**
     * T2-05 — filas del archivo, que **no** son órdenes: cada línea de una orden es una
     * fila. Contar órdenes dejaría el tope de la exportación corto por un factor que
     * depende de cuántos productos lleve cada una.
     */
    async contarParaExportar() {
        return prisma.saleOrderItem.count();
    },

    /** Las órdenes en lotes, por cursor, aplanadas a una fila por línea (T2-05). */
    async *exportarPorLotes() {
        let cursor: string | undefined;

        for (;;) {
            const pagina = await prisma.saleOrder.findMany({
                take: TAM_LOTE_EXPORTACION,
                ...(cursor && { cursor: { id: cursor }, skip: 1 }),
                // El desempate por `id` da un orden total, que es lo que hace correcta
                // la paginación sin depender de que Postgres devuelva el mismo orden
                // arbitrario en cada página (ver el detalle en `product.service.ts`).
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                include: ORDER_INCLUDE,
            });

            if (pagina.length === 0) return;

            yield pagina.flatMap((o) =>
                o.items.map((item) => {
                    const linea = totalesDeLinea(item);
                    return {
                        // T6-04 — con sus ceros, como en pantalla. `orderId` se conserva: es lo que
                        // identifica la orden en la API.
                        orderNumber: escribirNumeroDeVenta(o.number),
                        orderId: o.id,
                        status: o.status,
                        customerName: o.customerName ?? "",
                        customerEmail: o.customerEmail ?? "",
                        customerDocument: o.customerDocument ?? "",
                        createdAt: o.createdAt.toISOString(),
                        createdByEmail: o.createdByEmail ?? "",
                        productName: item.productName,
                        quantity: item.quantity,
                        unitPrice: Number(item.unitPrice),
                        // `totalLine` sigue siendo cantidad × precio, **sin impuesto**: es la columna
                        // que ya había y quien la suma espera lo mismo que sumaba. T6-05 añade las
                        // tres de detrás; en las líneas sin tasa, la tasa va vacía y el impuesto es 0.
                        totalLine: linea.subtotal.toNumber(),
                        taxRate: item.taxRate === null ? "" : item.taxRate.toNumber(),
                        taxLine: linea.tax.toNumber(),
                        totalLineWithTax: linea.total.toNumber(),
                    };
                }),
            );

            if (pagina.length < TAM_LOTE_EXPORTACION) return;
            cursor = pagina[pagina.length - 1]!.id;
        }
    },
};
