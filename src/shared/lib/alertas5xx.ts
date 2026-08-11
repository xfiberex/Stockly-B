import { prisma } from "@/shared/lib/prisma";
import { sendServerErrorAlertEmail } from "@/shared/lib/nodemailer";
import { logger } from "@/shared/lib/logger";
import { env } from "@/config/env";

/**
 * Alerta por pico de errores 5xx (T4-06).
 *
 * El criterio de la tarea es que **un pico de 5xx avise antes de que lo reporte un
 * usuario**. Con Prometheus y Alertmanager delante eso lo resuelve una regla (ver
 * `docs/operaciones.md` §8), pero esa pila es infraestructura que hay que desplegar y
 * mantener, y mientras no exista el sistema se queda exactamente igual de mudo que antes.
 *
 * Esto es la red de seguridad que **no depende de nada externo**: el propio proceso cuenta
 * sus 5xx en una ventana deslizante y, al cruzar el umbral, escribe una línea de nivel
 * `error` con un marcador estable —`alerta: "pico_5xx"`, sobre la que se puede montar una
 * alerta del recolector de logs— y avisa por correo a los administradores. El correo ya
 * existía para el bajo stock; aquí se reutiliza el mismo camino.
 *
 * **Lo que este mecanismo no puede hacer, y por eso no sustituye a Prometheus:** vive
 * dentro del proceso, así que no avisa de lo único que de verdad importa cuando el
 * servicio muere —que ha dejado de responder—. Para eso hace falta algo que mire desde
 * fuera. Los dos niveles se complementan; ninguno sobra.
 */

/** Un 5xx, con lo justo para que el aviso diga dónde y permita tirar del hilo. */
type Suceso = { instante: number; ruta: string; status: number; requestId?: string };

const sucesos: Suceso[] = [];
let ultimaAlerta = 0;

const ventanaMs = env.alerta5xx.ventanaMinutos * 60_000;
const enfriamientoMs = env.alerta5xx.enfriamientoMinutos * 60_000;

const enVuelo = new Set<Promise<unknown>>();

/**
 * Registra un 5xx y decide si toca avisar.
 *
 * Se llama desde el middleware de métricas, en `res.on("finish")`, y **no desde el
 * manejador de errores**: hay 5xx que no pasan por él —los que escribe Express al
 * romperse el propio parseo, o cualquier ruta que responda 503 a mano, como `/ready`—, y
 * son precisamente los que más cuesta ver.
 */
export function registrar5xx(suceso: Omit<Suceso, "instante">): void {
    if (!env.alerta5xx.habilitada) return;

    const ahora = Date.now();

    sucesos.push({ ...suceso, instante: ahora });

    // Podar por delante. La ventana es deslizante, así que el array nunca crece más allá
    // de los 5xx de los últimos minutos: en un servicio sano son cero.
    while (sucesos.length > 0 && ahora - sucesos[0]!.instante > ventanaMs) sucesos.shift();

    if (sucesos.length < env.alerta5xx.umbral) return;

    // El enfriamiento es lo que separa «una alerta» de «un buzón inservible». Una avería
    // real produce cientos de 5xx por minuto: sin esto, el aviso útil queda enterrado bajo
    // sus propias repeticiones y el siguiente incidente ya nadie lo mira.
    if (ahora - ultimaAlerta < enfriamientoMs) return;

    ultimaAlerta = ahora;
    disparar([...sucesos]);
}

/** Las rutas del pico, de más a menos ruidosa. */
function porRuta(lista: Suceso[]): Array<{ ruta: string; total: number }> {
    const cuenta = new Map<string, number>();
    for (const s of lista) cuenta.set(s.ruta, (cuenta.get(s.ruta) ?? 0) + 1);

    return [...cuenta.entries()]
        .map(([ruta, total]) => ({ ruta, total }))
        .sort((a, b) => b.total - a.total);
}

function disparar(lista: Suceso[]): void {
    const resumen = {
        total: lista.length,
        ventanaMinutos: env.alerta5xx.ventanaMinutos,
        rutas: porRuta(lista),
        // Con este identificador se recuperan todas las líneas de una de las peticiones
        // rotas (T2-10). Es el primer sitio al que hay que ir tras leer el aviso.
        requestId: lista[lista.length - 1]?.requestId,
    };

    // Va primero y sin esperar a nada: aunque el correo no esté configurado o falle, el
    // pico queda registrado con un marcador estable sobre el que un recolector de logs
    // puede alertar por su cuenta.
    logger.error({ alerta: "pico_5xx", ...resumen }, `Pico de errores 5xx: ${resumen.total} en ${resumen.ventanaMinutos} min`);

    const tarea = avisarPorCorreo(resumen)
        .catch((err: unknown) => {
            logger.warn({ err, alerta: "pico_5xx" }, "No se pudo enviar el aviso de pico de 5xx");
        })
        .finally(() => {
            enVuelo.delete(tarea);
        });

    enVuelo.add(tarea);
}

async function avisarPorCorreo(resumen: {
    total: number;
    ventanaMinutos: number;
    rutas: Array<{ ruta: string; total: number }>;
    requestId?: string;
}): Promise<void> {
    if (!env.smtp.configured) return;

    const admins = await prisma.user.findMany({
        where: { role: "ADMIN", isActive: true, isVerified: true },
        select: { email: true, name: true },
    });

    await Promise.allSettled(
        admins.map((admin) => sendServerErrorAlertEmail(admin.email, admin.name, resumen)),
    );
}

/** Espera a los avisos en vuelo. Para los tests y para un apagado limpio. */
export async function esperarAlertasEnVuelo(): Promise<void> {
    await Promise.allSettled([...enVuelo]);
}

/** Vacía la ventana y el enfriamiento. Solo lo usan los tests. */
export function reiniciarVentana(): void {
    sucesos.length = 0;
    ultimaAlerta = 0;
}
