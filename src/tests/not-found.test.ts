import request from "supertest";
import app from "@/app";

// T2-01: una ruta desconocida caía en el manejador por defecto de Express, que responde
// una página HTML. El código ya era 404 —por eso `health.test.ts` lo daba por bueno—,
// así que lo que se comprueba aquí es el **formato**, que es lo que estaba roto: un
// cliente que hace `res.json()` con esa respuesta falla al parsear, y el error que ve
// no menciona en ningún momento que la ruta no exista.

describe("Rutas desconocidas (T2-01)", () => {
    it("responde JSON con el sobre de la API, no la página de Express", async () => {
        const res = await request(app).get("/api/v1/ruta-que-no-existe");

        expect(res.status).toBe(404);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
        expect(res.body).toMatchObject({ success: false });
        expect(typeof res.body.message).toBe("string");
    });

    it("el cuerpo no contiene HTML", async () => {
        const res = await request(app).get("/api/v1/ruta-que-no-existe");

        // La comprobación que faltaba: el `Cannot GET …` de Express llega envuelto en
        // un documento completo, y es eso —no el código de estado— lo que rompía.
        expect(res.text).not.toContain("<!DOCTYPE");
        expect(res.text).not.toContain("Cannot GET");
    });

    it("una ruta existente con el verbo equivocado también responde JSON", async () => {
        // `/auth/login` existe, pero solo para POST. Se usa un verbo **no mutante** a
        // propósito: la protección CSRF va antes del router y en el servidor real corta
        // un DELETE sin token con un 403 que nunca llega hasta aquí. En tests el CSRF se
        // omite, así que un caso con DELETE pasaría y estaría describiendo algo que en
        // producción no ocurre.
        const res = await request(app).get("/api/v1/auth/login");

        expect(res.status).toBe(404);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
        // El mensaje nombra el método: sin él parecería mentir, porque la ruta sí existe.
        expect(res.body.message).toContain("GET");
    });

    it("fuera de `/api/v1` tampoco se escapa una página HTML", async () => {
        const res = await request(app).get("/no-existe");

        expect(res.status).toBe(404);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
    });

    it("las rutas que sí existen siguen respondiendo", async () => {
        // El 404 va al final de la cadena: si se hubiera colado antes del router,
        // este test caería y el resto del suite con él.
        const res = await request(app).get("/api/v1/health");

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
