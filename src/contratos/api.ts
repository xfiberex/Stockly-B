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

export const rolSchema = z.enum(["ADMIN", "USER", "WAREHOUSE", "SELLER"]);

// ─────────────────────── Permisos (T5-13) ───────────────────────

const TODOS = ["ADMIN", "USER", "WAREHOUSE", "SELLER"] as const;
const SOLO_ADMIN = ["ADMIN"] as const;
const ALMACEN = ["ADMIN", "WAREHOUSE"] as const;
/** T6-08 — quien vende en el mostrador. */
const MOSTRADOR = ["ADMIN", "SELLER"] as const;

/**
 * T5-13 — qué rol puede llamar a cada ruta de la API. **Es la única copia de la matriz.**
 *
 * El backend protege cada ruta con `permitir("<MÉTODO> <ruta>")`, que lee de aquí, y el
 * frontend decide con `puede()` qué botones enseñar, así que la interfaz no puede ofrecer lo
 * que la API va a rechazar ni esconder lo que admite. `permisos.test.ts` recorre las rutas
 * montadas: una ruta sin fila aquí, una fila sin ruta, o una ruta que responda distinto de lo
 * que dice su fila para algún rol **rompe la suite**.
 *
 * `WAREHOUSE` recibe compras, envía ventas y mueve stock. No crea ni edita productos, órdenes
 * ni catálogo —todo eso fija precios o costes—, no cancela ni borra —deshacer es una decisión
 * comercial—, y no ve usuarios, configuración, auditoría ni exportaciones de órdenes. Lee lo
 * mismo que `USER`.
 *
 * T6-08 — `SELLER` atiende el mostrador: lee lo mismo que `USER` y **solo añade una ruta**, la
 * venta de un paso (`POST /sale-orders/counter`), donde el precio lo pone el catálogo y no él.
 * No crea ni edita órdenes pendientes —fijan un precio—, no envía las de otros —eso es del
 * almacén—, no cancela una venta hecha —devolver stock es una decisión comercial— y no ve
 * usuarios, configuración, auditoría ni exportaciones de órdenes.
 *
 * `/auth` queda fuera: sus rutas son de la propia sesión y no dependen del rol.
 */
export const PERMISOS = {
    // Productos
    "GET /products": TODOS,
    "GET /products/export": TODOS,
    // T5-08 — buscar por código (el escáner) e imprimir etiquetas: leer, como el catálogo.
    "GET /products/lookup": TODOS,
    "GET /products/labels": TODOS,
    "GET /products/:id": TODOS,
    "GET /products/:id/movements": TODOS,
    "GET /products/:id/movements/export": TODOS,
    "GET /products/:id/price-history": TODOS,
    "GET /products/:id/cost-history": TODOS,
    "POST /products/import": SOLO_ADMIN,
    "POST /products": SOLO_ADMIN,
    "PUT /products/:id": SOLO_ADMIN,
    "DELETE /products/:id": SOLO_ADMIN,
    "PATCH /products/:id/restore": SOLO_ADMIN,
    "POST /products/:id/movements": ALMACEN,
    "PATCH /products/bulk-stock": ALMACEN,
    // Catálogo
    "GET /categories": TODOS,
    "GET /categories/:id": TODOS,
    "POST /categories": SOLO_ADMIN,
    "PUT /categories/:id": SOLO_ADMIN,
    "DELETE /categories/:id": SOLO_ADMIN,
    "GET /brands": TODOS,
    "GET /brands/:id": TODOS,
    "POST /brands": SOLO_ADMIN,
    "PUT /brands/:id": SOLO_ADMIN,
    "DELETE /brands/:id": SOLO_ADMIN,
    "GET /suppliers": TODOS,
    "GET /suppliers/:id": TODOS,
    "POST /suppliers": SOLO_ADMIN,
    "PUT /suppliers/:id": SOLO_ADMIN,
    "DELETE /suppliers/:id": SOLO_ADMIN,
    "GET /tags": TODOS,
    "GET /tags/:id": TODOS,
    "POST /tags": SOLO_ADMIN,
    "PUT /tags/:id": SOLO_ADMIN,
    "DELETE /tags/:id": SOLO_ADMIN,
    // Compras
    "GET /purchase-orders": TODOS,
    "GET /purchase-orders/export": SOLO_ADMIN,
    "GET /purchase-orders/suggestions": TODOS,
    "POST /purchase-orders/suggestions": SOLO_ADMIN,
    "GET /purchase-orders/:id": TODOS,
    "POST /purchase-orders": SOLO_ADMIN,
    "POST /purchase-orders/:id/receipts": ALMACEN,
    "PATCH /purchase-orders/:id": SOLO_ADMIN,
    "DELETE /purchase-orders/:id": SOLO_ADMIN,
    // Clientes (T5-06): los ve quien ve las ventas; los crea y los edita quien crea ventas.
    "GET /customers": TODOS,
    "GET /customers/:id": TODOS,
    "POST /customers": SOLO_ADMIN,
    "PUT /customers/:id": SOLO_ADMIN,
    "DELETE /customers/:id": SOLO_ADMIN,
    // Ventas
    "GET /sale-orders": TODOS,
    "GET /sale-orders/export": SOLO_ADMIN,
    "GET /sale-orders/:id": TODOS,
    // T6-07 — el comprobante lo descarga quien lee la venta: no dice nada que la orden no diga ya.
    "GET /sale-orders/:id/receipt": TODOS,
    "POST /sale-orders": SOLO_ADMIN,
    // T6-08 — la venta de mostrador: creada y enviada en una operación, al precio del catálogo.
    "POST /sale-orders/counter": MOSTRADOR,
    "POST /sale-orders/:id/ship": ALMACEN,
    "PATCH /sale-orders/:id": SOLO_ADMIN,
    "DELETE /sale-orders/:id": SOLO_ADMIN,
    // Conteos físicos (T5-07): el almacén hace el ciclo entero; los demás lo consultan.
    "GET /inventory-counts": TODOS,
    "POST /inventory-counts": ALMACEN,
    "GET /inventory-counts/:id": TODOS,
    "GET /inventory-counts/:id/lines": TODOS,
    "PATCH /inventory-counts/:id/lines": ALMACEN,
    "POST /inventory-counts/:id/close": ALMACEN,
    "POST /inventory-counts/:id/cancel": ALMACEN,
    // Informes
    "GET /reports": TODOS,
    "GET /reports/period": TODOS,
    "GET /reports/abc": TODOS,
    // Administración
    "GET /users": SOLO_ADMIN,
    "POST /users": SOLO_ADMIN,
    "GET /users/:id": SOLO_ADMIN,
    "PATCH /users/:id/role": SOLO_ADMIN,
    "PATCH /users/:id/activate": SOLO_ADMIN,
    "PATCH /users/:id/deactivate": SOLO_ADMIN,
    "GET /settings": SOLO_ADMIN,
    "PATCH /settings": SOLO_ADMIN,
    // T6-03 — la moneda la pinta cualquier rol en cualquier pantalla, y los datos del negocio van
    // en el comprobante que cualquiera descarga: se leen aparte, sin los ajustes de administración.
    "GET /settings/business": TODOS,
    "PUT /settings/logo": SOLO_ADMIN,
    "DELETE /settings/logo": SOLO_ADMIN,
    "GET /audit-logs": SOLO_ADMIN,
    // Avisos (T5-12): cada cual lee y marca **los suyos**; no hay ruta que enseñe los de otro.
    "GET /notifications": TODOS,
    "GET /notifications/unread-count": TODOS,
    "POST /notifications/read-all": TODOS,
    "POST /notifications/:id/read": TODOS,
} as const satisfies Record<string, readonly z.infer<typeof rolSchema>[]>;

export type RutaConPermiso = keyof typeof PERMISOS;

/** Si `rol` puede llamar a `ruta`. Sin rol —sin sesión— no puede nada. */
export function puede(rol: z.infer<typeof rolSchema> | undefined, ruta: RutaConPermiso): boolean {
    return rol !== undefined && (PERMISOS[ruta] as readonly string[]).includes(rol);
}

/**
 * T4-12 — el idioma en el que el servidor le escribe a un usuario.
 *
 * **En mayúsculas porque es un enum de la base**, no la etiqueta de idioma del navegador:
 * el frontend maneja `"es"` / `"en"` en su `localStorage` y convierte al mandarlo. Mezclar
 * las dos formas es la vía por la que un `"es"` acaba llegando a `users.idioma` y Prisma
 * rechaza el `update` en producción.
 */
export const idiomaSchema = z.enum(["ES", "EN"]);
export const estadoOrdenCompraSchema = z.enum(["PENDING", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]);
export const estadoOrdenVentaSchema = z.enum(["PENDING", "SHIPPED", "CANCELLED"]);
export const tipoMovimientoSchema = z.enum(["IN", "OUT", "ADJUSTMENT", "IMPORT"]);
/** T5-01 — de dónde sale un cambio de coste: una recepción de compra o una edición a mano. */
export const origenCosteSchema = z.enum(["PURCHASE_RECEIPT", "MANUAL"]);
/** T5-10 — clase ABC por facturación. C es también la de los productos sin ventas. */
export const claseAbcSchema = z.enum(["A", "B", "C"]);

export const accionAuditoriaSchema = z.enum([
    "CREATE", "UPDATE", "DELETE", "RESTORE", "STOCK_MOVEMENT", "BULK_STOCK",
    "ORDER_RECEIVE", "ORDER_CANCEL", "USER_ROLE_CHANGE", "USER_ACTIVATE",
    "USER_DEACTIVATE", "SALE_SHIP", "SALE_CANCEL", "REFRESH_REUSE",
    "COUNT_CLOSE", "COUNT_CANCEL",
    // T6-08 — una venta de mostrador.
    "SALE_COUNTER",
]);

export const entidadAuditoriaSchema = z.enum([
    "Product", "PurchaseOrder", "SaleOrder", "User", "Tag", "Category", "Brand", "Supplier",
    "InventoryCount", "Customer",
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

// ─────────────────── Código de barras (T5-08) ───────────────────

/** El más largo que se admite. Code 128 no tiene tope, pero una etiqueta de 50 mm sí. */
export const LARGO_MAXIMO_CODIGO_DE_BARRAS = 48;

/**
 * El dígito de control GTIN (EAN-13, UPC-A, EAN-8) de `cuerpo`, que son todos los dígitos
 * **menos** el último. Pesos 3 y 1 alternos empezando **por la derecha**: por eso sirve igual
 * para los tres largos sin saber cuál es.
 */
export function digitoDeControlGtin(cuerpo: string): number {
    let suma = 0;
    for (let i = 0; i < cuerpo.length; i++) {
        suma += Number(cuerpo[cuerpo.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    }
    return (10 - (suma % 10)) % 10;
}

/** Solo dígitos y con largo de EAN-8, UPC-A o EAN-13: se imprime y se valida como tal. */
export function esLargoGtin(codigo: string): boolean {
    return /^\d+$/.test(codigo) && [8, 12, 13].includes(codigo.length);
}

/**
 * Por qué `codigo` no vale como código de barras, o `null` si vale. **Es la regla de los dos
 * lados**: el validador del backend y el formulario del frontend la leen de aquí.
 *
 * - ASCII imprimible sin espacios, hasta 48: lo que Code 128 imprime y un lector de teclado
 *   (los de pistola USB escriben el código y pulsan Intro) devuelve igual.
 * - Si **parece** un GTIN —solo dígitos, 8, 12 o 13— tiene que cuadrar su dígito de control.
 *   Un EAN tecleado con una cifra cambiada es un código que ningún escáner va a leer nunca:
 *   mejor rechazarlo al guardar que descubrirlo delante de la estantería. El precio es que un
 *   código interno de 8, 12 o 13 cifras que no sea GTIN no se admite; con otro largo, sí.
 */
export function motivoCodigoDeBarrasInvalido(codigo: string): "largo" | "caracteres" | "digitoDeControl" | null {
    if (codigo.length === 0 || codigo.length > LARGO_MAXIMO_CODIGO_DE_BARRAS) return "largo";
    if (!/^[\x21-\x7E]+$/.test(codigo)) return "caracteres";
    if (esLargoGtin(codigo) && digitoDeControlGtin(codigo.slice(0, -1)) !== Number(codigo.at(-1))) {
        return "digitoDeControl";
    }
    return null;
}

/** Convierte un importe del cable a número. Devuelve `NaN` si no lo es, como `Number`. */
export function aNumero(importe: z.infer<typeof importeSchema>): number {
    return typeof importe === "number" ? importe : Number(importe);
}

/**
 * T6-03 — lo que puede pesar una imagen que se sube: la de un producto o el logo del negocio.
 * Aquí, y no en `upload.middleware`, porque lo leen tres sitios: multer, el error que explica
 * por qué la cortó y el formulario, que lo comprueba antes de enviar.
 */
export const PESO_MAXIMO_DE_IMAGEN_MB = 2;

// ─────────────────────── Moneda (T6-03) ───────────────────────

/** El símbolo con el que nace una instalación, y al que se vuelve si el guardado no vale. */
export const SIMBOLO_DE_MONEDA_POR_DEFECTO = "$";

export const LARGO_MAXIMO_SIMBOLO_DE_MONEDA = 5;

/**
 * Por qué `simbolo` no vale como símbolo de moneda, o `null` si vale. **Es la regla de los dos
 * lados**, como la del código de barras.
 *
 * Es un texto libre y no un código ISO porque `Intl` no escribe `RD$` sin la configuración
 * regional `es-DO`: con `es-MX`, un peso dominicano sale `DOP 14,999.00`. Pero «libre» tiene un
 * límite, y lo pone el PDF: la Helvetica estándar de PDFKit solo conoce WinAnsi, y `₡`, `₲`,
 * `₱`, `₹` o `₽` salen con **ancho cero**, o sea, un importe sin moneda y sin aviso. Se admite
 * lo que se imprime: letras sin acento, `$`, `/`, `.` y los signos `€ £ ¥ ¢ ƒ`. Quien cobra en
 * colones escribe `CRC`. `moneda.test.ts`, en el backend, mide cada carácter contra la fuente.
 *
 * Ni cifras ni signos: pegado a un importe, `1` o `-` cambian lo que dice.
 */
export function motivoSimboloDeMonedaInvalido(simbolo: string): "largo" | "caracteres" | null {
    if (simbolo.length === 0 || simbolo.length > LARGO_MAXIMO_SIMBOLO_DE_MONEDA) return "largo";
    if (!/^[A-Za-z$/.€£¥¢ƒ]+$/.test(simbolo)) return "caracteres";
    return null;
}

/**
 * Un importe como lo escribe Stockly en todas partes: `RD$14,999.00`, `-RD$1,234.50`.
 *
 * Vive aquí porque había dos copias, una por repositorio, y no coincidían: el PDF escribía
 * `$-1,234.50` y la pantalla `-$1,234.50`. El formato numérico es fijo —coma de millares, punto
 * decimal— y **no sigue al idioma de la interfaz**: solo el símbolo es del negocio.
 */
export function escribirImporte(
    valor: number,
    simbolo: string,
    opciones: { decimales?: number; signo?: boolean } = {},
): string {
    const { decimales = 2, signo = false } = opciones;
    const cifras = Math.abs(valor).toLocaleString("es-MX", {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
    });
    // Lo que redondea a cero no lleva signo: `-$0.00` no es ni una deuda ni una bajada.
    const esCero = !/[1-9]/.test(cifras);
    const prefijo = esCero ? "" : valor < 0 ? "-" : signo ? "+" : "";
    return `${prefijo}${simbolo}${cifras}`;
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
    "CANNOT_REOPEN_RECEIVED_ORDER",
    // T5-07 — la sesión ya está cerrada o cancelada.
    "COUNT_NOT_OPEN",
    // T5-07 — el filtro de la sesión no alcanza a ningún producto activo.
    "COUNT_WITHOUT_PRODUCTS",
    "INACTIVE_PRODUCT_MOVEMENT",
    "INSUFFICIENT_STOCK",
    "INVALID_FILTER_VALUE",
    "INVALID_OR_EXPIRED_TOKEN",
    "ORDER_ALREADY_SHIPPED",
    "ORDER_NOT_RECEIVABLE",
    "PRODUCT_ALREADY_ACTIVE",
    "PRODUCT_NOT_IN_COUNT",
    "PRODUCT_WITHOUT_SUPPLIER",
    // T5-08 — se piden etiquetas de productos sin código de barras ni SKU que imprimir, o con
    // uno tan largo que sus barras saldrían más finas de lo que se puede leer.
    "PRODUCTS_WITHOUT_CODE",
    "CODE_TOO_LONG_FOR_LABEL",
    "RECEIPT_EXCEEDS_PENDING",
    "STOCK_CANNOT_BE_NEGATIVE",
    // 401 / 403 — quién eres y qué se te permite
    "ACCOUNT_DISABLED",
    "EMAIL_NOT_CONFIRMED",
    // T5-13 — el rol no alcanza para esa ruta (`PERMISOS`).
    "FORBIDDEN",
    "INVALID_CREDENTIALS",
    "NOT_AUTHENTICATED",
    "SESSION_EXPIRED",
    "WRONG_CURRENT_PASSWORD",
    // 404
    "BRAND_NOT_FOUND",
    "CATEGORY_NOT_FOUND",
    "CUSTOMER_NOT_FOUND",
    "INVENTORY_COUNT_NOT_FOUND",
    // T5-12 — el aviso no existe **o es de otro usuario**: desde fuera no se distinguen.
    "NOTIFICATION_NOT_FOUND",
    "PRODUCT_NOT_FOUND",
    "PURCHASE_ORDER_ITEM_NOT_FOUND",
    "PURCHASE_ORDER_NOT_FOUND",
    "ROUTE_NOT_FOUND",
    "SALE_ORDER_NOT_FOUND",
    "SUPPLIER_NOT_FOUND",
    "TAG_NOT_FOUND",
    "USER_NOT_FOUND",
    // 409 — colisiones de unicidad
    // T5-08 — el código de barras o el SKU ya es de otro producto. El SKU daba **500** hasta
    // entonces: nadie traducía el error de unicidad de la base.
    "BARCODE_EXISTS",
    "BRAND_NAME_EXISTS",
    "CATEGORY_NAME_EXISTS",
    // T5-06 — el correo de un cliente es su clave: dos clientes no pueden compartirlo.
    "CUSTOMER_EMAIL_EXISTS",
    "EMAIL_ALREADY_REGISTERED",
    "EMAIL_IN_USE",
    "SKU_EXISTS",
    "SUPPLIER_EMAIL_EXISTS",
    "TAG_NAME_EXISTS",
    // 409 — el estado del inventario no admite la petición
    "INSUFFICIENT_AVAILABLE_STOCK",
    // T6-08 — se quiso vender en el mostrador un producto descatalogado.
    "INACTIVE_PRODUCT_SALE",
    // T5-07 — cerrar dejaría un producto en negativo, o un producto ya está en otro conteo abierto.
    "COUNT_ADJUSTMENT_NEGATIVE",
    "PRODUCTS_IN_OPEN_COUNT",
    // T6-07 — se pidió el comprobante de una orden que no se ha enviado: todavía no es una venta.
    "SALE_ORDER_NOT_SHIPPED",
    // 413 / 422 — el cuerpo o el archivo
    "EXPORT_TOO_LARGE",
    // T6-03 — `PUT /settings/logo` sin archivo: en un producto la imagen es opcional; aquí es la petición.
    "IMAGE_REQUIRED",
    // T6-03 — lo que corta multer antes de que nadie mire el archivo: pesa más de
    // `PESO_MAXIMO_DE_IMAGEN_MB`, o llegó en un campo que la ruta no espera. Los dos salían 500.
    "IMAGE_TOO_LARGE",
    "UNEXPECTED_FILE_FIELD",
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
    /** T5-05 — días de entrega; `null` es desconocido y la reposición usa el plazo por defecto. */
    leadTimeDays: z.number().nullable(),
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
    /** T5-08 — EAN-13, UPC-A, EAN-8 o un código interno; ver `motivoCodigoDeBarrasInvalido`. */
    barcode: z.string().nullable(),
    price: importeSchema,
    /**
     * T5-01 — coste medio ponderado, con cuatro decimales. **`null` es desconocido, no
     * cero**: un producto que nunca se ha comprado no vale nada a coste, simplemente no se
     * sabe. Quien sume valores a coste tiene que decidir qué hace con él, no tratarlo como 0.
     */
    costPrice: importeSchema.nullable(),
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

/**
 * T5-03 — `GET /products` y `GET /products/:id` traen además lo comprometido en ventas
 * pendientes y el disponible (`stock − comprometido`). El resto de respuestas con producto
 * —crear, editar, restaurar, el histórico— **no**: calcularlo en cada una costaría una consulta
 * más donde nadie lo pinta. **El disponible puede ser negativo** con datos anteriores a T5-03.
 *
 * T5-10 — y, por lo mismo, la clase ABC: solo la pintan el catálogo y la ficha.
 */
export const productoConDisponibleSchema = productoSchema.extend({
    committedStock: z.number(),
    availableStock: z.number(),
    abcClass: claseAbcSchema,
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
 * T5-01 — un cambio del coste medio. `oldCost` es `null` en la primera recepción de un
 * producto sin coste; `newCost` lo es cuando un ADMIN borra el coste a mano.
 * `purchaseOrderId` solo lo llevan los que salen de una recepción.
 */
export const historialCosteSchema = z.object({
    id: z.string(),
    productId: z.string(),
    oldCost: importeSchema.nullable(),
    newCost: importeSchema.nullable(),
    source: origenCosteSchema,
    purchaseOrderId: z.string().nullable(),
    createdAt: fechaSchema,
});

/**
 * `GET /products/:id/cost-history` (T5-01): paginado y del más reciente al más antiguo.
 * Sin el producto, a diferencia de los movimientos: la pantalla que lo pide ya lo tiene.
 */
export const historialCosteDeProductoSchema = z.object({
    history: z.array(historialCosteSchema),
    meta: metaPaginacionSchema,
});

/**
 * `GET /products/:id/movements` (T4-15).
 *
 * **No usa `paginadoSchema`** aunque lleve `meta`: además de la página devuelve el
 * producto, y llamar `data` a los movimientos dentro de un `data` que ya envuelve todo
 * confundiría los dos niveles. Lo que sí comparte es el `meta`, que es lo que permite
 * reutilizar el control de paginación de la interfaz.
 *
 * Los movimientos llegan **del más reciente al más antiguo**: la primera página es lo
 * último que pasó, que es lo que se abre a mirar. Quien pinte una serie temporal con
 * ellos tiene que invertirlos.
 */
export const movimientosDeProductoSchema = z.object({
    product: productoSchema,
    movements: z.array(movimientoStockSchema),
    meta: metaPaginacionSchema,
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
    /** **Sin impuesto**, siempre: de él salen los ingresos y el margen de los informes. */
    unitPrice: importeSchema,
    /**
     * T6-05 — el porcentaje de impuesto congelado al crear la orden (`18`, `7.5`). `null` en
     * las líneas anteriores a él: sin impuesto.
     */
    taxRate: z.number().nullable(),
    /** T6-05 — cantidad × precio, sin impuesto. Lo calcula el servidor, como los dos de abajo. */
    subtotal: importeSchema,
    /** El impuesto de la línea, redondeado a dos decimales. */
    tax: importeSchema,
    total: importeSchema,
    createdAt: fechaSchema,
});

/** T6-05 — el tope de la tasa de impuesto: es un porcentaje. */
export const TASA_DE_IMPUESTO_MAXIMA = 100;

/**
 * T6-05 — si `tasa` vale como tasa de impuesto: un porcentaje entre 0 y 100 con dos decimales
 * como mucho, que son los que guarda la columna (`18`, `7.5`, `10.25`). **Es la regla de los dos
 * lados**: la aplica el `PATCH /settings` y la dice el formulario antes de enviar.
 */
export function esTasaDeImpuestoValida(tasa: number): boolean {
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > TASA_DE_IMPUESTO_MAXIMA) return false;
    return Math.abs(tasa * 100 - Math.round(tasa * 100)) < 1e-9;
}

/** T6-08 — cuántas líneas admite una venta de mostrador. */
export const MAXIMO_DE_LINEAS_DE_MOSTRADOR = 100;

/**
 * T6-08 — lo que va a sumar una venta **que todavía no existe**: lo que el mostrador enseña
 * antes de registrarla, para que quien cobra sepa cuánto pedir.
 *
 * La regla es la de `totalesDeLinea`, en el servidor —el impuesto se redondea **por línea**, a
 * dos decimales y con el medio hacia arriba—, escrita aquí en céntimos enteros para no depender
 * de `Decimal` ni de la coma flotante. Un test del backend compara las dos sobre una rejilla de
 * precios, cantidades y tasas: si un día divergen, rompe.
 *
 * Es una **previsión**: lo que vale es lo que devuelve la venta al registrarse, que es lo que
 * la pantalla enseña después.
 */
export function totalesPrevistos(lineas: ReadonlyArray<{ quantity: number; unitPrice: number | string }>, tasa: number) {
    const centesimasDeTasa = Math.round(tasa * 100);
    let subtotal = 0;
    let tax = 0;
    for (const linea of lineas) {
        const centimos = Math.round(Number(linea.unitPrice) * 100) * linea.quantity;
        subtotal += centimos;
        tax += Math.floor((centimos * centesimasDeTasa + 5000) / 10000);
    }
    const escribir = (centimos: number) => (centimos / 100).toFixed(2);
    return { subtotal: escribir(subtotal), tax: escribir(tax), total: escribir(subtotal + tax) };
}

/** T6-04 — con cuántas cifras se enseña el número de una venta. Es un mínimo, no un tope. */
export const CIFRAS_DEL_NUMERO_DE_VENTA = 6;

/**
 * T6-04 — el número de una venta como se lee en todas partes: `123` → `000123`. Sin la `#`,
 * que la pone el texto de cada sitio («Venta #000123», «Orden de venta #000123»).
 *
 * Vive aquí para que el servidor —las notas de los movimientos, el resumen semanal, la
 * exportación— y la interfaz no puedan escribirlo de dos maneras.
 */
export function escribirNumeroDeVenta(numero: number): string {
    return String(numero).padStart(CIFRAS_DEL_NUMERO_DE_VENTA, "0");
}

/**
 * T6-07 — si una orden tiene comprobante: **las enviadas**. Una pendiente todavía no es una
 * venta, y una cancelada sin enviar nunca lo fue. La que se canceló después de enviarse lo
 * conserva —el papel ya se entregó—, marcado como anulada: `shippedAt` sobrevive a la
 * cancelación, y es lo que las distingue.
 *
 * **Es la regla de los dos lados**: el servidor responde 409 donde esto dice que no, y la
 * interfaz no ofrece el botón.
 */
export function tieneComprobante(orden: { status: EstadoOrdenVenta; shippedAt: unknown }): boolean {
    return orden.status === "SHIPPED" || (orden.status === "CANCELLED" && orden.shippedAt !== null);
}

export const ordenVentaSchema = z.object({
    id: z.string(),
    /**
     * T6-04 — el correlativo: un entero que crece de uno en uno con cada venta creada. Es
     * **interno**, sin valor fiscal, y puede tener huecos: los de las órdenes borradas.
     */
    number: z.number(),
    status: estadoOrdenVentaSchema,
    /**
     * T5-06 — el cliente vinculado, o `null`: la venta no tenía correo, o su cliente se borró.
     * Los tres campos de abajo son la **instantánea** de a quién se vendió, y no cambian al
     * editar el cliente.
     */
    customerId: z.string().nullable(),
    customerName: z.string().nullable(),
    customerEmail: z.string().nullable(),
    customerPhone: z.string().nullable(),
    /** T6-06 — el documento del cliente, parte de la misma instantánea. */
    customerDocument: z.string().nullable(),
    /**
     * T6-06 — el correo de quien registró la venta. Lo pone el servidor con la sesión, no la
     * petición, y no se puede editar. Sobrevive a la cuenta: es texto, no una clave foránea.
     * `null` en las órdenes anteriores de las que la auditoría no guardaba quién las creó.
     */
    createdByEmail: z.string().nullable(),
    notes: z.string().nullable(),
    items: z.array(itemOrdenVentaSchema),
    /**
     * T6-05 — los importes de la orden, **calculados por el servidor** y no guardados: la suma
     * de los de sus líneas. `tax` es la suma del impuesto de cada línea, ya redondeado, no el
     * porcentaje de `subtotal`. Con la tasa a 0, `tax` es `0.00` y `total` es `subtotal`.
     */
    subtotal: importeSchema,
    tax: importeSchema,
    total: importeSchema,
    /**
     * Cuándo salió la mercancía, o `null` si no ha salido. **Se conserva al cancelar**: una
     * orden cancelada con fecha de envío es una venta anulada, y tiene comprobante (T6-07).
     */
    shippedAt: fechaSchema.nullable(),
    createdAt: fechaSchema,
    updatedAt: fechaSchema,
});

// ─────────────────────── Clientes (T5-06) ───────────────────────

/** T6-06 — lo más largo que puede ser el documento de un cliente (cédula, RNC, NIF…). */
export const LARGO_MAXIMO_DE_DOCUMENTO = 40;

/** El correo se guarda normalizado —minúsculas, sin espacios alrededor—: es la clave del cliente. */
export const clienteSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    /**
     * T6-06 — cédula, RNC, NIF. Texto libre: cada país tiene el suyo. **No identifica al
     * cliente**: no es único, y una venta no se vincula a nadie por él.
     */
    document: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: fechaSchema,
    updatedAt: fechaSchema,
});

/** Una fila de `GET /customers`: el cliente y cuántas órdenes tiene, en cualquier estado. */
export const clienteEnListadoSchema = clienteSchema.extend({ ordersCount: z.number() });

/**
 * Las cifras de la ficha. **`shippedRevenue` suma solo las órdenes enviadas**: una pendiente
 * todavía puede cancelarse y una cancelada no se cobró. Llega como número, igual que en
 * reportes: el servicio convierte.
 */
export const resumenClienteSchema = z.object({
    orders: z.number(),
    pending: z.number(),
    shipped: z.number(),
    cancelled: z.number(),
    shippedRevenue: z.number(),
    lastOrderAt: fechaSchema.nullable(),
});

/** `GET /customers/:id`. Sus órdenes van aparte, por `GET /sale-orders?customerId=`, paginadas. */
export const fichaClienteSchema = clienteSchema.extend({ summary: resumenClienteSchema });

// ─────────────────────── Avisos (T5-12) ───────────────────────

export const tipoDeAvisoSchema = z.enum(["LOW_STOCK", "SALE_UNSHIPPABLE", "PURCHASE_OVERDUE"]);

/**
 * `entityId` es de qué habla el aviso —el producto, la venta o la compra, según el tipo—, y
 * es adonde lleva al pulsarlo.
 */
const camposDeAviso = {
    id: z.string(),
    entityId: z.string(),
    /** `null` mientras no se ha leído. */
    readAt: z.string().nullable(),
    createdAt: z.string(),
};

/**
 * Un aviso lleva **los huecos de su texto, no el texto**: el servidor no sabe en qué idioma
 * está la pantalla de quien lo lee, y un mensaje ya escrito en español no se traduce en el
 * cliente (T4-04). Cada tipo tiene los suyos, y por eso es una unión discriminada.
 *
 * Son una copia del momento: `stock` es el que quedó entonces, no el de ahora.
 */
export const avisoSchema = z.discriminatedUnion("type", [
    z.object({
        ...camposDeAviso,
        type: z.literal("LOW_STOCK"),
        data: z.object({ productName: z.string(), stock: z.number(), minStock: z.number() }),
    }),
    z.object({
        ...camposDeAviso,
        type: z.literal("SALE_UNSHIPPABLE"),
        /**
         * El primer producto que no alcanzó: cuánto había y cuánto pedía la orden.
         *
         * T6-04 — `orderNumber` es el correlativo de la venta. Falta en los avisos anteriores,
         * que no se reescriben: esos se siguen nombrando por el principio de `entityId`.
         */
        data: z.object({
            orderNumber: z.number().optional(),
            productName: z.string(),
            available: z.number(),
            required: z.number(),
        }),
    }),
    z.object({
        ...camposDeAviso,
        type: z.literal("PURCHASE_OVERDUE"),
        /** `dueDate` es el día en que vencía el plazo, `AAAA-MM-DD` en la zona del negocio. */
        data: z.object({ supplierName: z.string().nullable(), dueDate: z.string() }),
    }),
]);

/** `GET /notifications`: los más recientes —no todos— y cuántos hay sin leer **en total**. */
export const avisosSchema = z.object({ items: z.array(avisoSchema), unread: z.number() });

/** `GET /notifications/unread-count`, y lo que devuelven las dos rutas que marcan como leído. */
export const avisosSinLeerSchema = z.object({ unread: z.number() });

export const itemOrdenCompraSchema = z.object({
    id: z.string(),
    purchaseOrderId: z.string(),
    productId: z.string().nullable(),
    product: productoDeItemSchema,
    productName: z.string(),
    quantity: z.number(),
    /** T5-04 — lo que ha entrado de la línea entre todas sus recepciones; nunca más que `quantity`. */
    receivedQuantity: z.number(),
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

/**
 * T5-05 — de dónde sale el precio propuesto para el borrador: el último pagado a ese
 * proveedor o el coste medio. `null`, junto a un precio `null`: no hay ninguno y hay que
 * escribirlo. Nunca el precio de venta.
 */
export const origenPrecioSugeridoSchema = z.enum(["LAST_PURCHASE", "COST"]);

/**
 * T5-05 — una fila de `GET /purchase-orders/suggestions`. Lleva todo lo que entra en la
 * fórmula para que la pantalla pueda enseñar **por qué** sugiere lo que sugiere, no solo el
 * número. Los importes llegan como número, igual que en reportes: el servicio convierte.
 */
export const sugerenciaReposicionSchema = z.object({
    productId: z.string(),
    productName: z.string(),
    sku: z.string().nullable(),
    /** `null`: producto sin proveedor. Sale en la lista, pero no se puede generar su orden. */
    supplier: referenciaSchema.nullable(),
    leadTimeDays: z.number(),
    /** El proveedor no tiene plazo y se ha usado el de Configuración. */
    leadTimeIsDefault: z.boolean(),
    stock: z.number(),
    committedStock: z.number(),
    availableStock: z.number(),
    minStock: z.number(),
    /** Lo que falta por llegar de órdenes abiertas, de cualquier proveedor. */
    pendingReceipt: z.number(),
    /** Unidades salidas en la ventana de `days` días. */
    unitsOut: z.number(),
    dailyVelocity: z.number(),
    suggestedQuantity: z.number(),
    proposedUnitPrice: z.number().nullable(),
    priceSource: origenPrecioSugeridoSchema.nullable(),
});

export const sugerenciasReposicionSchema = z.object({
    data: z.array(sugerenciaReposicionSchema),
    meta: metaPaginacionSchema,
    /** La ventana de la velocidad de salida, la misma que la rotación. */
    days: z.number(),
    defaultLeadTimeDays: z.number(),
});

// ─────────────────────── Conteos físicos (T5-07) ───────────────────────

export const estadoConteoSchema = z.enum(["OPEN", "CLOSED", "CANCELLED"]);

/** El filtro de líneas de un conteo: por contar, contadas, o contadas con diferencia. */
export const filtroLineasConteoSchema = z.enum(["pending", "counted", "difference"]);

/**
 * Las cifras de una sesión. Las diferencias se valoran al coste medio (T5-01): el de **cada
 * línea al cerrar** en una sesión cerrada, el actual en una abierta. Las líneas de productos sin
 * coste no entran en el valor, y `linesWithoutCost` dice cuántas son.
 */
export const resumenConteoSchema = z.object({
    lines: z.number(),
    counted: z.number(),
    uncounted: z.number(),
    withDifference: z.number(),
    unitsOver: z.number(),
    unitsShort: z.number(),
    valueOver: z.number(),
    valueShort: z.number(),
    linesWithoutCost: z.number(),
});

export const conteoSchema = z.object({
    id: z.string(),
    status: estadoConteoSchema,
    note: z.string().nullable(),
    category: z.object({ id: z.string(), name: z.string() }).nullable(),
    createdByEmail: z.string().nullable(),
    closedByEmail: z.string().nullable(),
    createdAt: fechaSchema,
    closedAt: fechaSchema.nullable(),
    summary: resumenConteoSchema,
});

/**
 * Una línea. `expectedQuantity` y `difference` solo existen **después** de contarla: la pantalla
 * de captura no los enseña (conteo a ciegas) y la de revisión sí. No es una barrera de
 * seguridad —el stock se ve en el catálogo—, es no poner el número delante de quien cuenta.
 */
export const lineaConteoSchema = z.object({
    id: z.string(),
    productId: z.string(),
    name: z.string(),
    sku: z.string().nullable(),
    category: z.string().nullable(),
    countedQuantity: z.number().nullable(),
    expectedQuantity: z.number().nullable(),
    difference: z.number().nullable(),
    countedAt: fechaSchema.nullable(),
    countedByEmail: z.string().nullable(),
    adjustment: z.number().nullable(),
    unitCost: z.number().nullable(),
});

export const lineasConteoSchema = z.object({
    data: z.array(lineaConteoSchema),
    meta: metaPaginacionSchema,
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

/**
 * `GET /auth/me` no devuelve `updatedAt`: su `select` es más corto que `USER_SELECT`.
 *
 * Y **sí devuelve `idioma`**, que `USER_SELECT` no trae (T4-12): es una preferencia de quien
 * mira, no un dato de la ficha de un usuario ajeno, así que no pinta nada en el listado de
 * administración. El frontend lo compara con su idioma efectivo para saber si tiene que
 * sincronizarlo con `PATCH /auth/me/idioma`.
 */
export const perfilSchema = usuarioSchema.omit({ updatedAt: true }).extend({ idioma: idiomaSchema });

/** Respuesta de `PATCH /auth/me/idioma`. */
export const idiomaGuardadoSchema = z.object({ idioma: idiomaSchema });

// ─────────────────────── Ajustes ───────────────────────

/**
 * T6-03 — a qué tarjeta de Configuración pertenece un ajuste: los datos del negocio —quién vende
 * y en qué moneda— o el funcionamiento de la aplicación.
 */
export const grupoDeAjusteSchema = z.enum(["general", "business"]);

const camposDeAjuste = {
    key: z.string(),
    label: z.string(),
    description: z.string(),
    group: grupoDeAjusteSchema,
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
    // `maxLength` (T6-03) solo lo traen los textos con tope: el campo lo aplica al teclear.
    z.object({ ...camposDeAjuste, type: z.literal("string"), value: z.string(), maxLength: z.number().optional() }),
]);

/** Lo que devuelve `PATCH /settings`: solo la clave y su valor ya convertido. */
export const ajusteGuardadoSchema = z.object({
    key: z.string(),
    value: z.union([z.boolean(), z.number(), z.string()]),
});

/**
 * T6-03 — quién vende y en qué moneda: lo que devuelve `GET /settings/business` **a cualquier
 * rol**. `GET /settings` es solo de `ADMIN`, pero el símbolo lo pinta toda pantalla con un
 * importe y estos datos encabezan el comprobante de venta.
 *
 * Un dato sin rellenar llega como cadena vacía, no como `null`: son ajustes, y un ajuste siempre
 * tiene valor. `logoUrl` sí es `null` sin logo, porque no es un ajuste: no lo escribe el `PATCH`,
 * solo `PUT /settings/logo`, que es quien sabe que la URL es de una imagen que subió él.
 */
export const negocioSchema = z.object({
    name: z.string(),
    taxId: z.string(),
    address: z.string(),
    phone: z.string(),
    email: z.string(),
    currencySymbol: z.string(),
    /**
     * T6-05 — cómo se llama el impuesto en este negocio («ITBIS», «IVA»). Vacío, la interfaz
     * pone el genérico de su catálogo de textos.
     */
    taxName: z.string(),
    /**
     * T6-08 — la tasa con la que nace una venta **ahora**, en porcentaje. Es para que el
     * mostrador diga cuánto se va a cobrar antes de registrar la venta (`totalesPrevistos`).
     * **No sirve para una orden que ya existe**: esa lleva la suya congelada en sus líneas.
     */
    taxRate: z.number(),
    logoUrl: z.string().nullable(),
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
    /** A precio de **venta**: incluye un beneficio que todavía no existe. */
    inventoryValue: z.number(),
    /** T5-02 — a coste medio, sumando solo los productos que tienen coste. */
    inventoryCostValue: z.number(),
    /** Precio de venta menos coste, **sobre los productos con coste**; no sobre todos. */
    potentialMargin: z.number(),
    /** Activos con stock y sin coste: quedan fuera de las dos cifras anteriores. */
    productsWithoutCost: z.number(),
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
    /** T5-03 — stock menos lo comprometido; `daysToStockout` se cuenta sobre este. */
    availableStock: z.number(),
    minStock: z.number(),
    dailyVelocity: z.number(),
    daysToStockout: z.number().nullable(),
    reorderSoon: z.boolean(),
});

/**
 * T5-02 — lo común a cada fila del margen realizado. `marginPercent` es sobre ventas, con un
 * decimal, y `null` cuando no hay ventas: un 0 % diría que se vendió sin ganar nada.
 */
const camposDeMargen = {
    revenue: z.number(),
    cost: z.number(),
    margin: z.number(),
    marginPercent: z.number().nullable(),
};

/** `name` es `null` para lo vendido sin categoría: la etiqueta la pone la interfaz, en su idioma. */
export const margenPorCategoriaSchema = z.object({ name: z.string().nullable(), ...camposDeMargen });

export const margenPorProductoSchema = z.object({
    /** `null` si el producto se borró después; el nombre es el congelado en la venta. */
    productId: z.string().nullable(),
    name: z.string(),
    units: z.number(),
    ...camposDeMargen,
});

/**
 * Margen de las ventas **enviadas** en los últimos `days` días. Solo cuentan los ítems con
 * coste congelado al enviar; lo vendido sin él va en `revenueWithoutCost` y no entra.
 */
export const margenRealizadoSchema = z.object({
    days: z.number(),
    ...camposDeMargen,
    revenueWithoutCost: z.number(),
    byCategory: z.array(margenPorCategoriaSchema),
    topProducts: z.array(margenPorProductoSchema),
});

/**
 * T6-09 — las ventas **enviadas** de un día del negocio (`YYYY-MM-DD`, en la zona `timezone`).
 * `revenue` es neto, como el resto de informes. Un día sin ventas viene a cero, no falta.
 */
export const ventasPorDiaSchema = z.object({
    day: z.string(),
    orders: z.number(),
    revenue: z.number(),
});

/** T6-09 — por el nombre congelado en la línea de venta: el producto puede ya no existir. */
export const masVendidoSchema = z.object({
    name: z.string(),
    units: z.number(),
    revenue: z.number(),
});

export const resumenReporteSchema = z.object({
    totals: totalesReporteSchema,
    stockByCategory: z.array(stockPorCategoriaSchema),
    topByValue: z.array(productoTopSchema),
    movementsByMonth: z.array(movimientoPorMesSchema),
    lowStockProducts: z.array(productoBajoStockSchema),
    stockMetrics: z.array(metricaStockSchema),
    /** T6-09 — hoy y los seis días anteriores, del más antiguo al más reciente: siempre siete. */
    salesByDay: z.array(ventasPorDiaSchema),
    /** T6-09 — los cinco más vendidos por unidades en esos siete días. */
    topSold: z.array(masVendidoSchema),
    margin: margenRealizadoSchema,
});

/**
 * T5-09 — unidades e importe de lo vendido (enviado) y lo comprado (recibido). Cada fila de
 * los desgloses por periodo lleva las cuatro cifras.
 */
const cifrasDePeriodo = {
    salesUnits: z.number(),
    salesRevenue: z.number(),
    purchaseUnits: z.number(),
    purchaseAmount: z.number(),
};

export const atajoDePeriodoSchema = z.enum(["this-month", "last-month", "this-quarter", "this-year"]);

/** Un mes del periodo, `YYYY-MM`. Los de los extremos, recortados a los días del periodo. */
export const periodoPorMesSchema = z.object({ month: z.string(), ...cifrasDePeriodo });

/** `name` a `null`: sin categoría, o producto borrado. La etiqueta la pone la interfaz. */
export const periodoPorCategoriaSchema = z.object({ name: z.string().nullable(), ...cifrasDePeriodo });

export const periodoPorProductoSchema = z.object({
    /** `null` si el producto se borró; `name` es entonces el congelado en la línea. */
    productId: z.string().nullable(),
    name: z.string(),
    sku: z.string().nullable(),
    category: z.string().nullable(),
    ...cifrasDePeriodo,
});

/**
 * `GET /reports/period`. `from` y `to` son días del negocio (`YYYY-MM-DD`, ambos incluidos) en
 * la zona `timezone`; `preset` es el atajo que los produjo, o `null` si se pidieron a mano.
 * `byProduct` trae los primeros por ventas; `moreProducts` dice si hay más (el CSV los trae todos).
 * No hay recuento total a propósito: obligaría a acumular todos los grupos (ver
 * `productosDelPeriodo`).
 */
export const informePorPeriodoSchema = z.object({
    from: z.string(),
    to: z.string(),
    preset: atajoDePeriodoSchema.nullable(),
    timezone: z.string(),
    totals: z.object({
        salesOrders: z.number(),
        purchaseOrders: z.number(),
        ...cifrasDePeriodo,
    }),
    byMonth: z.array(periodoPorMesSchema),
    byCategory: z.array(periodoPorCategoriaSchema),
    byProduct: z.array(periodoPorProductoSchema),
    moreProducts: z.boolean(),
});

/**
 * T5-10 — `GET /reports/abc`. `from` y `to` son los doce meses naturales completos anteriores
 * al actual, en la zona `timezone`; `calculatedAt`, cuándo se calculó por última vez.
 * `counts.C` cuenta **todos** los productos que no son A ni B, con ventas o sin ellas.
 */
export const resumenAbcSchema = z.object({
    from: z.string(),
    to: z.string(),
    timezone: z.string(),
    calculatedAt: fechaSchema,
    counts: z.object({ A: z.number(), B: z.number(), C: z.number() }),
});

// ─────────────────────── Tipos inferidos ───────────────────────
// Es lo que consume el frontend. No se escriben a mano: si el esquema cambia, el tipo
// cambia con él y `tsc` señala cada uso que dejó de encajar.

export type Rol = z.infer<typeof rolSchema>;
export type IdiomaDeCorreo = z.infer<typeof idiomaSchema>;
export type EstadoOrdenCompra = z.infer<typeof estadoOrdenCompraSchema>;
export type EstadoOrdenVenta = z.infer<typeof estadoOrdenVentaSchema>;
export type TipoMovimiento = z.infer<typeof tipoMovimientoSchema>;
export type OrigenCoste = z.infer<typeof origenCosteSchema>;
export type ClaseAbc = z.infer<typeof claseAbcSchema>;
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
export type ProductoConDisponible = z.infer<typeof productoConDisponibleSchema>;
export type MovimientosDeProducto = z.infer<typeof movimientosDeProductoSchema>;
export type HistorialPrecio = z.infer<typeof historialPrecioSchema>;
export type HistorialCoste = z.infer<typeof historialCosteSchema>;
export type HistorialCosteDeProducto = z.infer<typeof historialCosteDeProductoSchema>;
export type ProductoExportado = z.infer<typeof productoExportadoSchema>;
export type ResultadoImportacion = z.infer<typeof resultadoImportacionSchema>;

export type ItemOrdenVenta = z.infer<typeof itemOrdenVentaSchema>;
export type OrdenVenta = z.infer<typeof ordenVentaSchema>;
export type Cliente = z.infer<typeof clienteSchema>;
export type ClienteEnListado = z.infer<typeof clienteEnListadoSchema>;
export type ResumenCliente = z.infer<typeof resumenClienteSchema>;
export type FichaCliente = z.infer<typeof fichaClienteSchema>;
export type TipoDeAviso = z.infer<typeof tipoDeAvisoSchema>;
export type Aviso = z.infer<typeof avisoSchema>;
export type Avisos = z.infer<typeof avisosSchema>;
export type AvisosSinLeer = z.infer<typeof avisosSinLeerSchema>;
export type ItemOrdenCompra = z.infer<typeof itemOrdenCompraSchema>;
export type OrdenCompra = z.infer<typeof ordenCompraSchema>;
export type OrigenPrecioSugerido = z.infer<typeof origenPrecioSugeridoSchema>;
export type SugerenciaReposicion = z.infer<typeof sugerenciaReposicionSchema>;
export type SugerenciasReposicion = z.infer<typeof sugerenciasReposicionSchema>;
export type EstadoConteo = z.infer<typeof estadoConteoSchema>;
export type FiltroLineasConteo = z.infer<typeof filtroLineasConteoSchema>;
export type ResumenConteo = z.infer<typeof resumenConteoSchema>;
export type Conteo = z.infer<typeof conteoSchema>;
export type LineaConteo = z.infer<typeof lineaConteoSchema>;
export type LineasConteo = z.infer<typeof lineasConteoSchema>;

export type Usuario = z.infer<typeof usuarioSchema>;
export type Perfil = z.infer<typeof perfilSchema>;
export type IdiomaGuardado = z.infer<typeof idiomaGuardadoSchema>;
export type Ajuste = z.infer<typeof ajusteSchema>;
export type AjusteGuardado = z.infer<typeof ajusteGuardadoSchema>;
export type GrupoDeAjuste = z.infer<typeof grupoDeAjusteSchema>;
export type Negocio = z.infer<typeof negocioSchema>;
export type RegistroAuditoria = z.infer<typeof registroAuditoriaSchema>;

export type TotalesReporte = z.infer<typeof totalesReporteSchema>;
export type StockPorCategoria = z.infer<typeof stockPorCategoriaSchema>;
export type ProductoTop = z.infer<typeof productoTopSchema>;
export type MovimientoPorMes = z.infer<typeof movimientoPorMesSchema>;
export type ProductoBajoStock = z.infer<typeof productoBajoStockSchema>;
export type MetricaStock = z.infer<typeof metricaStockSchema>;
export type ResumenReporte = z.infer<typeof resumenReporteSchema>;
export type VentasPorDia = z.infer<typeof ventasPorDiaSchema>;
export type MasVendido = z.infer<typeof masVendidoSchema>;
export type MargenRealizado = z.infer<typeof margenRealizadoSchema>;
export type AtajoDePeriodo = z.infer<typeof atajoDePeriodoSchema>;
export type PeriodoPorMes = z.infer<typeof periodoPorMesSchema>;
export type PeriodoPorCategoria = z.infer<typeof periodoPorCategoriaSchema>;
export type PeriodoPorProducto = z.infer<typeof periodoPorProductoSchema>;
export type InformePorPeriodo = z.infer<typeof informePorPeriodoSchema>;
export type ResumenAbc = z.infer<typeof resumenAbcSchema>;
export type MargenPorCategoria = z.infer<typeof margenPorCategoriaSchema>;
export type MargenPorProducto = z.infer<typeof margenPorProductoSchema>;

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
