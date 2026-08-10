import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser } from "./helpers";

// T2-31: la rotación ya era correcta, pero **reutilizar** un token ya rotado se trataba
// como una sesión caducada cualquiera: 401 y a otra cosa. Un token gastado que reaparece
// no tiene una explicación inocente —alguien se hizo con él—, y como la rotación ya
// entregó uno nuevo, callarse deja al atacante con sesión indefinida.

const BASE = "/api/v1/auth";
const PASSWORD = "Test1234!";

/** Extrae la cookie del refresh token de una respuesta, lista para reenviar. */
function cookieDeRefresco(res: request.Response): string {
    const cookies = res.headers["set-cookie"] as unknown as string[];
    return cookies.find((c) => c.startsWith("refreshToken="))!.split(";")[0]!;
}

describe("Reuso de refresh tokens (T2-31)", () => {
    beforeAll(async () => {
        await cleanDb();
    });

    afterAll(async () => {
        await cleanDb();
    });

    async function sesionIniciada(email: string) {
        const user = await createUser({ email, password: PASSWORD });
        const login = await request(app).post(`${BASE}/login`).send({ email: user.email, password: PASSWORD });
        expect(login.status).toBe(200);
        return { user, cookie: cookieDeRefresco(login) };
    }

    it("reutilizar un token ya rotado cierra la sesión y queda en la auditoría", async () => {
        const { user, cookie: original } = await sesionIniciada(`reuso_${Date.now()}@example.com`);

        // Rotación normal: el token original queda gastado y se emite uno nuevo.
        const rotacion = await request(app).post(`${BASE}/refresh`).set("Cookie", original);
        expect(rotacion.status).toBe(200);
        const nuevo = cookieDeRefresco(rotacion);

        // Alguien presenta el **viejo**: eso es el reuso.
        const reuso = await request(app).post(`${BASE}/refresh`).set("Cookie", original);
        expect(reuso.status).toBe(401);

        // Lo que importa no es ese 401 —antes también lo daba— sino lo que pasa después:
        // el token **legítimo** deja de servir. Se cierra la familia entera porque no hay
        // forma de saber cuál de los dos está en manos del atacante.
        const conElNuevo = await request(app).post(`${BASE}/refresh`).set("Cookie", nuevo);
        expect(conElNuevo.status).toBe(401);

        const guardado = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        expect(guardado.refreshToken).toBeNull();
        expect(guardado.previousRefreshToken).toBeNull();
        expect(guardado.refreshExpires).toBeNull();

        const registro = await prisma.auditLog.findFirst({
            where: { action: "REFRESH_REUSE", entityId: user.id },
        });
        expect(registro).not.toBeNull();
        expect(registro?.userEmail).toBe(user.email);
    });

    it("la rotación normal, repetida, sigue funcionando", async () => {
        const { cookie } = await sesionIniciada(`rotacion_${Date.now()}@example.com`);

        // Tres rotaciones encadenadas: cada una usa el token que devolvió la anterior.
        // Sin esto, una detección demasiado celosa —por ejemplo, comparar contra el
        // token que se acaba de emitir— rompería el uso normal y no lo notaría nadie
        // hasta que las sesiones empezaran a caerse solas.
        let actual = cookie;
        for (let i = 0; i < 3; i++) {
            const res = await request(app).post(`${BASE}/refresh`).set("Cookie", actual);
            expect(res.status).toBe(200);
            actual = cookieDeRefresco(res);
        }
    });

    it("un token inventado no dispara la alarma ni toca ninguna sesión", async () => {
        const { user, cookie } = await sesionIniciada(`inventado_${Date.now()}@example.com`);

        const res = await request(app)
            .post(`${BASE}/refresh`)
            .set("Cookie", "refreshToken=" + "f".repeat(64));

        expect(res.status).toBe(401);
        // La sesión buena sobrevive: la alarma solo salta con un token que **existió**.
        const sigueViva = await request(app).post(`${BASE}/refresh`).set("Cookie", cookie);
        expect(sigueViva.status).toBe(200);

        const registro = await prisma.auditLog.findFirst({
            where: { action: "REFRESH_REUSE", entityId: user.id },
        });
        expect(registro).toBeNull();
    });

    it("cerrar sesión no deja un token capaz de disparar la alarma después", async () => {
        const { user, cookie } = await sesionIniciada(`logout_${Date.now()}@example.com`);

        const rotacion = await request(app).post(`${BASE}/refresh`).set("Cookie", cookie);
        const nuevo = cookieDeRefresco(rotacion);
        await request(app).post(`${BASE}/logout`).set("Cookie", nuevo);

        // Presentar el viejo tras un logout ordenado: es un 401, pero **no** una anomalía.
        // Sin limpiar `previousRefreshToken` al cerrar sesión, esto registraría un reuso
        // falso sobre una sesión que el propio usuario cerró.
        const res = await request(app).post(`${BASE}/refresh`).set("Cookie", cookie);
        expect(res.status).toBe(401);

        const registro = await prisma.auditLog.findFirst({
            where: { action: "REFRESH_REUSE", entityId: user.id },
        });
        expect(registro).toBeNull();
    });

    it("un inicio de sesión nuevo no arrastra el token anterior", async () => {
        const email = `relogin_${Date.now()}@example.com`;
        const { user, cookie: primera } = await sesionIniciada(email);
        await request(app).post(`${BASE}/refresh`).set("Cookie", primera);

        // Segundo login: empieza una familia nueva.
        const relogin = await request(app).post(`${BASE}/login`).send({ email, password: PASSWORD });
        expect(relogin.status).toBe(200);

        const guardado = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
        // Si el «anterior» se arrastrara, un token de la sesión pasada seguiría pudiendo
        // disparar la alarma y cerrar la sesión nueva sin que nadie robara nada.
        expect(guardado.previousRefreshToken).toBeNull();
    });
});
