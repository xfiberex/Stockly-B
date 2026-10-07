import fs from "fs";
import path from "path";
import request from "supertest";
import PDFDocument from "pdfkit";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { env } from "@/config/env";
import { formatearImporte } from "@/shared/lib/moneda";
import { enviarResumenSemanal } from "@/shared/lib/resumenSemanal";
import {
    LARGO_MAXIMO_SIMBOLO_DE_MONEDA,
    SIMBOLO_DE_MONEDA_POR_DEFECTO,
    escribirImporte,
    motivoSimboloDeMonedaInvalido,
} from "@/contratos/api";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

/**
 * T6-03 — la moneda del negocio.
 *
 * El criterio de la ficha: cambiar el símbolo a `RD$` cambia **todos** los importes del PDF de
 * informes, de las etiquetas y del resumen semanal, y no queda ningún `$` escrito a mano. Los
 * tres se comprueban de punta a punta —el ajuste en la base, la petición o el comando, y lo que
 * sale—, no llamando al formateador con el símbolo ya en la mano.
 */

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

/** Un `$` que no forma parte de `RD$`: el símbolo antiguo, colado por algún sitio. */
const DOLAR_SUELTO = /(?<!RD)\$/;

describe("escribirImporte: un solo formato para los dos repositorios", () => {
    it("lleva separador de miles, dos decimales y el símbolo delante", () => {
        expect(escribirImporte(14999, "$")).toBe("$14,999.00");
        expect(escribirImporte(1234567.891, "RD$")).toBe("RD$1,234,567.89");
        expect(escribirImporte(0, "S/")).toBe("S/0.00");
    });

    it("el signo de un negativo va delante del símbolo, no entre el símbolo y la cifra", () => {
        // El PDF escribía `$-1,234.50` y la pantalla `-$1,234.50`: eran dos implementaciones.
        expect(escribirImporte(-1234.5, "$")).toBe("-$1,234.50");
        expect(escribirImporte(-1234.5, "RD$")).toBe("-RD$1,234.50");
    });

    it("`decimales: 0` redondea, para un KPI", () => {
        expect(escribirImporte(1234567.89, "$", { decimales: 0 })).toBe("$1,234,568");
    });

    it("`signo` marca los positivos y deja el cero sin signo", () => {
        expect(escribirImporte(12, "$", { signo: true })).toBe("+$12.00");
        expect(escribirImporte(-12, "$", { signo: true })).toBe("-$12.00");
        expect(escribirImporte(0, "$", { signo: true })).toBe("$0.00");
    });

    it("lo que redondea a cero no lleva signo", () => {
        expect(escribirImporte(-0.004, "$")).toBe("$0.00");
        expect(escribirImporte(0.004, "$", { signo: true })).toBe("$0.00");
        expect(escribirImporte(-0.005, "$")).toBe("-$0.01");
    });

    it("`formatearImporte` del backend es ese mismo formato", () => {
        expect(formatearImporte(2469, "RD$")).toBe("RD$2,469.00");
        expect(formatearImporte(2469.5, "RD$", { decimales: 0 })).toBe("RD$2,470");
    });
});

describe("motivoSimboloDeMonedaInvalido", () => {
    it.each(["$", "RD$", "S/", "S/.", "Bs.", "€", "£", "¥", "¢", "ƒ", "Q", "L", "CRC", "R$", "C$", "kr", "Fr."])("«%s» vale", (simbolo) => {
        expect(motivoSimboloDeMonedaInvalido(simbolo)).toBeNull();
    });

    it.each([
        ["", "largo"],
        ["RD$MXN", "largo"],
        ["₡", "caracteres"],
        ["₱", "caracteres"],
        ["zł", "caracteres"],
        ["1$", "caracteres"],
        ["-$", "caracteres"],
        ["+", "caracteres"],
        ["RD $", "caracteres"],
        [" $", "caracteres"],
        ["<b>", "caracteres"],
        ["&", "caracteres"],
        ["$,", "caracteres"],
    ])("«%s» no vale: %s", (simbolo, motivo) => {
        expect(motivoSimboloDeMonedaInvalido(simbolo)).toBe(motivo);
    });

    it("el símbolo por defecto pasa su propia regla", () => {
        expect(motivoSimboloDeMonedaInvalido(SIMBOLO_DE_MONEDA_POR_DEFECTO)).toBeNull();
        expect(SIMBOLO_DE_MONEDA_POR_DEFECTO.length).toBeLessThanOrEqual(LARGO_MAXIMO_SIMBOLO_DE_MONEDA);
    });

    describe("la regla es exactamente lo que el PDF sabe imprimir", () => {
        // La razón de ser de la lista. PDFKit dibuja con las fuentes estándar del PDF, que solo
        // conocen WinAnsi: lo que no está ahí sale con ancho cero y sin error.
        const doc = new PDFDocument();
        const ancho = (fuente: string, texto: string) => doc.font(fuente).fontSize(10).widthOfString(texto);
        /** Todo el Latin-1, el bloque de símbolos de moneda y los dos signos de WinAnsi que quedan fuera de ambos. */
        const candidatos = [
            ...Array.from({ length: 0xff - 0x20 }, (_, i) => String.fromCodePoint(0x21 + i)),
            ...Array.from({ length: 0x20c0 - 0x20a0 }, (_, i) => String.fromCodePoint(0x20a0 + i)),
            "ƒ",
        ];
        const admitidos = candidatos.filter((c) => motivoSimboloDeMonedaInvalido(c) === null);

        it("admite las letras, `$ / .` y los cinco signos, y nada más", () => {
            expect(admitidos.join("")).toBe(
                "$./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz¢£¥€ƒ",
            );
        });

        it.each(["Helvetica", "Helvetica-Bold"])("cada carácter admitido tiene ancho en %s", (fuente) => {
            const sinAncho = admitidos.filter((c) => ancho(fuente, c) <= 0);
            expect(sinAncho).toEqual([]);
        });

        it.each(["₡", "₲", "₱", "₹", "₩", "₺", "₽"])("«%s» no tiene ancho en la fuente, y por eso se rechaza", (simbolo) => {
            expect(ancho("Helvetica", simbolo)).toBe(0);
            expect(motivoSimboloDeMonedaInvalido(simbolo)).toBe("caracteres");
        });
    });
});

describe("Cambiar el símbolo a RD$ cambia todos los importes que salen del servidor", () => {
    let cookie: string;
    let textos: jest.SpyInstance;

    /** Lo que PDFKit ha escrito desde la última limpieza: el PDF va comprimido y no se puede leer. */
    const escrito = () => textos.mock.calls.map(([texto]) => String(texto));
    const importes = () => escrito().filter((t) => /\d[.,]\d{2}$|^-?\D{0,5}\d{1,3}(,\d{3})*$/.test(t) && /\$/.test(t));

    const descargar = (url: string) =>
        request(app)
            .get(url)
            .set("Cookie", cookie)
            .buffer(true)
            .parse((r, cb) => {
                const trozos: Buffer[] = [];
                r.on("data", (t: Buffer) => trozos.push(t));
                r.on("end", () => cb(null, Buffer.concat(trozos)));
            });

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "moneda_admin@example.com", role: "ADMIN", name: "Ana" });
        cookie = getAuthCookie(admin.id);

        const categoria = await prisma.category.create({ data: { name: "Herramientas" } });
        const producto = await prisma.product.create({
            data: { name: "Taladro", sku: "TAL-01", price: 1234.5, costPrice: 800, stock: 4, minStock: 1, categoryId: categoria.id },
        });
        // Enviada el jueves 24 de septiembre de 2026: entra en el margen, en julio-septiembre y
        // en la semana que resume el comando el miércoles 30.
        await prisma.saleOrder.create({
            data: {
                status: "SHIPPED",
                shippedAt: new Date("2026-09-24T12:00:00Z"),
                createdAt: new Date("2026-09-23T12:00:00Z"),
                items: { create: [{ productId: producto.id, productName: "Taladro", quantity: 2, unitPrice: 1234.5, unitCost: 800 }] },
            },
        });
        await prisma.saleOrder.create({
            data: { status: "PENDING", items: { create: [{ productId: producto.id, productName: "Taladro", quantity: 1, unitPrice: 1234.5 }] } },
        });
    });

    beforeEach(async () => {
        await prisma.appSetting.deleteMany();
        await prisma.weeklyDigest.deleteMany();
        enviados.length = 0;
        textos = jest.spyOn(PDFDocument.prototype, "text");
    });

    afterEach(() => {
        textos.mockRestore();
    });

    afterAll(async () => {
        await cleanDb();
    });

    const conRD = () => prisma.appSetting.create({ data: { key: "currencySymbol", value: "RD$" } });

    describe("el PDF de informes", () => {
        it("sin ajuste, sale en `$`, como antes", async () => {
            const res = await descargar("/api/v1/reports?format=pdf");

            expect(res.status).toBe(200);
            expect(escrito()).toContain("$4,938.00");
            expect(importes().some((t) => t.includes("RD$"))).toBe(false);
        });

        it("con RD$, todos sus importes lo llevan: los de las tablas y los de los KPI", async () => {
            await conRD();

            const res = await descargar("/api/v1/reports?format=pdf");

            expect(res.status).toBe(200);
            // El valor del stock en la tabla (4 × 1234.50) y, sin céntimos, en el KPI.
            expect(escrito()).toContain("RD$4,938.00");
            expect(escrito()).toContain("RD$4,938");
            expect(importes().length).toBeGreaterThan(8);
            expect(importes().filter((t) => DOLAR_SUELTO.test(t))).toEqual([]);
        });

        it("el informe por periodo, también", async () => {
            await conRD();

            const res = await descargar("/api/v1/reports/period?from=2026-09-01&to=2026-09-30&format=pdf");

            expect(res.status).toBe(200);
            expect(escrito()).toContain("RD$2,469.00");
            expect(escrito()).toContain("RD$2,469");
            expect(importes().length).toBeGreaterThan(4);
            expect(importes().filter((t) => DOLAR_SUELTO.test(t))).toEqual([]);
        });
    });

    describe("las etiquetas", () => {
        const etiquetas = async () => {
            const { id } = await prisma.product.findFirstOrThrow({ where: { sku: "TAL-01" } });
            return descargar(`/api/v1/products/labels?ids=${id}&format=label`);
        };

        it("sin ajuste, el precio va en `$`", async () => {
            expect((await etiquetas()).status).toBe(200);
            expect(escrito()).toContain("$1,234.50");
        });

        it("con RD$, el precio de la etiqueta lo lleva", async () => {
            await conRD();

            expect((await etiquetas()).status).toBe(200);
            expect(escrito()).toContain("RD$1,234.50");
            expect(escrito().filter((t) => DOLAR_SUELTO.test(t))).toEqual([]);
        });
    });

    describe("el resumen semanal", () => {
        const AHORA = new Date("2026-09-30T15:00:00Z");

        beforeEach(async () => {
            (env.smtp as { configured: boolean }).configured = true;
            await prisma.appSetting.create({ data: { key: "weeklyDigestEnabled", value: "true" } });
        });

        it("con RD$, las cifras, lo más vendido, las pendientes y el preencabezado lo llevan", async () => {
            await conRD();

            await enviarResumenSemanal(AHORA);

            const { html } = enviados[0]!;
            // Total de la semana y de «lo más vendido», la venta pendiente y el preencabezado.
            expect(html.match(/RD\$2,469\.00/g)!.length).toBeGreaterThanOrEqual(3);
            expect(html).toContain("RD$1,234.50");
            expect(html).not.toMatch(DOLAR_SUELTO);
        });

        it("sin ajuste, sigue saliendo en `$`", async () => {
            await enviarResumenSemanal(AHORA);

            expect(enviados[0]!.html).toContain("$2,469.00");
            expect(enviados[0]!.html).not.toContain("RD$");
        });
    });
});

describe("No queda ningún `$` escrito a mano junto a un importe (T6-03)", () => {
    const RAIZ = path.join(__dirname, "..");

    function fuentes(dir: string): string[] {
        return fs.readdirSync(dir).flatMap((entrada) => {
            const ruta = path.join(dir, entrada);
            if (fs.statSync(ruta).isDirectory()) return ["tests", "generated"].includes(entrada) ? [] : fuentes(ruta);
            return ruta.endsWith(".ts") ? [ruta] : [];
        });
    }

    it("ningún archivo del servidor pega un `$` delante de una interpolación", () => {
        // `$${importe}` es como se escribía: un dólar literal y, pegada, la expresión.
        const sospechosas = fuentes(RAIZ).flatMap((archivo) =>
            fs
                .readFileSync(archivo, "utf8")
                .split("\n")
                .map((linea, i) => ({ linea, donde: `${path.relative(RAIZ, archivo)}:${i + 1}` }))
                .filter(({ linea }) => /\$\$\{/.test(linea))
                .map(({ linea, donde }) => `${donde} → ${linea.trim()}`),
        );

        expect(sospechosas).toEqual([]);
    });

    it("el símbolo no tiene valor por defecto en `formatearImporte`: olvidarlo no compila", () => {
        // Con uno, un PDF nuevo que no pidiera la moneda saldría en `$` sin que nada avisara.
        const fuente = fs.readFileSync(path.join(RAIZ, "shared/lib/moneda.ts"), "utf8");

        expect(fuente).toMatch(/formatearImporte\(n: number, simbolo: string,/);
    });
});
