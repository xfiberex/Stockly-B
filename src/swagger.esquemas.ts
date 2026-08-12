/**
 * T4-02 — `components.schemas` del spec, **derivado** en vez de escrito a mano.
 *
 * Antes eran ~120 líneas de objeto literal que describían de memoria lo mismo que ya
 * declaraban el contrato y los validadores. T2-29 nació justo de que se separaran: la
 * documentación exigía un campo `category` que el validador rechaza, así que seguir el
 * «Try it out» acababa en 422. Un test lo ató, pero atar es más frágil que derivar.
 *
 * Ahora cada esquema sale de su fuente y **no puede desincronizarse, porque no se escribe**:
 *
 * | Qué documenta | De dónde sale |
 * |---|---|
 * | Lo que la API **devuelve** | `src/contratos/api.ts` (T4-01), que el backend comprueba contra respuestas reales |
 * | Lo que la API **acepta** | los `*.validator.ts` de cada módulo, que son quienes validan de verdad |
 *
 * ## Por qué no hace falta `zod-to-openapi`
 *
 * La ficha proponía esa dependencia, y es de cuando Zod no sabía hacerlo solo. **Zod 4.4
 * trae `z.toJSONSchema()` con `target: "openapi-3.0"` nativo**, que es exactamente la
 * versión del spec: emite `nullable: true` en vez de `type: [..., "null"]` y resuelve un
 * `$ref` anulable con el idioma `nullable` + `allOf` que pide 3.0. Añadir una librería
 * para esto sería una dependencia por costumbre.
 *
 * ## `io: "input"` en las peticiones, y por qué importa
 *
 * Los validadores usan `z.coerce.number()` y `z.preprocess`: lo que **aceptan** no es lo
 * mismo que lo que **producen**. Documentar la salida diría que `price` ha de ser un
 * número cuando el endpoint admite también la cadena que manda un formulario. Las
 * peticiones se generan con `io: "input"`; las respuestas, con la salida.
 */

import { z } from "zod";
import * as contrato from "@/contratos/api";
import { createProductSchema, importProductsSchema } from "@/modules/products/product.validator";

type EsquemaOpenApi = Record<string, unknown>;

/**
 * Nombre de componente → esquema Zod del que se deriva.
 *
 * Los nombres **no son libres**: son los que las rutas ya referencian con `$ref`, y
 * `swagger-esquemas.test.ts` comprueba que no quede ninguna referencia sin destino.
 */
const RESPUESTAS = {
    NamedRef: contrato.referenciaSchema,
    TagRef: contrato.etiquetaRefSchema,
    Tag: contrato.etiquetaSchema,
    Product: contrato.productoSchema,
    ProductExport: contrato.productoExportadoSchema,
    StockMovement: contrato.movimientoStockSchema,
    MovimientosDeProducto: contrato.movimientosDeProductoSchema,
    PriceHistory: contrato.historialPrecioSchema,
    Category: contrato.categoriaSchema,
    Supplier: contrato.proveedorSchema,
    SaleOrder: contrato.ordenVentaSchema,
    SaleOrderItem: contrato.itemOrdenVentaSchema,
    PurchaseOrder: contrato.ordenCompraSchema,
    PurchaseOrderItem: contrato.itemOrdenCompraSchema,
    User: contrato.usuarioSchema,
    Profile: contrato.perfilSchema,
    Setting: contrato.ajusteSchema,
    AuditLog: contrato.registroAuditoriaSchema,
    ReportSummary: contrato.resumenReporteSchema,
    PaginationMeta: contrato.metaPaginacionSchema,
    Error: contrato.errorSchema,
} as const;

/**
 * Lo que la API acepta. `ProductImport` es el **elemento** del array que recibe
 * `/products/import`, no el sobre entero: es la fila que documenta el «Try it out».
 */
const PETICIONES = {
    ProductWrite: createProductSchema,
    ProductImport: importProductsSchema.shape.products.element,
} as const;

/** OpenAPI no usa `$id`; Zod lo emite para poder resolver los `$ref` entre esquemas. */
function sinId(esquema: EsquemaOpenApi): EsquemaOpenApi {
    const { $id: _descartado, ...resto } = esquema;
    return resto;
}

function generar(entradas: Record<string, unknown>, io: "input" | "output"): Record<string, EsquemaOpenApi> {
    const registro = z.registry<{ id: string }>();
    for (const [nombre, esquema] of Object.entries(entradas)) {
        registro.add(esquema as never, { id: nombre });
    }

    const { schemas } = z.toJSONSchema(registro, {
        target: "openapi-3.0",
        io,
        uri: (id) => `#/components/schemas/${id}`,
    }) as { schemas: Record<string, EsquemaOpenApi> };

    return Object.fromEntries(Object.entries(schemas).map(([nombre, esquema]) => [nombre, sinId(esquema)]));
}

/**
 * `components.schemas` completo.
 *
 * Dos añadidos que Zod no puede saber, y por eso van explícitos aquí y no escondidos:
 *
 * - **`Brand` es un alias de `Category`.** Tienen la misma forma y en el contrato son
 *   literalmente el mismo objeto, así que no pueden registrarse dos veces; el `$ref` dice
 *   lo mismo sin duplicar.
 * - **`ProductWrite.image`.** El archivo lo consume multer antes de llegar a Zod, así que
 *   no existe en el validador y sin esto el «Try it out» no ofrecería subir imagen. Es la
 *   única propiedad de todo el spec escrita a mano, y está aquí para que se vea.
 */
export function generarEsquemas(): Record<string, EsquemaOpenApi> {
    const respuestas = generar(RESPUESTAS, "output");
    const peticiones = generar(PETICIONES, "input");

    const productWrite = peticiones.ProductWrite!;
    productWrite.properties = {
        ...(productWrite.properties as EsquemaOpenApi),
        image: { type: "string", format: "binary", description: "Imagen del producto (multipart)" },
    };

    return {
        ...respuestas,
        ...peticiones,
        Brand: { $ref: "#/components/schemas/Category" },
    };
}
