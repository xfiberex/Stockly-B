import request from "supertest";
import type { Response } from "express";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { buildCsv } from "@/shared/lib/csv";
import { enviarExportacion, MAX_FILAS_EXPORTACION, TAM_LOTE_EXPORTACION, BOM } from "@/shared/lib/exportacion";
import { HttpError } from "@/shared/lib/httpError";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

// T2-05: las tres exportaciones cargaban su tabla entera y `buildCsv` concatenaba el
// archivo completo en una cadena antes de enviarlo. Ahora el servicio entrega lotes por
// cursor y la respuesta se escribe según llegan.
//
// Lo que más importa comprobar no es la memoria —que no se mide bien desde un test—
// sino que **el archivo no ha cambiado**: es lo que el usuario nota si se rompe.

const BASE = "/api/v1/products";

describe("Exportación en streaming (T2-05)", () => {
    let cookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "export_admin@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    afterEach(async () => {
        // `contains` y no `startsWith`: uno de los productos de prueba empieza por `=`
        // a propósito, y con `startsWith` sobrevivía y contaminaba los tests siguientes.
        await prisma.product.deleteMany({ where: { name: { contains: "T205-" } } });
    });

    it("el CSV es idéntico al que producía `buildCsv` sobre el conjunto completo", async () => {
        const categoria = await prisma.category.create({ data: { name: "T205-Cat" } });
        await prisma.product.create({
            data: { name: "T205-uno", description: "con, coma", price: 10.5, stock: 3, minStock: 1, categoryId: categoria.id },
        });
        await prisma.product.create({
            // Empieza por `=`: la protección contra inyección de fórmulas tiene que
            // seguir aplicándose ahora que el escapado ocurre fila a fila.
            data: { name: "=T205-dos", description: 'comillas "dobles"', price: 2, stock: 0, minStock: 0 },
        });

        const res = await request(app).get(`${BASE}/export?format=csv`).set("Cookie", cookie);

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/csv/);

        // La referencia se calcula con la misma función que generaba el archivo antes,
        // sobre las filas leídas de la base: si el streaming cambiara una coma, un
        // escape o el orden de las columnas, esto lo caza.
        const filas: Array<Record<string, unknown>> = [];
        for await (const lote of (await import("@/modules/products/product.service")).productService.exportarPorLotes()) {
            filas.push(...lote);
        }
        // El `BOM` de T2-34 va delante; quitado, el resto tiene que ser byte a byte lo
        // que generaba `buildCsv`.
        expect(res.text.startsWith(BOM)).toBe(true);
        expect(res.text.slice(BOM.length)).toBe(buildCsv(filas));
        expect(res.text.slice(BOM.length).split("\n")[0]).toBe(
            "name,description,sku,price,stock,minStock,isActive,categoryName,brandName,supplierName,tags",
        );

        await prisma.category.delete({ where: { id: categoria.id } });
    });

    it("sin filas, el CSV sale vacío, como antes", async () => {
        const res = await request(app).get(`${BASE}/export?format=csv`).set("Cookie", cookie);

        expect(res.status).toBe(200);
        expect(res.text).toBe("");
    });

    it("el JSON conserva el sobre de la API aunque se transmita por partes", async () => {
        await prisma.product.create({ data: { name: "T205-json", price: 7, stock: 2, minStock: 0 } });

        const res = await request(app).get(`${BASE}/export`).set("Cookie", cookie);

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
        // Se construye a mano —`res.json` serializaría el array completo en memoria—,
        // así que hay que comprobar que el resultado sigue siendo JSON válido y con la
        // misma forma que el resto de la API.
        expect(res.body).toMatchObject({ success: true, message: "Productos exportados exitosamente" });
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]).toMatchObject({ name: "T205-json", stock: 2, categoryName: null });
    });

    it("cruza varios lotes sin repetir ni perder filas", async () => {
        // Un lote y medio: es donde vive el fallo clásico de la paginación por cursor.
        const N = TAM_LOTE_EXPORTACION + 100;
        await prisma.product.createMany({
            data: Array.from({ length: N }, (_, i) => ({
                name: `T205-lote-${String(i).padStart(4, "0")}`,
                price: 1 + i,
                stock: i,
                minStock: 0,
            })),
        });

        const res = await request(app).get(`${BASE}/export?format=csv`).set("Cookie", cookie);

        const lineas = res.text.split("\n");
        expect(lineas).toHaveLength(N + 1); // + cabecera
        const nombres = lineas.slice(1).map((l) => l.split(",")[0]);
        expect(new Set(nombres).size).toBe(N);
    });

    it("todas las filas comparten `createdAt`, y aun así no se pierde ninguna", async () => {
        // `createMany` las crea en el mismo instante, así que `createdAt` empata en las
        // 600: es el caso en que el cursor solo se sostiene por el desempate de `id`.
        //
        // **Este test también pasa quitando el desempate**, comprobado: Postgres devuelve
        // de hecho el mismo orden en cada página mientras nadie escriba entre medias. Se
        // deja porque documenta el caso y porque fallaría si esa casualidad dejara de
        // darse, que es justo lo que no queremos que dependa de la suerte.
        const N = TAM_LOTE_EXPORTACION + 100;
        const instante = new Date("2026-01-01T00:00:00.000Z");
        await prisma.product.createMany({
            data: Array.from({ length: N }, (_, i) => ({
                name: `T205-empate-${String(i).padStart(4, "0")}`,
                price: 1,
                stock: 0,
                minStock: 0,
                createdAt: instante,
            })),
        });

        const res = await request(app).get(`${BASE}/export?format=csv`).set("Cookie", cookie);

        const nombres = res.text.split("\n").slice(1).map((l) => l.split(",")[0]);
        expect(nombres).toHaveLength(N);
        expect(new Set(nombres).size).toBe(N);
    });
});

// T2-34: el CSV salía como `text/csv` a secas y sin marca de orden de bytes, así que
// Excel en Windows lo abría con la página de códigos del sistema y los acentos se
// rompían — «Electrónica» se veía «ElectrÃ³nica».
describe("Codificación del CSV exportado (T2-34)", () => {
    let cookie: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "csv_admin@example.com", role: "ADMIN" });
        cookie = getAuthCookie(admin.id);
    });

    afterAll(async () => {
        await cleanDb();
    });

    it("declara `charset=utf-8` y empieza por la marca de orden de bytes", async () => {
        const producto = await prisma.product.create({
            data: { name: "T234-Cámara réflex", description: "Ñandú, acentuación", price: 10, stock: 1, minStock: 0 },
        });

        const res = await request(app).get(`${BASE}/export?format=csv`).set("Cookie", cookie);

        expect(res.headers["content-type"]).toMatch(/text\/csv; ?charset=utf-8/);
        expect(res.text.startsWith(BOM)).toBe(true);
        // Y el contenido acentuado llega intacto, que es de lo que iba todo esto.
        expect(res.text).toContain("T234-Cámara réflex");

        await prisma.product.delete({ where: { id: producto.id } });
    });

    it("el CSV de movimientos de un producto recibe el mismo trato", async () => {
        const producto = await prisma.product.create({
            data: { name: "T234-con-movimientos", price: 10, stock: 5, minStock: 0 },
        });
        await prisma.stockMovement.create({
            data: { productId: producto.id, type: "IN", delta: 5, stockAfter: 5, note: "Importación" },
        });

        const res = await request(app)
            .get(`${BASE}/${producto.id}/movements/export?format=csv`)
            .set("Cookie", cookie);

        expect(res.headers["content-type"]).toMatch(/text\/csv; ?charset=utf-8/);
        expect(res.text.startsWith(BOM)).toBe(true);
        expect(res.text).toContain("Importación");

        await prisma.stockMovement.deleteMany({ where: { productId: producto.id } });
        await prisma.product.delete({ where: { id: producto.id } });
    });

    it("el JSON no lleva la marca: sería un error de sintaxis", async () => {
        const res = await request(app).get(`${BASE}/export`).set("Cookie", cookie);

        // Un analizador estricto rechaza un documento JSON que empiece por `U+FEFF`.
        expect(res.text.startsWith(BOM)).toBe(false);
        expect(res.body.success).toBe(true);
    });
});

describe("Tope de la exportación (T2-05)", () => {
    /** Un doble de `Response` que registra si se llegó a escribir algo. */
    function respuestaFalsa() {
        const escrito: string[] = [];
        const res = {
            setHeader: () => {},
            write: (t: string) => { escrito.push(t); return true; },
            end: () => {},
            once: () => {},
            off: () => {},
        } as unknown as Response;
        return { res, escrito };
    }

    async function* sinLotes() { /* no se llega a iterar */ }

    it("rechaza con 413 antes de escribir un solo byte", async () => {
        const { res, escrito } = respuestaFalsa();

        await expect(
            enviarExportacion(res, {
                formato: "csv",
                nombreArchivo: "x",
                mensaje: "x",
                total: MAX_FILAS_EXPORTACION + 1,
                lotes: sinLotes(),
            }),
        ).rejects.toBeInstanceOf(HttpError);

        // El orden importa: una vez enviada la cabecera ya no se puede responder un
        // error, y lo único que quedaría es cortar el archivo por la mitad y que el
        // usuario se lleve una exportación incompleta creyéndola buena.
        expect(escrito).toHaveLength(0);
    });

    it("justo en el tope sí exporta", async () => {
        const { res, escrito } = respuestaFalsa();

        await enviarExportacion(res, {
            formato: "csv",
            nombreArchivo: "x",
            mensaje: "x",
            total: MAX_FILAS_EXPORTACION,
            lotes: (async function* () { yield [{ a: 1 }]; })(),
        });

        // Con el `BOM` de T2-34 al frente: es lo primero que se escribe del archivo.
        expect(escrito.join("")).toBe(BOM + "a\n1");
    });
});
