import { spec } from "@/swagger";
import { generarEsquemas } from "@/swagger.esquemas";
import { createProductSchema, importProductsSchema } from "@/modules/products/product.validator";
import * as contrato from "@/contratos/api";

/**
 * T4-02 — el spec ya no describe la API de memoria: la deriva.
 *
 * Lo que aquí se comprueba **no** es que los esquemas estén bien —eso lo garantiza que se
 * generen desde el contrato y los validadores, que son quienes mandan— sino las tres
 * costuras que la generación no puede cubrir sola:
 *
 *   1. Que ningún `$ref` de las rutas apunte a un esquema que no existe. Las rutas siguen
 *      escritas a mano y son el sitio donde se puede teclear mal un nombre.
 *   2. Que lo documentado como cuerpo de petición sea **aceptado** por el validador real.
 *      Es el criterio de T2-29, que ahora se cumple por construcción; el test lo prueba.
 *   3. Que la derivación no se deshaga: si alguien vuelve a escribir un esquema a mano en
 *      el spec, deja de coincidir con lo generado y esto lo dice.
 */

type Esquema = Record<string, unknown>;
const s = spec as unknown as {
    openapi: string;
    components: { schemas: Record<string, Esquema> };
    paths: Record<string, Record<string, unknown>>;
};

/** Todos los `#/components/schemas/X` que aparecen en cualquier parte del spec. */
function referencias(): Set<string> {
    const encontradas = new Set<string>();
    JSON.stringify(spec, (_clave, valor) => {
        if (typeof valor === "string" && valor.startsWith("#/components/schemas/")) {
            encontradas.add(valor.slice("#/components/schemas/".length));
        }
        return valor;
    });
    return encontradas;
}

describe("Esquemas derivados del spec (T4-02)", () => {
    it("ningún `$ref` apunta a un esquema inexistente", () => {
        const definidos = new Set(Object.keys(s.components.schemas));
        const colgando = [...referencias()].filter((r) => !definidos.has(r));

        expect(colgando).toEqual([]);
    });

    it("todo esquema definido se usa en alguna ruta", () => {
        // Un esquema que no referencia nadie es peso muerto: o falta engancharlo a la
        // ruta que lo describe, o sobra. Las dos cosas conviene verlas.
        const usados = referencias();
        const huerfanos = Object.keys(s.components.schemas).filter((n) => !usados.has(n));

        expect(huerfanos).toEqual([]);
    });

    it("los esquemas del spec son exactamente los generados, sin retoques a mano", () => {
        expect(s.components.schemas).toEqual(generarEsquemas());
    });

    describe("lo documentado como petición es lo que acepta el validador", () => {
        it("`ProductWrite` marca obligatorios los mismos campos que `createProductSchema`", () => {
            const requeridos = s.components.schemas.ProductWrite!.required as string[];

            expect([...requeridos].sort()).toEqual(["name", "price"]);

            // Falta `name`: el validador debe rechazarlo, como promete la documentación.
            expect(createProductSchema.safeParse({ price: 10 }).success).toBe(false);
            expect(createProductSchema.safeParse({ name: "X", price: 10 }).success).toBe(true);
        });

        it("un cuerpo con todos los campos documentados pasa el validador", () => {
            const propiedades = s.components.schemas.ProductWrite!.properties as Record<string, unknown>;
            // `image` es el archivo: lo consume multer y nunca llega a Zod.
            const documentados = Object.keys(propiedades).filter((c) => c !== "image");

            const ejemplo: Record<string, unknown> = {
                name: "Producto de ejemplo",
                description: "Descripción",
                sku: "SKU-1",
                price: 10,
                stock: 1,
                minStock: 0,
                categoryId: "11111111-1111-4111-8111-111111111111",
                brandId: "22222222-2222-4222-8222-222222222222",
                supplierId: "33333333-3333-4333-8333-333333333333",
                tagIds: ["44444444-4444-4444-8444-444444444444"],
            };

            // Si se documenta un campo nuevo sin añadirlo aquí, el test lo señala.
            expect(Object.keys(ejemplo).sort()).toEqual(documentados.sort());
            expect(createProductSchema.safeParse(ejemplo).success).toBe(true);
        });

        it("`ProductImport` describe la fila, no el sobre entero", () => {
            const propiedades = Object.keys(s.components.schemas.ProductImport!.properties as object);

            expect(propiedades).toEqual(expect.arrayContaining(["name", "price", "categoryName", "brandName"]));
            expect(propiedades).not.toContain("products");
            expect(importProductsSchema.safeParse({ products: [{ name: "X", price: 1 }] }).success).toBe(true);
        });

        it("documenta el precio como lo **acepta** el endpoint, no como lo produce", () => {
            // Los validadores usan `z.coerce.number()`: un formulario puede enviar la
            // cadena "10.5" y es válida. Generado con la salida en vez de la entrada, el
            // spec diría que solo admite números y el «Try it out» mentiría por defecto.
            expect(createProductSchema.safeParse({ name: "X", price: "10.5" }).success).toBe(true);
        });
    });

    describe("lo documentado como respuesta es el contrato de T4-01", () => {
        it("`Setting` es la unión discriminada, no un mapa de cadenas", () => {
            // Antes de T4-02 esta ruta documentaba `additionalProperties: { type: "string" }`
            // en las dos direcciones. Es el defecto de T1-06 escrito en la documentación:
            // `"false"` es una cadena verdadera.
            const ajuste = s.components.schemas.Setting!;
            expect(ajuste.oneOf ?? ajuste.anyOf).toBeDefined();
            expect(JSON.stringify(ajuste)).toContain('"boolean"');

            expect(contrato.ajusteSchema.safeParse({
                key: "k", label: "l", description: "d", type: "boolean", value: "false",
            }).success).toBe(false);
        });

        it("`Product.price` admite cadena, porque `Decimal` viaja serializado", () => {
            const price = (s.components.schemas.Product!.properties as Record<string, Esquema>).price!;

            expect(JSON.stringify(price)).toContain('"string"');
        });

        it("`ProductExport` fija las once columnas que T3-05 alineó entre repositorios", () => {
            const columnas = Object.keys(s.components.schemas.ProductExport!.properties as object);

            expect(columnas).toEqual([
                "name", "description", "sku", "price", "stock", "minStock",
                "isActive", "categoryName", "brandName", "supplierName", "tags",
            ]);
        });
    });

    it("el spec sigue siendo OpenAPI 3.0, que es el dialecto que se genera", () => {
        // `z.toJSONSchema` recibe `target: "openapi-3.0"`: emite `nullable: true` en vez de
        // `type: [..., "null"]`. Subir el spec a 3.1 sin cambiar el target produciría un
        // documento que Swagger UI acepta y que describe mal cada campo anulable.
        expect(s.openapi).toMatch(/^3\.0\./);
    });
});
