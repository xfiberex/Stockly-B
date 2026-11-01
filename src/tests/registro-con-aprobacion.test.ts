import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { env } from "@/config/env";
import { hashToken } from "@/shared/lib/tokens";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

/**
 * AUD-001 — el registro con aprobación.
 *
 * Lo que había: cualquiera que confirmara un correo propio quedaba como `USER` y leía la agenda
 * de clientes con su documento, todas las ventas y los costes. Lo que hay: la cuenta nace sin
 * rol (`PENDING`), no entra, los administradores se enteran en la campana y, cuando uno le da
 * rol, la persona recibe un correo.
 *
 * Como en `invitacion.test.ts`, se sustituye el **transporte** y no `@/shared/lib/nodemailer`:
 * el token con el que se confirma la cuenta es el del correo que se habría enviado.
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

const AUTH = "/api/v1/auth";
const USUARIOS = "/api/v1/users";
const CLAVE = "Registro2026";

const smtp = env.smtp as { configured: boolean };
const smtpOriginal = smtp.configured;

/** El token del enlace de confirmación del último correo enviado a `correo`. */
function tokenDeConfirmacion(correo: string): string {
    const html = [...enviados].reverse().find((c) => c.to === correo)!.html;
    const href = /href="([^"]*\/auth\/confirm-account[^"]*)"/.exec(html)![1]!;
    return new URL(href.replace(/&amp;/g, "&")).searchParams.get("token")!;
}

/** El token del enlace de «olvidé mi contraseña» del último correo enviado. */
function tokenDeRestablecimiento(): string {
    const html = enviados[enviados.length - 1]!.html;
    const href = /href="([^"]*\/auth\/reset-password[^"]*)"/.exec(html)![1]!;
    return new URL(href.replace(/&amp;/g, "&")).searchParams.get("token")!;
}

const registrar = (email: string, nombre = "Persona Nueva", idioma = "es") =>
    request(app).post(`${AUTH}/register`).set("Accept-Language", idioma).send({ name: nombre, email, password: CLAVE });

const confirmar = (email: string) => request(app).post(`${AUTH}/verify-email`).send({ token: tokenDeConfirmacion(email) });

const entrar = (email: string) => request(app).post(`${AUTH}/login`).send({ email, password: CLAVE });

/** Registra y confirma: lo que deja a alguien esperando aprobación. */
async function registrarYConfirmar(email: string, nombre?: string, idioma?: string) {
    expect((await registrar(email, nombre, idioma)).status).toBe(201);
    expect((await confirmar(email)).status).toBe(200);
    return prisma.user.findUniqueOrThrow({ where: { email } });
}

const avisosDe = (cuentaId: string) =>
    prisma.notification.findMany({ where: { type: "USER_PENDING", entityId: cuentaId }, orderBy: { userId: "asc" } });

describe("Registro con aprobación (AUD-001)", () => {
    let admin: { id: string };
    let otroAdmin: { id: string };
    let almacen: { id: string };
    let galletaAdmin: string;

    const darRol = (id: string, role: string, galleta = galletaAdmin) =>
        request(app).patch(`${USUARIOS}/${id}/role`).set("Cookie", galleta).send({ role });

    beforeAll(async () => {
        await cleanDb();
        admin = await createUser({ email: "aprueba_admin@example.com", role: "ADMIN" });
        otroAdmin = await createUser({ email: "aprueba_admin2@example.com", role: "ADMIN" });
        almacen = await createUser({ email: "aprueba_almacen@example.com", role: "WAREHOUSE" });
        galletaAdmin = getAuthCookie(admin.id);
    });

    beforeEach(() => {
        enviados.length = 0;
        falloDeEnvio = null;
        smtp.configured = true;
    });

    afterAll(async () => {
        smtp.configured = smtpOriginal;
        await cleanDb();
    });

    describe("el criterio de aceptación", () => {
        it("una cuenta registrada y confirmada nace sin rol y no puede iniciar sesión", async () => {
            const cuenta = await registrarYConfirmar("criterio@example.com");

            expect(cuenta).toMatchObject({ role: "PENDING", isVerified: true, isActive: true });
            const login = await entrar("criterio@example.com");
            expect(login.status).toBe(403);
            expect(login.body.code).toBe("ACCOUNT_PENDING_APPROVAL");
            // Ni cookie de sesión ni de refresco: no hay nada con lo que seguir.
            expect(login.headers["set-cookie"]).toBeUndefined();
        });

        // Por si alguna vez consiguiera una sesión —un token firmado a mano, un fallo en otro
        // sitio—: el rol se lee de la base en cada petición, y `PENDING` no está en ningún grupo.
        it.each(["/api/v1/customers", "/api/v1/sale-orders", "/api/v1/reports"])(
            "con una sesión, %s responde 403",
            async (ruta) => {
                const cuenta = await prisma.user.findUniqueOrThrow({ where: { email: "criterio@example.com" } });
                const res = await request(app).get(ruta).set("Cookie", getAuthCookie(cuenta.id));
                expect(res.status).toBe(403);
                expect(res.body.code).toBe("FORBIDDEN");
            },
        );

        it("sin confirmar el correo, lo que se le pide es confirmarlo, no esperar", async () => {
            expect((await registrar("sinconfirmar@example.com")).status).toBe(201);

            const login = await entrar("sinconfirmar@example.com");
            expect(login.status).toBe(403);
            expect(login.body.code).toBe("EMAIL_NOT_CONFIRMED");
        });
    });

    describe("el aviso a los administradores", () => {
        it("al confirmar el correo, cada administrador activo recibe un aviso con el nombre y el correo", async () => {
            const cuenta = await registrarYConfirmar("avisada@example.com", "Avisada Pérez");

            const avisos = await avisosDe(cuenta.id);
            expect(avisos.map((a) => a.userId).sort()).toEqual([admin.id, otroAdmin.id].sort());
            expect(avisos[0]).toMatchObject({ readAt: null, data: { name: "Avisada Pérez", email: "avisada@example.com" } });
            // El almacén no administra usuarios: no tiene nada que hacer con él.
            expect(avisos.some((a) => a.userId === almacen.id)).toBe(false);
        });

        it("antes de confirmar no se avisa: un registro con un correo ajeno no llega a la campana", async () => {
            expect((await registrar("ajena@example.com")).status).toBe(201);
            const cuenta = await prisma.user.findUniqueOrThrow({ where: { email: "ajena@example.com" } });

            expect(await avisosDe(cuenta.id)).toEqual([]);
        });

        it("si la confirma restableciendo la contraseña, también se avisa", async () => {
            expect((await registrar("porreset@example.com")).status).toBe(201);
            expect((await request(app).post(`${AUTH}/forgot-password`).send({ email: "porreset@example.com" })).status).toBe(200);
            const token = tokenDeRestablecimiento();

            const res = await request(app).post(`${AUTH}/reset-password`).send({ token, password: CLAVE });

            expect(res.status).toBe(200);
            const cuenta = await prisma.user.findUniqueOrThrow({ where: { email: "porreset@example.com" } });
            expect(cuenta).toMatchObject({ role: "PENDING", isVerified: true });
            expect(await avisosDe(cuenta.id)).toHaveLength(2);
            // Y restablecer no es una puerta trasera: sigue sin entrar.
            expect((await entrar("porreset@example.com")).body.code).toBe("ACCOUNT_PENDING_APPROVAL");
        });

        it("restablecer la contraseña de una cuenta ya confirmada no reabre un aviso leído", async () => {
            // Si lo reabriera, una cuenta pendiente podría volver a ponerse en todas las campanas
            // cada vez que pidiera «olvidé mi contraseña».
            const cuenta = await registrarYConfirmar("insistente@example.com");
            await prisma.notification.updateMany({ where: { entityId: cuenta.id }, data: { readAt: new Date() } });
            await request(app).post(`${AUTH}/forgot-password`).send({ email: "insistente@example.com" });
            const token = tokenDeRestablecimiento();

            expect((await request(app).post(`${AUTH}/reset-password`).send({ token, password: CLAVE })).status).toBe(200);

            expect((await avisosDe(cuenta.id)).every((a) => a.readAt !== null)).toBe(true);
        });

        it("una cuenta con rol que confirma su correo no avisa de nada", async () => {
            const conRol = await createUser({ email: "conrol@example.com", role: "SELLER", isVerified: false });
            await prisma.user.update({
                where: { id: conRol.id },
                data: { verifyToken: hashToken("token-conrol"), verifyExpires: new Date(Date.now() + 60_000) },
            });

            expect((await request(app).post(`${AUTH}/verify-email`).send({ token: "token-conrol" })).status).toBe(200);
            expect(await avisosDe(conRol.id)).toEqual([]);
        });
    });

    describe("aprobar es dar el primer rol", () => {
        it("la cuenta pasa al rol, entra, y su aviso sale de todas las campanas", async () => {
            const cuenta = await registrarYConfirmar("aprobada@example.com", "Aprobada Gómez");
            expect(await avisosDe(cuenta.id)).toHaveLength(2);

            const res = await darRol(cuenta.id, "WAREHOUSE");

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Cuenta aprobada");
            expect(res.body.data).toMatchObject({ id: cuenta.id, role: "WAREHOUSE" });
            expect(await avisosDe(cuenta.id)).toEqual([]);
            expect((await entrar("aprobada@example.com")).status).toBe(200);
        });

        it("la persona recibe un correo, en su idioma, con el rol y un botón al inicio de sesión", async () => {
            const cuenta = await registrarYConfirmar("inglesa@example.com", "Jane Doe", "en");
            enviados.length = 0;

            await darRol(cuenta.id, "USER");

            expect(enviados).toHaveLength(1);
            const [correo] = enviados;
            expect(correo!.to).toBe("inglesa@example.com");
            expect(correo!.subject).toMatch(/approved/);
            expect(correo!.html).toContain("Read-only");
            expect(correo!.html).toMatch(/href="[^"]*\/auth\/login"/);
            // Sin token: la contraseña ya la eligió al registrarse.
            expect(correo!.html).not.toMatch(/token=/);
        });

        it("deja rastro en la auditoría: USER_ROLE_CHANGE de PENDING al rol, marcado como aprobación", async () => {
            const cuenta = await registrarYConfirmar("auditada@example.com");

            await darRol(cuenta.id, "SELLER");

            const rastro = await prisma.auditLog.findFirstOrThrow({ where: { action: "USER_ROLE_CHANGE", entityId: cuenta.id } });
            expect(rastro).toMatchObject({
                userId: admin.id,
                entity: "User",
                details: { email: "auditada@example.com", de: "PENDING", a: "SELLER", aprobada: true },
            });
        });

        it("cambiar el rol de una cuenta ya aprobada no manda correo, y la auditoría no lo llama aprobación", async () => {
            const cuenta = await createUser({ email: "veterana@example.com", role: "USER" });

            const res = await darRol(cuenta.id, "WAREHOUSE");

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Rol actualizado exitosamente");
            expect(enviados).toEqual([]);
            const rastro = await prisma.auditLog.findFirstOrThrow({ where: { action: "USER_ROLE_CHANGE", entityId: cuenta.id } });
            expect(rastro.details).toEqual({ email: "veterana@example.com", de: "USER", a: "WAREHOUSE" });
        });

        it("si el correo no sale, la aprobación se queda: la cuenta ya puede entrar", async () => {
            const cuenta = await registrarYConfirmar("sincorreo@example.com");
            falloDeEnvio = new Error("SMTP caído");

            const res = await darRol(cuenta.id, "USER");

            expect(res.status).toBe(200);
            expect((await prisma.user.findUniqueOrThrow({ where: { id: cuenta.id } })).role).toBe("USER");
            falloDeEnvio = null;
            expect((await entrar("sincorreo@example.com")).status).toBe(200);
        });

        it("sin SMTP configurado, también se aprueba", async () => {
            const cuenta = await registrarYConfirmar("sinsmtp@example.com");
            smtp.configured = false;

            const res = await darRol(cuenta.id, "USER");

            expect(res.status).toBe(200);
            expect(res.body.data.role).toBe("USER");
            expect(enviados.filter((c) => c.to === "sinsmtp@example.com" && /aprobada/.test(c.subject))).toEqual([]);
        });

        // La carrera de abajo, a cámara lenta: dos peticiones simultáneas casi nunca se cruzan en
        // el punto exacto, así que aquí se fuerza. Se lee la cuenta como pendiente, pero otro
        // administrador ya la ha aprobado: la aprobación tiene que ver la base, no lo leído.
        it("si otro la aprobó entre la lectura y la escritura, esta petición ya no aprueba ni manda correo", async () => {
            const cuenta = await registrarYConfirmar("cruce@example.com");
            await prisma.user.update({ where: { id: cuenta.id }, data: { role: "SELLER" } });
            enviados.length = 0;
            // Solo la lectura de esta cuenta: la de la sesión del administrador va por el mismo método.
            const original = prisma.user.findUnique.bind(prisma.user);
            const lectura = jest.spyOn(prisma.user, "findUnique").mockImplementation(((args: { where: { id?: string } }) =>
                args.where.id === cuenta.id ? Promise.resolve({ role: "PENDING" }) : original(args as never)) as never);

            const res = await darRol(cuenta.id, "WAREHOUSE");
            lectura.mockRestore();

            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Rol actualizado exitosamente");
            expect(res.body.data.role).toBe("WAREHOUSE");
            expect(enviados).toEqual([]);
        });

        it("dos administradores que la aprueban a la vez: un solo correo y una sola aprobación en la auditoría", async () => {
            const cuenta = await registrarYConfirmar("carrera@example.com");
            enviados.length = 0;

            const respuestas = await Promise.all([
                darRol(cuenta.id, "WAREHOUSE"),
                darRol(cuenta.id, "SELLER", getAuthCookie(otroAdmin.id)),
            ]);

            expect(respuestas.map((r) => r.status)).toEqual([200, 200]);
            expect(enviados).toHaveLength(1);
            const rastros = await prisma.auditLog.findMany({ where: { action: "USER_ROLE_CHANGE", entityId: cuenta.id } });
            expect(rastros.filter((r) => (r.details as { aprobada?: boolean }).aprobada)).toHaveLength(1);
        });
    });

    describe("PENDING no se asigna", () => {
        it("no se puede devolver a nadie a «sin rol»: 422", async () => {
            const cuenta = await createUser({ email: "devolver@example.com", role: "USER" });

            const res = await darRol(cuenta.id, "PENDING");

            expect(res.status).toBe(422);
            expect((await prisma.user.findUniqueOrThrow({ where: { id: cuenta.id } })).role).toBe("USER");
        });

        it("ni invitar a alguien sin rol: 422, y no se crea nada", async () => {
            const res = await request(app)
                .post(USUARIOS)
                .set("Cookie", galletaAdmin)
                .send({ name: "Sin Rol", email: "invitada-sinrol@example.com", role: "PENDING" });

            expect(res.status).toBe(422);
            expect(await prisma.user.findUnique({ where: { email: "invitada-sinrol@example.com" } })).toBeNull();
        });
    });

    describe("rechazar es desactivar", () => {
        it("desactivar una cuenta pendiente retira su aviso, y sigue sin rol ni acceso", async () => {
            const cuenta = await registrarYConfirmar("rechazada@example.com");
            expect(await avisosDe(cuenta.id)).toHaveLength(2);

            const res = await request(app).patch(`${USUARIOS}/${cuenta.id}/deactivate`).set("Cookie", galletaAdmin);

            expect(res.status).toBe(200);
            expect(await avisosDe(cuenta.id)).toEqual([]);
            expect(res.body.data).toMatchObject({ role: "PENDING", isActive: false });
            expect((await entrar("rechazada@example.com")).body.code).toBe("ACCOUNT_DISABLED");
        });

        it("la lista de Usuarios filtra las pendientes", async () => {
            const res = await request(app).get(`${USUARIOS}?role=PENDING&limit=100`).set("Cookie", galletaAdmin);

            expect(res.status).toBe(200);
            const roles = new Set(res.body.data.data.map((u: { role: string }) => u.role));
            expect([...roles]).toEqual(["PENDING"]);
            expect(res.body.data.meta.total).toBeGreaterThan(0);
        });
    });
});
