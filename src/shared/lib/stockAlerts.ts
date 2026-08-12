import { prisma } from "@/shared/lib/prisma";
import { settingsService } from "@/modules/settings/settings.service";
import { sendLowStockAlertEmail } from "@/shared/lib/nodemailer";
import { logger } from "@/shared/lib/logger";

// Notifica por correo a los administradores cuando un producto queda en/bajo su stock mínimo.
// Compartido por product.service y sale-orders.service para evitar duplicación.
// Es best-effort: los fallos de envío no interrumpen la operación que lo dispara.
export async function checkLowStockAlert(
    productName: string,
    newStock: number,
    minStock: number,
): Promise<void> {
    if (newStock > minStock) return;

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

export function dispararAlertaStock(productName: string, newStock: number, minStock: number): void {
    const tarea = checkLowStockAlert(productName, newStock, minStock)
        .catch((err: unknown) => {
            // Un fallo de correo no puede tumbar la operación que ya se guardó, pero
            // tampoco puede desaparecer: sin esta línea, el aviso se perdía en silencio.
            logger.warn({ err, productName }, "No se pudo enviar la alerta de bajo stock");
        })
        .finally(() => {
            enVuelo.delete(tarea);
        });

    enVuelo.add(tarea);
}

/** Espera a que terminen las alertas en vuelo. Pensado para los tests y para un apagado limpio. */
export async function esperarAlertasEnVuelo(): Promise<void> {
    await Promise.allSettled([...enVuelo]);
}
