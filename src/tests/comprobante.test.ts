import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import request from "supertest";
import PDFDocument from "pdfkit";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { tieneComprobante } from "@/contratos/api";
import { PESO_MAXIMO_DEL_LOGO, traerLogoDelNegocio } from "@/shared/lib/logoDelNegocio";
import { fechaDelComprobante, rotuloDelImpuesto } from "@/modules/sale-orders/sale-orders.comprobante";
import { cleanDb, createUser, getAuthCookie, crearProducto } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

const VENTAS = "/api/v1/sale-orders";
const LOGO_URL = "https://res.cloudinary.com/demo/image/upload/v1/stockly/business/logo.png";

/** Un PNG de verdad —PDFKit lo abre—, liso y de 2 × 1. */
function png(): Buffer {
    const trozo = (tipo: string, datos: Buffer) => {
        const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
        const largo = Buffer.alloc(4);
        largo.writeUInt32BE(datos.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(zlib.crc32(cuerpo) >>> 0);
        return Buffer.concat([largo, cuerpo, crc]);
    };
    const cabecera = Buffer.alloc(13);
    cabecera.writeUInt32BE(2, 0);
    cabecera.writeUInt32BE(1, 4);
    cabecera[8] = 8;
    cabecera[9] = 2;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        trozo("IHDR", cabecera),
        trozo("IDAT", zlib.deflateSync(Buffer.from([0, 37, 99, 235, 37, 99, 235]))),
        trozo("IEND", Buffer.alloc(0)),
    ]);
}

const respuesta = (cuerpo: Buffer | string, init: ResponseInit = {}) => new Response(new Uint8Array(Buffer.from(cuerpo)), init);

/**
 * T6-07 — el comprobante de venta en PDF.
 *
 * El PDF va comprimido y no se puede leer, así que se mira lo que PDFKit **escribe** —`text`— y
 * lo que **incrusta** —`image`—, como en `moneda.test.ts`. Lo que se vigila: que solo lo tengan
 * las ventas enviadas, que diga lo que dice la pantalla sin calcular nada por su cuenta, que lo
 * que falta no deje hueco, y que el logo —la única petición que el servidor hace a una URL
 * guardada— nunca tumbe la descarga ni salga de Cloudinary.
 */
describe("Comprobante de venta en PDF (T6-07)", () => {
    let admin: string;
    let textos: jest.SpyInstance;
    let imagenes: jest.SpyInstance;
    let traer: jest.SpyInstance;

    const escrito = () => textos.mock.calls.map(([texto]) => String(texto));

    const descargar = (id: string, cookie = admin) =>
        request(app)
            .get(`${VENTAS}/${id}/receipt`)
            .set("Cookie", cookie)
            .buffer(true)
            .parse((r, cb) => {
                const trozos: Buffer[] = [];
                r.on("data", (t: Buffer) => trozos.push(t));
                r.on("end", () => cb(null, Buffer.concat(trozos)));
            });

    const ajustar = (ajustes: Record<string, string>) =>
        prisma.appSetting.createMany({ data: Object.entries(ajustes).map(([key, value]) => ({ key, value })) });

    const NEGOCIO = {
        businessName: "Ferretería El Tornillo",
        businessTaxId: "RNC 1-31-12345-6",
        businessAddress: "Av. Winston Churchill 1099, Santo Domingo",
        businessPhone: "+1 809 555 0142",
        businessEmail: "ventas@eltornillo.do",
        currencySymbol: "RD$",
        taxName: "ITBIS",
    };

    /** Una venta de dos líneas creada por la API —así congela la tasa vigente y a quien la registra—. */
    async function vender(extra: Record<string, unknown> = {}) {
        const taladro = await crearProducto({ data: { name: "Taladro", price: 1234.5, stock: 10 } });
        const res = await request(app)
            .post(VENTAS)
            .set("Cookie", admin)
            .send({
                customerName: "Distribuidora Vega",
                customerEmail: "compras@vega.mx",
                customerPhone: "+52 55 4821 9930",
                customerDocument: "DVE010203AB1",
                items: [
                    { productId: taladro.id, productName: "Taladro", quantity: 2, unitPrice: 1234.5 },
                    { productName: "Juego de brocas", quantity: 1, unitPrice: 499 },
                ],
                ...extra,
            });
        expect(res.status).toBe(201);
        return res.body.data as { id: string; number: number };
    }

    const enviar = async (id: string) => expect((await request(app).post(`${VENTAS}/${id}/ship`).set("Cookie", admin)).status).toBe(200);
    const cancelar = async (id: string) =>
        expect((await request(app).patch(`${VENTAS}/${id}`).set("Cookie", admin).send({ status: "CANCELLED" })).status).toBe(200);

    async function vendida(extra: Record<string, unknown> = {}) {
        const venta = await vender(extra);
        await enviar(venta.id);
        return venta;
    }

    beforeEach(async () => {
        await cleanDb();
        await prisma.appSetting.deleteMany();
        admin = getAuthCookie((await createUser({ email: "vendedora@example.com", role: "ADMIN" })).id);
        textos = jest.spyOn(PDFDocument.prototype, "text");
        imagenes = jest.spyOn(PDFDocument.prototype, "image");
        // Por defecto, Cloudinary no está: ningún test sale a la red por descuido.
        traer = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("sin red en los tests"));
    });

    afterEach(() => {
        textos.mockRestore();
        imagenes.mockRestore();
        traer.mockRestore();
    });

    afterAll(async () => {
        await prisma.appSetting.deleteMany();
        await cleanDb();
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el criterio: dos líneas con la tasa al 18 %", () => {
        it("lleva el número, los datos del negocio, las dos líneas y los tres importes", async () => {
            await ajustar({ ...NEGOCIO, taxRate: "18" });
            const venta = await vendida();
            const numero = String(venta.number).padStart(6, "0");

            const res = await descargar(venta.id);

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toBe("application/pdf");
            expect(res.headers["content-disposition"]).toBe(`attachment; filename=comprobante-${numero}.pdf`);
            expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

            const papel = escrito();
            expect(papel).toContain("Comprobante de venta");
            expect(papel).toContain(`Nº ${numero}`);
            // Los cinco datos del negocio.
            for (const dato of [NEGOCIO.businessName, NEGOCIO.businessTaxId, NEGOCIO.businessAddress, NEGOCIO.businessPhone, NEGOCIO.businessEmail]) {
                expect(papel).toContain(dato);
            }
            // Las dos líneas, con su importe **sin impuesto**: 2 × 1234.50 y 1 × 499.
            expect(papel).toEqual(expect.arrayContaining(["Taladro", "RD$1,234.50", "RD$2,469.00", "Juego de brocas", "RD$499.00"]));
            // Los tres importes de T6-05: 2968.00, su 18 % línea a línea (444.42 + 89.82) y la suma.
            const pie = papel.slice(papel.indexOf("Subtotal"));
            expect(pie.slice(0, 6)).toEqual(["Subtotal", "RD$2,968.00", "ITBIS (18 %)", "RD$534.24", "Total", "RD$3,502.24"]);
        });

        it("los importes son los que devuelve la API para esa orden: el comprobante no calcula", async () => {
            await ajustar({ taxRate: "7.5" });
            const venta = await vendida();
            const orden = (await request(app).get(`${VENTAS}/${venta.id}`).set("Cookie", admin)).body.data;

            await descargar(venta.id);

            const importe = (n: string) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            expect(escrito()).toEqual(expect.arrayContaining([importe(orden.subtotal), importe(orden.tax), importe(orden.total), "Impuesto (7.5 %)"]));
        });

        it("dice a quién se vendió, con su documento, y quién la registró", async () => {
            const venta = await vendida();

            await descargar(venta.id);

            expect(escrito()).toEqual(
                expect.arrayContaining(["CLIENTE", "Distribuidora Vega", "Documento: DVE010203AB1", "compras@vega.mx", "+52 55 4821 9930", "REGISTRADA POR", "vendedora@example.com"]),
            );
        });

        it("es un comprobante interno, y lo dice en la cabecera y en el pie", async () => {
            const venta = await vendida();

            await descargar(venta.id);

            const papel = escrito();
            expect(papel).toContain("Documento sin valor fiscal");
            expect(papel.some((t) => t.startsWith("Comprobante de venta Nº") && t.endsWith("Documento sin valor fiscal"))).toBe(true);
            expect(papel).toContain("Página 1 de 1");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("quién lo descarga", () => {
        it.each(["USER", "WAREHOUSE"] as const)("un %s lo descarga: lo lee quien lee la venta", async (role) => {
            const venta = await vendida();
            const lector = await createUser({ email: `lector_${role.toLowerCase()}@example.com`, role });

            const res = await descargar(venta.id, getAuthCookie(lector.id));

            expect(res.status).toBe(200);
            expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
        });

        it("sin sesión, 401", async () => {
            const venta = await vendida();

            expect((await request(app).get(`${VENTAS}/${venta.id}/receipt`)).status).toBe(401);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("qué órdenes lo tienen", () => {
        it("una pendiente responde 409 con su código: todavía no es una venta", async () => {
            await ajustar({ businessLogoUrl: LOGO_URL });
            const venta = await vender();

            const res = await request(app).get(`${VENTAS}/${venta.id}/receipt`).set("Cookie", admin);

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("SALE_ORDER_NOT_SHIPPED");
            expect(res.headers["content-type"]).toMatch(/json/);
            // Y no ha costado una llamada a Cloudinary.
            expect(traer).not.toHaveBeenCalled();
        });

        it("una cancelada sin haberse enviado, también 409: nunca fue una venta", async () => {
            const venta = await vender();
            await cancelar(venta.id);

            const res = await request(app).get(`${VENTAS}/${venta.id}/receipt`).set("Cookie", admin);

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("SALE_ORDER_NOT_SHIPPED");
        });

        it("una cancelada después de enviarse lo conserva, marcado como anulada en la cabecera y en el pie", async () => {
            const venta = await vendida();
            await cancelar(venta.id);

            const res = await descargar(venta.id);

            expect(res.status).toBe(200);
            const papel = escrito();
            expect(papel).toContain("ANULADA");
            expect(papel.some((t) => t.startsWith("Comprobante de venta Nº") && t.endsWith("· ANULADA"))).toBe(true);
            // Sigue diciendo lo que se vendió.
            expect(papel).toContain("Taladro");
        });

        it("una enviada no dice «anulada» en ningún sitio", async () => {
            const venta = await vendida();

            await descargar(venta.id);

            expect(escrito().filter((t) => /anulada/i.test(t))).toEqual([]);
        });

        it("una que no existe, 404", async () => {
            const res = await request(app).get(`${VENTAS}/00000000-0000-4000-8000-000000000000/receipt`).set("Cookie", admin);

            expect(res.status).toBe(404);
            expect(res.body.code).toBe("SALE_ORDER_NOT_FOUND");
        });

        it("la regla es una, en el contrato: la aplican el servidor y la interfaz", () => {
            const fecha = "2026-10-08T12:00:00.000Z";
            expect(tieneComprobante({ status: "SHIPPED", shippedAt: fecha })).toBe(true);
            expect(tieneComprobante({ status: "CANCELLED", shippedAt: fecha })).toBe(true);
            expect(tieneComprobante({ status: "CANCELLED", shippedAt: null })).toBe(false);
            expect(tieneComprobante({ status: "PENDING", shippedAt: null })).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("lo que no hay no deja hueco", () => {
        it("sin datos del negocio sale igualmente: ni líneas vacías ni rótulos sin dato", async () => {
            const venta = await vendida();

            const res = await descargar(venta.id);

            expect(res.status).toBe(200);
            const papel = escrito();
            expect(papel.filter((t) => t.trim() === "")).toEqual([]);
            // Lo primero que se escribe es el título: delante no hay bloque del negocio.
            expect(papel[0]).toBe("Comprobante de venta");
            expect(imagenes).not.toHaveBeenCalled();
        });

        it("con solo el nombre del negocio, sale el nombre y nada más", async () => {
            await ajustar({ businessName: "Mi Tienda", businessPhone: "   " });
            const venta = await vendida();

            await descargar(venta.id);

            const papel = escrito();
            expect(papel.slice(0, 2)).toEqual(["Mi Tienda", "Comprobante de venta"]);
        });

        it("sin cliente ni vendedor, no hay bloque de cliente", async () => {
            const venta = await vendida({ customerName: undefined, customerEmail: undefined, customerPhone: undefined, customerDocument: undefined });
            await prisma.saleOrder.update({ where: { id: venta.id }, data: { createdByEmail: null } });

            await descargar(venta.id);

            const papel = escrito();
            expect(papel).not.toContain("CLIENTE");
            expect(papel).not.toContain("REGISTRADA POR");
            expect(papel.filter((t) => t.startsWith("Documento:"))).toEqual([]);
        });

        it("con cliente y sin documento, no sale el rótulo «Documento:»", async () => {
            const venta = await vendida({ customerDocument: undefined });

            await descargar(venta.id);

            expect(escrito()).toContain("Distribuidora Vega");
            expect(escrito().filter((t) => t.startsWith("Documento:"))).toEqual([]);
        });

        it("con la tasa a 0 el pie es solo el total, como en la pantalla", async () => {
            const venta = await vendida();

            await descargar(venta.id);

            const papel = escrito();
            expect(papel).not.toContain("Subtotal");
            expect(papel.filter((t) => /Impuesto|ITBIS/.test(t))).toEqual([]);
            expect(papel.slice(papel.indexOf("Total")).slice(0, 2)).toEqual(["Total", "$2,968.00"]);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el logo", () => {
        it("con logo, se trae de Cloudinary y se incrusta", async () => {
            await ajustar({ businessLogoUrl: LOGO_URL });
            traer.mockResolvedValue(respuesta(png()));
            const venta = await vendida();

            const res = await descargar(venta.id);

            expect(res.status).toBe(200);
            expect(traer).toHaveBeenCalledTimes(1);
            expect(traer.mock.calls[0]![0]).toBe(LOGO_URL);
            // Con tope de tiempo y sin seguir redirecciones.
            expect(traer.mock.calls[0]![1]).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
            expect(imagenes).toHaveBeenCalledTimes(1);
        });

        it("con Cloudinary caído sale sin logo, no con un 500", async () => {
            await ajustar({ ...NEGOCIO, businessLogoUrl: LOGO_URL });
            traer.mockRejectedValue(new TypeError("fetch failed"));
            const venta = await vendida();

            const res = await descargar(venta.id);

            expect(res.status).toBe(200);
            expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
            expect(traer).toHaveBeenCalledTimes(1);
            expect(imagenes).not.toHaveBeenCalled();
            // El resto del papel está entero.
            expect(escrito()).toEqual(expect.arrayContaining([NEGOCIO.businessName, "Taladro", "Total"]));
        });

        it.each([
            ["responde 404", () => respuesta("no está", { status: 404 })],
            ["responde 500", () => respuesta("roto", { status: 500 })],
            ["devuelve una página y no una imagen", () => respuesta("<html>mantenimiento</html>")],
            ["devuelve un WebP, que PDFKit no incrusta", () => respuesta(Buffer.concat([Buffer.from("RIFF\x00\x00\x00\x00WEBP", "latin1"), Buffer.alloc(32)]))],
            ["declara más peso del admitido", () => respuesta(png(), { headers: { "content-length": String(PESO_MAXIMO_DEL_LOGO + 1) } })],
            ["manda más peso del admitido sin declararlo", () => respuesta(Buffer.concat([png(), Buffer.alloc(PESO_MAXIMO_DEL_LOGO)]))],
            ["manda la firma de un PNG y basura detrás", () => respuesta(Buffer.concat([png().subarray(0, 8), Buffer.alloc(64, 7)]))],
        ])("si Cloudinary %s, sale sin logo", async (_caso, responder) => {
            await ajustar({ businessLogoUrl: LOGO_URL });
            traer.mockResolvedValue(responder());
            const venta = await vendida();

            const res = await descargar(venta.id);

            expect(res.status).toBe(200);
            expect(imagenes.mock.results.filter((r) => r.type === "return")).toEqual([]);
            expect(escrito()).toContain("Taladro");
        });

        it.each([
            ["otro servidor", "https://ejemplo.com/logo.png"],
            ["la red interna", "http://169.254.169.254/latest/meta-data/"],
            ["Cloudinary sin HTTPS", "http://res.cloudinary.com/demo/image/upload/logo.png"],
            ["un dominio que solo empieza igual", "https://res.cloudinary.com.ejemplo.com/logo.png"],
            ["Cloudinary con credenciales en la URL", "https://usuario:clave@res.cloudinary.com/demo/logo.png"],
            ["Cloudinary por otro puerto", "https://res.cloudinary.com:8443/demo/logo.png"],
            ["algo que no es una URL", "logo.png"],
        ])("una URL guardada que apunta a %s no se pide: el servidor solo va a Cloudinary", async (_caso, url) => {
            await ajustar({ businessLogoUrl: url });
            const venta = await vendida();

            const res = await descargar(venta.id);

            expect(res.status).toBe(200);
            expect(traer).not.toHaveBeenCalled();
            expect(imagenes).not.toHaveBeenCalled();
        });

        it("sin logo guardado no se pide nada", async () => {
            const venta = await vendida();

            await descargar(venta.id);

            expect(traer).not.toHaveBeenCalled();
        });

        it("si Cloudinary no contesta, se deja de esperar: el tope de tiempo corta la petición", async () => {
            // Una petición que no termina nunca, salvo que la aborten.
            traer.mockImplementation(
                (_url: unknown, init?: RequestInit) =>
                    new Promise((_ok, falla) => init?.signal?.addEventListener("abort", () => falla(init.signal!.reason))),
            );
            const inicio = Date.now();

            const logo = await traerLogoDelNegocio(LOGO_URL, { tiempoMaximoMs: 40 });

            expect(logo).toBeNull();
            expect(Date.now() - inicio).toBeLessThan(2000);
        });

        it("lo que no es PNG ni JPEG se descarta al traerlo, sin esperar a que PDFKit lo rechace", async () => {
            // Los casos de arriba pasarían también sin esta comprobación —PDFKit no abre una
            // página web y el generador lo aguanta—: aquí se mira la firma, que es la primera red.
            traer.mockResolvedValue(respuesta("<html>mantenimiento</html>"));
            expect(await traerLogoDelNegocio(LOGO_URL)).toBeNull();

            traer.mockResolvedValue(respuesta(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])));
            expect(await traerLogoDelNegocio(LOGO_URL)).not.toBeNull();
        });

        it("lo que devuelve es exactamente lo que mandó Cloudinary", async () => {
            traer.mockResolvedValue(respuesta(png()));

            expect((await traerLogoDelNegocio(LOGO_URL))?.equals(png())).toBe(true);
            expect(await traerLogoDelNegocio(null)).toBeNull();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("la fecha", () => {
        it("es la del envío, en la zona del negocio y no en UTC", async () => {
            const venta = await vendida();
            // Las 02:30 UTC del día 9 son las 22:30 del día 8 en Santo Domingo, la zona por defecto.
            await prisma.saleOrder.update({
                where: { id: venta.id },
                data: { createdAt: new Date("2026-10-01T15:00:00Z"), shippedAt: new Date("2026-10-09T02:30:00Z") },
            });

            await descargar(venta.id);

            expect(escrito()).toContain("8 de octubre de 2026 a las 22:30");
        });

        it("cambiar la zona del negocio la cambia", async () => {
            await ajustar({ timezone: "Europe/Madrid" });
            const venta = await vendida();
            await prisma.saleOrder.update({ where: { id: venta.id }, data: { shippedAt: new Date("2026-10-09T02:30:00Z") } });

            await descargar(venta.id);

            expect(escrito()).toContain("9 de octubre de 2026 a las 04:30");
        });

        it("solo lleva caracteres que la fuente del PDF tiene", () => {
            // `es-MX` escribe «2:35 p. m.» con un espacio estrecho (U+202F) que Helvetica no tiene.
            const fecha = fechaDelComprobante(new Date("2026-10-08T18:35:00Z"), "America/Santo_Domingo");

            expect(fecha).toBe("8 de octubre de 2026 a las 14:35");
            expect(fecha).toMatch(/^[\x20-\x7e¡-ÿ]+$/);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el papel", () => {
        const paginas = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;

        it("es un A4", async () => {
            const venta = await vendida();

            const res = await descargar(venta.id);

            expect((res.body as Buffer).toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
            expect(paginas(res.body as Buffer)).toBe(1);
        });

        it("una venta larga pasa de página, repite el encabezado de la tabla y numera cada una", async () => {
            const venta = await vendida({
                items: Array.from({ length: 60 }, (_, i) => ({ productName: `Artículo ${i + 1}`, quantity: 1, unitPrice: 10 })),
            });

            const res = await descargar(venta.id);

            const total = paginas(res.body as Buffer);
            expect(total).toBeGreaterThan(1);
            const papel = escrito();
            expect(papel.filter((t) => t === "DESCRIPCIÓN")).toHaveLength(total);
            expect(papel).toEqual(expect.arrayContaining(["Artículo 1", "Artículo 60", "Página 1 de " + total, `Página ${total} de ${total}`]));
            // El pie con la leyenda, en todas.
            expect(papel.filter((t) => t.endsWith("Documento sin valor fiscal") && t.startsWith("Comprobante"))).toHaveLength(total);
        });

        it("una descripción larga no se recorta: se lee entera", async () => {
            const largo = "Juego de brocas de titanio para metal, madera y mampostería, 99 piezas, con estuche rígido y guía de profundidad";
            const venta = await vendida({ items: [{ productName: largo, quantity: 1, unitPrice: 499 }] });

            await descargar(venta.id);

            expect(escrito()).toContain(largo);
        });

        it("un salto de línea en un nombre no descoloca el papel: sale en una línea", async () => {
            const venta = await vendida({ customerName: "Ana\nSoto", items: [{ productName: "Cable\tUSB\r\nde 2 m", quantity: 1, unitPrice: 5 }] });

            await descargar(venta.id);

            const papel = escrito();
            expect(papel).toEqual(expect.arrayContaining(["Ana Soto", "Cable USB de 2 m"]));
            // eslint-disable-next-line no-control-regex
            expect(papel.filter((t) => /[\x00-\x1f]/.test(t))).toEqual([]);
        });

        it("no deja rastro en la auditoría: es una lectura", async () => {
            const venta = await vendida();
            const antes = await prisma.auditLog.count();

            await descargar(venta.id);

            expect(await prisma.auditLog.count()).toBe(antes);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("el rótulo del impuesto", () => {
        it("dice la tasa cuando las líneas con impuesto comparten una, aunque otras no lleven", () => {
            expect(rotuloDelImpuesto("IVA", [{ taxRate: 16 }, { taxRate: 16 }, { taxRate: null }])).toBe("IVA (16 %)");
        });

        it("con dos tasas distintas no se inventa una: solo el nombre", () => {
            expect(rotuloDelImpuesto("IVA", [{ taxRate: 16 }, { taxRate: 8 }])).toBe("IVA");
        });

        it("sin nombre en Configuración, el genérico", () => {
            expect(rotuloDelImpuesto("", [{ taxRate: 18 }])).toBe("Impuesto (18 %)");
            expect(rotuloDelImpuesto("  ", [{ taxRate: null }])).toBe("Impuesto");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("la palabra que no aparece (decidido el 2026-10-05)", () => {
        // El comprobante no tiene valor fiscal. Llamarlo como el documento que sí lo tiene sería
        // prometer algo que el papel no es.
        const PROHIBIDA = /factura|invoice/i;

        it("no la escribe el PDF, ni en una venta enviada ni en una anulada", async () => {
            await ajustar({ ...NEGOCIO, taxRate: "18" });
            const venta = await vendida();
            await descargar(venta.id);
            await cancelar(venta.id);
            await descargar(venta.id);

            expect(escrito().filter((t) => PROHIBIDA.test(t))).toEqual([]);
        });

        it("no está en el generador, ni en su ruta, ni en lo que documenta Swagger de ella", () => {
            const raiz = path.join(__dirname, "..");
            const fuentes = ["modules/sale-orders/sale-orders.comprobante.ts", "modules/sale-orders/sale-orders.controller.ts", "modules/sale-orders/sale-orders.routes.ts"];
            for (const archivo of fuentes) expect(readFileSync(path.join(raiz, archivo), "utf8")).not.toMatch(PROHIBIDA);

            const swagger = readFileSync(path.join(raiz, "swagger.paths.ts"), "utf8");
            const ruta = swagger.slice(swagger.indexOf('"/sale-orders/{id}/receipt"'), swagger.indexOf('"/sale-orders/{id}/ship"'));
            expect(ruta).toContain("sin valor fiscal");
            expect(ruta).not.toMatch(PROHIBIDA);
        });
    });
});
