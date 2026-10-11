import { prisma } from "@/shared/lib/prisma";
import { signToken } from "@/shared/lib/jwt";
import { hashPassword } from "@/shared/lib/hash";
import { siguienteNumeroDeVenta } from "@/shared/lib/numeroDeVenta";
import type { $Enums, Prisma } from "@/generated/prisma/client";

export async function cleanDb() {
    await prisma.saleOrderItem.deleteMany();
    await prisma.saleOrder.deleteMany();
    // T6-04 — con las ventas borradas, la serie vuelve a empezar en el 1.
    await prisma.counter.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.purchaseOrderItem.deleteMany();
    await prisma.purchaseOrder.deleteMany();
    await prisma.priceHistory.deleteMany();
    await prisma.costHistory.deleteMany();
    await prisma.stockMovement.deleteMany();
    // T5-14 — después de sus movimientos, que apuntan a ellas.
    await prisma.stockTransfer.deleteMany();
    // T5-07 — las líneas caen con su sesión (Cascade).
    await prisma.inventoryCount.deleteMany();
    // T5-10 — `product_abc` cae con sus productos (Cascade); la fila del cálculo no, y sin
    // borrarla la caché se daría por vigente con una tabla vacía.
    await prisma.abcCalculation.deleteMany();
    // T5-14 — `stock_levels` cae con sus productos (Cascade), y **no se borra antes**: con los
    // productos todavía ahí, la base rechazaría dejarlos con un total que sus niveles no suman.
    await prisma.product.deleteMany();
    // T5-14 — y los almacenes, para volver a empezar con uno solo, el predeterminado, y siempre
    // con el mismo id: así un test puede nombrarlo sin ir a buscarlo.
    await prisma.warehouse.deleteMany();
    await prisma.warehouse.create({ data: { id: ALMACEN, name: "Principal", isDefault: true } });
    await prisma.tag.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.appSetting.deleteMany();
    // T5-11 — sin borrarla, un resumen ya «enviado» sobreviviría a la limpieza.
    await prisma.weeklyDigest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
}

/**
 * T5-14 — el almacén predeterminado de la base de tests, el que deja `cleanDb`. Es el que usa
 * la API cuando una petición no dice almacén, y el que hay que poner en lo que un test crea
 * **directamente** con Prisma: una orden, un conteo o un movimiento sin almacén no existen.
 */
export const ALMACEN = "00000000-0000-4000-8000-0000000000a1";

/**
 * T5-14 — `prisma.product.create`, con el nivel que su stock exige. Un producto con stock y sin
 * nivel no se puede ni insertar: la base comprueba al confirmar que el total es la suma de sus
 * almacenes. El stock va entero al predeterminado, que es lo que era antes de los almacenes.
 */
export function crearProducto<T extends Prisma.ProductCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductCreateArgs>,
): Promise<Prisma.ProductGetPayload<T>> {
    const stock = Number((args.data as { stock?: number }).stock ?? 0);
    const conNivel = stock === 0 ? args : { ...args, data: { ...args.data, stockLevels: { create: { warehouseId: ALMACEN, stock } } } };
    return prisma.product.create(conNivel as typeof args) as unknown as Promise<Prisma.ProductGetPayload<T>>;
}

/** T5-14 — `prisma.product.createMany`, con los niveles: los productos y su stock, en una transacción. */
export async function crearProductos(args: { data: Prisma.ProductCreateManyInput[] }): Promise<{ count: number }> {
    return prisma.$transaction(async (tx) => {
        const creados = await tx.product.createManyAndReturn({ data: args.data, select: { id: true, stock: true } });
        const conStock = creados.filter((p) => p.stock !== 0);
        if (conStock.length > 0) {
            await tx.stockLevel.createMany({ data: conStock.map((p) => ({ productId: p.id, warehouseId: ALMACEN, stock: p.stock })) });
        }
        return { count: creados.length };
    });
}

/**
 * T5-14 — deja un producto con `stock` unidades, todas en el predeterminado, **sin movimiento**:
 * el atajo de un test para montar su escenario. Lo que hubiera en otros almacenes desaparece.
 */
export async function ponerStock(productId: string, stock: number) {
    return prisma.$transaction(async (tx) => {
        await tx.stockLevel.deleteMany({ where: { productId } });
        if (stock !== 0) await tx.stockLevel.create({ data: { productId, warehouseId: ALMACEN, stock } });
        return tx.product.update({ where: { id: productId }, data: { stock } });
    });
}

/**
 * T6-04 — el número para una venta que el test crea **directamente** con Prisma. Sale del mismo
 * contador que usa el servicio: uno propio del test chocaría con el de una venta creada después
 * por la API.
 */
export const numeroDeVenta = () => siguienteNumeroDeVenta(prisma);

interface CreateUserOptions {
    name?: string;
    email?: string;
    password?: string;
    isVerified?: boolean;
    // T3-02: el enum de Prisma, no `string`. Así un rol mal escrito en un test falla al
    // compilar en vez de al ejecutar contra la base.
    role?: $Enums.Role;
    // T4-12: mismo criterio que `role`. Por defecto lo pone la base (español).
    idioma?: $Enums.Idioma;
}

export async function createUser(options: CreateUserOptions = {}) {
    const {
        name = "Test User",
        email = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`,
        password = "Test1234!",
        isVerified = true,
        role = "USER",
        idioma = "ES",
    } = options;

    const hashed = await hashPassword(password);
    return prisma.user.create({
        data: { name, email, password: hashed, isVerified, role, idioma },
    });
}

export function getAuthCookie(userId: string): string {
    const token = signToken({ userId });
    return `token=${token}`;
}
