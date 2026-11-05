import { prisma } from "@/shared/lib/prisma";
import { $Enums } from "@/generated/prisma/client";
import { HttpError } from "@/shared/lib/httpError";
import { dispararAlertaStock, dispararAvisoDeVentaSinStock, type ProductoEnAlerta } from "@/shared/lib/stockAlerts";
import { parsePagination } from "@/shared/lib/pagination";
import { TAM_LOTE_EXPORTACION } from "@/shared/lib/exportacion";
import { filtroDeEnum } from "@/shared/lib/enums";
import { comprometidoPorProducto } from "@/shared/lib/stockComprometido";
import { bloquearProductos, entrar, nivelesEn, sacar } from "@/shared/lib/stock";
import { almacenDelFiltro, almacenParaOperar } from "@/shared/lib/almacenes";
import { aDia, hoyDelNegocio } from "@/shared/lib/lotes";
import { normalizarCorreo } from "@/shared/lib/correo";
import { rangoDeDias } from "@/shared/lib/diasDelNegocio";
import { numeroDeVentaDelFiltro, siguienteNumeroDeVenta } from "@/shared/lib/numeroDeVenta";
import { escribirNumeroDeVenta, tieneComprobante } from "@/contratos/api";
import { conTotales, totalesDeLinea } from "@/shared/lib/totalesDeVenta";
import { settingsService } from "@/modules/settings/settings.service";
import { Prisma } from "@/generated/prisma/client";
import type { CounterSaleDto, CreateSaleOrderDto, UpdateSaleOrderDto } from "./sale-orders.types";

const ORDER_INCLUDE = {
    // T5-14 — de qué almacén sale: la interfaz lo nombra junto al número.
    warehouse: { select: { id: true, name: true } },
    items: {
        include: {
            product: { select: { id: true, name: true, sku: true } },
            // T5-15 — de qué lotes salió cada línea, del que caduca antes al que caduca después.
            lots: {
                include: { lot: { select: { id: true, code: true, expiresAt: true } } },
                orderBy: [{ lot: { expiresAt: "asc" } }, { lot: { code: "asc" } }],
            },
        },
    },
} satisfies Prisma.SaleOrderInclude;

type OrdenLeida = Prisma.SaleOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/**
 * La orden como la devuelve la API: con sus importes (`conTotales`) y con los lotes de cada
 * línea aplanados. **La caducidad sale como día** (`AAAA-MM-DD`), no como el instante en que
 * Prisma lee una columna `date`: ver `loteRefSchema`, en el contrato.
 */
function aRespuesta(orden: OrdenLeida) {
    const conImportes = conTotales(orden);
    return {
        ...conImportes,
        items: conImportes.items.map((item) => ({
            ...item,
            lots: item.lots.map((l) => ({
                id: l.lot.id,
                code: l.lot.code,
                expiresAt: aDia(l.lot.expiresAt),
                quantity: l.quantity,
            })),
        })),
    };
}

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

/**
 * AUD-005 — a qué estado puede pasar una venta desde cada uno. **Es el único sitio que lo dice.**
 *
 * Una enviada solo se cancela: volver a pendiente dejaría fuera del almacén unas unidades que
 * la orden ya no explica, y enviarla otra vez las descontaría dos veces. Una cancelada no va a
 * ninguna parte. Antes no había lista: `PATCH { status: "PENDING" }` sobre una enviada se
 * aceptaba y no devolvía nada.
 */
const TRANSICIONES: Record<$Enums.SaleOrderStatus, readonly $Enums.SaleOrderStatus[]> = {
    PENDING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["CANCELLED"],
    CANCELLED: [],
};

/**
 * Si se puede pasar de `desde` a `hasta`. Sin `hasta`, o pendiente a pendiente, no hay cambio
 * de estado: es una edición de datos. Los dos casos con código propio desde antes lo conservan,
 * porque la interfaz ya los traduce: lo cancelado no se toca, y lo enviado no se envía otra vez.
 */
function comprobarTransicion(desde: $Enums.SaleOrderStatus, hasta: $Enums.SaleOrderStatus | undefined) {
    if (desde === "CANCELLED") throw new HttpError(400, "No se puede modificar una orden cancelada", "CANNOT_MODIFY_CANCELLED_ORDER");
    if (hasta === undefined || (desde === "PENDING" && hasta === "PENDING")) return;
    if (desde === "SHIPPED" && hasta === "SHIPPED") throw new HttpError(400, "La orden ya fue enviada", "ORDER_ALREADY_SHIPPED");
    if (!TRANSICIONES[desde].includes(hasta)) {
        throw new HttpError(409, `Una orden ${desde} no puede pasar a ${hasta}`, "INVALID_STATUS_TRANSITION", { desde, hasta });
    }
}

/**
 * AUD-005 — la orden, **bloqueada** hasta el final de la transacción. Es lo primero que hace
 * todo lo que cambia su estado: sin esto, dos envíos simultáneos leían los dos «pendiente» y
 * descontaban el stock dos veces, y dos cancelaciones lo devolvían dos veces. Con él, el
 * segundo espera, lee lo que dejó el primero y lo rechaza. Como `bloquearOrden` en compras.
 */
async function bloquearVenta(tx: Prisma.TransactionClient, id: string) {
    const filas = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM sale_orders WHERE id = ${id} FOR UPDATE`;
    if (filas.length === 0) throw new HttpError(404, "Orden de venta no encontrada", "SALE_ORDER_NOT_FOUND");
    return tx.saleOrder.findUniqueOrThrow({ where: { id } });
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
 * T5-14 — las dos cifras son **las del almacén de la venta**: lo que hay en otro local no se
 * puede prometer desde este, y lo comprometido en otro no le resta nada a este.
 *
 * Se bloquean las filas de los productos **antes** de contar lo comprometido. Sin el bloqueo,
 * dos ventas simultáneas de las mismas unidades leerían el mismo disponible y pasarían las
 * dos. Ordenadas por id, para que dos ventas con productos en distinto orden no se esperen
 * mutuamente. El bloqueo dura lo que la transacción: lo que se lea aquí —el precio, el stock—
 * sigue siendo verdad cuando se escriba la orden.
 *
 * T5-15 — lo caducado a `hoy` **no está disponible**: sigue en el almacén, pero no se le puede
 * prometer a nadie.
 */
async function reservarDisponible(tx: Prisma.TransactionClient, pedido: Map<string, number>, warehouseId: string, hoy: string) {
    const ids = [...pedido.keys()].sort();
    if (ids.length === 0) return [];

    await bloquearProductos(tx, ids);

    const productos = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, price: true, isActive: true },
    });
    const enAlmacen = await nivelesEn(tx, warehouseId, ids, { vigentesA: hoy });
    const comprometido = await comprometidoPorProducto(ids, tx, warehouseId);

    for (const id of ids) {
        const producto = productos.find((p) => p.id === id);
        if (!producto) throw new HttpError(404, "Producto no encontrado", "PRODUCT_NOT_FOUND");

        const disponible = (enAlmacen.get(id) ?? 0) - (comprometido.get(id) ?? 0);
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
 *
 * T5-14 — sale **del almacén de la orden**, y «insuficiente» es que no lo hay en él, aunque
 * sobre en otro. El mínimo, en cambio, se mira contra el total: es del producto, no del local.
 *
 * T5-15 — sale **primero lo que caduca antes** (FEFO), y de lo caducado a `hoy` no sale nada:
 * si lo único que queda está vencido, es «stock insuficiente». De qué lotes salió cada línea
 * queda anotado en ella, para el comprobante y para devolverlo si se cancela.
 */
async function despachar(
    tx: Prisma.TransactionClient,
    orden: { id: string; number: number; warehouseId: string },
    opciones: { datos?: Prisma.SaleOrderUpdateInput; concepto: string; bajoMinimos: ProductoEnAlerta[]; hoy: string },
) {
    const items = await tx.saleOrderItem.findMany({
        where: { saleOrderId: orden.id, productId: { not: null } },
    });

    // Los productos se bloquean todos antes de tocar ninguno, en orden de id: dos envíos con los
    // mismos productos en distinto orden no se esperan en cruz. **Las líneas no se reordenan**:
    // los movimientos salen en el orden de la orden, que es como se leen después.
    await bloquearProductos(tx, items.flatMap((item) => (item.productId ? [item.productId] : [])));

    for (const item of items) {
        if (!item.productId) continue;
        const productId = item.productId;

        const movido = await sacar(
            tx,
            {
                productId,
                warehouseId: orden.warehouseId,
                cantidad: item.quantity,
                type: "OUT",
                note: `${opciones.concepto} #${escribirNumeroDeVenta(orden.number)}`,
                vigentesA: opciones.hoy,
            },
            (enAlmacen, producto) =>
                new HttpError(
                    400,
                    `Stock insuficiente para "${producto.name}". Disponible: ${enAlmacen}, requerido: ${item.quantity}`,
                    "INSUFFICIENT_STOCK",
                    { producto: producto.name, disponible: enAlmacen, requerido: item.quantity },
                ),
        );

        // T5-02 — el coste se congela en el ítem **al enviar**, que es cuando la mercancía
        // sale. Es el de la fila que `sacar` acaba de escribir y deja bloqueada: una recepción
        // que cambiara el coste medio a la vez tiene que esperar a que esto termine.
        await tx.saleOrderItem.update({ where: { id: item.id }, data: { unitCost: movido.costPrice } });

        const deLotes = movido.lotes.flatMap((l) => (l.lotId ? [{ saleOrderItemId: item.id, lotId: l.lotId, quantity: l.cantidad }] : []));
        if (deLotes.length > 0) await tx.saleOrderItemLot.createMany({ data: deLotes });

        if (movido.stock <= movido.minStock) {
            opciones.bajoMinimos.push({ id: productId, name: movido.name, stock: movido.stock, minStock: movido.minStock });
        }
    }

    return tx.saleOrder.update({
        where: { id: orden.id },
        data: { ...opciones.datos, status: "SHIPPED", shippedAt: new Date() },
        include: ORDER_INCLUDE,
    });
}

/**
 * Lo contrario de `despachar`: cancelar una orden **ya enviada**. Reposición de stock,
 * movimientos compensatorios y cambio de estado en la misma transacción, con la orden ya
 * bloqueada por quien llama (AUD-005).
 */
async function devolverEnviada(
    tx: Prisma.TransactionClient,
    orden: { id: string; number: number; warehouseId: string },
    datos: Prisma.SaleOrderUpdateInput,
) {
    // T5-14 — la mercancía vuelve al almacén del que salió, y tiene que seguir
    // activo: devolverla a uno desactivado la dejaría donde nadie puede venderla.
    const almacen = await almacenParaOperar(orden.warehouseId, tx);

    const items = await tx.saleOrderItem.findMany({
        where: { saleOrderId: orden.id, productId: { not: null } },
        include: { lots: { select: { lotId: true, quantity: true } } },
    });
    await bloquearProductos(tx, items.flatMap((item) => (item.productId ? [item.productId] : [])));

    for (const item of items) {
        if (!item.productId) continue;

        // T5-15 — cada unidad vuelve **al lote del que salió**, aunque mientras tanto
        // haya caducado: devolverla a otro la haría pasar por lo que no es. Lo que
        // salió sin lote vuelve sin lote.
        const deLotes = item.lots.reduce((suma, l) => suma + l.quantity, 0);
        const devoluciones = [
            ...item.lots.map((l) => ({ lotId: l.lotId as string | null, cantidad: l.quantity })),
            { lotId: null, cantidad: item.quantity - deLotes },
        ].filter((d) => d.cantidad > 0);

        for (const devolucion of devoluciones) {
            await entrar(tx, {
                productId: item.productId,
                warehouseId: almacen.id,
                cantidad: devolucion.cantidad,
                lotId: devolucion.lotId,
                type: "IN",
                note: `Cancelación de orden de venta #${escribirNumeroDeVenta(orden.number)}`,
            });
        }
    }

    return tx.saleOrder.update({
        where: { id: orden.id },
        data: { ...datos, status: "CANCELLED" },
        include: ORDER_INCLUDE,
    });
}

export const saleOrderService = {
    async getAll(query: { page?: string; limit?: string; status?: string; customerId?: unknown; number?: unknown; from?: unknown; to?: unknown; warehouseId?: unknown; createdByEmail?: unknown }) {
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
        // T5-14 — las de un local.
        const warehouseId = await almacenDelFiltro(query.warehouseId);
        // AUD-008 — las de quien las registró: «Mis ventas de hoy» pedía las cien primeras del día
        // de todos y se quedaba con las suyas en el cliente, así que un día de más de cien se
        // quedaba corto sin avisar. Sin distinguir mayúsculas, como el login.
        const autor = typeof query.createdByEmail === "string" && query.createdByEmail.trim() ? query.createdByEmail.trim() : undefined;
        const where = {
            ...(warehouseId && { warehouseId }),
            ...(autor && { createdByEmail: { equals: autor, mode: "insensitive" as const } }),
            ...(statusFilter && { status: statusFilter }),
            ...(customerId && { customerId }),
            ...(number !== undefined && { number }),
            ...(creadas && { createdAt: creadas }),
        };

        const [orders, total] = await prisma.$transaction([
            prisma.saleOrder.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, include: ORDER_INCLUDE }),
            prisma.saleOrder.count({ where }),
        ]);

        return { data: orders.map(aRespuesta), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    },

    async getById(id: string) {
        const order = await prisma.saleOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
        if (!order) throw new HttpError(404, "Orden de venta no encontrada", "SALE_ORDER_NOT_FOUND");
        return aRespuesta(order);
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
        // T5-14 — de qué almacén saldrá: el de la petición o el predeterminado.
        const almacen = await almacenParaOperar(dto.warehouseId);

        // T6-05 — la tasa vigente **ahora**, que se congela en cada línea como `unitPrice`. Los
        // importes no vienen en `dto`: se calculan al responder, de lo que queda guardado.
        const taxRate = await settingsService.tasaDeImpuesto();
        const hoy = await hoyDelNegocio();

        const orden = await prisma.$transaction(async (tx) => {
            await reservarDisponible(tx, pedido, almacen.id, hoy);

            const cliente = await clienteDeLaVenta(tx, dto);

            // T6-04 — lo último antes de crear, y dentro de la transacción: un 409 de más arriba
            // no llega aquí, y si algo falla después el incremento se deshace con todo lo demás.
            const number = await siguienteNumeroDeVenta(tx);

            return tx.saleOrder.create({
                data: {
                    number,
                    warehouseId: almacen.id,
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

        return aRespuesta(orden);
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
        const almacen = await almacenParaOperar(dto.warehouseId);
        const hoy = await hoyDelNegocio();
        const bajoMinimos: ProductoEnAlerta[] = [];

        const orden = await prisma.$transaction(async (tx) => {
            const productos = new Map((await reservarDisponible(tx, pedido, almacen.id, hoy)).map((p) => [p.id, p]));

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
                    warehouseId: almacen.id,
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

            return despachar(tx, creada, { concepto: "Venta de mostrador", bajoMinimos, hoy });
        });

        // Después del `commit` y sin esperarlas, como en el envío.
        for (const producto of bajoMinimos) dispararAlertaStock(producto);

        return aRespuesta(orden);
    },

    /**
     * `actorId` es quien hace el cambio: si el envío falla por stock, es a quien **no** se avisa (T5-12).
     *
     * AUD-005 — **todo** ocurre en una transacción que empieza bloqueando la orden: leer su
     * estado, decidir qué transición es y aplicarla. Antes se leía fuera y se decidía con lo
     * leído, así que dos peticiones a la vez enviaban o cancelaban las dos.
     */
    async update(id: string, dto: UpdateSaleOrderDto, actorId?: string) {
        const customerData = {
            // T5-06 — cambiar el vínculo no toca la instantánea: son dos cosas distintas.
            ...(dto.customerId !== undefined && { customerId: dto.customerId }),
            ...(dto.customerName !== undefined && { customerName: dto.customerName }),
            ...(dto.customerEmail !== undefined && { customerEmail: dto.customerEmail }),
            ...(dto.customerPhone !== undefined && { customerPhone: dto.customerPhone }),
            ...(dto.customerDocument !== undefined && { customerDocument: dto.customerDocument }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
        };

        const lowStockTargets: ProductoEnAlerta[] = [];
        // Fuera de la transacción: lee ajustes, y solo hace falta para enviar.
        const hoy = dto.status === "SHIPPED" ? await hoyDelNegocio() : undefined;
        // Para el aviso de venta sin stock, que se da después de deshacer la transacción.
        let numero: number | undefined;

        const updated = await prisma.$transaction(async (tx) => {
            const existing = await bloquearVenta(tx, id);
            numero = existing.number;
            comprobarTransicion(existing.status, dto.status);

            if (dto.customerId) {
                const cliente = await tx.customer.findUnique({ where: { id: dto.customerId } });
                if (!cliente) throw clienteNoEncontrado();
            }

            // Envío: verificación de stock, descuento, movimientos y cambio de estado (`despachar`).
            if (existing.status === "PENDING" && dto.status === "SHIPPED") {
                return despachar(tx, existing, { datos: customerData, concepto: "Orden de venta", bajoMinimos: lowStockTargets, hoy: hoy! });
            }
            // Cancelar una orden ya enviada devuelve al inventario lo que salió con ella.
            if (existing.status === "SHIPPED" && dto.status === "CANCELLED") {
                return devolverEnviada(tx, existing, customerData);
            }
            // El resto no mueve stock: datos del cliente y notas, o cancelar una pendiente.
            return tx.saleOrder.update({
                where: { id },
                data: { ...customerData, ...(dto.status !== undefined && { status: dto.status }) },
                include: ORDER_INCLUDE,
            });
        }).catch((error: unknown) => {
            // T5-12 — fuera de la transacción, que ya se ha deshecho: un aviso creado dentro
            // se habría ido con ella. El error sigue su camino tal cual.
            if (error instanceof HttpError && error.code === "INSUFFICIENT_STOCK" && error.params) {
                dispararAvisoDeVentaSinStock(id, {
                    orderNumber: numero!,
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

        return aRespuesta(updated);
    },

    /** AUD-005 — con la orden bloqueada, como `update`: un envío a la vez no la deja borrar enviada. */
    async delete(id: string) {
        await prisma.$transaction(async (tx) => {
            const existing = await bloquearVenta(tx, id);
            if (existing.status === "SHIPPED") throw new HttpError(400, "No se puede eliminar una orden ya enviada", "CANNOT_DELETE_SHIPPED_ORDER");
            await tx.saleOrder.delete({ where: { id } });
        });
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
                        // T5-14: de que almacen salio. Al final, para no mover las columnas que ya habia.
                        warehouseName: o.warehouse.name,
                    };
                }),
            );

            if (pagina.length < TAM_LOTE_EXPORTACION) return;
            cursor = pagina[pagina.length - 1]!.id;
        }
    },
};
