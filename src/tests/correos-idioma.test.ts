import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";
import { traducirCorreo } from "@/shared/i18n/correos";
import { correosEs } from "@/shared/i18n/correos.es";
import { correosEn } from "@/shared/i18n/correos.en";
import { idiomaDePeticion } from "@/shared/lib/idiomaDePeticion";

/**
 * T4-12 — los correos, en el idioma de quien los recibe.
 *
 * El criterio de aceptación es de punta a punta: «un usuario con la interfaz en inglés
 * recibe en inglés los correos que la aplicación envía». Aquí se comprueba en tres alturas,
 * porque un fallo en cualquiera de ellas rompe la frase entera:
 *
 * 1. **El catálogo** — que los dos idiomas digan lo mismo y ninguna frase se quede a medias.
 * 2. **La resolución del idioma** — de dónde sale en cada envío, que no es el mismo sitio.
 * 3. **El correo que sale de verdad** — asunto, `lang` y cuerpo, sin mockear el módulo de
 *    plantillas: es lo único que demuestra el criterio.
 */

// El transporte se sustituye, no las plantillas: lo que se quiere leer es el HTML que
// se habría enviado. Los tests que mockean `@/shared/lib/nodemailer` entero comprueban
// otra cosa —que se llame—, y ahí no se vería un asunto en el idioma equivocado.
const enviados: Array<{ to: string; subject: string; html: string }> = [];

jest.mock("nodemailer", () => ({
    __esModule: true,
    default: {
        createTransport: () => ({
            sendMail: jest.fn(async (correo: { to: string; subject: string; html: string }) => {
                enviados.push(correo);
                return { messageId: "test" };
            }),
        }),
    },
}));

jest.mock("@/shared/middlewares/upload.middleware", () => ({
    verificarFirmaDeImagen: (_req: unknown, _res: unknown, next: () => void) => next(),
    uploadToCloudinary: jest.fn(),
    deleteFromCloudinary: jest.fn(),
    upload: { single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()) },
}));

import {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendLowStockAlertEmail,
    sendServerErrorAlertEmail,
} from "@/shared/lib/nodemailer";

const ultimo = () => enviados[enviados.length - 1];

beforeEach(() => {
    enviados.length = 0;
});

describe("Catálogo de correos (T4-12)", () => {
    it("el inglés cubre todas las claves del español", () => {
        // El tipo ya lo garantiza en compilación —`correos.en.ts` es un `Record` sobre las
        // claves del español—, pero este test es lo que lo dice en voz alta si algún día
        // alguien relaja ese tipo para «salir del paso».
        expect(Object.keys(correosEn).sort()).toEqual(Object.keys(correosEs).sort());
    });

    it("ninguna frase se queda sin traducir", () => {
        const iguales = Object.keys(correosEs).filter(
            (clave) => correosEs[clave as keyof typeof correosEs] === correosEn[clave as keyof typeof correosEn],
        );

        // Ningún par coincide hoy. Si alguna vez coincidiera legítimamente —un nombre propio,
        // un símbolo— este test lo obliga a justificarse en vez de pasar desapercibido.
        expect(iguales).toEqual([]);
    });

    it("los huecos de una frase son los mismos en los dos idiomas", () => {
        const huecos = (texto: string) => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

        for (const clave of Object.keys(correosEs) as Array<keyof typeof correosEs>) {
            // Un `{producto}` que se pierda al traducir deja el correo inglés sin el dato,
            // y no falla nada: sale una frase coherente que no dice de qué producto habla.
            expect({ clave, huecos: huecos(correosEn[clave]) }).toEqual({ clave, huecos: huecos(correosEs[clave]) });
        }
    });

    it("un valor interpolado no se vuelve a mirar", () => {
        // Un producto puede llamarse literalmente `{minimo}`: con `replace` encadenado, la
        // pasada siguiente lo sustituiría por el stock mínimo y el correo mentiría.
        const texto = traducirCorreo("ES", "stock.preencabezado", {
            producto: "{minimo}",
            actual: 2,
            minimo: 5,
        });

        expect(texto).toContain("{minimo} está en 2 unidades");
        expect(texto).toContain("(mínimo 5)");
    });

    it("un hueco sin valor se queda como está, no se borra", () => {
        // Que sobreviva es lo que lo hace visible en una revisión; borrarlo produce una
        // frase con un agujero que parece correcta.
        expect(traducirCorreo("EN", "verificacion.asunto")).toContain("{marca}");
    });
});

describe("De dónde sale el idioma de una petición (T4-12)", () => {
    const con = (valor?: string) =>
        idiomaDePeticion({ headers: valor === undefined ? {} : { "accept-language": valor } } as never);

    it.each([
        ["en", "EN"],
        ["en-GB", "EN"],
        ["es-ES", "ES"],
        ["EN", "EN"],
        // El primero soportado gana; el francés no lo está.
        ["fr-FR,en;q=0.9,es;q=0.8", "EN"],
    ])("«%s» → %s", (cabecera, esperado) => {
        expect(con(cabecera)).toBe(esperado);
    });

    it("sin cabecera, o con un idioma que no existe, cae en español", () => {
        expect(con()).toBe("ES");
        expect(con("de-DE,fr;q=0.9")).toBe("ES");
    });
});

describe("El correo que sale de verdad (T4-12)", () => {
    it("la verificación en inglés: asunto, `lang` y cuerpo", async () => {
        await sendVerificationEmail("nuevo@example.com", "Ann", "tok", "EN");

        expect(ultimo().subject).toBe("Verify your account — Stockly");
        expect(ultimo().html).toContain('lang="en"');
        expect(ultimo().html).toContain("Thanks for signing up to Stockly");
        expect(ultimo().html).toContain("Verify account");
        // El pie vivía escrito en la plantilla y salía en español aunque el resto fuera inglés.
        expect(ultimo().html).toContain("This is an automated message from Stockly");
        expect(ultimo().html).not.toContain("correo automático");
    });

    it("y en español dice lo mismo en español", async () => {
        await sendVerificationEmail("nuevo@example.com", "Ana", "tok", "ES");

        expect(ultimo().subject).toBe("Verifica tu cuenta — Stockly");
        expect(ultimo().html).toContain('lang="es"');
        expect(ultimo().html).toContain("Gracias por registrarte en Stockly");
    });

    it("el restablecimiento de contraseña", async () => {
        await sendPasswordResetEmail("a@example.com", "Ann", "tok", "EN");

        expect(ultimo().subject).toBe("Reset your password — Stockly");
        expect(ultimo().html).toContain("Reset password");
        expect(ultimo().html).toContain("The link expires in 1 hour");
    });

    it("la alerta de bajo stock traduce también los rótulos de su tabla", async () => {
        await sendLowStockAlertEmail("a@example.com", "Ann", "Cable HDMI", 2, 5, "EN");

        expect(ultimo().subject).toBe("⚠️ Low stock alert: Cable HDMI — Stockly");
        // Los tres rótulos de la izquierda son texto, no datos, y estaban incrustados.
        expect(ultimo().html).toContain("Current stock");
        expect(ultimo().html).toContain("Minimum stock");
        expect(ultimo().html).not.toContain("Stock actual");
    });

    it("el aviso de pico de 5xx, que la ficha no contaba", async () => {
        // La ficha hablaba de «los tres correos»; T4-06 añadió un cuarto después de
        // escribirla, y dejarlo en español habría cumplido la letra del criterio y no su
        // intención.
        await sendServerErrorAlertEmail(
            "a@example.com",
            "Ann",
            { total: 7, ventanaMinutos: 5, rutas: [{ ruta: "/api/v1/products", total: 7 }], requestId: "req-1" },
            "EN",
        );

        expect(ultimo().subject).toBe("🚨 5xx error spike: 7 in 5 min — Stockly");
        expect(ultimo().html).toContain("Server error spike");
        expect(ultimo().html).toContain("<strong>7 5xx errors</strong>");
    });

    it("el nombre del destinatario se escapa dentro de la frase traducida", async () => {
        // La traducción no puede ser la puerta por la que se cuela HTML: el saludo lleva el
        // nombre en un hueco, y el hueco se rellena con el valor ya escapado.
        await sendVerificationEmail("a@example.com", '<img src=x onerror="alert(1)">', "tok", "EN");

        expect(ultimo().html).not.toContain("<img src=x");
        expect(ultimo().html).toContain("&lt;img src=x");
    });
});

describe("El idioma con el que se escribe a cada usuario (T4-12)", () => {
    beforeEach(async () => {
        await cleanDb();
    });

    afterAll(async () => {
        await cleanDb();
    });

    it("el registro guarda el idioma de `Accept-Language` y manda el correo en él", async () => {
        const res = await request(app)
            .post("/api/v1/auth/register")
            .set("Accept-Language", "en")
            .send({ name: "Ann", email: "ann@example.com", password: "Admin1234!" });

        expect(res.status).toBe(201);

        const creado = await prisma.user.findUnique({ where: { email: "ann@example.com" } });
        expect(creado?.idioma).toBe("EN");
        expect(ultimo().subject).toBe("Verify your account — Stockly");
    });

    it("sin cabecera se registra en español", async () => {
        const res = await request(app)
            .post("/api/v1/auth/register")
            .send({ name: "Ana", email: "ana@example.com", password: "Admin1234!" });

        expect(res.status).toBe(201);
        const creado = await prisma.user.findUnique({ where: { email: "ana@example.com" } });
        expect(creado?.idioma).toBe("ES");
    });

    it("el de recuperar contraseña sale en el idioma **guardado**, no en el del navegador", async () => {
        // Es la diferencia que importa: quien pide el restablecimiento puede estar en el
        // ordenador de otro, o en un navegador recién instalado. Manda su fila.
        await createUser({ email: "ann2@example.com", name: "Ann", idioma: "EN" });

        const res = await request(app)
            .post("/api/v1/auth/forgot-password")
            .set("Accept-Language", "es")
            .send({ email: "ann2@example.com" });

        expect(res.status).toBe(200);
        expect(ultimo().subject).toBe("Reset your password — Stockly");
    });

    it("`PATCH /auth/me/idioma` lo cambia, y `GET /auth/me` lo devuelve", async () => {
        const usuario = await createUser({ email: "cambia@example.com", name: "Ana" });
        const cookie = getAuthCookie(usuario.id);

        const antes = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
        expect(antes.body.data.idioma).toBe("ES");

        const res = await request(app)
            .patch("/api/v1/auth/me/idioma")
            .set("Cookie", cookie)
            .send({ idioma: "EN" });

        expect(res.status).toBe(200);
        expect(res.body.data.idioma).toBe("EN");

        const despues = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
        expect(despues.body.data.idioma).toBe("EN");
    });

    it("un idioma que no existe se rechaza", async () => {
        const usuario = await createUser({ email: "malo@example.com", name: "Ana" });

        const res = await request(app)
            .patch("/api/v1/auth/me/idioma")
            .set("Cookie", getAuthCookie(usuario.id))
            // `"fr"` en minúscula es además el error verosímil: es la etiqueta que maneja el
            // navegador, y el enum de la base va en mayúsculas.
            .send({ idioma: "fr" });

        // 422 y no 400: es lo que devuelve `validate` para un cuerpo que no pasa el esquema.
        expect(res.status).toBe(422);
    });

    it("sin sesión no se toca", async () => {
        const res = await request(app).patch("/api/v1/auth/me/idioma").send({ idioma: "EN" });
        expect(res.status).toBe(401);
    });
});
