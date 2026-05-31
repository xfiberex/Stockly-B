import "dotenv/config";
import { prisma } from "../src/shared/lib/prisma";
import { hashPassword } from "../src/shared/lib/hash";
import { categoriesData } from "./data/categories";
import { brandsData } from "./data/brands";
import { suppliersData } from "./data/suppliers";
import { productsData } from "./data/products";
import type { Product } from "../src/generated/prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

// ─── Clean ────────────────────────────────────────────────────────────────────

async function cleanAll() {
    await prisma.purchaseOrderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.priceHistory.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.user.deleteMany();
    console.log("   ✔ Base de datos limpiada");
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function seedUsers() {
    const users = await Promise.all([
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
            },
        }),
    ]);
    console.log(`   ✔ ${users.length} usuarios creados`);
    return users;
}

// ─── Categories ───────────────────────────────────────────────────────────────

async function seedCategories(): Promise<Map<string, string>> {
    const created = await Promise.all(
        categoriesData.map((c: (typeof categoriesData)[0]) =>
            prisma.category.create({ data: c }),
        ),
    );
    console.log(`   ✔ ${created.length} categorías creadas`);
    return new Map(created.map((c: { id: string; name: string }) => [c.name, c.id]));
}

// ─── Brands ───────────────────────────────────────────────────────────────────

async function seedBrands(): Promise<Map<string, string>> {
    const created = await Promise.all(
        brandsData.map((b: (typeof brandsData)[0]) =>
            prisma.brand.create({ data: b }),
        ),
    );
    console.log(`   ✔ ${created.length} marcas creadas`);
    return new Map(created.map((b: { id: string; name: string }) => [b.name, b.id]));
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

async function seedSuppliers(): Promise<Map<string, string>> {
    const created = await Promise.all(
        suppliersData.map((s: (typeof suppliersData)[0]) =>
            prisma.supplier.create({ data: s }),
        ),
    );
    console.log(`   ✔ ${created.length} proveedores creados`);
    return new Map(created.map((s: { id: string; name: string }) => [s.name, s.id]));
}

// ─── Products ─────────────────────────────────────────────────────────────────

async function seedProducts(
    categoryMap: Map<string, string>,
    brandMap: Map<string, string>,
    supplierMap: Map<string, string>,
): Promise<Product[]> {
    const created = await Promise.all(
        productsData.map((p) =>
            prisma.product.create({
                data: {
                    name: p.name,
                    description: p.description,
                    sku: p.sku,
                    price: p.price,
                    stock: p.stock,
                    minStock: p.minStock,
                    isActive: true,
                    categoryId: p.category
                        ? categoryMap.get(p.category)
                        : undefined,
                    brandId: p.brand ? brandMap.get(p.brand) : undefined,
                    supplierId: p.supplier
                        ? supplierMap.get(p.supplier)
                        : undefined,
                },
            }),
        ),
    );
    console.log(`   ✔ ${created.length} productos creados`);
    return created;
}

// ─── Stock Movements ──────────────────────────────────────────────────────────

async function seedStockMovements(products: Product[]) {
    type MovementData = {
        productId: string;
        type: string;
        delta: number;
        stockAfter: number;
        note?: string;
        createdAt: Date;
    };

    const movements: MovementData[] = [];

    // Movimiento inicial de apertura para cada producto
    for (const p of products) {
        const initialQty = p.stock + Math.floor(Math.random() * 15) + 5;
        movements.push({
            productId: p.id,
            type: "IN",
            delta: initialQty,
            stockAfter: initialQty,
            note: "Stock inicial — apertura de inventario",
            createdAt: daysAgo(150),
        });
    }

    // Ventas (OUT) para los primeros 22 productos
    const outReasons = [
        "Venta directa",
        "Pedido en línea",
        "Venta a empresa",
        "Venta mostrador",
    ];
    for (const p of products.slice(0, 22)) {
        const qty = Math.floor(Math.random() * 6) + 1;
        movements.push({
            productId: p.id,
            type: "OUT",
            delta: -qty,
            stockAfter: Math.max(0, p.stock - qty),
            note: pick(outReasons),
            createdAt: daysAgo(Math.floor(Math.random() * 90) + 5),
        });
    }

    // Segunda ronda de ventas para productos de alta rotación
    const highTurnover = products.filter((p) => p.stock >= 20);
    for (const p of highTurnover) {
        const qty = Math.floor(Math.random() * 4) + 1;
        movements.push({
            productId: p.id,
            type: "OUT",
            delta: -qty,
            stockAfter: Math.max(0, p.stock - qty),
            note: pick(outReasons),
            createdAt: daysAgo(Math.floor(Math.random() * 30) + 1),
        });
    }

    // Ajustes de inventario físico para 8 productos
    const adjReasons = [
        "Conteo físico mensual",
        "Corrección de diferencia",
        "Ajuste por daño en almacén",
    ];
    for (const p of products.slice(10, 18)) {
        const delta = pick([-3, -2, -1, 1, 2]);
        movements.push({
            productId: p.id,
            type: "ADJUSTMENT",
            delta,
            stockAfter: p.stock + delta,
            note: pick(adjReasons),
            createdAt: daysAgo(Math.floor(Math.random() * 20) + 1),
        });
    }

    // Entradas por devolución de clientes
    const returnProducts = products.slice(2, 7);
    for (const p of returnProducts) {
        movements.push({
            productId: p.id,
            type: "IN",
            delta: 1,
            stockAfter: p.stock + 1,
            note: "Devolución de cliente",
            createdAt: daysAgo(Math.floor(Math.random() * 15) + 1),
        });
    }

    await prisma.stockMovement.createMany({ data: movements });
    console.log(`   ✔ ${movements.length} movimientos de stock creados`);
}

// ─── Price History ────────────────────────────────────────────────────────────

async function seedPriceHistory(products: Product[]) {
    type HistoryEntry = {
        productId: string;
        oldPrice: number;
        newPrice: number;
        createdAt: Date;
    };

    const entries: HistoryEntry[] = [];

    // 12 productos con historial de dos ajustes de precio cada uno
    for (const p of products.slice(0, 12)) {
        const current = Number(p.price);
        const oldest = +(current * 0.78).toFixed(2);
        const middle = +(current * 0.91).toFixed(2);

        entries.push(
            {
                productId: p.id,
                oldPrice: oldest,
                newPrice: middle,
                createdAt: daysAgo(180),
            },
            {
                productId: p.id,
                oldPrice: middle,
                newPrice: current,
                createdAt: daysAgo(75),
            },
        );
    }

    // 6 productos con un solo ajuste reciente
    for (const p of products.slice(12, 18)) {
        const current = Number(p.price);
        const prev = +(current * 0.94).toFixed(2);
        entries.push({
            productId: p.id,
            oldPrice: prev,
            newPrice: current,
            createdAt: daysAgo(30),
        });
    }

    await prisma.priceHistory.createMany({ data: entries });
    console.log(
        `   ✔ ${entries.length} entradas de historial de precios creadas`,
    );
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────

async function seedPurchaseOrders(
    products: Product[],
    supplierMap: Map<string, string>,
) {
    const skuMap = new Map(products.map((p) => [p.sku, p]));

    const orders = [
        // PO 1 — RECEIVED (hace 90 días): reposición electrónica
        {
            supplierId: supplierMap.get("TechDistribuidor SA")!,
            status: "RECEIVED",
            notes: "Reposición de smartphones y laptops — Q1",
            createdAt: daysAgo(90),
            items: [
                { sku: "ELE-SAM-A54", qty: 20, unitPrice: 7800 },
                { sku: "ELE-ASU-VB15", qty: 10, unitPrice: 13500 },
                { sku: "ELE-APL-IPD10", qty: 15, unitPrice: 9200 },
                { sku: "ELE-SAM-GW6", qty: 12, unitPrice: 6300 },
            ],
        },
        // PO 2 — RECEIVED (hace 60 días): periféricos
        {
            supplierId: supplierMap.get("Global Electronics")!,
            status: "RECEIVED",
            notes: "Pedido mensual de periféricos y monitores",
            createdAt: daysAgo(60),
            items: [
                { sku: "PER-LOG-MXKEYS", qty: 25, unitPrice: 2400 },
                { sku: "PER-LOG-MXM3S", qty: 30, unitPrice: 1950 },
                { sku: "PER-LOG-C920", qty: 15, unitPrice: 1600 },
                { sku: "PER-LG-27FHD", qty: 8, unitPrice: 5800 },
                { sku: "PER-ASU-PA248", qty: 5, unitPrice: 7100 },
            ],
        },
        // PO 3 — RECEIVED (hace 45 días): almacenamiento
        {
            supplierId: supplierMap.get("Importaciones del Norte")!,
            status: "RECEIVED",
            notes: "Reposición trimestral de almacenamiento",
            createdAt: daysAgo(45),
            items: [
                { sku: "ALM-WD-BLU-2T", qty: 20, unitPrice: 1400 },
                { sku: "ALM-KIN-USB128", qty: 60, unitPrice: 290 },
                { sku: "ALM-SAM-MSD256", qty: 50, unitPrice: 480 },
                { sku: "ALM-WD-BLK-500", qty: 15, unitPrice: 1700 },
                { sku: "ALM-SAM-870-1T", qty: 18, unitPrice: 2200 },
            ],
        },
        // PO 4 — RECEIVED (hace 30 días): redes
        {
            supplierId: supplierMap.get("Importaciones del Norte")!,
            status: "RECEIVED",
            notes: "Pedido de networking Q4 anterior",
            createdAt: daysAgo(30),
            items: [
                { sku: "RED-TPL-AX73", qty: 12, unitPrice: 3300 },
                { sku: "RED-TPL-SG108", qty: 20, unitPrice: 700 },
                { sku: "RED-ASU-AX58U", qty: 8, unitPrice: 2700 },
                { sku: "RED-CAB-CAT6-10", qty: 80, unitPrice: 130 },
            ],
        },
        // PO 5 — PENDING (hace 10 días): gaming y audio
        {
            supplierId: supplierMap.get("MegaSupply Corp")!,
            status: "PENDING",
            notes: "Reposición urgente gaming y audio — en espera de confirmación",
            createdAt: daysAgo(10),
            items: [
                { sku: "GAM-COR-M65RGB", qty: 15, unitPrice: 1750 },
                { sku: "GAM-COR-VIR-SE", qty: 8, unitPrice: 4800 },
                { sku: "AUD-SNY-XM5", qty: 10, unitPrice: 7900 },
                { sku: "AUD-COR-HS80", qty: 12, unitPrice: 2750 },
                { sku: "AUD-COR-WAVE3", qty: 6, unitPrice: 3200 },
            ],
        },
        // PO 6 — PENDING (hace 5 días): accesorios
        {
            supplierId: supplierMap.get("Tech Parts S.A. de C.V.")!,
            status: "PENDING",
            notes: "Accesorios para temporada alta — pendiente de pago",
            createdAt: daysAgo(5),
            items: [
                { sku: "ACC-ANK-USBC-2M", qty: 100, unitPrice: 210 },
                { sku: "ACC-ANK-65W-GAN", qty: 40, unitPrice: 720 },
                { sku: "ACC-ANK-HUB7-C", qty: 30, unitPrice: 980 },
                { sku: "ACC-ANK-PC26800", qty: 20, unitPrice: 1350 },
            ],
        },
        // PO 7 — PENDING (ayer): reposición stock bajo
        {
            supplierId: supplierMap.get("Tech Parts S.A. de C.V.")!,
            status: "PENDING",
            notes: "Reposición por alertas de stock mínimo",
            createdAt: daysAgo(1),
            items: [
                { sku: "RED-TPL-DECO-XE75", qty: 5, unitPrice: 4800 },
                { sku: "OFI-APC-600VA", qty: 8, unitPrice: 1700 },
                { sku: "OFI-HP-SJP2600", qty: 4, unitPrice: 5400 },
            ],
        },
        // PO 8 — CANCELLED: problema con proveedor
        {
            supplierId: supplierMap.get("TechDistribuidor SA")!,
            status: "CANCELLED",
            notes: "Cancelada — proveedor sin stock de OLED disponible este mes",
            createdAt: daysAgo(20),
            items: [
                { sku: "ELE-LG-TV55", qty: 5, unitPrice: 22000 },
                { sku: "ELE-SNY-ZVE10", qty: 4, unitPrice: 12000 },
            ],
        },
    ];

    let totalOrders = 0;
    let totalItems = 0;

    for (const order of orders) {
        const items = order.items
            .map((i) => {
                const product = skuMap.get(i.sku);
                return {
                    productId: product?.id ?? null,
                    productName: product?.name ?? i.sku,
                    quantity: i.qty,
                    unitPrice: i.unitPrice,
                };
            })
            .filter((i) => i.productId !== null);

        await prisma.purchaseOrder.create({
            data: {
                supplierId: order.supplierId,
                status: order.status,
                notes: order.notes,
                createdAt: order.createdAt,
                items: { create: items },
            },
        });

        totalOrders++;
        totalItems += items.length;
    }

    console.log(
        `   ✔ ${totalOrders} órdenes de compra creadas (${totalItems} ítems)`,
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("\n🌱  Iniciando seed de Stockly…\n");

    await cleanAll();

    const users = await seedUsers();
    const categoryMap = await seedCategories();
    const brandMap = await seedBrands();
    const supplierMap = await seedSuppliers();
    const products = await seedProducts(categoryMap, brandMap, supplierMap);

    await seedStockMovements(products);
    await seedPriceHistory(products);
    await seedPurchaseOrders(products, supplierMap);

    const pad = (n: number) => String(n).padStart(3);
    console.log(`
┌──────────────────────────────────────┐
│      Seed completado con éxito ✅    │
├──────────────────────────────────────┤
│  Usuarios       ${pad(users.length)}                  │
│  Categorías     ${pad(categoryMap.size)}                  │
│  Marcas         ${pad(brandMap.size)}                  │
│  Proveedores    ${pad(supplierMap.size)}                  │
│  Productos      ${pad(products.length)}                  │
└──────────────────────────────────────┘

  Credenciales:
  ● admin@stockly.app   →  Admin1234!  (ADMIN)
  ● carlos@stockly.app  →  Admin1234!  (ADMIN)
  ● laura@stockly.app   →  User1234!   (USER)
`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
