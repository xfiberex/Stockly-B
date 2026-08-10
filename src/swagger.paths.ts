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
        tags: ["Stock Movements"], summary: "Registrar un movimiento manual (ADMIN)", parameters: [PARAM_ID],
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
        },
    }),

    // ── Productos: lo que faltaba ────────────────────────────────────────────
    "/products/bulk-stock": {
        patch: {
            tags: ["Products"], summary: "Ajuste masivo de stock (ADMIN)",
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

    // ── Órdenes de compra ────────────────────────────────────────────────────
    "/purchase-orders": {
        get: {
            tags: ["Purchase Orders"], summary: "Listar órdenes de compra",
            parameters: [...PARAMS_PAGINA, { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "RECEIVED", "CANCELLED"] } }],
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
    "/purchase-orders/{id}": {
        get: {
            tags: ["Purchase Orders"], summary: "Obtener una orden", parameters: [PARAM_ID],
            responses: { "200": JSON_OK({ $ref: "#/components/schemas/PurchaseOrder" }, "Encontrada"), "404": ERROR("No encontrada") },
        },
        patch: {
            tags: ["Purchase Orders"], summary: "Actualizar o cambiar de estado",
            description: "Pasar a `RECEIVED` **suma stock** de cada ítem ligado a un producto; cancelar una ya recibida lo resta, y falla con 400 si esas unidades ya se consumieron (T0-04).",
            parameters: [PARAM_ID],
            requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", enum: ["PENDING", "RECEIVED", "CANCELLED"] }, supplierId: { type: "string", format: "uuid" }, notes: { type: "string" } } } } } },
            responses: {
                "200": JSON_OK({ $ref: "#/components/schemas/PurchaseOrder" }, "Actualizada"),
                "400": ERROR("Transición inválida o stock ya consumido"), "404": ERROR("No encontrada"),
            },
        },
        delete: {
            tags: ["Purchase Orders"], summary: "Eliminar (no permitido si ya se recibió)", parameters: [PARAM_ID],
            responses: { "200": JSON_OK(undefined, "Eliminada"), "400": ERROR("No se puede eliminar una orden recibida"), "404": ERROR("No encontrada") },
        },
    },

    // ── Órdenes de venta ─────────────────────────────────────────────────────
    "/sale-orders": {
        get: {
            tags: ["Sale Orders"], summary: "Listar órdenes de venta",
            parameters: [...PARAMS_PAGINA, { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "SHIPPED", "CANCELLED"] } }],
            responses: { "200": JSON_OK(LISTA_PAGINADA("#/components/schemas/SaleOrder"), "Listado paginado"), "401": ERROR("No autenticado") },
        },
        post: {
            tags: ["Sale Orders"], summary: "Crear orden de venta",
            requestBody: { required: true, content: { "application/json": { schema: {
                type: "object", required: ["items"],
                properties: {
                    customerName: { type: "string" }, customerEmail: { type: "string", format: "email" },
                    customerPhone: { type: "string" }, notes: { type: "string" },
                    items: { type: "array", minItems: 1, items: { type: "object", properties: { productId: { type: "string", format: "uuid" }, productName: { type: "string" }, quantity: { type: "integer" }, unitPrice: { type: "number" } } } },
                },
            } } } },
            responses: { "201": JSON_OK({ $ref: "#/components/schemas/SaleOrder" }, "Creada"), "422": ERROR("Datos inválidos") },
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
            requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", enum: ["PENDING", "SHIPPED", "CANCELLED"] }, customerName: { type: "string" }, notes: { type: "string" } } } } } },
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

    // ── Usuarios ─────────────────────────────────────────────────────────────
    "/users": {
        get: {
            tags: ["Users"], summary: "Listar usuarios (ADMIN)",
            parameters: [
                ...PARAMS_PAGINA,
                { name: "search", in: "query", schema: { type: "string" }, description: "Busca en nombre y correo (índice de trigramas, T2-09)" },
                { name: "role", in: "query", schema: { type: "string", enum: ["ADMIN", "USER"] } },
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
            requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["ADMIN", "USER"] } } } } } },
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
};

export const etiquetasAdicionales = [
    { name: "Salud", description: "Sondas de vivacidad y disponibilidad" },
    { name: "Categories", description: "Categorías de producto" },
    { name: "Brands", description: "Marcas" },
    { name: "Tags", description: "Etiquetas de producto" },
    { name: "Suppliers", description: "Proveedores" },
    { name: "Purchase Orders", description: "Órdenes de compra — recibir suma stock" },
    { name: "Sale Orders", description: "Órdenes de venta — enviar descuenta stock" },
    { name: "Reports", description: "Resumen de inventario y exportación en PDF" },
    { name: "Users", description: "Gestión de usuarios (solo ADMIN)" },
    { name: "Settings", description: "Configuración de la aplicación" },
    { name: "Audit Logs", description: "Rastro de acciones sensibles" },
];
