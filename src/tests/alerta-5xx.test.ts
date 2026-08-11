import request from "supertest";
import type { Express } from "express";
import { cleanDb, createUser } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    sendServerErrorAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/**
 * T4-06 — el criterio de aceptación de la tarea, ejecutado.
 *
 * «Un pico de errores 5xx genera una alerta antes de que lo reporte un usuario»: aquí se
 * provoca el pico de verdad, contra la aplicación entera y por HTTP, y se comprueba que
 * sale el aviso.
 *
 * **La configuración se lee al importar `config/env`**, así que el módulo se recarga con
 * el entorno puesto en vez de añadir un ajuste que solo existiría para el test. En `test`
 * la alerta viene apagada de fábrica a propósito: el `.env` trae credenciales SMTP reales
 * y cualquier suite que provoque un 500 acabaría mandando correo.
 */
describe("Alerta por pico de errores 5xx (T4-06)", () => {
    const UMBRAL = 3;
    const entornoOriginal = { ...process.env };

    let app: Express;
    let prisma: typeof import("@/shared/lib/prisma").prisma;
    let logger: typeof import("@/shared/lib/logger").logger;
    let esperarAlertasEnVuelo: () => Promise<void>;
    let reiniciarVentana: () => void;
    let enviarAviso: jest.Mock;

    beforeAll(async () => {
        process.env.ALERTA_5XX_HABILITADA = "true";
        process.env.ALERTA_5XX_UMBRAL = String(UMBRAL);
        process.env.ALERTA_5XX_VENTANA_MIN = "5";
        process.env.ALERTA_5XX_ENFRIAMIENTO_MIN = "30";

        jest.resetModules();

        app = (await import("@/app")).default;
        ({ prisma } = await import("@/shared/lib/prisma"));
        ({ logger } = await import("@/shared/lib/logger"));
        ({ esperarAlertasEnVuelo, reiniciarVentana } = await import("@/shared/lib/alertas5xx"));
        enviarAviso = (await import("@/shared/lib/nodemailer")).sendServerErrorAlertEmail as jest.Mock;

        await cleanDb();
        await createUser({ email: "admin_5xx@example.com", name: "Admin 5xx", role: "ADMIN" });
    });

    afterAll(async () => {
        process.env = { ...entornoOriginal };
        await cleanDb();
        jest.resetModules();
    });

    beforeEach(() => {
        reiniciarVentana();
        enviarAviso.mockClear();
    });

    /** Provoca `veces` respuestas 5xx reales por HTTP. */
    async function provocarErrores(veces: number): Promise<void> {
        // `/ready` con la base caída responde **503**, que es un 5xx que no pasa por el
        // manejador de errores. Es justo la clase de fallo que se escapa si uno cuenta los
        // errores desde `errorHandler` en vez de desde la respuesta.
        const consulta = jest.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("sin conexión"));

        for (let i = 0; i < veces; i++) {
            const res = await request(app).get("/api/v1/ready");
            expect(res.status).toBe(503);
        }

        consulta.mockRestore();
    }

    it("no avisa mientras los errores no llegan al umbral", async () => {
        await provocarErrores(UMBRAL - 1);
        await esperarAlertasEnVuelo();

        expect(enviarAviso).not.toHaveBeenCalled();
    });

    it("avisa por correo al administrador al cruzar el umbral", async () => {
        await provocarErrores(UMBRAL);
        await esperarAlertasEnVuelo();

        expect(enviarAviso).toHaveBeenCalledTimes(1);

        const [destinatario, nombre, resumen] = enviarAviso.mock.calls[0]!;

        expect(destinatario).toBe("admin_5xx@example.com");
        expect(nombre).toBe("Admin 5xx");
        expect(resumen).toMatchObject({ total: UMBRAL, ventanaMinutos: 5 });
        // El aviso tiene que decir **dónde**, o solo sirve para saber que algo pasa.
        expect(resumen.rutas[0]).toMatchObject({ ruta: "GET /api/v1/ready", total: UMBRAL });
        // Y con qué tirar del hilo: el identificador recupera todas las líneas de esa
        // petición en el registro (T2-10).
        expect(typeof resumen.requestId).toBe("string");
    });

    it("deja constancia en el registro con un marcador estable, aunque no haya correo", async () => {
        const registro = jest.spyOn(logger, "error");

        await provocarErrores(UMBRAL);
        await esperarAlertasEnVuelo();

        const alerta = registro.mock.calls.find(
            ([datos]) => typeof datos === "object" && datos !== null && (datos as { alerta?: string }).alerta === "pico_5xx",
        );

        // Sobre este campo puede alertar un recolector de logs por su cuenta, sin depender
        // ni del correo ni de Prometheus.
        expect(alerta).toBeDefined();
        expect(alerta![0]).toMatchObject({ alerta: "pico_5xx", total: UMBRAL });

        registro.mockRestore();
    });

    it("no repite el aviso durante el enfriamiento, aunque los errores sigan", async () => {
        await provocarErrores(UMBRAL);
        await esperarAlertasEnVuelo();
        expect(enviarAviso).toHaveBeenCalledTimes(1);

        // Una avería real produce cientos de 5xx por minuto. Sin enfriamiento, el aviso
        // útil queda enterrado bajo sus propias repeticiones.
        await provocarErrores(UMBRAL * 2);
        await esperarAlertasEnVuelo();

        expect(enviarAviso).toHaveBeenCalledTimes(1);
    });

    it("un fallo al enviar el correo no tumba la petición que lo provocó", async () => {
        enviarAviso.mockRejectedValueOnce(new Error("SMTP caído"));

        // El aviso es best-effort: si el buzón no está, el servicio sigue igual de roto
        // pero no *más* roto.
        await expect(provocarErrores(UMBRAL)).resolves.toBeUndefined();
        await esperarAlertasEnVuelo();

        expect(enviarAviso).toHaveBeenCalled();
    });
});
