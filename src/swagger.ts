import swaggerUi from "swagger-ui-express";
import type { Express } from "express";

const spec = {
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
            Product: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string", example: "Laptop Pro 15" },
                    description: { type: "string", nullable: true },
                    price: { type: "number", example: 1299.99 },
                    stock: { type: "integer", example: 15 },
                    category: { type: "string", enum: ["Electrónica", "Periféricos", "Audio", "Accesorios", "Muebles", "Otros"] },
                    imageUrl: { type: "string", nullable: true },
                    isActive: { type: "boolean" },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
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
                    { name: "category", in: "query", schema: { type: "string" } },
                    { name: "isActive", in: "query", schema: { type: "boolean" } },
                ],
                responses: { "200": { description: "Lista paginada de productos" }, "401": { description: "No autenticado" } },
            },
            post: {
                tags: ["Products"], summary: "Crear producto (ADMIN)",
                requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["name", "price", "category"], properties: { name: { type: "string" }, description: { type: "string" }, price: { type: "number" }, stock: { type: "integer" }, category: { type: "string" }, image: { type: "string", format: "binary" } } } } } },
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
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["products"], properties: { products: { type: "array", items: { $ref: "#/components/schemas/Product" } } } } } } },
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
                requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { name: { type: "string" }, price: { type: "number" }, stock: { type: "integer" }, category: { type: "string" }, image: { type: "string", format: "binary" }, removeImage: { type: "boolean" } } } } } },
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
