import request from "supertest";
import type { Request, Response } from "express";
import app from "@/app";
import { errorHandler } from "@/shared/middlewares/error.middleware";

// T2-33: los 5 MB de cuerpo estaban puestos globalmente por una sola ruta, la
// importación masiva. Lo que se comprueba es que el límite ajustado no rompe esa ruta
// y que el rechazo llega como 413 en JSON, no como un 500 genérico.

/** Un cuerpo JSON válido de aproximadamente `kb` kilobytes. */
function cuerpoDe(kb: number) {
    return { relleno: "x".repeat(kb * 1024) };
}

describe("Límite de tamaño del cuerpo (T2-33)", () => {
    it("rechaza con 413 un cuerpo de 1 MB en una ruta corriente", async () => {
        const res = await request(app).post("/api/v1/auth/login").send(cuerpoDe(1024));

        expect(res.status).toBe(413);
    });

    it("el 413 viaja en el sobre JSON de la API, no como error genérico", async () => {
        const res = await request(app).post("/api/v1/auth/login").send(cuerpoDe(1024));

        // `body-parser` lanza un error que no es `HttpError`: sin tratarlo, el manejador
        // lo tomaba por una avería y respondía 500, escondiendo la causa real.
        expect(res.headers["content-type"]).toMatch(/application\/json/);
        expect(res.body).toMatchObject({ success: false });
        // El mensaje es el de `body-parser` («request entity too large»), que se reenvía
        // porque viene marcado como `expose: true`: es la convención de `http-errors`
        // para decir «esto se le puede enseñar al cliente».
        expect(res.body.message).toMatch(/too large/i);
    });

    it("un cuerpo pequeño sigue pasando en las rutas corrientes", async () => {
        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "no-existe@stockly.app", password: "loQueSea1!" });

        // Da igual que las credenciales fallen: lo que importa es que el cuerpo se
        // parsea y la petición llega a la lógica, en vez de morir en el límite.
        expect(res.status).not.toBe(413);
    });

    it("la ruta de importación sí acepta un cuerpo grande", async () => {
        const res = await request(app).post("/api/v1/products/import").send(cuerpoDe(1024));

        // Sin autenticación responderá 401, y con un cuerpo inválido 422 — pero nunca
        // 413: ahí es donde el límite de 5 MB tiene que seguir vivo.
        expect(res.status).not.toBe(413);
    });
});

// El 413 obligó a que `errorHandler` entendiera los errores de terceros marcados como
// expuestos (`http-errors`). Ese ensanchamiento tiene que ser estrecho: reenviar el
// mensaje de cualquier error ajeno filtraría detalles internos al cliente.
describe("errorHandler — errores de terceros (T2-33)", () => {
    /** Un doble mínimo de `Response` que recuerda con qué se le llamó. */
    function respuestaFalsa() {
        const registro: { codigo?: number; cuerpo?: unknown } = {};
        const res = {
            status(codigo: number) { registro.codigo = codigo; return this; },
            json(cuerpo: unknown) { registro.cuerpo = cuerpo; return this; },
            getHeader: () => undefined,
        } as unknown as Response;
        return { res, registro };
    }

    const peticion = { method: "POST", originalUrl: "/api/v1/x", log: { error: () => {} } } as unknown as Request;

    function lanzar(err: Error) {
        const { res, registro } = respuestaFalsa();
        errorHandler(err, peticion, res, () => {});
        return registro;
    }

    it("respeta el código de un error 4xx marcado como expuesto", () => {
        const err = Object.assign(new Error("request entity too large"), { status: 413, expose: true });

        expect(lanzar(err)).toMatchObject({ codigo: 413, cuerpo: { success: false, message: "request entity too large" } });
    });

    it("un error 4xx sin `expose` sigue siendo un 500", () => {
        const err = Object.assign(new Error("detalle interno"), { status: 400 });

        // Sin la marca no hay permiso para enseñar el mensaje: se trata como avería.
        expect(lanzar(err).codigo).toBe(500);
    });

    it("un 5xx expuesto tampoco se reenvía tal cual", () => {
        const err = Object.assign(new Error("el servicio de al lado se cayó"), { status: 502, expose: true });

        // La regla cubre «el cliente se equivocó», no «algo se rompió»: un 5xx ajeno
        // pasa por el camino de siempre, que lo registra y lo oculta en producción.
        expect(lanzar(err).codigo).toBe(500);
    });
});
