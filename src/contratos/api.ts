/**
 * T4-01 — El contrato de la API, en un solo archivo y en un solo sitio.
 *
 * Esta es la **fuente de verdad** de la forma de las respuestas. `Stockly-F` no escribe
 * la suya: recibe una copia literal de este archivo, generada con `pnpm contratos:generar`
 * y versionada allí. Un desajuste deja de ser un fallo silencioso en tiempo de ejecución y
 * pasa a ser una de dos cosas: un error de `tsc` en el frontend —si el campo cambió de
 * forma— o un `pnpm verify` en rojo —si la copia está desfasada—.
 *
 * ## Por qué un solo archivo y por qué solo importa `zod`
 *
 * Porque se copia entero. Cualquier `import` de `@/…`, de Prisma o de otro módulo del
 * backend haría que la copia no compilase del otro lado. Es la restricción que mantiene
 * el mecanismo trivial: copiar, no transformar. `zod` es 4.4.3 en los dos repositorios.
 *
 * ## Por qué los enums se repiten aquí en vez de importarse de Prisma
 *
 * Por lo mismo. La duplicación no queda suelta: `src/tests/contratos.test.ts` compara cada
 * `z.enum` de abajo con el `$Enums` generado por Prisma y falla si divergen, así que
 * añadir un valor al `schema.prisma` sin traerlo aquí rompe la suite del backend.
 *
 * ## Lo que este contrato **no** es
 *
 * No valida en producción: describe. Las peticiones se siguen validando con los
 * `*.validator.ts` de cada módulo. Lo que sí hace es sostener los tipos del frontend y
 * los tests de contrato de los dos lados.
 */

import { z } from "zod";

// ─────────────────────────── Enums ───────────────────────────
// Espejo de `prisma/schema.prisma`, vigilado por `contratos.test.ts`.

export const rolSchema = z.enum(["ADMIN", "USER"]);
export const estadoOrdenCompraSchema = z.enum(["PENDING", "RECEIVED", "CANCELLED"]);
export const estadoOrdenVentaSchema = z.enum(["PENDING", "SHIPPED", "CANCELLED"]);
export const tipoMovimientoSchema = z.enum(["IN", "OUT", "ADJUSTMENT", "IMPORT"]);

export const accionAuditoriaSchema = z.enum([
    "CREATE", "UPDATE", "DELETE", "RESTORE", "STOCK_MOVEMENT", "BULK_STOCK",
    "ORDER_RECEIVE", "ORDER_CANCEL", "USER_ROLE_CHANGE", "USER_ACTIVATE",
    "USER_DEACTIVATE", "SALE_SHIP", "SALE_CANCEL", "REFRESH_REUSE",
]);

export const entidadAuditoriaSchema = z.enum([
    "Product", "PurchaseOrder", "SaleOrder", "User", "Tag", "Category", "Brand", "Supplier",
]);

// ─────────────────────── Primitivas del cable ───────────────────────

/**
 * Un importe tal como **llega**, no como nos gustaría que llegara.
 *
 * Los campos `Decimal` de Prisma se serializan a JSON como **cadena**, no como número:
 * `{"price":"10.50"}`. Medido sobre la respuesta real en T3-05. Durante meses el frontend
 * los declaró `number` y funcionó de casualidad, sostenido por dos `Number(...)`
 * defensivos, un `z.coerce.number()` en el formulario y un `formatearImporte` que acepta
 * las dos cosas — o sea, el código sabía la verdad y el tipo no.
 *
 * Se declara como unión a propósito: obliga a cada consumidor a decidir qué hace con la
 * cadena, que es exactamente la fricción que faltaba. Para pasarlo a número está
 * `aNumero()`, más abajo.
 *
 * **Ojo:** `/reports` es la excepción y sí devuelve números, porque su servicio convierte
 * con `Number(...)` antes de responder. Por eso los esquemas de reportes usan `z.number()`
 * y no esto.
 */
export const importeSchema = z.union([z.string(), z.number()]);

/** `DateTime` de Prisma serializado por `JSON.stringify`: ISO 8601 en cadena. */
export const fechaSchema = z.string();

/** Convierte un importe del cable a número. Devuelve `NaN` si no lo es, como `Number`. */
export function aNumero(importe: z.infer<typeof importeSchema>): number {
    return typeof importe === "number" ? importe : Number(importe);
}

// ─────────────────────── Sobres de respuesta ───────────────────────

export const metaPaginacionSchema = z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
});

/**
 * El sobre de los listados. Está aquí porque es la forma que más se equivoca al mockear:
 * la lista va en `data.data`, junto a `meta`, **no** en `data`.
 */
export const paginadoSchema = <T extends z.ZodTypeAny>(elemento: T) =>
    z.object({ data: z.array(elemento), meta: metaPaginacionSchema });

/** Todo endpoint responde envuelto así; `data` falta en las respuestas sin cuerpo útil. */
export const sobreSchema = <T extends z.ZodTypeAny>(datos: T) =>
    z.object({ success: z.boolean(), message: z.string(), data: datos.optional() });

/**
 * Los códigos de error de la API (T4-04). **Esta lista es el contrato de verdad**; el
 * `message` que va al lado es un respaldo legible, no la interfaz.
 *
 * Existe porque el criterio de T4-04 pide que también se traduzcan los errores que vienen
 * del servidor, y un mensaje en español no se puede traducir en el cliente: hay que saber
 * *qué* pasó, no *cómo se dijo*. El backend sigue mandando su frase —para quien consulte la
 * API sin interfaz, y como red si el código todavía no está traducido—, pero lo que el
 * frontend enseña sale de su catálogo.
 *
 * Un código nuevo aquí sin entrada en el catálogo del frontend **rompe su suite**: la
 * guardia recorre este enum y exige `error.<CÓDIGO>` en los dos idiomas.
 */
export const CODIGOS_DE_ERROR = [
    // 400 — la petición pide algo que el estado actual no permite
    "ACCOUNT_NOT_FOUND_OR_VERIFIED",
    "CANNOT_CANCEL_UNITS_CONSUMED",
    "CANNOT_CHANGE_OWN_ROLE",
    "CANNOT_DEACTIVATE_OWN_ACCOUNT",
    "CANNOT_DELETE_RECEIVED_ORDER",
    "CANNOT_DELETE_SHIPPED_ORDER",
    "CANNOT_MODIFY_CANCELLED_ORDER",
    "INACTIVE_PRODUCT_MOVEMENT",
    "INSUFFICIENT_STOCK",
    "INVALID_FILTER_VALUE",
    "INVALID_OR_EXPIRED_TOKEN",
    "ORDER_ALREADY_SHIPPED",
    "PRODUCT_ALREADY_ACTIVE",
    "STOCK_CANNOT_BE_NEGATIVE",
    // 401 / 403 — quién eres y qué se te permite
    "ACCOUNT_DISABLED",
    "EMAIL_NOT_CONFIRMED",
    "INVALID_CREDENTIALS",
    "NOT_AUTHENTICATED",
    "SESSION_EXPIRED",
    "WRONG_CURRENT_PASSWORD",
    // 404
    "BRAND_NOT_FOUND",
    "CATEGORY_NOT_FOUND",
    "PRODUCT_NOT_FOUND",
    "PURCHASE_ORDER_NOT_FOUND",
    "ROUTE_NOT_FOUND",
    "SALE_ORDER_NOT_FOUND",
    "SUPPLIER_NOT_FOUND",
    "TAG_NOT_FOUND",
    "USER_NOT_FOUND",
    // 409 — colisiones de unicidad
    "BRAND_NAME_EXISTS",
    "CATEGORY_NAME_EXISTS",
    "EMAIL_ALREADY_REGISTERED",
    "EMAIL_IN_USE",
    "SUPPLIER_EMAIL_EXISTS",
    "TAG_NAME_EXISTS",
    // 413 / 422 — el cuerpo o el archivo
    "EXPORT_TOO_LARGE",
    "INVALID_IMAGE_FILE",
    /**
     * El cuerpo no pasa el validador (T4-04). Lo pone `validate.middleware`, que es el otro
     * sitio que escribe respuestas de error y hasta ahora no ponía ninguno: su `message`
     * («Error de validación») salía en español pasara lo que pasara.
     *
     * **Los mensajes de `errors[]` siguen siendo los del validador, en español**, y eso es
     * deliberado: son de campo y dicen qué regla se incumplió, no hay código por regla. En
     * la práctica no se ven, porque cada formulario valida antes con su propio esquema —el
     * 422 es la red de seguridad de quien llama a la API sin interfaz—. Traducirlos exigiría
     * un código por regla de Zod, y eso es otra tarea.
     */
    "VALIDATION_ERROR",
    // 429 / 500 / 503 — el servidor
    "EMAIL_NOT_CONFIGURED",
    "INTERNAL_ERROR",
    "RATE_LIMITED",
    "UPLOAD_NOT_CONFIGURED",
] as const;

export const codigoDeErrorSchema = z.enum(CODIGOS_DE_ERROR);

/**
 * La forma de cualquier respuesta de error. Comprobada contra los dos sitios que las
 * escriben, que no coinciden del todo:
 *
 * - `validate.middleware.ts` responde **422** con `errors`, cuyo campo se llama `field`
 *   —no `path`— y trae el mensaje del propio validador de Zod.
 * - `error.middleware.ts` responde el resto con `message` a secas, y en los **500** añade
 *   `requestId`: en producción el mensaje real se oculta, así que ese identificador es el
 *   hilo del que tirar para encontrar las líneas de log de esa petición (T2-10). El
 *   mensaje va además **saneado de rutas del sistema de archivos** (T3-13).
 */
export const errorSchema = z.object({
    success: z.literal(false),
    message: z.string(),
    /**
     * Opcional a propósito: lo llevan los errores que la aplicación lanza a conciencia, no
     * los que se escapan de una librería de terceros. Sin código, el cliente enseña el
     * `message`, que es exactamente lo que hacía antes de T4-04.
     */
    code: codigoDeErrorSchema.optional(),
    /**
     * Los huecos del mensaje, para que el cliente pueda componer el suyo. «Stock insuficiente
     * para "Teclado". Disponible: 3, requerido: 5» no se traduce sustituyendo palabras: hace
     * falta el producto y los dos números por separado, porque en otro idioma van en otro orden.
     */
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
    requestId: z.string().optional(),
});

// ─────────────────────── Referencias ───────────────────────

/** Categoría, marca y proveedor se leen como objeto, no como cadena. */
export const referenciaSchema = z.object({ id: z.string(), name: z.string() });

export const etiquetaRefSchema = z.object({
    id: z.string(),
    name: z.string(),
    color: z.string().nullable(),
});

// ─────────────────────── Catálogo ───────────────────────

export const categoriaSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: fechaSchema,
    updatedAt: fechaSchema,
});

export const marcaSchema = categoriaSchema;

export const proveedorSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: fechaSchema,
    updatedAt: fechaSchema,
});

export const etiquetaSchema = z.object({
    id: z.string(),
    name: z.string(),
    color: z.string().nullable(),
    createdAt: fechaSchema,
    updatedAt: fechaSchema,
});

// ─────────────────────── Producto ───────────────────────

/**
 * `PRODUCT_INCLUDE` de `product.service.ts`. Dos trampas conocidas van explícitas:
 * `price` es un importe del cable (cadena) y `tags` es un array de **objetos**, que es
 * justo lo que el validador descartaba en silencio hasta T1-03.
 */
export const productoSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    sku: z.string().nullable(),
    price: importeSchema,
    stock: z.number(),
    minStock: z.number(),
    imageUrl: z.string().nullable(),
    imagePublicId: z.string().nullable(),
    isActive: z.boolean(),
    categoryId: z.string().nullable(),
    brandId: z.string().nullable(),
    supplierId: z.string().nullable(),
    category: referenciaSchema.nullable(),
    brand: referenciaSchema.nullable(),
    supplier: referenciaSchema.nullable(),
    tags: z.array(etiquetaRefSchema),
    createdAt: fechaSchema,
    updatedAt: fechaSchema,
});

export const movimientoStockSchema = z.object({
    id: z.string(),
    productId: z.string(),
    type: tipoMovimientoSchema,
    delta: z.number(),
    stockAfter: z.number(),
    note: z.string().nullable(),
    createdAt: fechaSchema,
});

export const historialPrecioSchema = z.object({
    id: z.string(),
    productId: z.string(),
    oldPrice: importeSchema,
    newPrice: importeSchema,
    createdAt: fechaSchema,
});

/**
 * `filaDeExportacion` de `product.service.ts`, que es lo que devuelve `/products/export`.
 * Las once columnas y su orden están fijados por un test en cada repositorio (T3-05).
 */
export const productoExportadoSchema = z.object({
    name: z.string(),
    description: z.string().nullable(),
    sku: z.string().nullable(),
    price: importeSchema,
    stock: z.number(),
    minStock: z.number(),
    isActive: z.boolean(),
    categoryName: z.string().nullable(),
    brandName: z.string().nullable(),
    supplierName: z.string().nullable(),
    tags: z.string(),
});

export const resultadoImportacionSchema = z.object({
    created: z.number(),
    errors: z.array(z.object({ row: z.number(), error: z.string() })),
});

// ─────────────────────── Órdenes ───────────────────────

/**
 * El producto enlazado viene del `ORDER_INCLUDE` de los dos servicios de órdenes. Es
 * `null` cuando el ítem se escribió a mano o cuando el producto se borró después
 * (`onDelete: SetNull`), y de esa distinción depende el recuento de reposición de T2-42.
 */
const productoDeItemSchema = z
    .object({ id: z.string(), name: z.string(), sku: z.string().nullable() })
    .nullable();

export const itemOrdenVentaSchema = z.object({
    id: z.string(),
    saleOrderId: z.string(),
    productId: z.string().nullable(),
    product: productoDeItemSchema,
    productName: z.string(),
    quantity: z.number(),
    unitPrice: importeSchema,
    createdAt: fechaSchema,
});

export const ordenVentaSchema = z.object({
    id: z.string(),
    status: estadoOrdenVentaSchema,
    customerName: z.string().nullable(),
    customerEmail: z.string().nullable(),
    customerPhone: z.string().nullable(),
    notes: z.string().nullable(),
    items: z.array(itemOrdenVentaSchema),
    createdAt: fechaSchema,
    updatedAt: fechaSchema,
});

export const itemOrdenCompraSchema = z.object({
    id: z.string(),
    purchaseOrderId: z.string(),
    productId: z.string().nullable(),
    product: productoDeItemSchema,
    productName: z.string(),
    quantity: z.number(),
    unitPrice: importeSchema,
    createdAt: fechaSchema,
});

export const ordenCompraSchema = z.object({
    id: z.string(),
    supplierId: z.string().nullable(),
    supplier: referenciaSchema.nullable(),
    status: estadoOrdenCompraSchema,
    notes: z.string().nullable(),
    items: z.array(itemOrdenCompraSchema),
    createdAt: fechaSchema,
    updatedAt: fechaSchema,
});

// ─────────────────────── Usuarios y sesión ───────────────────────

/** `USER_SELECT` de `users.service.ts`. La contraseña y los tokens nunca salen de aquí. */
export const usuarioSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: rolSchema,
    isActive: z.boolean(),
    isVerified: z.boolean(),
    createdAt: fechaSchema,
    updatedAt: fechaSchema,
});

/** `GET /auth/me` no devuelve `updatedAt`: su `select` es más corto que `USER_SELECT`. */
export const perfilSchema = usuarioSchema.omit({ updatedAt: true });

// ─────────────────────── Ajustes ───────────────────────

const camposDeAjuste = {
    key: z.string(),
    label: z.string(),
    description: z.string(),
};

/**
 * **Unión discriminada, no `value: boolean | number | string`.** La diferencia no es
 * teórica: con la versión laxa, `{ type: "boolean", value: "false" }` valida — y ese es
 * exactamente el defecto de T1-06, donde el interruptor se pintaba apagado con el ajuste
 * encendido porque `"false"` es una cadena verdadera.
 *
 * T2-24 ya había endurecido su espejo en los tests, pero el tipo de producción del
 * frontend seguía siendo el laxo y arrastraba un `esVerdadero(v) => v === true || v ===
 * "true"` como parche. Aquí se cierra en un solo sitio para los dos lados.
 */
export const ajusteSchema = z.discriminatedUnion("type", [
    z.object({ ...camposDeAjuste, type: z.literal("boolean"), value: z.boolean() }),
    z.object({ ...camposDeAjuste, type: z.literal("number"), value: z.number() }),
    z.object({ ...camposDeAjuste, type: z.literal("string"), value: z.string() }),
]);

/** Lo que devuelve `PATCH /settings`: solo la clave y su valor ya convertido. */
export const ajusteGuardadoSchema = z.object({
    key: z.string(),
    value: z.union([z.boolean(), z.number(), z.string()]),
});

// ─────────────────────── Auditoría ───────────────────────

export const registroAuditoriaSchema = z.object({
    id: z.string(),
    userId: z.string().nullable(),
    userEmail: z.string().nullable(),
    action: accionAuditoriaSchema,
    entity: entidadAuditoriaSchema,
    entityId: z.string().nullable(),
    details: z.unknown().nullable(),
    createdAt: fechaSchema,
});

// ─────────────────────── Reportes ───────────────────────
// Excepción a `importeSchema`: `reports.service.ts` convierte con `Number(...)` antes de
// responder, así que aquí los importes sí llegan como números.

export const totalesReporteSchema = z.object({
    totalProducts: z.number(),
    activeProducts: z.number(),
    inactiveProducts: z.number(),
    inventoryValue: z.number(),
    lowStockCount: z.number(),
});

export const stockPorCategoriaSchema = z.object({
    name: z.string(),
    stock: z.number(),
    value: z.number(),
});

export const productoTopSchema = z.object({
    id: z.string(),
    name: z.string(),
    sku: z.string().nullable(),
    price: z.number(),
    stock: z.number(),
    totalValue: z.number(),
});

export const movimientoPorMesSchema = z.object({
    month: z.string(),
    type: z.string(),
    total: z.number(),
});

export const productoBajoStockSchema = z.object({
    id: z.string(),
    name: z.string(),
    sku: z.string().nullable(),
    stock: z.number(),
    minStock: z.number(),
    category: z.string().nullable(),
});

export const metricaStockSchema = z.object({
    productId: z.string(),
    productName: z.string(),
    sku: z.string().nullable(),
    totalOutLast30Days: z.number(),
    currentStock: z.number(),
    minStock: z.number(),
    dailyVelocity: z.number(),
    daysToStockout: z.number().nullable(),
    reorderSoon: z.boolean(),
});

export const resumenReporteSchema = z.object({
    totals: totalesReporteSchema,
    stockByCategory: z.array(stockPorCategoriaSchema),
    topByValue: z.array(productoTopSchema),
    movementsByMonth: z.array(movimientoPorMesSchema),
    lowStockProducts: z.array(productoBajoStockSchema),
    stockMetrics: z.array(metricaStockSchema),
});

// ─────────────────────── Tipos inferidos ───────────────────────
// Es lo que consume el frontend. No se escriben a mano: si el esquema cambia, el tipo
// cambia con él y `tsc` señala cada uso que dejó de encajar.

export type Rol = z.infer<typeof rolSchema>;
export type EstadoOrdenCompra = z.infer<typeof estadoOrdenCompraSchema>;
export type EstadoOrdenVenta = z.infer<typeof estadoOrdenVentaSchema>;
export type TipoMovimiento = z.infer<typeof tipoMovimientoSchema>;
export type AccionAuditoria = z.infer<typeof accionAuditoriaSchema>;
export type EntidadAuditoria = z.infer<typeof entidadAuditoriaSchema>;

export type Importe = z.infer<typeof importeSchema>;
export type MetaPaginacion = z.infer<typeof metaPaginacionSchema>;
export type RespuestaDeError = z.infer<typeof errorSchema>;
export type CodigoDeError = z.infer<typeof codigoDeErrorSchema>;
export type Referencia = z.infer<typeof referenciaSchema>;
export type EtiquetaRef = z.infer<typeof etiquetaRefSchema>;

export type Categoria = z.infer<typeof categoriaSchema>;
export type Marca = z.infer<typeof marcaSchema>;
export type Proveedor = z.infer<typeof proveedorSchema>;
export type Etiqueta = z.infer<typeof etiquetaSchema>;

export type Producto = z.infer<typeof productoSchema>;
export type MovimientoStock = z.infer<typeof movimientoStockSchema>;
export type HistorialPrecio = z.infer<typeof historialPrecioSchema>;
export type ProductoExportado = z.infer<typeof productoExportadoSchema>;
export type ResultadoImportacion = z.infer<typeof resultadoImportacionSchema>;

export type ItemOrdenVenta = z.infer<typeof itemOrdenVentaSchema>;
export type OrdenVenta = z.infer<typeof ordenVentaSchema>;
export type ItemOrdenCompra = z.infer<typeof itemOrdenCompraSchema>;
export type OrdenCompra = z.infer<typeof ordenCompraSchema>;

export type Usuario = z.infer<typeof usuarioSchema>;
export type Perfil = z.infer<typeof perfilSchema>;
export type Ajuste = z.infer<typeof ajusteSchema>;
export type AjusteGuardado = z.infer<typeof ajusteGuardadoSchema>;
export type RegistroAuditoria = z.infer<typeof registroAuditoriaSchema>;

export type TotalesReporte = z.infer<typeof totalesReporteSchema>;
export type StockPorCategoria = z.infer<typeof stockPorCategoriaSchema>;
export type ProductoTop = z.infer<typeof productoTopSchema>;
export type MovimientoPorMes = z.infer<typeof movimientoPorMesSchema>;
export type ProductoBajoStock = z.infer<typeof productoBajoStockSchema>;
export type MetricaStock = z.infer<typeof metricaStockSchema>;
export type ResumenReporte = z.infer<typeof resumenReporteSchema>;

/** Un listado paginado ya envuelto: `{ data: T[], meta }`. */
export interface Paginado<T> {
    data: T[];
    meta: MetaPaginacion;
}

/** El sobre de cualquier respuesta. */
export interface Sobre<T> {
    success: boolean;
    message: string;
    data?: T;
}
