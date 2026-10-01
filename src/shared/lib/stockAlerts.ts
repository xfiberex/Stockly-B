import { prisma } from "@/shared/lib/prisma";
import { settingsService } from "@/modules/settings/settings.service";
import { sendLowStockAlertEmail } from "@/shared/lib/nodemailer";
import { logger } from "@/shared/lib/logger";
import { notificationsService } from "@/modules/notifications/notifications.service";

/** El producto tal como quedó tras el movimiento que dispara la alerta. */
export interface ProductoEnAlerta {
    id: string;
    name: string;
    stock: number;
    minStock: number;
}

// Avisa a los administradores cuando un producto queda en su stock mínimo o por debajo.
// Compartido por product.service, sale-orders.service e inventory-counts.service.
// Es best-effort: los fallos no interrumpen la operación que lo dispara.
export async function checkLowStockAlert(producto: ProductoEnAlerta): Promise<void> {
    const { name: productName, stock: newStock, minStock } = producto;
    if (newStock > minStock) return;

    // T5-12 — el aviso dentro de la aplicación va **antes** del ajuste y sin mirarlo: el
    // correo es opcional, enterarse no. Y con su propio `catch`: que falle uno de los dos
    // canales no puede dejar al otro sin salir.
    await notificationsService.avisarStockBajo(producto).catch((err: unknown) => {
        logger.warn({ err, productName }, "No se pudo crear el aviso de bajo stock");
    });

    const enabled = await settingsService.get("lowStockAlertEnabled");
    if (!enabled) return;

    // T4-12: `idioma` en el `select`. Este correo no lo pide nadie —lo dispara una venta o
    // un ajuste de stock ajeno—, así que **no hay ninguna petición de la que deducirlo**: el
    // idioma tiene que salir de la fila de cada destinatario. Dos administradores con
    // preferencias distintas reciben el mismo aviso en dos idiomas.
    const admins = await prisma.user.findMany({
        where: { role: "ADMIN", isActive: true, isVerified: true },
        select: { email: true, name: true, idioma: true },
    });

    await Promise.allSettled(
        admins.map((admin) =>
            sendLowStockAlertEmail(admin.email, admin.name, productName, newStock, minStock, admin.idioma),
        ),
    );
}

/**
 * Alertas en vuelo (T2-07).
 *
 * La alerta ya estaba fuera de la transacción, pero se esperaba dentro del ciclo
 * de la petición: quien registraba una salida de stock pagaba en su tiempo de
 * respuesta la latencia del servidor SMTP — y en las órdenes de venta, una vez
 * por producto, en serie. Ahora se dispara sin esperar.
 *
 * El registro existe porque un `void promesa` deja el envío sin testar y sin
 * apagar el proceso ordenadamente: guarda las promesas vivas para que los tests
 * puedan esperarlas de verdad, en vez de dormir un rato y cruzar los dedos.
 */
const enVuelo = new Set<Promise<unknown>>();

function enSegundoPlano(trabajo: Promise<unknown>, alFallar: (err: unknown) => void): void {
    const tarea = trabajo.catch(alFallar).finally(() => {
        enVuelo.delete(tarea);
    });

    enVuelo.add(tarea);
}

export function dispararAlertaStock(producto: ProductoEnAlerta): void {
    enSegundoPlano(checkLowStockAlert(producto), (err) => {
        // Un fallo de correo no puede tumbar la operación que ya se guardó, pero
        // tampoco puede desaparecer: sin esta línea, el aviso se perdía en silencio.
        logger.warn({ err, productName: producto.name }, "No se pudo enviar la alerta de bajo stock");
    });
}

/**
 * T5-12 — la venta que no se pudo enviar por falta de stock. Sin esperar, como la alerta: el
 * envío ya ha fallado y quien lo intentó está esperando su error, no este aviso.
 */
export function dispararAvisoDeVentaSinStock(
    saleOrderId: string,
    falta: { productName: string; available: number; required: number },
    actorId?: string,
): void {
    enSegundoPlano(notificationsService.avisarVentaSinStock(saleOrderId, falta, actorId), (err) => {
        logger.warn({ err, saleOrderId }, "No se pudo crear el aviso de venta sin stock");
    });
}

/** Espera a que terminen las alertas en vuelo. Pensado para los tests y para un apagado limpio. */
export async function esperarAlertasEnVuelo(): Promise<void> {
    await Promise.allSettled([...enVuelo]);
}
