import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

import { sendVerificationEmail, sendPasswordResetEmail } from "@/shared/lib/nodemailer";

// El tercer argumento del mock es el rawToken enviado al usuario
function getLastCapturedToken(mockFn: jest.Mock): string {
    const calls = mockFn.mock.calls;
    return calls[calls.length - 1][2] as string;
}

const BASE = "/api/v1/auth";

describe("Auth API", () => {
    beforeAll(async () => {
        await cleanDb();
    });

    afterAll(async () => {
        await cleanDb();
    });

    // -----------------------------------------------------------------------
    describe("POST /register", () => {
        it("201: registra usuario y llama a sendVerificationEmail", async () => {
            const res = await request(app).post(`${BASE}/register`).send({
                name: "Ana García",
                email: "ana@example.com",
                password: "Test1234!",
            });

            expect(res.status).toBe(201);
            expect(res.body.message).toBeDefined();
            expect(sendVerificationEmail).toHaveBeenCalledWith(
                "ana@example.com",
                "Ana García",
                expect.any(String),
            );
        });

        it("409: email ya registrado", async () => {
            const res = await request(app).post(`${BASE}/register`).send({
                name: "Ana Dup",
                email: "ana@example.com",
                password: "Test1234!",
            });

            expect(res.status).toBe(409);
            expect(res.body.success).toBe(false);
        });

        it("422: email inválido", async () => {
            const res = await request(app).post(`${BASE}/register`).send({
                name: "Test",
                email: "no-es-un-email",
                password: "Test1234!",
            });

            expect(res.status).toBe(422);
            expect(res.body.errors).toBeDefined();
        });

        it("422: contraseña débil (sin mayúscula)", async () => {
            const res = await request(app).post(`${BASE}/register`).send({
                name: "Test",
                email: "weak@example.com",
                password: "test1234",
            });

            expect(res.status).toBe(422);
        });

        it("422: sin nombre", async () => {
            const res = await request(app).post(`${BASE}/register`).send({
                email: "noname@example.com",
                password: "Test1234!",
            });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /verify-email", () => {
        let rawToken: string;

        beforeAll(async () => {
            (sendVerificationEmail as jest.Mock).mockClear();

            await request(app).post(`${BASE}/register`).send({
                name: "Verificar User",
                email: "verify@example.com",
                password: "Test1234!",
            });

            rawToken = getLastCapturedToken(sendVerificationEmail as jest.Mock);
        });

        it("200: verifica cuenta con token válido y marca isVerified=true", async () => {
            const res = await request(app)
                .post(`${BASE}/verify-email`)
                .send({ token: rawToken });

            expect(res.status).toBe(200);

            const user = await prisma.user.findUnique({ where: { email: "verify@example.com" } });
            expect(user?.isVerified).toBe(true);
            expect(user?.verifyToken).toBeNull();
        });

        it("400: token inválido", async () => {
            const res = await request(app)
                .post(`${BASE}/verify-email`)
                .send({ token: "token-falso-abc123" });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it("422: sin token en el body", async () => {
            const res = await request(app).post(`${BASE}/verify-email`).send({});
            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /resend-verification", () => {
        it("200: reenvía verificación a usuario sin verificar", async () => {
            (sendVerificationEmail as jest.Mock).mockClear();
            const user = await createUser({
                email: `resend_${Date.now()}@example.com`,
                isVerified: false,
            });

            const res = await request(app)
                .post(`${BASE}/resend-verification`)
                .send({ email: user.email });

            expect(res.status).toBe(200);
            expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
        });

        it("400: usuario ya verificado", async () => {
            const user = await createUser({ email: `verified_${Date.now()}@example.com`, isVerified: true });

            const res = await request(app)
                .post(`${BASE}/resend-verification`)
                .send({ email: user.email });

            expect(res.status).toBe(400);
        });

        it("400: email inexistente", async () => {
            const res = await request(app)
                .post(`${BASE}/resend-verification`)
                .send({ email: "fantasma@example.com" });

            expect(res.status).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /login", () => {
        beforeAll(async () => {
            await createUser({ email: "login@example.com", password: "Test1234!", isVerified: true });
        });

        it("200: login correcto devuelve datos de usuario y setea cookies de sesión", async () => {
            const res = await request(app)
                .post(`${BASE}/login`)
                .send({ email: "login@example.com", password: "Test1234!" });

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ email: "login@example.com" });
            expect(res.body.data.password).toBeUndefined();

            const cookies: string[] = res.headers["set-cookie"] as unknown as string[];
            expect(cookies).toBeDefined();
            expect(cookies.some((c) => c.startsWith("token="))).toBe(true);
            expect(cookies.some((c) => c.startsWith("refreshToken="))).toBe(true);
        });

        it("401: contraseña incorrecta", async () => {
            const res = await request(app)
                .post(`${BASE}/login`)
                .send({ email: "login@example.com", password: "WrongPass1!" });

            expect(res.status).toBe(401);
        });

        it("401: usuario no existe", async () => {
            const res = await request(app)
                .post(`${BASE}/login`)
                .send({ email: "nadie@example.com", password: "Test1234!" });

            expect(res.status).toBe(401);
        });

        it("403: usuario sin verificar", async () => {
            await createUser({
                email: `unverified_${Date.now()}@example.com`,
                password: "Test1234!",
                isVerified: false,
            });

            // Necesitamos un email fijo para este test, creamos uno predecible
            const email = `noverif_${Date.now()}@example.com`;
            await createUser({ email, password: "Test1234!", isVerified: false });

            const res = await request(app)
                .post(`${BASE}/login`)
                .send({ email, password: "Test1234!" });

            expect(res.status).toBe(403);
        });

        it("422: campos faltantes", async () => {
            const res = await request(app)
                .post(`${BASE}/login`)
                .send({ password: "Test1234!" }); // sin email

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /logout", () => {
        it("200: limpia las cookies de sesión", async () => {
            const user = await createUser();
            const cookie = getAuthCookie(user.id);

            const res = await request(app)
                .post(`${BASE}/logout`)
                .set("Cookie", cookie);

            expect(res.status).toBe(200);
            const cookies: string[] = res.headers["set-cookie"] as unknown as string[];
            const tokenCookie = cookies.find((c) => /^token=/.test(c));
            expect(tokenCookie).toMatch(/token=;|Max-Age=0/);
        });
    });

    // -----------------------------------------------------------------------
    describe("GET /me", () => {
        let userId: string;
        let authCookie: string;

        beforeAll(async () => {
            const user = await createUser({ email: `me_${Date.now()}@example.com` });
            userId = user.id;
            authCookie = getAuthCookie(userId);
        });

        it("200: devuelve perfil del usuario autenticado (sin contraseña)", async () => {
            const res = await request(app)
                .get(`${BASE}/me`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(userId);
            expect(res.body.data.password).toBeUndefined();
            expect(["name", "email", "isVerified", "createdAt"].every((k) => k in res.body.data)).toBe(true);
        });

        it("401: sin cookie de sesión", async () => {
            const res = await request(app).get(`${BASE}/me`);
            expect(res.status).toBe(401);
        });

        it("401: token inválido", async () => {
            const res = await request(app)
                .get(`${BASE}/me`)
                .set("Cookie", "token=jwt.invalido.abc");
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /forgot-password", () => {
        it("200: siempre responde OK aunque el email no exista (no revela info)", async () => {
            const res = await request(app)
                .post(`${BASE}/forgot-password`)
                .send({ email: "fantasma@example.com" });

            expect(res.status).toBe(200);
        });

        it("200: envía email de reset para usuario existente", async () => {
            (sendPasswordResetEmail as jest.Mock).mockClear();
            const user = await createUser({ email: `forgot_${Date.now()}@example.com` });

            const res = await request(app)
                .post(`${BASE}/forgot-password`)
                .send({ email: user.email });

            expect(res.status).toBe(200);
            expect(sendPasswordResetEmail).toHaveBeenCalledWith(
                user.email,
                expect.any(String),
                expect.any(String),
            );
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /reset-password", () => {
        let rawToken: string;

        beforeAll(async () => {
            (sendPasswordResetEmail as jest.Mock).mockClear();
            const user = await createUser({ email: `reset_${Date.now()}@example.com` });

            await request(app)
                .post(`${BASE}/forgot-password`)
                .send({ email: user.email });

            rawToken = getLastCapturedToken(sendPasswordResetEmail as jest.Mock);
        });

        it("200: restablece contraseña con token válido", async () => {
            const res = await request(app)
                .post(`${BASE}/reset-password`)
                .send({ token: rawToken, password: "NuevaPass1234!" });

            expect(res.status).toBe(200);
        });

        it("400: token inválido", async () => {
            const res = await request(app)
                .post(`${BASE}/reset-password`)
                .send({ token: "token-falso-xyz", password: "NuevaPass1234!" });

            expect(res.status).toBe(400);
        });

        it("422: contraseña nueva demasiado débil", async () => {
            const res = await request(app)
                .post(`${BASE}/reset-password`)
                .send({ token: "cualquier-token", password: "debil" });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("PUT /me", () => {
        let user: Awaited<ReturnType<typeof createUser>>;
        let authCookie: string;

        beforeEach(async () => {
            user = await createUser({
                name: "Nombre Original",
                email: `profile_${Date.now()}@example.com`,
            });
            authCookie = getAuthCookie(user.id);
        });

        afterEach(async () => {
            await prisma.user.deleteMany({ where: { email: { startsWith: "profile_" } } });
        });

        it("200: actualiza el nombre correctamente", async () => {
            const res = await request(app)
                .put(`${BASE}/me`)
                .set("Cookie", authCookie)
                .send({ name: "Nombre Actualizado", email: user.email });

            expect(res.status).toBe(200);

            const updated = await prisma.user.findUnique({ where: { id: user.id } });
            expect(updated?.name).toBe("Nombre Actualizado");
        });

        it("200: cambio de email dispara nueva verificación", async () => {
            (sendVerificationEmail as jest.Mock).mockClear();

            const res = await request(app)
                .put(`${BASE}/me`)
                .set("Cookie", authCookie)
                .send({ name: user.name, email: `nuevo_${Date.now()}@example.com` });

            expect(res.status).toBe(200);
            expect(res.body.emailChanged).toBe(true);
            expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

            const updated = await prisma.user.findUnique({ where: { id: user.id } });
            expect(updated?.isVerified).toBe(false);
        });

        it("409: email ya en uso por otra cuenta", async () => {
            const other = await createUser({ email: `taken_${Date.now()}@example.com` });

            const res = await request(app)
                .put(`${BASE}/me`)
                .set("Cookie", authCookie)
                .send({ name: user.name, email: other.email });

            expect(res.status).toBe(409);

            await prisma.user.delete({ where: { id: other.id } });
        });

        it("401: sin autenticación", async () => {
            const res = await request(app)
                .put(`${BASE}/me`)
                .send({ name: "Test", email: "test@example.com" });

            expect(res.status).toBe(401);
        });

        it("422: campos faltantes", async () => {
            const res = await request(app)
                .put(`${BASE}/me`)
                .set("Cookie", authCookie)
                .send({ name: "Solo nombre" }); // sin email

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("PATCH /me/password", () => {
        let authCookie: string;

        beforeEach(async () => {
            const user = await createUser({
                email: `changepw_${Date.now()}@example.com`,
                password: "OldPass1234!",
            });
            authCookie = getAuthCookie(user.id);
        });

        it("200: cambia contraseña y limpia las cookies de sesión", async () => {
            const res = await request(app)
                .patch(`${BASE}/me/password`)
                .set("Cookie", authCookie)
                .send({ currentPassword: "OldPass1234!", password: "NewPass5678!" });

            expect(res.status).toBe(200);
            expect(res.body.passwordChanged).toBe(true);

            const cookies: string[] = res.headers["set-cookie"] as unknown as string[];
            const tokenCookie = cookies.find((c) => /^token=/.test(c));
            expect(tokenCookie).toMatch(/token=;|Max-Age=0/);
        });

        it("403: contraseña actual incorrecta", async () => {
            const res = await request(app)
                .patch(`${BASE}/me/password`)
                .set("Cookie", authCookie)
                .send({ currentPassword: "WrongPass1!", password: "NewPass5678!" });

            expect(res.status).toBe(403);
        });

        it("422: nueva contraseña demasiado débil", async () => {
            const res = await request(app)
                .patch(`${BASE}/me/password`)
                .set("Cookie", authCookie)
                .send({ currentPassword: "OldPass1234!", password: "corta" });

            expect(res.status).toBe(422);
        });

        it("401: sin autenticación", async () => {
            const res = await request(app)
                .patch(`${BASE}/me/password`)
                .send({ currentPassword: "OldPass1234!", password: "NewPass5678!" });

            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /refresh", () => {
        let refreshCookieValue: string;

        beforeAll(async () => {
            await createUser({ email: "refresh@example.com", password: "Test1234!", isVerified: true });

            const loginRes = await request(app)
                .post(`${BASE}/login`)
                .send({ email: "refresh@example.com", password: "Test1234!" });

            const setCookieHeader = loginRes.headers["set-cookie"] as unknown as string[];
            const raw = setCookieHeader.find((c) => c.startsWith("refreshToken="));
            // Extrae solo el valor (sin atributos del cookie como Path, HttpOnly, etc.)
            refreshCookieValue = raw?.split(";")[0] ?? "";
        });

        it("200: renueva el access token y rota el refresh token", async () => {
            const res = await request(app)
                .post(`${BASE}/refresh`)
                .set("Cookie", refreshCookieValue);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Token renovado");
            expect(res.body.data).toMatchObject({ email: "refresh@example.com" });

            const cookies: string[] = res.headers["set-cookie"] as unknown as string[];
            expect(cookies.some((c) => c.startsWith("token=") && !c.includes("token=;"))).toBe(true);
            expect(cookies.some((c) => c.startsWith("refreshToken=") && !c.includes("refreshToken=;"))).toBe(true);
        });

        it("401: el refresh token anterior ya no es válido después de la rotación", async () => {
            const res = await request(app)
                .post(`${BASE}/refresh`)
                .set("Cookie", refreshCookieValue); // token ya fue rotado arriba

            expect(res.status).toBe(401);
        });

        it("401: sin cookie de refresh", async () => {
            const res = await request(app).post(`${BASE}/refresh`);
            expect(res.status).toBe(401);
        });

        it("401: refresh token inválido", async () => {
            const res = await request(app)
                .post(`${BASE}/refresh`)
                .set("Cookie", "refreshToken=token-falso-abc123");

            expect(res.status).toBe(401);
        });
    });
});
