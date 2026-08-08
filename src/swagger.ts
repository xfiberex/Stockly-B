import swaggerUi from "swagger-ui-express";
import type { Express } from "express";

// Exportado para que los tests puedan comprobar que lo documentado y lo que acepta
// el validador no se separen otra vez (T2-29).
export const spec = {
    openapi: "3.0.3",
    info: {
        title: "Stockly API",
        description: "API REST para gestión de inventario de productos con autenticación y roles.",
        version: "1.0.0",
    },
    servers: [{ url: "/api/v1", description: "Servidor principal" }],
    components: {
        securitySchemes: {
            cookieAuth: { type: "apiKey", in: "cookie", name: "token" },
        },
        schemas: {
            // Categoría, marca y proveedor son relaciones: se leen como objeto y se
            // escriben por su id. El esquema las declaraba como un enum de cadenas y
            // el `requestBody` exigía un campo `category` que el validador rechaza,
            // así que seguir el «Try it out» acababa en 422.
            NamedRef: {
                type: "object",
                nullable: true,
                properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string", example: "Electrónica" },
                },
            },
            Tag: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string", example: "Oferta" },
                    color: { type: "string", nullable: true, example: "#ef4444" },
                },
            },
            Product: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string", example: "Laptop Pro 15" },
                    description: { type: "string", nullable: true },
                    sku: { type: "string", nullable: true, example: "ELE-LAP-LAPT15" },
                    price: { type: "number", example: 1299.99 },
                    stock: { type: "integer", example: 15 },
                    minStock: { type: "integer", example: 3 },
                    category: { $ref: "#/components/schemas/NamedRef" },
                    brand: { $ref: "#/components/schemas/NamedRef" },
                    supplier: { $ref: "#/components/schemas/NamedRef" },
                    tags: { type: "array", items: { $ref: "#/components/schemas/Tag" } },
                    imageUrl: { type: "string", nullable: true },
                    isActive: { type: "boolean" },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                },
            },
            // Cuerpo real de creación y actualización: los mismos campos que acepta
            // `createProductSchema`. `tagIds` se repite una vez por etiqueta porque
            // multipart no tiene arrays; `""` significa «ninguna».
            ProductWrite: {
                type: "object",
                properties: {
                    name: { type: "string", example: "Laptop Pro 15" },
                    description: { type: "string" },
                    sku: { type: "string" },
                    price: { type: "number", example: 1299.99 },
                    stock: { type: "integer", example: 15 },
                    minStock: { type: "integer", example: 3 },
                    categoryId: { type: "string", format: "uuid" },
                    brandId: { type: "string", format: "uuid" },
                    supplierId: { type: "string", format: "uuid" },
                    tagIds: { type: "array", items: { type: "string", format: "uuid" } },
                    image: { type: "string", format: "binary" },
                },
            },
            // La importación masiva tiene su propio contrato: categoría y marca van
            // por nombre, no por id, y se crean si no existen.
            ProductImport: {
                type: "object",
                required: ["name", "price"],
                properties: {
                    name: { type: "string", example: "Laptop Pro 15" },
                    description: { type: "string" },
                    price: { type: "number", example: 1299.99 },
                    stock: { type: "integer", example: 15 },
                    categoryName: { type: "string", example: "Electrónica" },
                    brandName: { type: "string", example: "Genérica" },
                    isActive: { type: "boolean" },
                },
            },
            StockMovement: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    productId: { type: "string", format: "uuid" },
                    type: { type: "string", enum: ["IN", "OUT", "ADJUSTMENT", "IMPORT"] },
                    delta: { type: "integer", description: "Positivo = entrada, negativo = salida" },
                    stockAfter: { type: "integer", description: "Stock resultante tras el movimiento" },
                    note: { type: "string", nullable: true },
                    createdAt: { type: "string", format: "date-time" },
                },
            },
            User: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    role: { type: "string", enum: ["ADMIN", "USER"] },
                    isVerified: { type: "boolean" },
                    createdAt: { type: "string", format: "date-time" },
                },
            },
            Error: {
                type: "object",
                properties: {
                    success: { type: "boolean", example: false },
                    message: { type: "string" },
                },
            },
        },
    },
    security: [{ cookieAuth: [] }],
    tags: [
        { name: "Auth", description: "Registro, login y gestión de cuenta" },
        { name: "Products", description: "CRUD de productos (escritura solo ADMIN)" },
        { name: "Stock Movements", description: "Historial de movimientos de stock" },
    ],
    paths: {
        "/auth/register": {
            post: {
                tags: ["Auth"], summary: "Registrar usuario",
                security: [],
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "email", "password"], properties: { name: { type: "string" }, email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 } } } } } },
                responses: { "201": { description: "Registro exitoso. Se envía email de verificación." }, "409": { description: "El correo ya está registrado" } },
            },
        },
        "/auth/verify-email": {
            post: {
                tags: ["Auth"], summary: "Verificar correo electrónico",
                security: [],
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } },
                responses: { "200": { description: "Cuenta verificada" }, "400": { description: "Token inválido o expirado" } },
            },
        },
        "/auth/login": {
            post: {
                tags: ["Auth"], summary: "Iniciar sesión",
                security: [],
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } } } } },
                responses: { "200": { description: "Login exitoso. Establece cookie de sesión.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/User" } } } } } }, "401": { description: "Credenciales inválidas" } },
            },
        },
        "/auth/logout": {
            post: {
                tags: ["Auth"], summary: "Cerrar sesión",
                responses: { "200": { description: "Sesión cerrada. Cookie eliminada." } },
            },
        },
        "/auth/me": {
            get: {
                tags: ["Auth"], summary: "Obtener usuario autenticado",
                responses: { "200": { description: "Datos del usuario", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/User" } } } } } }, "401": { description: "No autenticado" } },
            },
            put: {
                tags: ["Auth"], summary: "Actualizar nombre/email",
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "email"], properties: { name: { type: "string" }, email: { type: "string", format: "email" } } } } } },
                responses: { "200": { description: "Perfil actualizado" }, "409": { description: "El correo ya está en uso" } },
            },
        },
        "/auth/me/password": {
            patch: {
                tags: ["Auth"], summary: "Cambiar contraseña",
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["currentPassword", "password"], properties: { currentPassword: { type: "string" }, password: { type: "string", minLength: 8 } } } } } },
                responses: { "200": { description: "Contraseña actualizada" }, "403": { description: "Contraseña actual incorrecta" } },
            },
        },
        "/auth/forgot-password": {
            post: {
                tags: ["Auth"], summary: "Solicitar reset de contraseña",
                security: [],
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } } },
                responses: { "200": { description: "Email enviado si el correo existe" } },
            },
        },
        "/auth/reset-password": {
            post: {
                tags: ["Auth"], summary: "Restablecer contraseña con token",
                security: [],
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token", "password"], properties: { token: { type: "string" }, password: { type: "string", minLength: 8 } } } } } },
                responses: { "200": { description: "Contraseña restablecida" }, "400": { description: "Token inválido o expirado" } },
            },
        },
        "/products": {
            get: {
                tags: ["Products"], summary: "Listar productos con filtros y paginación",
                parameters: [
                    { name: "page", in: "query", schema: { type: "integer", default: 1 } },
                    { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
                    { name: "search", in: "query", schema: { type: "string" } },
                    // Los filtros van por id, no por nombre (ver `ProductQuery`).
                    { name: "categoryId", in: "query", schema: { type: "string", format: "uuid" } },
                    { name: "brandId", in: "query", schema: { type: "string", format: "uuid" } },
                    { name: "supplierId", in: "query", schema: { type: "string", format: "uuid" } },
                    { name: "tagId", in: "query", schema: { type: "string", format: "uuid" } },
                    { name: "isActive", in: "query", schema: { type: "boolean" } },
                ],
                responses: { "200": { description: "Lista paginada de productos" }, "401": { description: "No autenticado" } },
            },
            post: {
                tags: ["Products"], summary: "Crear producto (ADMIN)",
                requestBody: { required: true, content: { "multipart/form-data": { schema: { allOf: [{ $ref: "#/components/schemas/ProductWrite" }, { required: ["name", "price"] }] } } } },
                responses: { "201": { description: "Producto creado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Product" } } } } } }, "403": { description: "Solo ADMIN" }, "422": { description: "Datos inválidos" } },
            },
        },
        "/products/export": {
            get: {
                tags: ["Products"], summary: "Exportar todos los productos",
                responses: { "200": { description: "Array de productos para exportar" } },
            },
        },
        "/products/import": {
            post: {
                tags: ["Products"], summary: "Importar productos en masa (ADMIN, máx 1000)",
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["products"], properties: { products: { type: "array", items: { $ref: "#/components/schemas/ProductImport" } } } } } } },
                responses: { "201": { description: "Resultado de la importación con conteo de errores por fila" }, "403": { description: "Solo ADMIN" }, "422": { description: "Validación fallida" } },
            },
        },
        "/products/{id}": {
            get: {
                tags: ["Products"], summary: "Obtener producto por ID",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                responses: { "200": { description: "Producto encontrado" }, "404": { description: "No encontrado" } },
            },
            put: {
                tags: ["Products"], summary: "Actualizar producto (ADMIN)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                requestBody: { required: true, content: { "multipart/form-data": { schema: { allOf: [{ $ref: "#/components/schemas/ProductWrite" }, { type: "object", properties: { removeImage: { type: "string", description: "Cualquier valor no vacío elimina la imagen actual" } } }] } } } },
                responses: { "200": { description: "Producto actualizado" }, "403": { description: "Solo ADMIN" }, "404": { description: "No encontrado" } },
            },
            delete: {
                tags: ["Products"], summary: "Eliminar producto — soft delete (ADMIN)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                responses: { "200": { description: "Producto desactivado" }, "403": { description: "Solo ADMIN" }, "404": { description: "No encontrado" } },
            },
        },
        "/products/{id}/restore": {
            patch: {
                tags: ["Products"], summary: "Restaurar producto inactivo (ADMIN)",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                responses: { "200": { description: "Producto restaurado" }, "400": { description: "El producto ya está activo" }, "403": { description: "Solo ADMIN" } },
            },
        },
        "/products/{id}/movements": {
            get: {
                tags: ["Stock Movements"], summary: "Historial de movimientos de stock de un producto",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                responses: {
                    "200": {
                        description: "Producto + lista de movimientos",
                        content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { product: { $ref: "#/components/schemas/Product" }, movements: { type: "array", items: { $ref: "#/components/schemas/StockMovement" } } } } } } } },
                    },
                    "404": { description: "Producto no encontrado" },
                },
            },
        },
    },
};

export function registerSwagger(app: Express) {
    app.use(
        "/api/v1/docs",
        swaggerUi.serve,
        swaggerUi.setup(spec, {
            customSiteTitle: "Stockly API Docs",
            swaggerOptions: { persistAuthorization: true },
        }),
    );
}
