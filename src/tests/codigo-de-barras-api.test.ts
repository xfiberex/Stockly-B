import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { productService } from "@/modules/products/product.service";
import { barrasDe } from "@/modules/products/codigoDeBarras";
import { nuevoDocumentoDeEtiquetas, renderEtiquetas } from "@/modules/products/product.etiquetas";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

/**
 * T5-08 — el código de barras por la API: guardarlo, encontrar un producto por él e imprimir
 * sus etiquetas. Que las barras se lean está en `codigo-de-barras.test.ts`; aquí, que lleguen
 * al PDF tal cual y que todo lo que rodea al código se comporte.
 */

const PRODUCTOS = "/api/v1/products";
const EAN = "4006381333931";
const UPC = "036000291452";

describe("Código de barras en la API (T5-08)", () => {
    let admin: string;
    let usuario: string;

    beforeAll(async () => {
        await cleanDb();
        admin = getAuthCookie((await createUser({ email: "cb_admin@example.com", role: "ADMIN" })).id);
        usuario = getAuthCookie((await createUser({ email: "cb_user@example.com", role: "USER" })).id);
    });

    afterEach(async () => {
        await prisma.inventoryCount.deleteMany();
        await prisma.stockMovement.deleteMany();
        await prisma.product.deleteMany();
        await prisma.auditLog.deleteMany();
    });

    afterAll(async () => {
        await cleanDb();
    });

    const crear = (cuerpo: Record<string, unknown>) =>
        request(app).post(PRODUCTOS).set("Cookie", admin).send({ price: 10, ...cuerpo });

    const producto = (name: string, extra: { barcode?: string; sku?: string; isActive?: boolean } = {}) =>
        prisma.product.create({ data: { name, price: 12.5, stock: 3, ...extra } });

    describe("Guardarlo", () => {
        it("se guarda al crear y un segundo producto con el mismo código recibe 409, no 500", async () => {
            const primero = await crear({ name: "Teclado", barcode: EAN });
            expect(primero.status).toBe(201);
            expect(primero.body.data.barcode).toBe(EAN);

            const segundo = await crear({ name: "Otro teclado", barcode: EAN });

            expect(segundo.status).toBe(409);
            expect(segundo.body.code).toBe("BARCODE_EXISTS");
            expect(await prisma.product.count()).toBe(1);
        });

        it("un SKU repetido también es 409: hasta T5-08 era un 500", async () => {
            expect((await crear({ name: "Ratón", sku: "RAT-1" })).status).toBe(201);

            const res = await crear({ name: "Ratón bis", sku: "RAT-1" });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("SKU_EXISTS");
        });

        it("al editar, quitarle a uno su código y dárselo a otro también choca con 409", async () => {
            const a = await producto("A", { barcode: EAN });
            const b = await producto("B");

            const res = await request(app).put(`${PRODUCTOS}/${b.id}`).set("Cookie", admin).send({ barcode: EAN });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe("BARCODE_EXISTS");
            expect((await prisma.product.findUniqueOrThrow({ where: { id: a.id } })).barcode).toBe(EAN);
        });

        it("un EAN con el dígito de control mal se rechaza al guardar", async () => {
            const res = await crear({ name: "Mal", barcode: "4006381333932" });

            expect(res.status).toBe(422);
            expect(res.body.errors).toEqual([expect.objectContaining({ field: "barcode", message: expect.stringMatching(/dígito de control/) })]);
        });

        it("al editar, el vacío lo quita y no mandarlo no lo toca", async () => {
            const p = await producto("Monitor", { barcode: EAN });
            const editar = (cuerpo: Record<string, unknown>) =>
                request(app).put(`${PRODUCTOS}/${p.id}`).set("Cookie", admin).send(cuerpo);

            expect((await editar({ name: "Monitor 27" })).body.data.barcode).toBe(EAN);
            expect((await editar({ barcode: "" })).body.data.barcode).toBeNull();
        });

        it("los espacios de alrededor no forman parte del código", async () => {
            const res = await crear({ name: "Espacios", barcode: `  ${EAN} ` });

            expect(res.body.data.barcode).toBe(EAN);
        });
    });

    describe("Buscar por código", () => {
        const buscar = (code: string, cookie = usuario) =>
            request(app).get(`${PRODUCTOS}/lookup`).query({ code }).set("Cookie", cookie);

        it("por código de barras devuelve la ficha con el disponible, como `GET /products/:id`", async () => {
            const p = await producto("Teclado", { barcode: EAN });

            const res = await buscar(EAN);

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ id: p.id, barcode: EAN, availableStock: 3, abcClass: "C" });
        });

        it("por SKU, exacto", async () => {
            const p = await producto("Ratón", { sku: "RAT-1" });

            expect((await buscar("RAT-1")).body.data.id).toBe(p.id);
            expect((await buscar("RAT")).status).toBe(404);
        });

        it("un UPC-A se encuentra leído con 12 cifras o con 13, lo haya guardado de una forma o de la otra", async () => {
            const doce = await producto("Guardado con 12", { barcode: UPC });
            const trece = await producto("Guardado con 13", { barcode: "0012345678905" });

            expect((await buscar(`0${UPC}`)).body.data.id).toBe(doce.id);
            expect((await buscar("012345678905")).body.data.id).toBe(trece.id);
        });

        it("si el texto es el código de barras de uno y el SKU de otro, gana el código de barras", async () => {
            await producto("Por SKU", { sku: EAN });
            const porCodigo = await producto("Por código", { barcode: EAN });

            expect((await buscar(EAN)).body.data.id).toBe(porCodigo.id);
        });

        it("también encuentra los inactivos: la ficha los enseña como tales", async () => {
            await producto("Retirado", { barcode: EAN, isActive: false });

            expect((await buscar(EAN)).body.data.isActive).toBe(false);
        });

        it("uno desconocido es 404 con el código en los parámetros, para ofrecer darlo de alta", async () => {
            const res = await buscar("NO-EXISTE");

            expect(res.status).toBe(404);
            expect(res.body).toMatchObject({ code: "PRODUCT_NOT_FOUND", params: { codigo: "NO-EXISTE" } });
        });

        it("sin código es 400, no una lista", async () => {
            const res = await buscar("  ");

            expect(res.status).toBe(400);
            expect(res.body.code).toBe("INVALID_FILTER_VALUE");
        });
    });

    describe("Etiquetas", () => {
        const pedir = (query: Record<string, string>) =>
            request(app).get(`${PRODUCTOS}/labels`).query(query).set("Cookie", usuario)
                .buffer(true).parse((res, callback) => {
                    const trozos: Buffer[] = [];
                    res.on("data", (t: Buffer) => trozos.push(t));
                    res.on("end", () => callback(null, Buffer.concat(trozos)));
                });

        // Los diccionarios de página no van comprimidos: se cuentan sin abrir el PDF.
        const paginas = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;

        it("en A4 caben 24 por hoja: 2 productos × 13 copias son 2 hojas", async () => {
            const a = await producto("A", { barcode: EAN });
            const b = await producto("B", { sku: "B-1" });

            const res = await pedir({ ids: `${a.id},${b.id}`, copies: "13" });

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toBe("application/pdf");
            expect(paginas(res.body as Buffer)).toBe(2);
        });

        it("en rollo, una etiqueta de 50 × 25 mm por página", async () => {
            const a = await producto("A", { barcode: EAN });

            const res = await pedir({ ids: a.id, format: "label", copies: "3" });
            const pdf = (res.body as Buffer).toString("latin1");

            expect(paginas(res.body as Buffer)).toBe(3);
            expect(pdf).toMatch(/\/MediaBox \[0 0 141\.73\d* 70\.86\d*\]/);
        });

        it("el código es el de barras si lo hay y si no el SKU, en el orden pedido", async () => {
            const conCodigo = await producto("Con código", { barcode: EAN, sku: "IGNORADO" });
            const conSku = await producto("Con SKU", { sku: "SKU-9" });

            const { etiquetas, formato } = await productService.prepararEtiquetas({
                ids: `${conSku.id},${conCodigo.id}`,
                copies: "2",
            });

            expect(formato).toBe("sheet");
            expect(etiquetas.map((e) => e.codigo)).toEqual(["SKU-9", "SKU-9", EAN, EAN]);
            expect(etiquetas[0]).toMatchObject({ nombre: "Con SKU", precio: 12.5 });
        });

        it("las barras del PDF son exactamente las del codificador", () => {
            const doc = nuevoDocumentoDeEtiquetas();
            const rect = jest.spyOn(doc, "rect");

            renderEtiquetas(doc, [{ nombre: "X", codigo: "PER-LOG-MX3", precio: 1 }], "label", "$");
            doc.end();

            // Se reconstruye la cadena de módulos a partir de dónde cayó cada rectángulo.
            const llamadas = rect.mock.calls.map(([x, , ancho]) => [Number(x), Number(ancho)] as const);
            const inicio = llamadas[0]![0];
            const modulo = Math.min(...llamadas.map(([, ancho]) => ancho));
            const fin = Math.max(...llamadas.map(([x, ancho]) => x + ancho));
            const modulos = Array.from({ length: Math.round((fin - inicio) / modulo) }, () => "0");
            for (const [x, ancho] of llamadas) {
                const desde = Math.round((x - inicio) / modulo);
                for (let i = 0; i < Math.round(ancho / modulo); i++) modulos[desde + i] = "1";
            }
            expect(modulos.join("")).toBe(barrasDe("PER-LOG-MX3").modulos);
        });

        it("un código demasiado largo para el formato se rechaza antes de empezar el PDF, nombrando el producto", async () => {
            // 17 caracteres caben en la de rollo; 18 ya no, y en la hoja A4 sí.
            const justo = await producto("Justo", { sku: "ABCDEFGHIJKLMNOPQ" });
            const largo = await producto("Largo", { sku: "ABCDEFGHIJKLMNOPQR" });

            expect((await pedir({ ids: justo.id, format: "label" })).status).toBe(200);
            const res = await pedir({ ids: `${justo.id},${largo.id}`, format: "label" });
            expect(res.status).toBe(400);
            expect(JSON.parse((res.body as Buffer).toString())).toMatchObject({ code: "CODE_TOO_LONG_FOR_LABEL", params: { producto: "Largo" } });
            expect((await pedir({ ids: largo.id, format: "sheet" })).status).toBe(200);
        });

        it("un producto sin código de barras ni SKU rechaza la petición entera", async () => {
            const a = await producto("A", { barcode: EAN });
            const b = await producto("Sin nada");

            const res = await pedir({ ids: `${a.id},${b.id}` });

            expect(res.status).toBe(400);
            expect(JSON.parse((res.body as Buffer).toString())).toMatchObject({ code: "PRODUCTS_WITHOUT_CODE", params: { productos: 1 } });
        });

        it.each([
            [{ ids: "" }, "ids"],
            [{ ids: "x", format: "a3" }, "format"],
            [{ ids: "x", copies: "0" }, "copies"],
            [{ ids: "x", copies: "1.5" }, "copies"],
            [{ ids: "x", copies: "2001" }, "copies"],
        ])("%j es 400 por «%s»", async (query, campo) => {
            const res = await pedir(query);

            expect(res.status).toBe(400);
            expect(JSON.parse((res.body as Buffer).toString()).params.campo).toBe(campo);
        });

        it("un identificador que no existe es 404", async () => {
            const res = await pedir({ ids: "00000000-0000-0000-0000-000000000000" });

            expect(res.status).toBe(404);
        });
    });

    describe("En el conteo físico", () => {
        it("las líneas se filtran por producto, y la búsqueda encuentra por código de barras exacto", async () => {
            const almacen = getAuthCookie((await createUser({ role: "WAREHOUSE" })).id);
            const a = await producto("Teclado", { barcode: EAN });
            await producto("Ratón", { barcode: "96385074" });
            const conteo = await request(app).post("/api/v1/inventory-counts").set("Cookie", almacen).send({});
            const lineas = (query: Record<string, string>) =>
                request(app).get(`/api/v1/inventory-counts/${conteo.body.data.id}/lines`).query(query).set("Cookie", almacen);

            expect((await lineas({ productId: a.id })).body.data.data.map((l: { name: string }) => l.name)).toEqual(["Teclado"]);
            expect((await lineas({ search: EAN })).body.data.data.map((l: { name: string }) => l.name)).toEqual(["Teclado"]);
            expect((await lineas({ search: EAN.slice(0, 6) })).body.data.data).toEqual([]);
        });
    });
});
