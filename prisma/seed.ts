import "dotenv/config";
import { prisma } from "../src/shared/lib/prisma";
import { hashPassword } from "../src/shared/lib/hash";
import { categoriesData } from "./data/categories";
import { brandsData } from "./data/brands";
import { suppliersData } from "./data/suppliers";
import { productsData } from "./data/products";
import type { $Enums, Product, User } from "../src/generated/prisma/client";

// ─── Azar reproducible ────────────────────────────────────────────────────────
//
// `Math.random()` daba una base distinta en cada ejecución: dos personas mirando «el
// seed» veían números distintos, y un fallo que dependiera de los datos no se podía
// reproducir pidiendo «vuelve a sembrar». Con generador propio y semilla fija, `pnpm
// db:seed` produce siempre la misma base. Lo único que se mueve son las fechas, y a
// propósito: el panel enseña los últimos 30 días y con fechas fijas se vaciaría solo.

let semilla = 0x51_0c_c1_11;

function azar(): number {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const entre = (min: number, max: number): number => min + Math.floor(azar() * (max - min + 1));

function elegir<T>(opciones: readonly T[]): T {
    return opciones[Math.floor(azar() * opciones.length)];
}

/**
 * Fecha de hace `dias`. Los minutos salen del propio `dias` y no del azar: así dos
 * movimientos del mismo día no comparten instante y el orden del histórico es estable.
 */
function hace(dias: number, hora = 10): Date {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    d.setHours(hora, dias % 60, 0, 0);
    return d;
}

// ─── Limpieza ─────────────────────────────────────────────────────────────────

/**
 * El orden importa: primero lo que apunta a otra cosa. Y la lista tiene que estar
 * **completa** — aquí faltaban `sale_orders`, `tags`, `audit_logs` y `app_settings`, que
 * se añadieron al esquema después que el seed. No daba error: las claves foráneas de esas
 * tablas son `SetNull` o `Cascade`, así que sembrar de nuevo dejaba órdenes de venta
 * huérfanas, etiquetas duplicándose y un ajuste conmutado a mano sobreviviendo al
 * «borrón y cuenta nueva». Una tabla que se añada al esquema se añade también aquí.
 */
async function limpiar(): Promise<void> {
    await prisma.saleOrderItem.deleteMany();
    await prisma.saleOrder.deleteMany();
    await prisma.purchaseOrderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.priceHistory.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.product.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.appSetting.deleteMany();
    await prisma.user.deleteMany();
    console.log("  - Base de datos limpiada");
}

// ─── Usuarios ─────────────────────────────────────────────────────────────────

async function sembrarUsuarios(): Promise<User[]> {
    const usuarios = await Promise.all([
        prisma.user.create({
            data: {
                name: "Admin Principal",
                email: "admin@stockly.app",
                password: await hashPassword("Admin1234!"),
                role: "ADMIN",
                isVerified: true,
            },
        }),
        prisma.user.create({
            data: {
                name: "Carlos Martínez",
                email: "carlos@stockly.app",
                password: await hashPassword("Admin1234!"),
                role: "ADMIN",
                isVerified: true,
            },
        }),
        prisma.user.create({
            data: {
                name: "Laura Sánchez",
                email: "laura@stockly.app",
                password: await hashPassword("User1234!"),
                role: "USER",
                isVerified: true,
                // T4-12 — una cuenta en inglés, para que el idioma de los correos se pueda
                // probar sin tocar la base a mano. Es la preferencia del **correo**, no la
                // de la interfaz: esa vive en el navegador y es por dispositivo.
                idioma: "EN",
            },
        }),
    ]);
    console.log(`  - ${usuarios.length} usuarios creados`);
    return usuarios;
}

// ─── Catálogos ────────────────────────────────────────────────────────────────

async function sembrarCategorias(): Promise<Map<string, string>> {
    const creadas = await Promise.all(categoriesData.map((c) => prisma.category.create({ data: c })));
    console.log(`  - ${creadas.length} categorías creadas`);
    return new Map(creadas.map((c) => [c.name, c.id]));
}

async function sembrarMarcas(): Promise<Map<string, string>> {
    const creadas = await Promise.all(brandsData.map((b) => prisma.brand.create({ data: b })));
    console.log(`  - ${creadas.length} marcas creadas`);
    return new Map(creadas.map((b) => [b.name, b.id]));
}

async function sembrarProveedores(): Promise<Map<string, string>> {
    const creados = await Promise.all(suppliersData.map((s) => prisma.supplier.create({ data: s })));
    console.log(`  - ${creados.length} proveedores creados`);
    return new Map(creados.map((s) => [s.name, s.id]));
}

// ─── Etiquetas ────────────────────────────────────────────────────────────────

const etiquetasData = [
    { name: "Oferta", color: "#f97316" },
    { name: "Novedad", color: "#3b82f6" },
    { name: "Alta gama", color: "#8b5cf6" },
    { name: "Liquidación", color: "#ef4444" },
    { name: "Bajo pedido", color: "#64748b" },
    { name: "Descontinuado", color: "#78716c" },
] as const;

async function sembrarEtiquetas(): Promise<Map<string, string>> {
    const creadas = await Promise.all(etiquetasData.map((t) => prisma.tag.create({ data: { ...t } })));
    console.log(`  - ${creadas.length} etiquetas creadas`);
    return new Map(creadas.map((t) => [t.name, t.id]));
}

/**
 * Qué etiquetas lleva cada producto. Por regla y no al azar: una etiqueta que aparece
 * donde no pega no se distingue de un fallo al filtrar, y la pantalla de etiquetas se
 * mira precisamente para comprobar que el filtro hace lo que dice.
 */
function etiquetasDe(p: (typeof productsData)[number], i: number): string[] {
    const nombres: string[] = [];
    if (descontinuado(i)) nombres.push("Descontinuado");
    if (p.price >= 10000) nombres.push("Alta gama");
    if (p.stock >= 40) nombres.push("Liquidación");
    if (p.minStock <= 2 && p.price >= 5000) nombres.push("Bajo pedido");
    if (i % 6 === 0) nombres.push("Oferta");
    if (i % 9 === 4) nombres.push("Novedad");
    return nombres;
}

/** Los dos últimos del catálogo se dan de baja: sin ninguno, el filtro «inactivos» y la
 *  reactivación no tienen nada que enseñar y se prueban solo con datos hechos a mano. */
const descontinuado = (i: number): boolean => i >= productsData.length - 2;

// ─── Productos ────────────────────────────────────────────────────────────────

async function sembrarProductos(
    categorias: Map<string, string>,
    marcas: Map<string, string>,
    proveedores: Map<string, string>,
    etiquetas: Map<string, string>,
): Promise<Product[]> {
    const creados = await Promise.all(
        productsData.map((p, i) =>
            prisma.product.create({
                data: {
                    name: p.name,
                    description: p.description,
                    sku: p.sku,
                    price: p.price,
                    stock: p.stock,
                    minStock: p.minStock,
                    isActive: !descontinuado(i),
                    categoryId: p.category ? categorias.get(p.category) : undefined,
                    brandId: p.brand ? marcas.get(p.brand) : undefined,
                    supplierId: p.supplier ? proveedores.get(p.supplier) : undefined,
                    tags: {
                        connect: etiquetasDe(p, i).map((nombre) => ({ id: exigir(etiquetas, nombre, "etiqueta") })),
                    },
                },
            }),
        ),
    );
    const bajos = creados.filter((p) => p.stock <= p.minStock).length;
    console.log(`  - ${creados.length} productos creados (${bajos} en o por debajo del mínimo, 2 descontinuados)`);
    return creados;
}

// ─── Órdenes de compra ────────────────────────────────────────────────────────

interface LineaDePedido {
    sku: string;
    qty: number;
    /** Coste al proveedor. En las ventas no se declara: sale del precio del catálogo. */
    unitPrice?: number;
}

interface OrdenDeCompra {
    proveedor: string;
    status: $Enums.PurchaseOrderStatus;
    notes: string;
    dias: number;
    items: LineaDePedido[];
}

const ordenesDeCompra: OrdenDeCompra[] = [
    {
        proveedor: "TechDistribuidor SA",
        status: "RECEIVED",
        notes: "Reposición de smartphones y laptops — Q1",
        dias: 90,
        items: [
            { sku: "ELE-SAM-A54", qty: 20, unitPrice: 7800 },
            { sku: "ELE-ASU-VB15", qty: 10, unitPrice: 13500 },
            { sku: "ELE-APL-IPD10", qty: 15, unitPrice: 9200 },
            { sku: "ELE-SAM-GW6", qty: 12, unitPrice: 6300 },
        ],
    },
    {
        proveedor: "Global Electronics",
        status: "RECEIVED",
        notes: "Pedido mensual de periféricos y monitores",
        dias: 60,
        items: [
            { sku: "PER-LOG-MXKEYS", qty: 25, unitPrice: 2400 },
            { sku: "PER-LOG-MXM3S", qty: 30, unitPrice: 1950 },
            { sku: "PER-LOG-C920", qty: 15, unitPrice: 1600 },
            { sku: "PER-LG-27FHD", qty: 8, unitPrice: 5800 },
            { sku: "PER-ASU-PA248", qty: 5, unitPrice: 7100 },
        ],
    },
    {
        proveedor: "Importaciones del Norte",
        status: "RECEIVED",
        notes: "Reposición trimestral de almacenamiento",
        dias: 45,
        items: [
            { sku: "ALM-WD-BLU-2T", qty: 20, unitPrice: 1400 },
            { sku: "ALM-KIN-USB128", qty: 60, unitPrice: 290 },
            { sku: "ALM-SAM-MSD256", qty: 50, unitPrice: 480 },
            { sku: "ALM-WD-BLK-500", qty: 15, unitPrice: 1700 },
            { sku: "ALM-SAM-870-1T", qty: 18, unitPrice: 2200 },
        ],
    },
    {
        proveedor: "Importaciones del Norte",
        status: "RECEIVED",
        notes: "Pedido de networking Q4 anterior",
        dias: 30,
        items: [
            { sku: "RED-TPL-AX73", qty: 12, unitPrice: 3300 },
            { sku: "RED-TPL-SG108", qty: 20, unitPrice: 700 },
            { sku: "RED-ASU-AX58U", qty: 8, unitPrice: 2700 },
            { sku: "RED-CAB-CAT6-10", qty: 80, unitPrice: 130 },
        ],
    },
    {
        proveedor: "MegaSupply Corp",
        status: "PENDING",
        notes: "Reposición urgente gaming y audio — en espera de confirmación",
        dias: 10,
        items: [
            { sku: "GAM-COR-M65RGB", qty: 15, unitPrice: 1750 },
            { sku: "GAM-COR-VIR-SE", qty: 8, unitPrice: 4800 },
            { sku: "AUD-SNY-XM5", qty: 10, unitPrice: 7900 },
            { sku: "AUD-COR-HS80", qty: 12, unitPrice: 2750 },
            { sku: "AUD-COR-WAVE3", qty: 6, unitPrice: 3200 },
        ],
    },
    {
        proveedor: "Tech Parts S.A. de C.V.",
        status: "PENDING",
        notes: "Accesorios para temporada alta — pendiente de pago",
        dias: 5,
        items: [
            { sku: "ACC-ANK-USBC-2M", qty: 100, unitPrice: 210 },
            { sku: "ACC-ANK-65W-GAN", qty: 40, unitPrice: 720 },
            { sku: "ACC-ANK-HUB7-C", qty: 30, unitPrice: 980 },
            { sku: "ACC-ANK-PC26800", qty: 20, unitPrice: 1350 },
        ],
    },
    {
        proveedor: "Tech Parts S.A. de C.V.",
        status: "PENDING",
        notes: "Reposición por alertas de stock mínimo",
        dias: 1,
        items: [
            { sku: "RED-TPL-DECO-XE75", qty: 5, unitPrice: 4800 },
            { sku: "OFI-APC-600VA", qty: 8, unitPrice: 1700 },
            { sku: "OFI-HP-SJP2600", qty: 4, unitPrice: 5400 },
        ],
    },
    {
        proveedor: "TechDistribuidor SA",
        status: "CANCELLED",
        notes: "Cancelada — proveedor sin stock de OLED disponible este mes",
        dias: 20,
        items: [
            { sku: "ELE-LG-TV55", qty: 5, unitPrice: 22000 },
            { sku: "ELE-SNY-ZVE10", qty: 4, unitPrice: 12000 },
        ],
    },
];

// ─── Órdenes de venta ─────────────────────────────────────────────────────────

interface OrdenDeVenta {
    status: $Enums.SaleOrderStatus;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    notes?: string;
    dias: number;
    items: LineaDePedido[];
}

const ordenesDeVenta: OrdenDeVenta[] = [
    {
        status: "SHIPPED",
        customerName: "Distribuidora Vega",
        customerEmail: "compras@distribuidoravega.mx",
        customerPhone: "+52 55 4821 9930",
        notes: "Entregado en almacén central, firmado por recepción",
        dias: 25,
        items: [
            { sku: "PER-LOG-MXM3S", qty: 3 },
            { sku: "ACC-ANK-USBC-2M", qty: 10 },
            { sku: "ALM-KIN-USB128", qty: 6 },
        ],
    },
    {
        status: "SHIPPED",
        customerName: "Estudio Nómada",
        customerEmail: "hola@estudionomada.com",
        notes: "Equipamiento de sala de grabación",
        dias: 12,
        items: [
            { sku: "AUD-SNY-XM5", qty: 2 },
            { sku: "PER-LOG-C920", qty: 2 },
        ],
    },
    {
        status: "PENDING",
        customerName: "Colegio San Marcos",
        customerEmail: "administracion@colegiosanmarcos.edu.mx",
        customerPhone: "+52 55 7712 4408",
        notes: "Pendiente de orden de compra firmada",
        dias: 3,
        items: [
            { sku: "RED-TPL-SG108", qty: 4 },
            { sku: "RED-CAB-CAT6-10", qty: 20 },
            { sku: "OFI-APC-600VA", qty: 3 },
        ],
    },
    {
        status: "CANCELLED",
        customerName: "Iván Ríos",
        customerEmail: "ivan.rios@correo.com",
        notes: "Cancelada por el cliente antes de preparar el envío",
        dias: 8,
        items: [{ sku: "GAM-COR-VIR-SE", qty: 1 }],
    },
];

// ─── Libro mayor de existencias ───────────────────────────────────────────────

interface Evento {
    productId: string;
    type: $Enums.StockMovementType;
    delta: number;
    note: string;
    createdAt: Date;
}

/**
 * El histórico se construye **una sola vez y para todos los orígenes**, porque tiene que
 * cuadrar. El seed anterior inventaba cada bloque por su cuenta: la apertura decía un
 * `stockAfter` y las ventas otro, las órdenes recibidas no dejaban rastro ninguno, y la
 * suma del histórico de un producto no daba su stock. Se ve enseguida en la ficha del
 * producto —la columna de saldo va dando tumbos— y hace inservible cualquier prueba
 * sobre el histórico, que es justo lo que T4-15 paginó.
 *
 * La regla que se respeta aquí es la del código de producción: recibir una orden de
 * compra es una entrada (`purchase-orders.service.ts`) y enviar una de venta es una
 * salida (`sale-orders.service.ts`). Lo pendiente y lo cancelado no mueven nada.
 */
class LibroMayor {
    private readonly eventos = new Map<string, Evento[]>();

    anotar(evento: Evento): void {
        const lista = this.eventos.get(evento.productId);
        if (lista) lista.push(evento);
        else this.eventos.set(evento.productId, [evento]);
    }

    /**
     * Cierra el libro: añade la apertura, cuadra con un último movimiento y calcula el
     * saldo tras cada uno. El stock del producto **no se toca** — es el dato curado de
     * `data/products.ts`, con sus casos de mínimo a propósito; lo que se ajusta es el
     * historial para desembocar exactamente en él.
     */
    cerrar(productos: Product[]): (Evento & { stockAfter: number })[] {
        const movimientos: (Evento & { stockAfter: number })[] = [];

        for (const p of productos) {
            const propios = [...(this.eventos.get(p.id) ?? [])];

            propios.push({
                productId: p.id,
                type: "IN",
                delta: p.stock,
                note: "Stock inicial — apertura de inventario",
                createdAt: hace(150),
            });

            // Lo que falta para volver al stock que declara el catálogo. Sale negativo en
            // casi todos: las órdenes recibidas metieron mercancía que desde entonces se
            // ha vendido. Se parte en dos cuando es grande, porque una única salida de
            // sesenta unidades no se parece a nada que pase en un almacén.
            const descuadre = p.stock - propios.reduce((total, e) => total + e.delta, 0);
            for (const parte of repartir(descuadre)) {
                propios.push({
                    productId: p.id,
                    type: parte > 0 ? "IN" : "OUT",
                    delta: parte,
                    note: parte > 0 ? elegir(NOTAS_ENTRADA) : elegir(NOTAS_SALIDA),
                    createdAt: hace(entre(2, 9), entre(9, 18)),
                });
            }

            propios.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            let saldo = 0;
            for (const e of propios) {
                saldo += e.delta;
                // Un almacén no tiene existencias negativas. Si salta, los datos de
                // `data/products.ts` o las cantidades de una orden dejaron de encajar:
                // es un fallo del seed, no algo que deba acabar en la base.
                if (saldo < 0) {
                    throw new Error(
                        `El histórico de ${p.sku ?? p.name} baja de cero (${saldo}) el ${e.createdAt.toISOString()}. ` +
                            "Revisa las cantidades de las órdenes o el stock del catálogo.",
                    );
                }
                movimientos.push({ ...e, stockAfter: saldo });
            }

            if (saldo !== p.stock) {
                throw new Error(`El histórico de ${p.sku ?? p.name} cierra en ${saldo} y su stock es ${p.stock}.`);
            }
        }

        return movimientos;
    }
}

const NOTAS_SALIDA = ["Venta mostrador", "Venta directa", "Pedido en línea", "Venta a empresa"] as const;
const NOTAS_ENTRADA = ["Reposición de almacén", "Traspaso desde sucursal", "Compra puntual a proveedor"] as const;

/** Parte una cantidad en dos cuando es grande, para que el histórico no tenga saltos raros. */
function repartir(total: number): number[] {
    if (total === 0) return [];
    if (Math.abs(total) < 10) return [total];
    const primera = Math.trunc(total / 2);
    return [primera, total - primera];
}

/**
 * Movimientos que no vienen de una orden: ajustes de conteo, devoluciones e importaciones
 * masivas. Sin ellos el histórico solo tendría entradas y salidas, y los tres tipos que
 * faltan —incluido `IMPORT`, que es de la carga por CSV— no aparecerían nunca en los
 * filtros ni en las gráficas.
 */
function anotarMovimientosSueltos(libro: LibroMayor, productos: Product[]): void {
    const ajustes = ["Conteo físico mensual", "Corrección de diferencia", "Ajuste por daño en almacén"] as const;

    for (const p of productos.slice(10, 20)) {
        libro.anotar({
            productId: p.id,
            type: "ADJUSTMENT",
            delta: elegir([-3, -2, -1, 1, 2]),
            note: elegir(ajustes),
            createdAt: hace(entre(12, 40)),
        });
    }

    for (const p of productos.slice(2, 9)) {
        libro.anotar({
            productId: p.id,
            type: "IN",
            delta: 1,
            note: "Devolución de cliente",
            createdAt: hace(entre(10, 35)),
        });
    }

    for (const p of productos.slice(24, 30)) {
        libro.anotar({
            productId: p.id,
            type: "IMPORT",
            delta: entre(4, 12),
            note: "Importación masiva desde CSV",
            createdAt: hace(entre(50, 70)),
        });
    }
}

// ─── Órdenes ──────────────────────────────────────────────────────────────────

async function sembrarOrdenesDeCompra(
    porSku: Map<string, Product>,
    proveedores: Map<string, string>,
    libro: LibroMayor,
): Promise<number> {
    let items = 0;

    for (const orden of ordenesDeCompra) {
        const fecha = hace(orden.dias);
        const lineas = orden.items.map((i) => {
            const producto = exigirProducto(porSku, i.sku);
            if (orden.status === "RECEIVED") {
                libro.anotar({
                    productId: producto.id,
                    type: "IN",
                    delta: i.qty,
                    note: `Recepción de orden de compra — ${orden.proveedor}`,
                    createdAt: fecha,
                });
            }
            return {
                productId: producto.id,
                productName: producto.name,
                quantity: i.qty,
                unitPrice: i.unitPrice ?? Number(producto.price),
            };
        });

        await prisma.purchaseOrder.create({
            data: {
                supplierId: exigir(proveedores, orden.proveedor, "proveedor"),
                status: orden.status,
                notes: orden.notes,
                createdAt: fecha,
                items: { create: lineas },
            },
        });
        items += lineas.length;
    }

    console.log(`  - ${ordenesDeCompra.length} órdenes de compra creadas (${items} ítems)`);
    return items;
}

async function sembrarOrdenesDeVenta(porSku: Map<string, Product>, libro: LibroMayor): Promise<number> {
    let items = 0;

    for (const orden of ordenesDeVenta) {
        const fecha = hace(orden.dias);
        const lineas = orden.items.map((i) => {
            const producto = exigirProducto(porSku, i.sku);
            if (orden.status === "SHIPPED") {
                libro.anotar({
                    productId: producto.id,
                    type: "OUT",
                    delta: -i.qty,
                    note: `Envío de orden de venta — ${orden.customerName}`,
                    createdAt: fecha,
                });
            }
            return {
                productId: producto.id,
                productName: producto.name,
                quantity: i.qty,
                // El precio de venta es el del catálogo: repetirlo aquí a mano solo crea
                // una segunda copia que se separa de `data/products.ts` a la primera.
                unitPrice: Number(producto.price),
            };
        });

        await prisma.saleOrder.create({
            data: {
                status: orden.status,
                customerName: orden.customerName,
                customerEmail: orden.customerEmail,
                customerPhone: orden.customerPhone,
                notes: orden.notes,
                createdAt: fecha,
                items: { create: lineas },
            },
        });
        items += lineas.length;
    }

    console.log(`  - ${ordenesDeVenta.length} órdenes de venta creadas (${items} ítems)`);
    return items;
}

// ─── Historial de precios ─────────────────────────────────────────────────────

async function sembrarHistorialDePrecios(productos: Product[]): Promise<number> {
    const entradas = [];

    for (const p of productos.slice(0, 12)) {
        const actual = Number(p.price);
        const antiguo = +(actual * 0.78).toFixed(2);
        const medio = +(actual * 0.91).toFixed(2);
        entradas.push(
            { productId: p.id, oldPrice: antiguo, newPrice: medio, createdAt: hace(180) },
            { productId: p.id, oldPrice: medio, newPrice: actual, createdAt: hace(75) },
        );
    }

    for (const p of productos.slice(12, 18)) {
        const actual = Number(p.price);
        entradas.push({
            productId: p.id,
            oldPrice: +(actual * 0.94).toFixed(2),
            newPrice: actual,
            createdAt: hace(30),
        });
    }

    await prisma.priceHistory.createMany({ data: entradas });
    console.log(`  - ${entradas.length} entradas de historial de precios creadas`);
    return entradas.length;
}

// ─── Auditoría ────────────────────────────────────────────────────────────────

/**
 * La pantalla de auditoría salía vacía en una base recién sembrada, así que no se podía
 * mirar sin antes fabricarse el rastro a mano. Estas entradas imitan lo que dejaría el
 * `auditService`: el mismo `entity`/`action` y un `details` con la forma que espera la
 * pantalla. `REFRESH_REUSE` va sin actor a propósito — es una anomalía detectada, no
 * algo que alguien haga (T2-31).
 */
async function sembrarAuditoria(usuarios: User[], productos: Product[]): Promise<number> {
    const [admin, carlos, laura] = usuarios;
    const actor = (u: User) => ({ userId: u.id, userEmail: u.email });

    const ordenDeCompra = await prisma.purchaseOrder.findFirst({ where: { status: "RECEIVED" } });
    const ordenDeVenta = await prisma.saleOrder.findFirst({ where: { status: "SHIPPED" } });
    const cancelada = await prisma.saleOrder.findFirst({ where: { status: "CANCELLED" } });
    const etiqueta = await prisma.tag.findFirst({ where: { name: "Oferta" } });

    const entradas = [
        { ...actor(admin), action: "CREATE" as const, entity: "Product" as const, entityId: productos[0].id,
            details: { name: productos[0].name, sku: productos[0].sku }, createdAt: hace(120) },
        { ...actor(admin), action: "CREATE" as const, entity: "Tag" as const, entityId: etiqueta?.id ?? null,
            details: { name: "Oferta" }, createdAt: hace(118) },
        { ...actor(carlos), action: "UPDATE" as const, entity: "Product" as const, entityId: productos[3].id,
            details: { price: { de: 22990, a: Number(productos[3].price) } }, createdAt: hace(75) },
        { ...actor(carlos), action: "ORDER_RECEIVE" as const, entity: "PurchaseOrder" as const,
            entityId: ordenDeCompra?.id ?? null, details: { items: 4 }, createdAt: hace(90) },
        { ...actor(admin), action: "BULK_STOCK" as const, entity: "Product" as const, entityId: null,
            details: { productos: 6, origen: "importacion.csv" }, createdAt: hace(60) },
        { ...actor(laura), action: "STOCK_MOVEMENT" as const, entity: "Product" as const, entityId: productos[12].id,
            details: { type: "ADJUSTMENT", delta: -2, note: "Conteo físico mensual" }, createdAt: hace(38) },
        { ...actor(carlos), action: "SALE_SHIP" as const, entity: "SaleOrder" as const, entityId: ordenDeVenta?.id ?? null,
            details: { customerName: "Distribuidora Vega", items: 3 }, createdAt: hace(25) },
        { ...actor(admin), action: "USER_ROLE_CHANGE" as const, entity: "User" as const, entityId: carlos.id,
            details: { de: "USER", a: "ADMIN" }, createdAt: hace(22) },
        { ...actor(admin), action: "ORDER_CANCEL" as const, entity: "PurchaseOrder" as const, entityId: null,
            details: { motivo: "Proveedor sin stock" }, createdAt: hace(20) },
        { ...actor(carlos), action: "SALE_CANCEL" as const, entity: "SaleOrder" as const, entityId: cancelada?.id ?? null,
            details: { customerName: "Iván Ríos" }, createdAt: hace(8) },
        { userId: null, userEmail: null, action: "REFRESH_REUSE" as const, entity: "User" as const,
            entityId: laura.id, details: { ip: "203.0.113.44" }, createdAt: hace(6) },
        { ...actor(admin), action: "DELETE" as const, entity: "Product" as const,
            entityId: productos[productos.length - 1].id,
            details: { name: productos[productos.length - 1].name }, createdAt: hace(4) },
        { ...actor(admin), action: "RESTORE" as const, entity: "Product" as const,
            entityId: productos[productos.length - 2].id,
            details: { name: productos[productos.length - 2].name }, createdAt: hace(3) },
        { ...actor(carlos), action: "USER_DEACTIVATE" as const, entity: "User" as const, entityId: laura.id,
            details: { motivo: "Baja temporal" }, createdAt: hace(2) },
    ];

    await prisma.auditLog.createMany({ data: entradas });
    console.log(`  - ${entradas.length} entradas de auditoría creadas`);
    return entradas.length;
}

// ─── Utilidades de búsqueda ───────────────────────────────────────────────────

/**
 * Los dos fallan en vez de devolver `undefined`. El seed anterior descartaba en silencio
 * las líneas cuyo SKU no existía (`.filter(i => i.productId !== null)`): renombrar un
 * producto en `data/products.ts` vaciaba órdenes enteras sin decir nada, y quien mirara
 * la pantalla vería una orden de compra sin ítems y la creería un fallo de la aplicación.
 */
function exigirProducto(porSku: Map<string, Product>, sku: string): Product {
    const producto = porSku.get(sku);
    if (!producto) throw new Error(`No existe ningún producto con SKU ${sku}: revisa prisma/data/products.ts.`);
    return producto;
}

function exigir(mapa: Map<string, string>, clave: string, que: string): string {
    const id = mapa.get(clave);
    if (!id) throw new Error(`No existe ${que} «${clave}»: revisa los datos de prisma/data/.`);
    return id;
}

// ─── Principal ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log("\nSembrando la base de Stockly...\n");

    await limpiar();

    const usuarios = await sembrarUsuarios();
    const categorias = await sembrarCategorias();
    const marcas = await sembrarMarcas();
    const proveedores = await sembrarProveedores();
    const etiquetas = await sembrarEtiquetas();
    const productos = await sembrarProductos(categorias, marcas, proveedores, etiquetas);

    const porSku = new Map(productos.flatMap((p) => (p.sku ? [[p.sku, p] as const] : [])));

    // Las órdenes van antes que los movimientos: son las que los generan.
    const libro = new LibroMayor();
    await sembrarOrdenesDeCompra(porSku, proveedores, libro);
    await sembrarOrdenesDeVenta(porSku, libro);
    anotarMovimientosSueltos(libro, productos);

    const movimientos = libro.cerrar(productos);
    await prisma.stockMovement.createMany({ data: movimientos });
    console.log(`  - ${movimientos.length} movimientos de stock creados`);

    await sembrarHistorialDePrecios(productos);
    await sembrarAuditoria(usuarios, productos);

    // `app_settings` se deja vacía a propósito: `SETTINGS_CATALOG` ya define el valor por
    // defecto de cada ajuste y la tabla solo guarda lo que alguien haya cambiado. Sembrar
    // una fila con el valor de fábrica no cambiaría ninguna pantalla y sí escondería el
    // caso interesante, que es justamente el de «todavía nadie lo ha tocado».

    const bajos = productos.filter((p) => p.isActive && p.stock <= p.minStock);

    console.log(`
  Seed completado

    Usuarios            ${usuarios.length}
    Categorias          ${categorias.size}
    Marcas              ${marcas.size}
    Proveedores         ${proveedores.size}
    Etiquetas           ${etiquetas.size}
    Productos           ${productos.length}  (${bajos.length} bajo minimo, 2 descontinuados)
    Ordenes de compra   ${ordenesDeCompra.length}
    Ordenes de venta    ${ordenesDeVenta.length}
    Movimientos         ${movimientos.length}

  Credenciales:
    admin@stockly.app    Admin1234!   (ADMIN)
    carlos@stockly.app   Admin1234!   (ADMIN)
    laura@stockly.app    User1234!    (USER, correos en ingles)
`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
