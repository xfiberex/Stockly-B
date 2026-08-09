import request from "supertest";
import app from "@/app";
import { spec } from "@/swagger";
import { createProductSchema } from "@/modules/products/product.validator";
import { prisma } from "@/shared/lib/prisma";
import { cleanDb, createUser, getAuthCookie } from "./helpers";

jest.mock("@/shared/lib/nodemailer", () => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendLowStockAlertEmail: jest.fn().mockResolvedValue(undefined),
    transporter: { sendMail: jest.fn() },
}));

jest.mock("@/shared/middlewares/upload.middleware", () => ({
    // T2-32: el mock debe exportar **todo** lo que las rutas importan de este módulo.
    // Sin esta línea, Express recibe `undefined` como manejador y la suite no arranca.
    verificarFirmaDeImagen: (_req: unknown, _res: unknown, next: () => void) => next(),
    uploadToCloudinary: jest.fn(),
    deleteFromCloudinary: jest.fn(),
    upload: { single: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()) },
}));

// T2-29: el esquema documentaba `category` como enum de cadenas y el `requestBody`
// lo exigía, pero el validador solo acepta `categoryId`. Seguir el «Try it out»
// terminaba en 422. Estos tests atan la documentación al validador real.

type Esquema = { type?: string; format?: string; properties?: Record<string, Esquema>; items?: Esquema; $ref?: string };
const esquemas = spec.components.schemas as unknown as Record<string, Esquema>;

describe("Contrato entre Swagger y el validador de productos", () => {
    it("`Product` expone las relaciones como objeto, no como enum de cadenas", () => {
        const producto = esquemas.Product!.properties!;

        expect(producto.category).toEqual({ $ref: "#/components/schemas/NamedRef" });
        expect(producto.tags).toMatchObject({ type: "array" });
        // El campo que existía antes era `category: { enum: [...] }`.
        expect(JSON.stringify(producto.category)).not.toMatch(/enum/);
    });

    it("todo campo escribible documentado es aceptado por `createProductSchema`", () => {
        const propiedades = esquemas.ProductWrite!.properties!;
        // `image` es el archivo, lo consume multer y no llega al esquema de Zod.
        const documentados = Object.keys(propiedades).filter((campo) => campo !== "image");

        const ejemplo: Record<string, unknown> = {
            name: "Producto de ejemplo",
            price: 10,
            stock: 1,
            minStock: 0,
            description: "Descripción",
            sku: "SKU-1",
            categoryId: "11111111-1111-4111-8111-111111111111",
            brandId: "22222222-2222-4222-8222-222222222222",
            supplierId: "33333333-3333-4333-8333-333333333333",
            tagIds: ["44444444-4444-4444-8444-444444444444"],
        };

        // Si se documenta un campo nuevo sin añadirlo aquí, el test lo señala.
        expect(Object.keys(ejemplo).sort()).toEqual(documentados.sort());

        const resultado = createProductSchema.safeParse(ejemplo);
        expect(resultado.success).toBe(true);
    });

    it("los filtros documentados de `GET /products` son los que implementa el servicio", () => {
        const parametros = (spec.paths["/products"].get.parameters as Array<{ name: string }>).map((p) => p.name);

        expect(parametros).toEqual(
            expect.arrayContaining(["page", "limit", "search", "categoryId", "brandId", "supplierId", "tagId", "isActive"]),
        );
        // `category` (por nombre) nunca existió en el servicio.
        expect(parametros).not.toContain("category");
    });
});

describe("Crear un producto siguiendo la documentación", () => {
    let adminCookie: string;
    let categoryId: string;

    beforeAll(async () => {
        await cleanDb();
        const admin = await createUser({ email: "swagger_admin@example.com", role: "ADMIN" });
        adminCookie = getAuthCookie(admin.id);
        const categoria = await prisma.category.create({ data: { name: "Swagger Electrónica" } });
        categoryId = categoria.id;
    });

    afterAll(async () => {
        await cleanDb();
    });

    it("devuelve 201 con el cuerpo que describe el esquema", async () => {
        const res = await request(app)
            .post("/api/v1/products")
            .set("Cookie", adminCookie)
            .send({ name: "Laptop Pro 15", price: 1299.99, stock: 15, minStock: 3, categoryId });

        expect(res.status).toBe(201);
        expect(res.body.data.category).toMatchObject({ id: categoryId, name: "Swagger Electrónica" });
    });

    it("el campo `category` que exigía la documentación anterior habría dado 422", async () => {
        const res = await request(app)
            .post("/api/v1/products")
            .set("Cookie", adminCookie)
            .send({ name: "Con category", price: 10, category: "Electrónica" });

        // El producto se crea, pero `category` se ignora: era un campo inventado.
        expect(res.status).toBe(201);
        expect(res.body.data.category).toBeNull();
    });
});
