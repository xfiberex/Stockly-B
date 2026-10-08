/**
 * T2-30 — el resto del spec de OpenAPI.
 *
 * Vive en su propio archivo porque son nueve módulos y `swagger.ts` ya tenía 280 líneas;
 * juntarlo todo lo dejaba imposible de leer. `swagger.ts` lo mezcla dentro de `paths`.
 *
 * Los cuatro catálogos —categorías, marcas, etiquetas y proveedores— son **el mismo CRUD**
 * con otro nombre, así que se generan con una función en vez de copiarse cuatro veces:
 * copiado a mano, la quinta se olvida de un código de respuesta y nadie lo nota.
 */

type Operacion = Record<string, unknown>;
type Ruta = Record<string, Operacion>;

const JSON_OK = (esquema: unknown, descripcion: string) => ({
    description: descripcion,
    content: {
        "application/json": {
            schema: {
                type: "object",
                properties: { success: { type: "boolean" }, message: { type: "string" }, data: esquema },
            },
        },
    },
});

const ERROR = (descripcion: string) => ({
    description: descripcion,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const PARAM_ID = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };

/** Los parámetros de paginación que acepta `parsePagination` en todos los listados. */
const PARAMS_PAGINA = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } },
];

/**
 * Sobre paginado real de la API: la lista va en `data.data`, junto a `data.meta`.
 * El `meta` se referencia (T4-02): lo genera `swagger.esquemas.ts` desde el contrato,
 * en vez de repetir aquí sus cuatro campos.
 */
const LISTA_PAGINADA = (ref: string) => ({
    type: "object",
    properties: {
        data: { type: "array", items: { $ref: ref } },
        meta: { $ref: "#/components/schemas/PaginationMeta" },
    },
});

/**
 * CRUD de un catálogo simple. Los cuatro comparten forma: listado sin paginar, alta,
 * lectura, edición y borrado, con escritura restringida a ADMIN.
 */
function crudDeCatalogo(base: string, etiqueta: string, ref: string, escritura: unknown): Record<string, Ruta> {
    const cuerpo = { required: true, content: { "application/json": { schema: escritura } } };
    return {
        [`/${base}`]: {
            get: {
                tags: [etiqueta], summary: `Listar ${etiqueta.toLowerCase()}`,
                responses: { "200": JSON_OK({ type: "array", items: { $ref: ref } }, "Listado completo"), "401": ERROR("No autenticado") },
            },
            post: {
                tags: [etiqueta], summary: `Crear (ADMIN)`, requestBody: cuerpo,
                responses: {
                    "201": JSON_OK({ $ref: ref }, "Creado"),
                    "401": ERROR("No autenticado"), "403": ERROR("Requiere rol ADMIN"),
                    "409": ERROR("Ya existe uno con ese nombre"), "422": ERROR("Datos inválidos"),
                },
            },
        },
        [`/${base}/{id}`]: {
            get: {
                tags: [etiqueta], summary: "Obtener por id", parameters: [PARAM_ID],
                responses: { "200": JSON_OK({ $ref: ref }, "Encontrado"), "404": ERROR("No encontrado") },
            },
            put: {
                tags: [etiqueta], summary: "Actualizar (ADMIN)", parameters: [PARAM_ID], requestBody: cuerpo,
                responses: {
                    "200": JSON_OK({ $ref: ref }, "Actualizado"), "403": ERROR("Requiere rol ADMIN"),
                    "404": ERROR("No encontrado"), "409": ERROR("Nombre duplicado"), "422": ERROR("Datos inválidos"),
                },
            },
            delete: {
                tags: [etiqueta], summary: "Eliminar (ADMIN)", parameters: [PARAM_ID],
                responses: { "200": JSON_OK(undefined, "Eliminado"), "403": ERROR("Requiere rol ADMIN"), "404": ERROR("No encontrado") },
            },
        },
    };
}

const NOMBRE_Y_DESCRIPCION = {
    type: "object",
    required: ["name"],
    properties: { name: { type: "string", example: "Electrónica" }, description: { type: "string" } },
};

/** Rutas de exportación: las tres aceptan `?format=csv` y responden JSON si no. */
const exportacion = (etiqueta: string, nombre: string): Ruta => ({
    get: {
        tags: [etiqueta], summary: `Exportar ${nombre}`,
        parameters: [{ name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"], default: "json" } }],
        responses: {
            "200": {
                description: "Exportación completa. Se transmite por partes (T2-05); el CSV lleva marca de orden de bytes (T2-34).",
                content: { "application/json": {}, "text/csv": { schema: { type: "string" } } },
            },
            "401": ERROR("No autenticado"),
            "413": ERROR("La exportación supera el máximo de filas"),
        },
    },
});

// T4-02 — aquí vivían `ITEM_DE_ORDEN` y `esquemasAdicionales`: ~70 líneas de objetos
// literales que repetían de memoria la forma de las respuestas. Los genera ahora
// `swagger.esquemas.ts` desde el contrato, y se referencian por `$ref` como el resto.
// Lo que queda en este archivo son las **rutas**, que no se derivan de nada: qué
// endpoints hay, con qué resumen, qué rol piden y qué códigos devuelven.

/**
 * El `POST` de `/products/{id}/movements`, que se inserta **dentro** del objeto que
 * `swagger.ts` ya tiene para esa ruta con su `get`. Ver la nota más abajo.
 */
export const postDeMovimientoManual = {
    post: {
        tags: ["Stock Movements"], summary: "Registrar un movimiento manual (ADMIN o WAREHOUSE)", parameters: [PARAM_ID],
        requestBody: {
            required: true,
            content: { "application/json": { schema: {
                type: "object", required: ["type", "quantity"],
                properties: {
                    type: { type: "string", enum: ["IN", "OUT", "ADJUSTMENT"] },
                    quantity: { type: "integer", example: 5 },
                    reason: { type: "string" },
                },
            } } },
        },
        responses: {
            "201": JSON_OK({ $ref: "#/components/schemas/Product" }, "Movimiento registrado"),
            "400": ERROR("Stock insuficiente"), "403": ERROR("Requiere rol ADMIN"), "404": ERROR("Producto no encontrado"),
        },
    },
};

export const rutasAdicionales: Record<string, Ruta> = {
    // ── Salud ────────────────────────────────────────────────────────────────
    "/health": {
        get: {
            tags: ["Salud"], security: [],
            summary: "Vivacidad: responde 200 mientras el proceso viva, **aunque la base esté caída**",
            responses: { "200": JSON_OK(undefined, "El proceso responde") },
        },
    },
    "/ready": {
        get: {
            tags: ["Salud"], security: [],
            summary: "Disponibilidad: comprueba la base de datos (T2-25)",
            responses: {
                "200": JSON_OK(undefined, "Lista para recibir tráfico"),
                "503": ERROR("La base de datos no está disponible"),
            },
        },
    },

    // ── Auth que faltaba ─────────────────────────────────────────────────────
    "/auth/refresh": {
        post: {
            tags: ["Auth"], security: [],
            summary: "Rota el refresh token y renueva la sesión",
            description: "Reutilizar un token ya rotado cierra **todas** las sesiones del usuario y queda registrado en la auditoría (T2-31).",
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/User" }, "Sesión renovada"), "401": ERROR("Sesión expirada o token reutilizado") },
        },
    },
    "/auth/resend-verification": {
        post: {
            tags: ["Auth"], security: [],
            summary: "Reenvía el correo de verificación",
            requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } } },
            responses: { "200": JSON_OK(undefined, "Correo reenviado"), "400": ERROR("Cuenta no encontrada o ya verificada") },
        },
    },

    // ── Catálogos ────────────────────────────────────────────────────────────
    ...crudDeCatalogo("categories", "Categories", "#/components/schemas/Category", NOMBRE_Y_DESCRIPCION),
    ...crudDeCatalogo("brands", "Brands", "#/components/schemas/Brand", NOMBRE_Y_DESCRIPCION),
    ...crudDeCatalogo("tags", "Tags", "#/components/schemas/Tag", {
        type: "object", required: ["name"],
        properties: { name: { type: "string", example: "Oferta" }, color: { type: "string", example: "#ef4444" } },
    }),
    ...crudDeCatalogo("suppliers", "Suppliers", "#/components/schemas/Supplier", {
        type: "object", required: ["name"],
        properties: {
            name: { type: "string", example: "Distribuidora Norte" },
            email: { type: "string", format: "email" }, phone: { type: "string" }, notes: { type: "string" },
            leadTimeDays: { type: "integer", minimum: 0, maximum: 365, nullable: true, description: "Días de entrega (T5-05). Vacío: se usa el plazo por defecto de Configuración" },
        },
    }),

    // ── Productos: lo que faltaba ────────────────────────────────────────────
    "/products/bulk-stock": {
        patch: {
            tags: ["Products"], summary: "Ajuste masivo de stock (ADMIN o WAREHOUSE)",
            requestBody: {
                required: true,
                content: { "application/json": { schema: {
                    type: "object", required: ["items"],
                    properties: {
                        reason: { type: "string", example: "Recuento de inventario" },
                        items: { type: "array", items: { type: "object", properties: { productId: { type: "string", format: "uuid" }, stock: { type: "integer" } } } },
                    },
                } } },
            },
            responses: {
                // Devuelve 200 con el detalle por producto: un fallo suelto no tumba el lote.
                "200": JSON_OK({ type: "array", items: { type: "object", properties: { productId: { type: "string" }, success: { type: "boolean" }, error: { type: "string" } } } }, "Resultado por producto"),
                "403": ERROR("Requiere rol ADMIN"), "422": ERROR("Datos inválidos"),
            },
        },
    },
    // OJO: `/products/{id}/movements` **no** va aquí, aunque le tocaría. Esa ruta ya está
    // documentada en `swagger.ts` con su `get`, y repetir la clave la sobrescribiría
    // entera —el spread sustituye, no fusiona—, dejando el `get` sin documentar **en
    // silencio**. Su `post` se exporta arriba y se inserta dentro del objeto existente.
    "/products/{id}/movements/export": exportacion("Stock Movements", "los movimientos de un producto"),
    "/products/{id}/price-history": {
        get: {
            tags: ["Products"], summary: "Historial de cambios de precio", parameters: [PARAM_ID],
            responses: {
                "200": JSON_OK({ type: "array", items: { $ref: "#/components/schemas/PriceHistory" } }, "Historial"),
                "404": ERROR("Producto no encontrado"),
            },
        },
    },

    "/products/{id}/cost-history": {
        get: {
            tags: ["Products"], summary: "Historial de cambios de coste medio (T5-01)",
            description: "Del más reciente al más antiguo. Cada recepción de compra que cambia el coste medio deja una fila, igual que cada edición manual.",
            parameters: [PARAM_ID, ...PARAMS_PAGINA],
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/CostHistoryPage" }, "Página del historial"),
                "404": ERROR("Producto no encontrado"),
            },
        },
    },

    // ── Órdenes de compra ────────────────────────────────────────────────────
    "/purchase-orders": {
        get: {
            tags: ["Purchase Orders"], summary: "Listar órdenes de compra",
            parameters: [...PARAMS_PAGINA, { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] } }],
            responses: { "200": JSON_OK(LISTA_PAGINADA("#/components/schemas/PurchaseOrder"), "Listado paginado"), "401": ERROR("No autenticado") },
        },
        post: {
            tags: ["Purchase Orders"], summary: "Crear orden de compra",
            requestBody: { required: true, content: { "application/json": { schema: {
                type: "object", required: ["items"],
                properties: {
                    supplierId: { type: "string", format: "uuid" }, notes: { type: "string" },
                    items: { type: "array", minItems: 1, items: { type: "object", properties: { productId: { type: "string", format: "uuid" }, productName: { type: "string" }, quantity: { type: "integer" }, unitPrice: { type: "number" } } } },
                },
            } } } },
            responses: { "201": JSON_OK({ $ref: "#/components/schemas/PurchaseOrder" }, "Creada"), "422": ERROR("Datos inválidos") },
        },
    },
    "/purchase-orders/export": exportacion("Purchase Orders", "las órdenes de compra"),
    "/purchase-orders/suggestions": {
        get: {
            tags: ["Purchase Orders"], summary: "Sugerencias de reposición (T5-05)",
            description: "Productos activos a los que la fórmula pide reponer: `⌈velocidad diaria × plazo + mínimo − disponible − pendiente de recibir⌉`, solo si sale positiva. La velocidad son las salidas `OUT` de los últimos 30 días; el plazo, el del proveedor o, sin él, el ajuste `defaultLeadTimeDays`. Agrupadas por proveedor, con los productos **sin proveedor al final**: se listan, pero no se pueden generar.",
            parameters: [...PARAMS_PAGINA],
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/ReorderSuggestions" }, "Página de sugerencias"), "401": ERROR("No autenticado") },
        },
        post: {
            tags: ["Purchase Orders"], summary: "Generar órdenes desde las sugerencias (ADMIN, T5-05)",
            description: "Crea **una orden `PENDING` por proveedor** con las líneas revisadas. Cantidad y precio son los enviados, no los sugeridos. El proveedor sale de cada producto. Todas o ninguna.",
            requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ReorderSuggestionsRequest" } } } },
            responses: {
                "201": JSON_OK({ type: "array", items: { $ref: "#/components/schemas/PurchaseOrder" } }, "Órdenes creadas"),
                "400": ERROR("Un producto sin proveedor (`PRODUCT_WITHOUT_SUPPLIER`)"), "403": ERROR("Requiere rol ADMIN"),
                "404": ERROR("Producto inexistente o inactivo"), "422": ERROR("Datos inválidos"),
            },
        },
    },
    "/purchase-orders/{id}/receipts": {
        post: {
            tags: ["Purchase Orders"], summary: "Registrar una recepción, parcial o completa (T5-04; ADMIN o WAREHOUSE)",
            description: "Suma a cada línea indicada la cantidad recibida, con su stock, su movimiento `IN` y el coste medio calculado sobre lo recibido. La orden queda `RECEIVED` si todas sus líneas se completan y `PARTIALLY_RECEIVED` si no. Las líneas que no se envían no reciben nada.",
            parameters: [PARAM_ID],
            requestBody: { required: true, content: { "application/json": { schema: {
                type: "object", required: ["items"],
                properties: {
                    items: { type: "array", minItems: 1, items: { type: "object", required: ["itemId", "quantity"], properties: { itemId: { type: "string", format: "uuid" }, quantity: { type: "integer", minimum: 1 } } } },
                },
            } } } },
            responses: {
                "201": JSON_OK({ $ref: "#/components/schemas/PurchaseOrder" }, "Recepción registrada"),
                "400": ERROR("Más de lo pendiente (`RECEIPT_EXCEEDS_PENDING`) u orden recibida o cancelada (`ORDER_NOT_RECEIVABLE`)"),
                "404": ERROR("La orden o la línea no existen"), "422": ERROR("Datos inválidos"),
            },
        },
    },
    "/purchase-orders/{id}": {
        get: {
            tags: ["Purchase Orders"], summary: "Obtener una orden", parameters: [PARAM_ID],
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/PurchaseOrder" }, "Encontrada"), "404": ERROR("No encontrada") },
        },
        patch: {
            tags: ["Purchase Orders"], summary: "Actualizar o cambiar de estado",
            description: "Pasar a `RECEIVED` **suma lo que falte** de cada línea ligada a un producto; cancelar una recibida, entera o a medias, retira lo que entró (`receivedQuantity`) y falla con 400 si esas unidades ya se consumieron (T0-04). `PARTIALLY_RECEIVED` no se escribe: se llega a él con `POST /purchase-orders/{id}/receipts`. Una orden con mercancía recibida no vuelve a `PENDING`.",
            parameters: [PARAM_ID],
            requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", enum: ["PENDING", "RECEIVED", "CANCELLED"] }, supplierId: { type: "string", format: "uuid" }, notes: { type: "string" } } } } } },
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/PurchaseOrder" }, "Actualizada"),
                "400": ERROR("Transición inválida, vuelta a pendiente de una orden con mercancía o stock ya consumido"), "404": ERROR("No encontrada"),
            },
        },
        delete: {
            tags: ["Purchase Orders"], summary: "Eliminar (no permitido si ya se recibió algo)", parameters: [PARAM_ID],
            responses: { "200": JSON_OK(undefined, "Eliminada"), "400": ERROR("No se puede eliminar una orden recibida"), "404": ERROR("No encontrada") },
        },
    },

    // ── Clientes (T5-06) ─────────────────────────────────────────────────────
    "/customers": {
        get: {
            tags: ["Customers"], summary: "Listar clientes, por nombre",
            parameters: [
                ...PARAMS_PAGINA,
                { name: "search", in: "query", schema: { type: "string" }, description: "Busca en nombre, correo, teléfono y documento" },
            ],
            responses: { "200": JSON_OK(LISTA_PAGINADA("#/components/schemas/CustomerListItem"), "Listado paginado"), "401": ERROR("No autenticado") },
        },
        post: {
            tags: ["Customers"], summary: "Crear cliente (ADMIN)",
            description: "El correo se guarda en minúsculas y sin espacios alrededor: es la clave con la que las ventas se vinculan solas a su cliente.",
            requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CustomerWrite" } } } },
            responses: {
                "201": JSON_OK({ $ref: "#/components/schemas/Customer" }, "Creado"),
                "403": ERROR("Requiere rol ADMIN"), "409": ERROR("Ya hay un cliente con ese correo (`CUSTOMER_EMAIL_EXISTS`)"),
                "422": ERROR("Datos inválidos"),
            },
        },
    },
    "/customers/{id}": {
        get: {
            tags: ["Customers"], summary: "Ficha del cliente, con sus cifras",
            description: "`summary.shippedRevenue` suma **solo las órdenes enviadas**. Las órdenes, paginadas, en `GET /sale-orders?customerId=`.",
            parameters: [PARAM_ID],
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/CustomerDetail" }, "Encontrado"), "404": ERROR("No encontrado") },
        },
        put: {
            tags: ["Customers"], summary: "Actualizar cliente (ADMIN)",
            description: "Un campo ausente no se toca y uno vacío se borra. **No reescribe las órdenes pasadas**: cada una conserva a quién se vendió.",
            parameters: [PARAM_ID],
            requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CustomerWrite" } } } },
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/Customer" }, "Actualizado"), "403": ERROR("Requiere rol ADMIN"),
                "404": ERROR("No encontrado"), "409": ERROR("Ya hay un cliente con ese correo"), "422": ERROR("Datos inválidos"),
            },
        },
        delete: {
            tags: ["Customers"], summary: "Eliminar cliente (ADMIN)",
            description: "Sus órdenes se quedan, sin cliente y con los datos de a quién se vendió.",
            parameters: [PARAM_ID],
            responses: { "200": JSON_OK(undefined, "Eliminado"), "403": ERROR("Requiere rol ADMIN"), "404": ERROR("No encontrado") },
        },
    },

    // ── Órdenes de venta ─────────────────────────────────────────────────────
    "/sale-orders": {
        get: {
            tags: ["Sale Orders"], summary: "Listar órdenes de venta",
            parameters: [
                ...PARAMS_PAGINA,
                { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "SHIPPED", "CANCELLED"] } },
                { name: "customerId", in: "query", schema: { type: "string", format: "uuid" }, description: "Solo las de un cliente (T5-06)" },
                { name: "number", in: "query", schema: { type: "string", pattern: "^[0-9]+$" }, description: "La venta con ese número correlativo, exacto: `123` y `000123` son la misma (T6-04)" },
                { name: "from", in: "query", schema: { type: "string", format: "date" }, description: "Creadas desde este día, incluido. Un día **del negocio**: empieza en la zona horaria de Configuración, no en UTC (T6-01)" },
                { name: "to", in: "query", schema: { type: "string", format: "date" }, description: "Creadas hasta este día, incluido, en la misma zona (T6-01)" },
            ],
            responses: {
                "200": JSON_OK(LISTA_PAGINADA("#/components/schemas/SaleOrder"), "Listado paginado"),
                "400": ERROR("INVALID_FILTER_VALUE: un estado que no existe, una fecha que no existe, un rango al revés o un `number` que no son solo dígitos"),
                "401": ERROR("No autenticado"),
            },
        },
        post: {
            tags: ["Sale Orders"], summary: "Crear orden de venta",
            description: "T6-06 — `createdByEmail` lo pone el servidor con la sesión de quien crea la venta; no se envía ni se edita. T6-05 — `subtotal`, `tax` y `total` los calcula el servidor con la tasa de Configuración vigente, que queda congelada en cada línea (`taxRate`); los que vengan en el cuerpo se descartan, y `unitPrice` es siempre sin impuesto. T6-04 — la respuesta trae `number`, el correlativo de la venta: lo asigna el servidor dentro de la transacción que la crea, y una venta rechazada no lo gasta. T5-06 — con `customerId` se vincula a ese cliente, y los datos de cliente que falten se copian de él. Sin `customerId`, se vincula **por el correo**: al cliente que lo tenga o a uno nuevo. Sin correo, a ninguno.",
            requestBody: { required: true, content: { "application/json": { schema: {
                type: "object", required: ["items"],
                properties: {
                    customerId: { type: "string", format: "uuid" },
                    customerName: { type: "string" }, customerEmail: { type: "string", format: "email" },
                    customerPhone: { type: "string" }, customerDocument: { type: "string", maxLength: 40, description: "Cédula, RNC, NIF (T6-06). Sin él se copia el del cliente vinculado" }, notes: { type: "string" },
                    items: { type: "array", minItems: 1, items: { type: "object", properties: { productId: { type: "string", format: "uuid" }, productName: { type: "string" }, quantity: { type: "integer" }, unitPrice: { type: "number" } } } },
                },
            } } } },
            responses: {
                "201": JSON_OK({ $ref: "#/components/schemas/SaleOrder" }, "Creada"),
                "404": ERROR("Un productId o el customerId no existe"),
                // T5-03 — la venta pide más de lo disponible (stock menos ventas pendientes).
                "409": ERROR("INSUFFICIENT_AVAILABLE_STOCK: la cantidad supera lo disponible de un producto"),
                "422": ERROR("Datos inválidos"),
            },
        },
    },
    "/sale-orders/export": exportacion("Sale Orders", "las órdenes de venta"),
    "/sale-orders/{id}": {
        get: {
            tags: ["Sale Orders"], summary: "Obtener una orden", parameters: [PARAM_ID],
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/SaleOrder" }, "Encontrada"), "404": ERROR("No encontrada") },
        },
        patch: {
            tags: ["Sale Orders"], summary: "Actualizar o cambiar de estado",
            description: "Pasar a `SHIPPED` **descuenta stock**; cancelar una ya enviada lo repone (T0-03). La interfaz pide confirmación antes de esa reposición (T2-42).",
            parameters: [PARAM_ID],
            requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", enum: ["PENDING", "SHIPPED", "CANCELLED"] }, customerId: { type: "string", format: "uuid", nullable: true, description: "T5-06 — `null` desvincula; no cambia los datos de cliente de la orden" }, customerName: { type: "string" }, notes: { type: "string" } } } } } },
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/SaleOrder" }, "Actualizada"),
                "400": ERROR("Stock insuficiente o transición inválida"), "404": ERROR("No encontrada"),
            },
        },
        delete: {
            tags: ["Sale Orders"], summary: "Eliminar (no permitido si ya se envió)", parameters: [PARAM_ID],
            responses: { "200": JSON_OK(undefined, "Eliminada"), "400": ERROR("No se puede eliminar una orden enviada"), "404": ERROR("No encontrada") },
        },
    },

    "/sale-orders/{id}/ship": {
        post: {
            tags: ["Sale Orders"], summary: "Enviar la orden (ADMIN o WAREHOUSE)",
            description: "T5-13 — lo mismo que `PATCH` con `status: SHIPPED` —**descuenta stock** y fija `shippedAt`—, sin nada más de la orden que se pueda tocar. Es la ruta del rol de almacén: el `PATCH`, que también edita y cancela, es solo de ADMIN.",
            parameters: [PARAM_ID],
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/SaleOrder" }, "Enviada"),
                "400": ERROR("Ya enviada, cancelada o sin stock suficiente"), "403": ERROR("Requiere rol ADMIN o WAREHOUSE"), "404": ERROR("No encontrada"),
            },
        },
    },

    // ── Conteos físicos (T5-07) ──────────────────────────────────────────────
    "/inventory-counts": {
        get: {
            tags: ["Inventory Counts"], summary: "Listar sesiones de conteo, con sus cifras",
            parameters: [...PARAMS_PAGINA, { name: "status", in: "query", schema: { type: "string", enum: ["OPEN", "CLOSED", "CANCELLED"] } }],
            responses: { "200": JSON_OK(LISTA_PAGINADA("#/components/schemas/InventoryCount"), "Listado paginado") },
        },
        post: {
            tags: ["Inventory Counts"], summary: "Abrir un conteo (ADMIN o WAREHOUSE)",
            description: "Crea una línea sin contar por cada producto **activo** del filtro (`categoryId`, o todo el catálogo). Un producto no puede estar en dos conteos abiertos.",
            requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/InventoryCountCreate" } } } },
            responses: {
                "201": JSON_OK({ $ref: "#/components/schemas/InventoryCount" }, "Abierto"),
                "400": ERROR("Ningún producto activo con ese filtro"), "404": ERROR("Categoría no encontrada"),
                "409": ERROR("Algún producto ya está en otro conteo abierto"),
            },
        },
    },
    "/inventory-counts/{id}": {
        get: {
            tags: ["Inventory Counts"], summary: "Una sesión y sus cifras", parameters: [PARAM_ID],
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/InventoryCount" }, "Encontrada"), "404": ERROR("No encontrada") },
        },
    },
    "/inventory-counts/{id}/lines": {
        get: {
            tags: ["Inventory Counts"], summary: "Líneas de una sesión, paginadas",
            description: "`expectedQuantity` y `difference` solo existen en las líneas ya contadas: la pantalla de captura no las enseña (conteo a ciegas).",
            parameters: [
                PARAM_ID, ...PARAMS_PAGINA,
                { name: "filter", in: "query", schema: { type: "string", enum: ["pending", "counted", "difference"] } },
                { name: "search", in: "query", schema: { type: "string" }, description: "Nombre o SKU, o el código de barras exacto (T5-08)" },
                { name: "productId", in: "query", schema: { type: "string", format: "uuid" }, description: "La línea de un producto: la del que se acaba de escanear (T5-08)" },
            ],
            responses: { "200": JSON_OK(LISTA_PAGINADA("#/components/schemas/InventoryCountLine"), "Listado paginado"), "404": ERROR("No encontrada") },
        },
        patch: {
            tags: ["Inventory Counts"], summary: "Anotar lo contado (ADMIN o WAREHOUSE)",
            description: "Guarda la cantidad contada y, **en ese momento**, el stock que esperaba el sistema: es contra lo que se comparará al cerrar. Volver a contar sobrescribe los dos.",
            parameters: [PARAM_ID],
            requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/InventoryCountLinesRequest" } } } },
            responses: {
                "200": JSON_OK({ type: "array", items: { $ref: "#/components/schemas/InventoryCountLine" } }, "Anotadas"),
                "400": ERROR("Sesión cerrada, o un producto que no está en ella"), "404": ERROR("No encontrada"),
            },
        },
    },
    "/inventory-counts/{id}/close": {
        post: {
            tags: ["Inventory Counts"], summary: "Cerrar: aplicar las diferencias (ADMIN o WAREHOUSE)",
            description: "Cada línea contada con diferencia genera un movimiento `ADJUSTMENT` de `contado − esperado` sobre el stock actual, todos en una transacción. Las no contadas no se tocan. Si algún ajuste dejara un producto en negativo, no se cierra nada.",
            parameters: [PARAM_ID],
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/InventoryCount" }, "Cerrada"),
                "400": ERROR("Ya cerrada o cancelada"), "404": ERROR("No encontrada"),
                "409": ERROR("Algún ajuste dejaría un producto en negativo"),
            },
        },
    },
    "/inventory-counts/{id}/cancel": {
        post: {
            tags: ["Inventory Counts"], summary: "Cancelar sin mover nada (ADMIN o WAREHOUSE)", parameters: [PARAM_ID],
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/InventoryCount" }, "Cancelada"),
                "400": ERROR("Ya cerrada o cancelada"), "404": ERROR("No encontrada"),
            },
        },
    },

    // ── Reportes ─────────────────────────────────────────────────────────────
    "/reports": {
        get: {
            tags: ["Reports"], summary: "Resumen de inventario para el dashboard",
            parameters: [{ name: "format", in: "query", schema: { type: "string", enum: ["json", "pdf"], default: "json" } }],
            responses: {
                // T4-02 — cuatro de las seis listas se documentaban como `items: {}`, o sea
                // «un array de algo»: quien leyera esto no sabía qué campos trae una
                // métrica de rotación. `ReportSummary` sale del contrato y las trae todas.
                "200": {
                    description: "Resumen. Con `format=pdf` devuelve el informe en PDF.",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    success: { type: "boolean" },
                                    message: { type: "string" },
                                    data: { $ref: "#/components/schemas/ReportSummary" },
                                },
                            },
                        },
                        "application/pdf": { schema: { type: "string", format: "binary" } },
                    },
                },
                "401": ERROR("No autenticado"),
            },
        },
    },
    "/reports/period": {
        get: {
            tags: ["Reports"],
            summary: "Ventas enviadas y compras recibidas de un periodo (T5-09)",
            description:
                "Los días son del negocio, en la zona del ajuste `timezone`. Se pide un atajo (`preset`) o un rango " +
                "(`from` y `to`, ambos incluidos), no las dos cosas; sin ninguno, este mes. Máximo 60 meses. " +
                "`format=csv` exporta el desglose por producto completo; `format=pdf`, el informe.",
            parameters: [
                { name: "preset", in: "query", schema: { type: "string", enum: ["this-month", "last-month", "this-quarter", "this-year"] } },
                { name: "from", in: "query", schema: { type: "string", format: "date" }, description: "Primer día, AAAA-MM-DD" },
                { name: "to", in: "query", schema: { type: "string", format: "date" }, description: "Último día, AAAA-MM-DD, incluido" },
                { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv", "pdf"], default: "json" } },
            ],
            responses: {
                "200": {
                    description: "Informe del periodo, o su CSV o PDF.",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    success: { type: "boolean" },
                                    message: { type: "string" },
                                    data: { $ref: "#/components/schemas/PeriodReport" },
                                },
                            },
                        },
                        "text/csv": { schema: { type: "string" } },
                        "application/pdf": { schema: { type: "string", format: "binary" } },
                    },
                },
                "400": ERROR("Periodo no válido: fecha mal escrita, atajo desconocido, fin antes del inicio o más de 60 meses"),
                "401": ERROR("No autenticado"),
                "413": ERROR("El CSV supera el máximo de filas de una exportación"),
            },
        },
    },
    "/reports/abc": {
        get: {
            tags: ["Reports"],
            summary: "Periodo de la clasificación ABC y productos por clase (T5-10)",
            description:
                "La clase de cada producto sale de lo que facturó en los doce meses naturales completos anteriores al " +
                "actual: A hasta el 80 % acumulado, B hasta el 95 %, C el resto y los que no vendieron. Se recalcula " +
                "sola al cambiar el periodo o la zona, o pasado un día. En el catálogo, `abcClass` en cada producto y " +
                "`?abcClass=` para filtrar.",
            responses: {
                "200": {
                    description: "Periodo, fecha del cálculo y recuento por clase.",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    success: { type: "boolean" },
                                    message: { type: "string" },
                                    data: { $ref: "#/components/schemas/AbcSummary" },
                                },
                            },
                        },
                    },
                },
                "401": ERROR("No autenticado"),
            },
        },
    },

    // ── Usuarios ─────────────────────────────────────────────────────────────
    "/users": {
        get: {
            tags: ["Users"], summary: "Listar usuarios (ADMIN)",
            parameters: [
                ...PARAMS_PAGINA,
                { name: "search", in: "query", schema: { type: "string" }, description: "Busca en nombre y correo (índice de trigramas, T2-09)" },
                { name: "role", in: "query", schema: { type: "string", enum: ["ADMIN", "USER", "WAREHOUSE"] } },
                { name: "isActive", in: "query", schema: { type: "string", enum: ["true", "false"] } },
            ],
            responses: { "200": JSON_OK(LISTA_PAGINADA("#/components/schemas/User"), "Listado paginado"), "403": ERROR("Requiere rol ADMIN") },
        },
    },
    "/users/{id}": {
        get: {
            tags: ["Users"], summary: "Obtener un usuario (ADMIN)", parameters: [PARAM_ID],
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/User" }, "Encontrado"), "403": ERROR("Requiere rol ADMIN"), "404": ERROR("No encontrado") },
        },
    },
    "/users/{id}/role": {
        patch: {
            tags: ["Users"], summary: "Cambiar el rol (ADMIN)", parameters: [PARAM_ID],
            requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["ADMIN", "USER", "WAREHOUSE"] } } } } } },
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/User" }, "Rol actualizado"),
                "400": ERROR("No puedes cambiar tu propio rol"), "403": ERROR("Requiere rol ADMIN"), "404": ERROR("No encontrado"),
            },
        },
    },
    "/users/{id}/activate": {
        patch: {
            tags: ["Users"], summary: "Reactivar una cuenta (ADMIN)", parameters: [PARAM_ID],
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/User" }, "Cuenta activada"), "403": ERROR("Requiere rol ADMIN"), "404": ERROR("No encontrado") },
        },
    },
    "/users/{id}/deactivate": {
        patch: {
            tags: ["Users"], summary: "Desactivar una cuenta (ADMIN)", parameters: [PARAM_ID],
            description: "Anula además el refresh token, así que la sesión abierta cae en cuanto expira el token de acceso (T1-06).",
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/User" }, "Cuenta desactivada"),
                "400": ERROR("No puedes desactivarte a ti mismo"), "403": ERROR("Requiere rol ADMIN"), "404": ERROR("No encontrado"),
            },
        },
    },

    // ── Configuración ────────────────────────────────────────────────────────
    "/settings": {
        // T4-02 — esto documentaba un **mapa de cadenas** en las dos direcciones, y la API
        // devuelve un **array de ajustes** cuyo `value` ya viene convertido según su
        // `type`. Es la misma clase de defecto que originó T2-29, y justamente en el
        // módulo cuya confusión de contrato costó T1-05 y T1-06: `"false"` es una cadena
        // verdadera, así que documentarlo como cadena invitaba a repetir el fallo.
        get: {
            tags: ["Settings"], summary: "Leer la configuración de la aplicación",
            responses: {
                "200": JSON_OK({ type: "array", items: { $ref: "#/components/schemas/Setting" } }, "Configuración actual"),
                "401": ERROR("No autenticado"),
            },
        },
        patch: {
            tags: ["Settings"], summary: "Guardar configuración (ADMIN)",
            description: "Lote de cambios: un objeto `{ clave: valor }` con el valor **ya tipado** —booleano, número o cadena— según el `type` del ajuste.",
            requestBody: {
                required: true,
                content: { "application/json": { schema: {
                    type: "object",
                    additionalProperties: { oneOf: [{ type: "boolean" }, { type: "number" }, { type: "string" }] },
                    example: { lowStockAlertEnabled: true },
                } } },
            },
            responses: {
                "200": JSON_OK({ type: "array", items: { type: "object", properties: { key: { type: "string" }, value: { oneOf: [{ type: "boolean" }, { type: "number" }, { type: "string" }] } } } }, "Ajustes guardados"),
                "403": ERROR("Requiere rol ADMIN"), "422": ERROR("Datos inválidos"),
            },
        },
    },
    // T6-03 — lo único de la configuración que lee cualquier rol.
    "/settings/business": {
        get: {
            tags: ["Settings"], summary: "Datos del negocio y símbolo de la moneda",
            description: "Para cualquier rol: el símbolo lo pinta toda pantalla con un importe. Un dato sin rellenar llega como cadena vacía; `logoUrl` es `null` sin logo.",
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/Business" }, "Datos del negocio"),
                "401": ERROR("No autenticado"),
            },
        },
    },
    "/settings/logo": {
        put: {
            tags: ["Settings"], summary: "Subir o sustituir el logo del negocio (ADMIN)",
            description: "JPEG, PNG o WebP de hasta 2 MB, validado por sus bytes. Se guarda como PNG de 600 px como mucho.",
            requestBody: {
                required: true,
                content: { "multipart/form-data": { schema: {
                    type: "object", required: ["logo"],
                    properties: { logo: { type: "string", format: "binary" } },
                } } },
            },
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/Business" }, "Logo actualizado"),
                "403": ERROR("Requiere rol ADMIN"), "422": ERROR("Falta el archivo o no es una imagen admitida"),
                "503": ERROR("Cloudinary no está configurado"),
            },
        },
        delete: {
            tags: ["Settings"], summary: "Quitar el logo del negocio (ADMIN)",
            description: "Sin logo no hace nada y responde igual.",
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/Business" }, "Logo eliminado"),
                "403": ERROR("Requiere rol ADMIN"),
            },
        },
    },

    // ── Auditoría ────────────────────────────────────────────────────────────
    "/audit-logs": {
        get: {
            tags: ["Audit Logs"], summary: "Registro de auditoría (ADMIN)",
            parameters: [
                ...PARAMS_PAGINA,
                { name: "action", in: "query", schema: { type: "string" } },
                { name: "entity", in: "query", schema: { type: "string" } },
            ],
            responses: { "200": JSON_OK(LISTA_PAGINADA("#/components/schemas/AuditLog"), "Listado paginado"), "403": ERROR("Requiere rol ADMIN") },
        },
    },

    // ── Avisos (T5-12) ───────────────────────────────────────────────────────
    "/notifications": {
        get: {
            tags: ["Notifications"], summary: "Mis avisos más recientes",
            description:
                "Los 30 últimos **del usuario de la sesión**, del más reciente al más antiguo, y cuántos tiene sin leer en total. " +
                "Cada aviso lleva los huecos de su texto en `data`, no el texto: lo compone el cliente en su idioma.",
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/Notifications" }, "Avisos y contador"), "401": ERROR("No autenticado") },
        },
    },
    "/notifications/unread-count": {
        get: {
            tags: ["Notifications"], summary: "Cuántos avisos tengo sin leer",
            description:
                "La consulta periódica de la campana. De paso, y como mucho cada cinco minutos, genera los avisos de " +
                "compras que pasaron su plazo y purga los leídos hace más de 90 días.",
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/NotificationsUnread" }, "Contador"), "401": ERROR("No autenticado") },
        },
    },
    "/notifications/read-all": {
        post: {
            tags: ["Notifications"], summary: "Marcar todos mis avisos como leídos",
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/NotificationsUnread" }, "Marcados"), "401": ERROR("No autenticado") },
        },
    },
    "/notifications/{id}/read": {
        post: {
            tags: ["Notifications"], summary: "Marcar un aviso como leído",
            description: "Marcarlo dos veces no es un error. El aviso de otro usuario responde 404, igual que uno que no existe.",
            parameters: [PARAM_ID],
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/NotificationsUnread" }, "Marcado; devuelve los que quedan sin leer"),
                "404": ERROR("No encontrado (`NOTIFICATION_NOT_FOUND`)"),
            },
        },
    },
};

export const etiquetasAdicionales = [
    { name: "Salud", description: "Sondas de vivacidad y disponibilidad" },
    { name: "Categories", description: "Categorías de producto" },
    { name: "Brands", description: "Marcas" },
    { name: "Tags", description: "Etiquetas de producto" },
    { name: "Suppliers", description: "Proveedores" },
    { name: "Purchase Orders", description: "Órdenes de compra — recibir suma stock" },
    { name: "Customers", description: "Clientes y su historial de ventas" },
    { name: "Sale Orders", description: "Órdenes de venta — enviar descuenta stock" },
    { name: "Reports", description: "Resumen de inventario y exportación en PDF" },
    { name: "Users", description: "Gestión de usuarios (solo ADMIN)" },
    { name: "Settings", description: "Configuración de la aplicación" },
    { name: "Audit Logs", description: "Rastro de acciones sensibles" },
    { name: "Notifications", description: "Avisos dentro de la aplicación, por usuario" },
];
