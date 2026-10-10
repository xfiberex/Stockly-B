import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { hashToken } from "@/shared/lib/tokens";
import { comparePassword } from "@/shared/lib/hash";
import { DIAS_DE_INVITACION } from "@/modules/users/users.service";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

/**
 * T6-10 — alta de usuarios por invitación.
 *
 * Se sustituye el **transporte**, no `@/shared/lib/nodemailer`: el enlace que se usa aquí para
 * poner la contraseña es el que sale del correo que se habría enviado. Con el módulo entero
 * mockeado, un enlace a otra página o con otro token pasaría todos los tests.
 */
const enviados: Array<{ to: string; subject: string; html: string }> = [];
let falloDeEnvio: Error | null = null;

jest.mock("nodemailer", () => ({
    __esModule: true,
    default: {
        createTransport: () => ({
            sendMail: jest.fn(async (correo: { to: string; subject: string; html: string }) => {
                if (falloDeEnvio) throw falloDeEnvio;
                enviados.push(correo);
                return { messageId: "test" };
            }),
        }),
    },
}));

const USUARIOS = "/api/v1/users";
const AUTH = "/api/v1/auth";
const CLAVE = "Almacen2026";

/** El enlace del botón del último correo, ya sin las entidades del HTML. */
function enlaceDelUltimoCorreo(): URL {
    const html = enviados[enviados.length - 1]!.html;
    const href = /href="([^"]*\/auth\/reset-password[^"]*)"/.exec(html)![1]!;
    return new URL(href.replace(/&amp;/g, "&"));
}

const tokenDelUltimoCorreo = () => enlaceDelUltimoCorreo().searchParams.get("token")!;

describe("Alta de usuarios por invitación (T6-10)", () => {
    let admin: { id: string; email: string };
    let galletaAdmin: string;

    const invitar = (cuerpo: Record<string, unknown>, galleta = galletaAdmin) =>
        request(app).post(USUARIOS).set("Cookie", galleta).send(cuerpo);

    beforeAll(async () => {
        await cleanDb();
        admin = await createUser({ email: "invita_admin@example.com", role: "ADMIN" });
        galletaAdmin = getAuthCookie(admin.id);
    });

    beforeEach(() => {
        enviados.length = 0;
        falloDeEnvio = null;
    });

    afterAll(async () => {
        await cleanDb();
    });

    describe("el criterio de aceptación, de punta a punta", () => {
        const correo = "almacen@example.com";

        it("un ADMIN invita como WAREHOUSE: la cuenta nace con su rol, sin verificar y sin contraseña conocida", async () => {
            const antes = Date.now();
            const res = await invitar({ name: "Ana Almacén", email: correo, role: "WAREHOUSE" });

            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ name: "Ana Almacén", email: correo, role: "WAREHOUSE", isActive: true, isVerified: false });
            // Ni la contraseña ni el token salen en la respuesta.
            expect(Object.keys(res.body.data).sort()).toEqual(
                ["createdAt", "email", "id", "isActive", "isVerified", "name", "role", "updatedAt"],
            );

            const fila = await prisma.user.findUniqueOrThrow({ where: { email: correo } });
            expect(fila.password).toMatch(/^\$2[aby]\$/);
            expect(await comparePassword("", fila.password!)).toBe(false);
            // La caducidad es la de la invitación, no la hora de «olvidé mi contraseña».
            const dias = (fila.resetExpires!.getTime() - antes) / (24 * 60 * 60 * 1000);
            expect(dias).toBeGreaterThan(DIAS_DE_INVITACION - 0.01);
            expect(dias).toBeLessThan(DIAS_DE_INVITACION + 0.01);
        });

        it("el correo lleva un enlace a la página de la contraseña, y ninguna contraseña", async () => {
            const res = await invitar({ name: "Luis Enlace", email: "enlace@example.com", role: "USER" });
            expect(res.status).toBe(201);

            expect(enviados).toHaveLength(1);
            expect(enviados[0]!.to).toBe("enlace@example.com");
            expect(enviados[0]!.subject).toBe("Te han invitado a Stockly");
            expect(enviados[0]!.html).toContain("Luis Enlace");
            expect(enviados[0]!.html).toContain(`${DIAS_DE_INVITACION} días`);

            const enlace = enlaceDelUltimoCorreo();
            expect(enlace.pathname).toBe("/auth/reset-password");
            expect(enlace.searchParams.get("invitacion")).toBe("1");

            // En la base está el hash del token, no el token (ADR 0002).
            const fila = await prisma.user.findUniqueOrThrow({ where: { email: "enlace@example.com" } });
            expect(fila.resetToken).toBe(hashToken(tokenDelUltimoCorreo()));
            expect(fila.resetToken).not.toBe(tokenDelUltimoCorreo());
            expect(enviados[0]!.html).not.toContain(fila.password!);
        });

        it("antes de abrir el enlace no se puede entrar", async () => {
            const res = await request(app).post(`${AUTH}/login`).send({ email: correo, password: CLAVE });
            expect(res.status).toBe(401);
        });

        it("con el enlace pone su contraseña y entra con ese rol, sin pasar por la verificación", async () => {
            await invitar({ name: "Eva Entra", email: "entra@example.com", role: "WAREHOUSE" });
            const token = tokenDelUltimoCorreo();

            const puesta = await request(app).post(`${AUTH}/reset-password`).send({ token, password: CLAVE });
            expect(puesta.status).toBe(200);

            const login = await request(app).post(`${AUTH}/login`).send({ email: "entra@example.com", password: CLAVE });
            expect(login.status).toBe(200);

            const galletas = (login.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
            const yo = await request(app).get(`${AUTH}/me`).set("Cookie", galletas);
            expect(yo.body.data).toMatchObject({ email: "entra@example.com", role: "WAREHOUSE", isVerified: true });
        });

        it("el enlace no sirve dos veces", async () => {
            await invitar({ name: "Dos Veces", email: "dosveces@example.com", role: "USER" });
            const token = tokenDelUltimoCorreo();

            expect((await request(app).post(`${AUTH}/reset-password`).send({ token, password: CLAVE })).status).toBe(200);
            const otra = await request(app).post(`${AUTH}/reset-password`).send({ token, password: "OtraClave2026" });
            expect(otra.status).toBe(400);
            expect(otra.body.code).toBe("INVALID_OR_EXPIRED_TOKEN");

            // Y la contraseña sigue siendo la primera.
            expect((await request(app).post(`${AUTH}/login`).send({ email: "dosveces@example.com", password: CLAVE })).status).toBe(200);
        });

        it("el enlace no sirve después de caducar, y la cuenta sigue sin poder entrar", async () => {
            await invitar({ name: "Tarde", email: "tarde@example.com", role: "USER" });
            const token = tokenDelUltimoCorreo();
            await prisma.user.update({ where: { email: "tarde@example.com" }, data: { resetExpires: new Date(Date.now() - 1000) } });

            const res = await request(app).post(`${AUTH}/reset-password`).send({ token, password: CLAVE });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe("INVALID_OR_EXPIRED_TOKEN");

            const fila = await prisma.user.findUniqueOrThrow({ where: { email: "tarde@example.com" } });
            expect(fila.isVerified).toBe(false);
            expect((await request(app).post(`${AUTH}/login`).send({ email: "tarde@example.com", password: CLAVE })).status).toBe(401);
        });

        it("caducada la invitación, «olvidé mi contraseña» hace el mismo papel", async () => {
            await request(app).post(`${AUTH}/forgot-password`).send({ email: "tarde@example.com" });
            const token = tokenDelUltimoCorreo();

            expect((await request(app).post(`${AUTH}/reset-password`).send({ token, password: CLAVE })).status).toBe(200);
            expect((await request(app).post(`${AUTH}/login`).send({ email: "tarde@example.com", password: CLAVE })).status).toBe(200);
        });

        it("invitar un correo ya registrado responde 409, también con otras mayúsculas, y no manda nada", async () => {
            for (const email of [correo, "ALMACEN@Example.com"]) {
                const res = await invitar({ name: "Repetida", email, role: "USER" });
                expect(res.status).toBe(409);
                expect(res.body.code).toBe("EMAIL_ALREADY_REGISTERED");
            }
            expect(enviados).toHaveLength(0);
            // La cuenta que ya había no cambia de rol.
            expect((await prisma.user.findUniqueOrThrow({ where: { email: correo } })).role).toBe("WAREHOUSE");
        });

        it.each(["USER", "WAREHOUSE", "SELLER"] as const)("un %s recibe 403 y no se crea nada", async (role) => {
            const otro = await createUser({ email: `invita_${role.toLowerCase()}@example.com`, role });
            const res = await invitar({ name: "Colada", email: `colada_${role}@example.com`, role: "ADMIN" }, getAuthCookie(otro.id));

            expect(res.status).toBe(403);
            expect(await prisma.user.findUnique({ where: { email: `colada_${role.toLowerCase()}@example.com` } })).toBeNull();
            expect(enviados).toHaveLength(0);
        });

        it("sin sesión, 401", async () => {
            const res = await request(app).post(USUARIOS).send({ name: "Nadie", email: "nadie@example.com", role: "USER" });
            expect(res.status).toBe(401);
        });

        it("el registro público sigue creando solo USER, aunque pida otro rol", async () => {
            const res = await request(app)
                .post(`${AUTH}/register`)
                .send({ name: "Lista", email: "lista@example.com", password: CLAVE, role: "ADMIN" });

            expect(res.status).toBe(201);
            expect((await prisma.user.findUniqueOrThrow({ where: { email: "lista@example.com" } })).role).toBe("USER");
        });
    });

    describe("lo que la ruta no acepta", () => {
        it.each([
            ["sin nombre", { email: "v1@example.com", role: "USER" }],
            ["con un correo que no lo es", { name: "V", email: "no-es-correo", role: "USER" }],
            ["sin rol", { name: "V", email: "v3@example.com" }],
            ["con un rol que no existe", { name: "V", email: "v4@example.com", role: "SUPERADMIN" }],
        ])("422 %s", async (_caso, cuerpo) => {
            const res = await invitar(cuerpo);
            expect(res.status).toBe(422);
            expect(enviados).toHaveLength(0);
        });

        it("ignora una contraseña o una verificación que vengan en el cuerpo", async () => {
            const res = await invitar({
                name: "Con Extras", email: "extras@example.com", role: "USER",
                password: CLAVE, isVerified: true, isActive: false,
            });
            expect(res.status).toBe(201);

            const fila = await prisma.user.findUniqueOrThrow({ where: { email: "extras@example.com" } });
            expect(fila.isVerified).toBe(false);
            expect(fila.isActive).toBe(true);
            expect(await comparePassword(CLAVE, fila.password!)).toBe(false);
        });
    });

    describe("idioma, auditoría y fallo del envío", () => {
        it("el correo sale en el idioma de la petición del administrador, y la cuenta lo hereda", async () => {
            const res = await request(app)
                .post(USUARIOS)
                .set("Cookie", galletaAdmin)
                .set("Accept-Language", "en")
                .send({ name: "Sam English", email: "sam@example.com", role: "SELLER" });

            expect(res.status).toBe(201);
            expect(enviados[0]!.subject).toBe("You have been invited to Stockly");
            expect(enviados[0]!.html).toContain('lang="en"');
            expect((await prisma.user.findUniqueOrThrow({ where: { email: "sam@example.com" } })).idioma).toBe("EN");
        });

        it("deja rastro en la auditoría: CREATE sobre User, con el rol y quién invitó", async () => {
            const res = await invitar({ name: "Con Rastro", email: "rastro@example.com", role: "SELLER" });

            const rastro = await prisma.auditLog.findFirstOrThrow({ where: { entity: "User", entityId: res.body.data.id } });
            expect(rastro).toMatchObject({ action: "CREATE", userId: admin.id, userEmail: admin.email });
            expect(rastro.details).toMatchObject({ email: "rastro@example.com", role: "SELLER" });
        });

        it("si el correo no sale, la cuenta no se queda: se puede repetir la invitación", async () => {
            falloDeEnvio = new Error("SMTP caído");
            const fallida = await invitar({ name: "Sin Correo", email: "sincorreo@example.com", role: "USER" });

            expect(fallida.status).toBe(500);
            expect(await prisma.user.findUnique({ where: { email: "sincorreo@example.com" } })).toBeNull();
            expect(await prisma.auditLog.count({ where: { entity: "User", details: { path: ["email"], equals: "sincorreo@example.com" } } })).toBe(0);

            falloDeEnvio = null;
            const repetida = await invitar({ name: "Sin Correo", email: "sincorreo@example.com", role: "USER" });
            expect(repetida.status).toBe(201);
        });
    });

    describe("poner la contraseña con un token válido verifica la cuenta", () => {
        it("quien se registró, no confirmó y restablece la contraseña ya puede entrar", async () => {
            await createUser({ email: "sinconfirmar@example.com", isVerified: false });
            await prisma.user.update({
                where: { email: "sinconfirmar@example.com" },
                data: { verifyToken: hashToken("pendiente"), verifyExpires: new Date(Date.now() + 60_000) },
            });

            await request(app).post(`${AUTH}/forgot-password`).send({ email: "sinconfirmar@example.com" });
            const res = await request(app).post(`${AUTH}/reset-password`).send({ token: tokenDelUltimoCorreo(), password: CLAVE });
            expect(res.status).toBe(200);

            // El token de verificación que quedaba pendiente ya no hace falta, y se retira.
            const fila = await prisma.user.findUniqueOrThrow({ where: { email: "sinconfirmar@example.com" } });
            expect(fila).toMatchObject({ isVerified: true, verifyToken: null, verifyExpires: null });
            expect((await request(app).post(`${AUTH}/login`).send({ email: "sinconfirmar@example.com", password: CLAVE })).status).toBe(200);
        });

        it("una cuenta desactivada sigue sin entrar aunque ponga su contraseña", async () => {
            await invitar({ name: "De Baja", email: "debaja@example.com", role: "USER" });
            const token = tokenDelUltimoCorreo();
            await prisma.user.update({ where: { email: "debaja@example.com" }, data: { isActive: false } });

            expect((await request(app).post(`${AUTH}/reset-password`).send({ token, password: CLAVE })).status).toBe(200);
            const login = await request(app).post(`${AUTH}/login`).send({ email: "debaja@example.com", password: CLAVE });
            expect(login.status).toBe(403);
            expect(login.body.code).toBe("ACCOUNT_DISABLED");
        });
    });
});
