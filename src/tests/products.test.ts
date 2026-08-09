import request from "supertest";
import app from "@/app";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";
import { updateProductSchema } from "@/modules/products/product.validator";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

jest.mock("@/shared/middlewares/upload.middleware", () => ({
    // T2-32: el mock debe exportar **todo** lo que las rutas importan de este módulo.
    // Sin esta línea, Express recibe `undefined` como manejador y la suite no arranca.
    verificarFirmaDeImagen: (_req: unknown, _res: unknown, next: () => void) => next(),
    uploadToCloudinary: jest.fn().mockResolvedValue({
        url: "https://res.cloudinary.com/test/image/upload/v1/test.jpg",
        publicId: "test/test",
    }),
    deleteFromCloudinary: jest.fn().mockResolvedValue(undefined),
    upload: {
        single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    },
}));

const BASE = "/api/v1/products";

describe("Products API", () => {
    let authCookie: string;
    let categoryId: string;

    beforeAll(async () => {
        await cleanDb();
        const user = await createUser({ email: "products_user@example.com", role: "ADMIN" });
        authCookie = getAuthCookie(user.id);

        // Crear categoría de test para usar en todos los productos
        const category = await prisma.category.create({ data: { name: "Electrónica" } });
        categoryId = category.id;
    });

    afterAll(async () => {
        await cleanDb();
    });

    // -----------------------------------------------------------------------
    describe("Guardia de autenticación", () => {
        it("401: GET /products sin cookie", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("401: POST /products sin cookie", async () => {
            const res = await request(app).post(BASE).send({ name: "X", price: 10 });
            expect(res.status).toBe(401);
        });

        it("401: DELETE /products/:id sin cookie", async () => {
            const res = await request(app).delete(`${BASE}/some-id`);
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /products", () => {
        it("201: crea producto con campos válidos", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: 'Monitor LG 27"', description: "Monitor Full HD", price: 299.99, stock: 15, categoryId });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({ name: 'Monitor LG 27"', isActive: true });
            expect(res.body.data.category).toMatchObject({ id: categoryId, name: "Electrónica" });
            expect(res.body.data.id).toBeDefined();
        });

        it("201: crea producto sin categoría (categoryId opcional)", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto sin categoría", price: 10 });

            expect(res.status).toBe(201);
            expect(res.body.data.category).toBeNull();
        });

        it("422: faltan campos obligatorios (sin precio)", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto incompleto" });

            expect(res.status).toBe(422);
            expect(res.body.errors).toBeDefined();
        });

        it("422: categoryId no es UUID válido", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto", price: 10, categoryId: "no-es-uuid" });

            expect(res.status).toBe(422);
        });

        it("422: precio negativo", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto", price: -50 });

            expect(res.status).toBe(422);
        });

        it("422: stock negativo", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Producto", price: 10, stock: -1 });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("GET /products", () => {
        beforeAll(async () => {
            const perifericos = await prisma.category.create({ data: { name: "Periféricos" } });
            const audio = await prisma.category.create({ data: { name: "Audio" } });

            await prisma.product.createMany({
                data: [
                    { name: "Teclado Mecánico", price: 89.99, stock: 30, categoryId: perifericos.id, isActive: true },
                    { name: "Mouse Gamer", price: 45.0, stock: 50, categoryId: perifericos.id, isActive: true },
                    { name: "Auriculares Sony", price: 120.0, stock: 10, categoryId: audio.id, isActive: false },
                ],
            });
        });

        it("200: devuelve lista paginada con meta", async () => {
            const res = await request(app).get(BASE).set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data.data)).toBe(true);
            expect(res.body.data.meta).toMatchObject({ page: 1, limit: 10 });
            expect(res.body.data.meta.total).toBeGreaterThanOrEqual(1);
        });

        it("200: filtra por categoryId", async () => {
            const perifericosId = (await prisma.category.findUnique({ where: { name: "Periféricos" } }))!.id;

            const res = await request(app)
                .get(`${BASE}?categoryId=${perifericosId}`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            const products = res.body.data.data as Array<{ category: { name: string } }>;
            expect(products.length).toBeGreaterThanOrEqual(2);
            products.forEach((p) => expect(p.category.name).toBe("Periféricos"));
        });

        it("200: filtra por búsqueda de texto", async () => {
            const res = await request(app)
                .get(`${BASE}?search=Teclado`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            const names = (res.body.data.data as Array<{ name: string }>).map((p) => p.name);
            expect(names.some((n) => n.includes("Teclado"))).toBe(true);
        });

        it("200: filtra productos inactivos con isActive=false", async () => {
            const res = await request(app)
                .get(`${BASE}?isActive=false`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            const products = res.body.data.data as Array<{ isActive: boolean }>;
            products.forEach((p) => expect(p.isActive).toBe(false));
        });

        it("200: pagina resultados correctamente", async () => {
            const res = await request(app)
                .get(`${BASE}?page=1&limit=2`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.data.length).toBeLessThanOrEqual(2);
            expect(res.body.data.meta.limit).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    describe("GET /products/:id", () => {
        let productId: string;

        beforeAll(async () => {
            const p = await prisma.product.create({
                data: { name: "Producto para buscar por ID", price: 99, stock: 5, categoryId },
            });
            productId = p.id;
        });

        it("200: devuelve producto con relaciones incluidas", async () => {
            const res = await request(app)
                .get(`${BASE}/${productId}`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(productId);
            expect(res.body.data.category).toMatchObject({ name: "Electrónica" });
        });

        it("404: id inexistente", async () => {
            const res = await request(app)
                .get(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    describe("PUT /products/:id", () => {
        let productId: string;

        beforeEach(async () => {
            const p = await prisma.product.create({
                data: { name: "Para actualizar", price: 100, stock: 10, categoryId },
            });
            productId = p.id;
        });

        it("200: actualiza nombre y precio", async () => {
            const res = await request(app)
                .put(`${BASE}/${productId}`)
                .set("Cookie", authCookie)
                .send({ name: "Nombre Actualizado", price: 199 });

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe("Nombre Actualizado");
            expect(parseFloat(res.body.data.price)).toBe(199);
        });

        it("404: producto inexistente", async () => {
            const res = await request(app)
                .put(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", authCookie)
                .send({ name: "Actualizado" });

            expect(res.status).toBe(404);
        });

        it("422: categoryId inválido en actualización", async () => {
            const res = await request(app)
                .put(`${BASE}/${productId}`)
                .set("Cookie", authCookie)
                .send({ categoryId: "no-es-uuid" });

            expect(res.status).toBe(422);
        });
    });

    // -----------------------------------------------------------------------
    describe("DELETE /products/:id", () => {
        let productId: string;

        beforeEach(async () => {
            const p = await prisma.product.create({
                data: { name: "Para eliminar", price: 50, stock: 5, categoryId, isActive: true },
            });
            productId = p.id;
        });

        it("200: soft delete — isActive pasa a false", async () => {
            const res = await request(app)
                .delete(`${BASE}/${productId}`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            const deleted = await prisma.product.findUnique({ where: { id: productId } });
            expect(deleted?.isActive).toBe(false);
        });

        it("404: producto inexistente", async () => {
            const res = await request(app)
                .delete(`${BASE}/00000000-0000-0000-0000-000000000000`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    describe("GET /products/export", () => {
        it("200: devuelve array con campos de exportación incluyendo nombres de relaciones", async () => {
            const res = await request(app).get(`${BASE}/export`).set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);

            const first = res.body.data[0];
            expect(first).toHaveProperty("name");
            expect(first).toHaveProperty("price");
            expect(first).toHaveProperty("stock");
            expect(first).toHaveProperty("categoryName");
            expect(first).not.toHaveProperty("id");
        });

        it("401: sin cookie", async () => {
            const res = await request(app).get(`${BASE}/export`);
            expect(res.status).toBe(401);
        });
    });

    // -----------------------------------------------------------------------
    describe("POST /products/import", () => {
        it("201: importa productos usando nombre de categoría", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .set("Cookie", authCookie)
                .send({
                    products: [
                        { name: "Producto Import A", price: 99.99, stock: 10, categoryName: "Electrónica" },
                        { name: "Producto Import B", price: 49.99, stock: 5 },
                    ],
                });

            expect(res.status).toBe(201);
            expect(res.body.data.created).toBe(2);
            expect(res.body.data.errors).toHaveLength(0);

            const imported = await prisma.product.findMany({ where: { name: { startsWith: "Producto Import" } } });
            // El primero debe tener la categoría resuelta
            const withCategory = imported.find((p) => p.name === "Producto Import A");
            expect(withCategory?.categoryId).toBe(categoryId);

            await prisma.stockMovement.deleteMany({ where: { productId: { in: imported.map((p) => p.id) } } });
            await prisma.product.deleteMany({ where: { name: { startsWith: "Producto Import" } } });
        });

        it("422: array vacío es rechazado", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .set("Cookie", authCookie)
                .send({ products: [] });

            expect(res.status).toBe(422);
        });

        it("422: producto sin precio es rechazado", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .set("Cookie", authCookie)
                .send({ products: [{ name: "Sin precio" }] });

            expect(res.status).toBe(422);
        });

        it("401: sin cookie", async () => {
            const res = await request(app)
                .post(`${BASE}/import`)
                .send({ products: [{ name: "X", price: 10 }] });

            expect(res.status).toBe(401);
        });

        // T2-08: la importación pasó de dos consultas por producto a dos por lote. Lo
        // que se comprueba aquí es que el resultado observable no cambió — el efecto de
        // agrupar es de rendimiento, y sería fácil que se llevara por delante los
        // movimientos de stock o la atribución de errores por fila.
        it("201: un lote grande crea todos los productos y sus movimientos", async () => {
            const N = 250; // más de un lote (200), para que se ejerciten dos
            const products = Array.from({ length: N }, (_, i) => ({
                name: `T208-producto-${i}`,
                price: 10 + i,
                // Uno de cada cincuenta entra con stock 0: no debe generar movimiento.
                stock: i % 50 === 0 ? 0 : 5,
            }));

            const res = await request(app).post(`${BASE}/import`).set("Cookie", authCookie).send({ products });

            expect(res.status).toBe(201);
            expect(res.body.data).toMatchObject({ created: N, errors: [] });

            const creados = await prisma.product.findMany({ where: { name: { startsWith: "T208-producto-" } } });
            expect(creados).toHaveLength(N);

            const movimientos = await prisma.stockMovement.findMany({
                where: { productId: { in: creados.map((p) => p.id) } },
            });
            // Un movimiento por producto **con stock**: los de stock 0 no mueven nada,
            // igual que antes de agrupar.
            expect(movimientos).toHaveLength(N - Math.ceil(N / 50));
            expect(movimientos.every((m) => m.type === "IMPORT")).toBe(true);
            const conStock = creados.find((p) => p.stock === 5)!;
            expect(movimientos.find((m) => m.productId === conStock.id)).toMatchObject({ delta: 5, stockAfter: 5 });

            await prisma.stockMovement.deleteMany({ where: { productId: { in: creados.map((p) => p.id) } } });
            await prisma.product.deleteMany({ where: { name: { startsWith: "T208-producto-" } } });
        });

        it("201: una fila mala no tumba el lote y se informa de cuál es", async () => {
            // `price` es `Decimal(10, 2)`: el tope es 99 999 999.99. El validador solo
            // exige que sea positivo, así que esta fila **pasa Zod y revienta en la
            // base** — que es justo el caso que interesa, un fallo que solo aparece al
            // insertar. Al fallar la inserción agrupada se reintenta el lote fila a
            // fila, única forma de decir *qué* fila fue.
            const products = [
                { name: "T208-buena-1", price: 10, stock: 3 },
                { name: "T208-mala", price: 100_000_000, stock: 3 },
                { name: "T208-buena-2", price: 20, stock: 4 },
            ];

            const res = await request(app).post(`${BASE}/import`).set("Cookie", authCookie).send({ products });

            expect(res.status).toBe(201);
            expect(res.body.data.created).toBe(2);
            expect(res.body.data.errors).toHaveLength(1);
            // La fila se numera desde 1, como la ve el usuario en su archivo.
            expect(res.body.data.errors[0].row).toBe(2);

            const buenos = await prisma.product.findMany({ where: { name: { startsWith: "T208-buena-" } } });
            // Y las buenas entraron una sola vez: `createMany` es una sentencia atómica,
            // así que el reintento fila a fila no puede duplicar lo ya insertado.
            expect(buenos).toHaveLength(2);

            await prisma.stockMovement.deleteMany({ where: { productId: { in: buenos.map((p) => p.id) } } });
            await prisma.product.deleteMany({ where: { name: { startsWith: "T208-buena-" } } });
        });
    });

    // -----------------------------------------------------------------------
    describe("PATCH /products/:id/restore", () => {
        let inactiveId: string;

        beforeEach(async () => {
            const p = await prisma.product.create({
                data: { name: "Para restaurar", price: 50, stock: 5, categoryId, isActive: false },
            });
            inactiveId = p.id;
        });

        it("200: restaura producto inactivo", async () => {
            const res = await request(app)
                .patch(`${BASE}/${inactiveId}/restore`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.isActive).toBe(true);
        });

        it("400: producto ya activo", async () => {
            const active = await prisma.product.create({
                data: { name: "Ya activo", price: 50, stock: 5, categoryId, isActive: true },
            });

            const res = await request(app)
                .patch(`${BASE}/${active.id}/restore`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(400);
            await prisma.product.delete({ where: { id: active.id } });
        });

        it("404: id inexistente", async () => {
            const res = await request(app)
                .patch(`${BASE}/00000000-0000-0000-0000-000000000000/restore`)
                .set("Cookie", authCookie);

            expect(res.status).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    // T1-04. Antes de T1-03 los esquemas no declaraban `tagIds`, así que Zod los
    // descartaba y `validate.middleware.ts:20` entregaba al servicio un cuerpo sin
    // etiquetas: la petición respondía 201 con 0 etiquetas asignadas. Estos tests
    // vuelven a fallar si se revierte aquel cambio.
    describe("Etiquetas de producto", () => {
        let tagA: { id: string };
        let tagB: { id: string };

        // No se borran productos: los de otros bloques tienen movimientos de stock
        // asociados y la FK lo impide. Basta con etiquetas nuevas en cada test, que
        // además aíslan el filtro por `?tagId=`.
        beforeEach(async () => {
            await prisma.tag.deleteMany();
            tagA = await prisma.tag.create({ data: { name: "Oferta", color: "#ef4444" } });
            tagB = await prisma.tag.create({ data: { name: "Novedad", color: "#22c55e" } });
        });

        afterAll(async () => {
            await prisma.tag.deleteMany();
        });

        it("201: crea un producto con las etiquetas asociadas", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Teclado", price: 49.99, categoryId, tagIds: [tagA.id, tagB.id] });

            expect(res.status).toBe(201);
            expect(res.body.data.tags.map((t: { id: string }) => t.id).sort()).toEqual([tagA.id, tagB.id].sort());

            const persistido = await prisma.product.findUnique({
                where: { id: res.body.data.id as string },
                include: { tags: true },
            });
            expect(persistido?.tags).toHaveLength(2);
        });

        it("200: al actualizar, `set` sustituye el conjunto de etiquetas", async () => {
            const creado = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Ratón", price: 19.99, categoryId, tagIds: [tagA.id] });

            const res = await request(app)
                .put(`${BASE}/${creado.body.data.id}`)
                .set("Cookie", authCookie)
                .send({ tagIds: [tagB.id] });

            expect(res.status).toBe(200);
            expect(res.body.data.tags).toHaveLength(1);
            expect(res.body.data.tags[0].id).toBe(tagB.id);
        });

        it("422: un `tagIds` con un UUID inválido se rechaza", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Inválido", price: 10, categoryId, tagIds: ["no-es-un-uuid"] });

            expect(res.status).toBe(422);
            expect(await prisma.product.count({ where: { name: "Inválido" } })).toBe(0);
        });

        it("200: el catálogo se puede filtrar por `?tagId=`", async () => {
            const conEtiqueta = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Con etiqueta", price: 10, categoryId, tagIds: [tagA.id] });
            await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Sin etiqueta", price: 10, categoryId });

            const res = await request(app).get(`${BASE}?tagId=${tagA.id}`).set("Cookie", authCookie);

            expect(res.status).toBe(200);
            expect(res.body.data.data).toHaveLength(1);
            expect(res.body.data.data[0].id).toBe(conEtiqueta.body.data.id);
        });

        it("200: un `tagIds` vacío quita todas las etiquetas", async () => {
            const creado = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Para vaciar", price: 10, categoryId, tagIds: [tagA.id, tagB.id] });
            expect(creado.body.data.tags).toHaveLength(2);

            const res = await request(app)
                .put(`${BASE}/${creado.body.data.id}`)
                .set("Cookie", authCookie)
                .send({ tagIds: [] });

            expect(res.status).toBe(200);
            expect(res.body.data.tags).toHaveLength(0);
        });
    });

    // T1-13. El email del actor ya no sale de una consulta extra por mutación en cada
    // controlador, sino de `req.userEmail`, que `requireAuth` carga junto al usuario.
    describe("Auditoría del actor", () => {
        it("el registro de auditoría conserva el email de quien hizo el cambio", async () => {
            const res = await request(app)
                .post(BASE)
                .set("Cookie", authCookie)
                .send({ name: "Auditado", price: 25, categoryId });

            expect(res.status).toBe(201);

            const registro = await prisma.auditLog.findFirst({
                where: { entityId: res.body.data.id as string, action: "CREATE" },
            });
            expect(registro?.userEmail).toBe("products_user@example.com");
        });
    });

    // El formato que produce `multipart/form-data` no puede ejercitarse por HTTP en
    // esta suite: `upload.middleware` está mockeado y multer, que es quien parsea el
    // cuerpo multipart, nunca corre. Se valida el esquema directamente, que es donde
    // vive la normalización.
    describe("Normalización de `tagIds` (formato multipart)", () => {
        const UUID_A = "11111111-1111-4111-8111-111111111111";
        const UUID_B = "22222222-2222-4222-8222-222222222222";

        it("una sola etiqueta llega como cadena y se normaliza a array", () => {
            const parsed = updateProductSchema.parse({ tagIds: UUID_A });
            expect(parsed.tagIds).toEqual([UUID_A]);
        });

        it("varias etiquetas llegan como array y se conservan", () => {
            const parsed = updateProductSchema.parse({ tagIds: [UUID_A, UUID_B] });
            expect(parsed.tagIds).toEqual([UUID_A, UUID_B]);
        });

        it("la cadena vacía significa «ninguna etiqueta», no «no tocar»", () => {
            const parsed = updateProductSchema.parse({ tagIds: "" });
            expect(parsed.tagIds).toEqual([]);
        });

        it("la clave ausente deja las etiquetas intactas", () => {
            const parsed = updateProductSchema.parse({ name: "Sin tocar etiquetas" });
            expect(parsed.tagIds).toBeUndefined();
        });

        it("un UUID inválido dentro del array se rechaza", () => {
            expect(() => updateProductSchema.parse({ tagIds: [UUID_A, "no-es-uuid"] })).toThrow();
        });
    });
});
