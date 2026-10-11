import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";

/** El cliente de Prisma o el de una transacción. */
type Cliente = Pick<typeof prisma, "warehouse">;

/**
 * T5-14 — el almacén predeterminado: el que usa una operación que no dice cuál.
 *
 * Siempre existe: lo crea la migración, no hay ruta que lo borre y `hacerPredeterminado` lo
 * cambia sin pasar por un instante en el que no haya ninguno. Que falte es una base rota, no
 * un error de quien llama, y por eso es un 500 sin código.
 */
export async function almacenPredeterminado(cliente: Cliente = prisma) {
    const almacen = await cliente.warehouse.findFirst({ where: { isDefault: true } });
    if (!almacen) throw new Error("No hay almacén predeterminado: falta la migración de T5-14 o se borró a mano");
    return almacen;
}

/**
 * T5-14 — el almacén en el que va a ocurrir una operación **nueva**: el que diga la petición o,
 * si calla, el predeterminado. Tiene que existir y estar activo.
 *
 * Es lo que hace que la API de antes de los almacenes siga valiendo tal cual: quien no manda
 * `warehouseId` opera sobre el predeterminado, que es donde la migración dejó todo el stock.
 */
export async function almacenParaOperar(warehouseId: string | undefined | null, cliente: Cliente = prisma) {
    if (!warehouseId) return almacenPredeterminado(cliente);

    const almacen = await cliente.warehouse.findUnique({ where: { id: warehouseId } });
    if (!almacen) throw new HttpError(404, "Almacén no encontrado", "WAREHOUSE_NOT_FOUND");
    if (!almacen.isActive) {
        throw new HttpError(409, `El almacén «${almacen.name}» está desactivado`, "WAREHOUSE_INACTIVE", { almacen: almacen.name });
    }
    return almacen;
}

/**
 * El almacén de un filtro de listado (`?warehouseId=`). Uno que no existe es 404 y no una lista
 * vacía: quien filtra por un identificador mal copiado tiene que enterarse. Uno inactivo sí
 * vale: su historia se sigue pudiendo consultar.
 */
export async function almacenDelFiltro(valor: unknown, cliente: Cliente = prisma): Promise<string | undefined> {
    if (typeof valor !== "string" || !valor) return undefined;
    const almacen = await cliente.warehouse.findUnique({ where: { id: valor }, select: { id: true } });
    if (!almacen) throw new HttpError(404, "Almacén no encontrado", "WAREHOUSE_NOT_FOUND");
    return almacen.id;
}
