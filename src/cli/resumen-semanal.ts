// Resumen semanal por correo (T5-11).
//
//   pnpm resumen:enviar                  en desarrollo
//   node dist/cli/resumen-semanal.js     en producción, donde no hay `tsx`
//
// Se programa **desde fuera** —cron, el programador de tareas, un `CronJob`—, como
// `pnpm db:backup`: el backend no tiene planificador (ver `shared/lib/resumenSemanal.ts`).
// Cuándo y cómo, en `docs/operaciones.md`.
//
// Sale con 0 si no había nada que hacer —el ajuste está apagado, ya se envió— o si se envió a
// todos, y con 1 si algún envío falló o el correo no está configurado: es lo que el
// planificador mira para avisar. Repetirlo es seguro; solo reenvía a quien no le llegó.

import "dotenv/config";
import { prisma } from "@/shared/lib/prisma";
import { enviarResumenSemanal, type ResultadoDelResumen } from "@/shared/lib/resumenSemanal";

/** Lo que se le dice a quien mira el registro del planificador, y con qué código se sale. */
export function informeDe(resultado: ResultadoDelResumen): { mensaje: string; codigo: 0 | 1 } {
    switch (resultado.estado) {
        case "desactivado":
            return { mensaje: "El resumen semanal está desactivado en Configuración: no se envía nada.", codigo: 0 };
        case "sin-destinatarios":
            return { mensaje: "No hay ningún administrador activo y verificado: no se envía nada.", codigo: 0 };
        case "ya-enviado":
            return { mensaje: `El resumen de la semana del ${resultado.from} al ${resultado.to} ya se envió: no se repite.`, codigo: 0 };
        case "en-curso":
            return { mensaje: `Otra ejecución está enviando el resumen de la semana del ${resultado.from} al ${resultado.to}: no se hace nada.`, codigo: 0 };
        case "enviado": {
            const semana = `semana del ${resultado.from} al ${resultado.to}`;
            return resultado.fallidos === 0
                ? { mensaje: `Resumen de la ${semana} enviado a ${resultado.enviados} administrador(es).`, codigo: 0 }
                : {
                    mensaje: `Resumen de la ${semana}: ${resultado.enviados} enviado(s) y ${resultado.fallidos} fallido(s). Al repetir el comando se reintenta solo con los fallidos.`,
                    codigo: 1,
                };
        }
    }
}

export async function ejecutar(ahora?: Date): Promise<0 | 1> {
    try {
        const { mensaje, codigo } = informeDe(await enviarResumenSemanal(ahora));
        (codigo === 0 ? console.log : console.error)(mensaje);
        return codigo;
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        return 1;
    }
}

// Solo al invocar el archivo; importarlo desde un test no envía nada.
if (require.main === module) {
    void ejecutar().then(async (codigo) => {
        await prisma.$disconnect();
        process.exit(codigo);
    });
}
