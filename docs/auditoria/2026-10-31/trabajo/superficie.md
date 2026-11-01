# Inventario de la superficie · datos recogidos
Encargo: puntos de entrada de Stockly-B y rutas de Stockly-F, 2026-10-31
Modelo: claude-haiku-5-5 (Haiku 5.5)

Convención de rutas: `Stockly-B/src/...` y `Stockly-F/src/...` se abrevian como `src/...` (backend) y como `Stockly-F/src/...` (frontend) cuando hace falta.

## Resultados

### Montaje y prefijos

| Montaje | Router | archivo:línea |
|---|---|---|
| `/api/v1` | `router` (raíz) | `src/app.ts:84` (`app.use("/api/v1", router)`) |
| `/auth` | `authRouter` | `src/routes/index.ts:108` |
| `/products` | `productRouter` | `src/routes/index.ts:109` |
| `/categories` | `categoriesRouter` | `src/routes/index.ts:110` |
| `/brands` | `brandsRouter` | `src/routes/index.ts:111` |
| `/suppliers` | `suppliersRouter` | `src/routes/index.ts:112` |
| `/purchase-orders` | `purchaseOrdersRouter` | `src/routes/index.ts:113` |
| `/customers` | `customersRouter` | `src/routes/index.ts:114` |
| `/sale-orders` | `saleOrdersRouter` | `src/routes/index.ts:115` |
| `/inventory-counts` | `inventoryCountsRouter` | `src/routes/index.ts:116` |
| `/warehouses` | `warehousesRouter` | `src/routes/index.ts:117` |
| `/stock-transfers` | `stockTransfersRouter` | `src/routes/index.ts:118` |
| `/reports` | `reportsRouter` | `src/routes/index.ts:119` |
| `/tags` | `tagsRouter` | `src/routes/index.ts:120` |
| `/users` | `usersRouter` | `src/routes/index.ts:121` |
| `/settings` | `settingsRouter` | `src/routes/index.ts:122` |
| `/audit-logs` | `auditLogsRouter` | `src/routes/index.ts:123` |
| `/notifications` | `notificationsRouter` | `src/routes/index.ts:124` |

Notas de montaje:
- Los montajes se hacen con un bucle `for (const [prefijo, modulo] of MONTAJES) router.use(prefijo, modulo);` (`src/routes/index.ts:127`). El array `MONTAJES` es un literal estático en `src/routes/index.ts:107-125`, así que los prefijos se han resuelto a mano desde ese literal.
- `/health`, `/ready` y `/metrics` se declaran directamente sobre `router` en `src/routes/index.ts:34`, `:48` y `:73`, por lo que su ruta completa es `/api/v1/health`, `/api/v1/ready` y `/api/v1/metrics`.
- Swagger se monta con `app.use("/api/v1/docs", ...)` en `src/swagger.ts:250-257`, solo si `env.nodeEnv !== "production"` (`src/app.ts:86-88`).

### Middlewares globales

| # | Qué monta | archivo:línea | Condición visible | Tipo |
|---|---|---|---|---|
| 1 | `helmet()` | `src/app.ts:21` | ninguna | middleware global |
| 2 | `cors({ origin: env.frontendUrl, credentials: true })` | `src/app.ts:23-26` | ninguna | middleware global |
| 3 | `pinoHttp({...})` (log de peticiones) | `src/app.ts:31-45` | ninguna | middleware global |
| 4 | `metricas` (métricas y 5xx) | `src/app.ts:52` | ninguna | middleware global |
| 5 | `express.json({ limit: "5mb" })` solo para `/api/v1/products/import` | `src/app.ts:66` | ruta `/api/v1/products/import` | middleware global |
| 6 | `express.json({ limit: "100kb" })` | `src/app.ts:67` | ninguna | middleware global |
| 7 | `express.urlencoded({ extended: true, limit: "100kb" })` | `src/app.ts:68` | ninguna | middleware global |
| 8 | `cookieParser()` | `src/app.ts:69` | ninguna | middleware global |
| 9 | `crearLimitadorGlobal(env.rateLimitMax)` (limitador global) | `src/app.ts:77-79` | solo si `env.nodeEnv !== "test"` | middleware global |
| 10 | `csrfProtection` (double-submit) | `src/app.ts:82` | ninguna (aplica a todo lo montado después) | middleware global |
| 11 | `notFoundHandler` (404) | `src/app.ts:92` | ninguna | middleware global |
| 12 | `errorHandler` (manejador de errores) | `src/app.ts:94` | ninguna | middleware global |
| 13 | `registerSwagger(app)` (Swagger UI en `/api/v1/docs`) | `src/app.ts:86-88` y `src/swagger.ts:249-258` | solo si `env.nodeEnv !== "production"` | middleware global |

Montaje de `router` en `/api/v1` (`src/app.ts:84`) no se cuenta como middleware global.

Notas:
- El orden es el de `src/app.ts`: el `notFoundHandler` (`:92`) va después de Swagger (`:86-88`) y de `router` (`:84`), y antes de `errorHandler` (`:94`).
- `src/app.ts:78` monta el limitador global, pero no hay límite visible para `/api/v1/notifications/unread-count` en el propio `app.ts`: ese tiene su limitador en el router de notificaciones (ver tabla HTTP).

### Rutas HTTP

Recuento: 112 declaraciones de método (`router.get/post/put/patch/delete`) más 1 montaje de Swagger (`app.use`), total 113 filas. El orden es alfabético por ruta de archivo; `src/routes/index.ts` y `src/swagger.ts` van al final.

Filas con `(router)`: cuando un archivo tiene `router.use(...)` antes de sus rutas, la protección se anota en cada fila afectada. Ese `router.use` se lista una vez por archivo debajo de la tabla.

| ID | Tipo | Método y ruta completa | archivo:línea | Protección visible en la declaración | En PERMISOS |
|---|---|---|---|---|---|
| E-001 | HTTP GET | `GET /api/v1/audit-logs` | `src/modules/audit-logs/audit-logs.routes.ts:8` | (router) requireAuth, permitir("GET /audit-logs") | sí |
| E-002 | HTTP POST | `POST /api/v1/auth/register` | `src/modules/auth/auth.routes.ts:19` | authRegisterLimiter, validate(registerSchema) | sin permitir |
| E-003 | HTTP POST | `POST /api/v1/auth/verify-email` | `src/modules/auth/auth.routes.ts:20` | validate(verifyEmailSchema) | sin permitir |
| E-004 | HTTP POST | `POST /api/v1/auth/resend-verification` | `src/modules/auth/auth.routes.ts:21` | authRegisterLimiter, validate(emailSchema) | sin permitir |
| E-005 | HTTP POST | `POST /api/v1/auth/login` | `src/modules/auth/auth.routes.ts:22` | authStrictLimiter, validate(loginSchema) | sin permitir |
| E-006 | HTTP POST | `POST /api/v1/auth/logout` | `src/modules/auth/auth.routes.ts:23` | ninguna | sin permitir |
| E-007 | HTTP GET | `GET /api/v1/auth/me` | `src/modules/auth/auth.routes.ts:24` | requireAuth | sin permitir |
| E-008 | HTTP POST | `POST /api/v1/auth/refresh` | `src/modules/auth/auth.routes.ts:25` | ninguna | sin permitir |
| E-009 | HTTP POST | `POST /api/v1/auth/forgot-password` | `src/modules/auth/auth.routes.ts:26` | authStrictLimiter, validate(emailSchema) | sin permitir |
| E-010 | HTTP POST | `POST /api/v1/auth/reset-password` | `src/modules/auth/auth.routes.ts:27` | authStrictLimiter, validate(resetPasswordSchema) | sin permitir |
| E-011 | HTTP PUT | `PUT /api/v1/auth/me` | `src/modules/auth/auth.routes.ts:28` | requireAuth, validate(updateProfileSchema) | sin permitir |
| E-012 | HTTP PATCH | `PATCH /api/v1/auth/me/password` | `src/modules/auth/auth.routes.ts:29` | requireAuth, validate(updatePasswordSchema) | sin permitir |
| E-013 | HTTP PATCH | `PATCH /api/v1/auth/me/idioma` | `src/modules/auth/auth.routes.ts:32` | requireAuth, validate(idiomaSchema) | sin permitir |
| E-014 | HTTP GET | `GET /api/v1/brands` | `src/modules/brands/brands.routes.ts:11` | (router) requireAuth, permitir("GET /brands") | sí |
| E-015 | HTTP GET | `GET /api/v1/brands/:id` | `src/modules/brands/brands.routes.ts:12` | (router) requireAuth, permitir("GET /brands/:id") | sí |
| E-016 | HTTP POST | `POST /api/v1/brands` | `src/modules/brands/brands.routes.ts:13` | (router) requireAuth, permitir("POST /brands"), validate(createBrandSchema) | sí |
| E-017 | HTTP PUT | `PUT /api/v1/brands/:id` | `src/modules/brands/brands.routes.ts:14` | (router) requireAuth, permitir("PUT /brands/:id"), validate(updateBrandSchema) | sí |
| E-018 | HTTP DELETE | `DELETE /api/v1/brands/:id` | `src/modules/brands/brands.routes.ts:15` | (router) requireAuth, permitir("DELETE /brands/:id") | sí |
| E-019 | HTTP GET | `GET /api/v1/categories` | `src/modules/categories/categories.routes.ts:11` | (router) requireAuth, permitir("GET /categories") | sí |
| E-020 | HTTP GET | `GET /api/v1/categories/:id` | `src/modules/categories/categories.routes.ts:12` | (router) requireAuth, permitir("GET /categories/:id") | sí |
| E-021 | HTTP POST | `POST /api/v1/categories` | `src/modules/categories/categories.routes.ts:13` | (router) requireAuth, permitir("POST /categories"), validate(createCategorySchema) | sí |
| E-022 | HTTP PUT | `PUT /api/v1/categories/:id` | `src/modules/categories/categories.routes.ts:14` | (router) requireAuth, permitir("PUT /categories/:id"), validate(updateCategorySchema) | sí |
| E-023 | HTTP DELETE | `DELETE /api/v1/categories/:id` | `src/modules/categories/categories.routes.ts:15` | (router) requireAuth, permitir("DELETE /categories/:id") | sí |
| E-024 | HTTP GET | `GET /api/v1/customers` | `src/modules/customers/customers.routes.ts:11` | (router) requireAuth, permitir("GET /customers") | sí |
| E-025 | HTTP GET | `GET /api/v1/customers/:id` | `src/modules/customers/customers.routes.ts:12` | (router) requireAuth, permitir("GET /customers/:id") | sí |
| E-026 | HTTP POST | `POST /api/v1/customers` | `src/modules/customers/customers.routes.ts:13` | (router) requireAuth, permitir("POST /customers"), validate(createCustomerSchema) | sí |
| E-027 | HTTP PUT | `PUT /api/v1/customers/:id` | `src/modules/customers/customers.routes.ts:14` | (router) requireAuth, permitir("PUT /customers/:id"), validate(updateCustomerSchema) | sí |
| E-028 | HTTP DELETE | `DELETE /api/v1/customers/:id` | `src/modules/customers/customers.routes.ts:15` | (router) requireAuth, permitir("DELETE /customers/:id") | sí |
| E-029 | HTTP GET | `GET /api/v1/inventory-counts` | `src/modules/inventory-counts/inventory-counts.routes.ts:11` | (router) requireAuth, permitir("GET /inventory-counts") | sí |
| E-030 | HTTP POST | `POST /api/v1/inventory-counts` | `src/modules/inventory-counts/inventory-counts.routes.ts:12` | (router) requireAuth, permitir("POST /inventory-counts"), validate(createInventoryCountSchema) | sí |
| E-031 | HTTP GET | `GET /api/v1/inventory-counts/:id` | `src/modules/inventory-counts/inventory-counts.routes.ts:13` | (router) requireAuth, permitir("GET /inventory-counts/:id") | sí |
| E-032 | HTTP GET | `GET /api/v1/inventory-counts/:id/lines` | `src/modules/inventory-counts/inventory-counts.routes.ts:14` | (router) requireAuth, permitir("GET /inventory-counts/:id/lines") | sí |
| E-033 | HTTP PATCH | `PATCH /api/v1/inventory-counts/:id/lines` | `src/modules/inventory-counts/inventory-counts.routes.ts:15` | (router) requireAuth, permitir("PATCH /inventory-counts/:id/lines"), validate(recordInventoryCountLinesSchema) | sí |
| E-034 | HTTP POST | `POST /api/v1/inventory-counts/:id/close` | `src/modules/inventory-counts/inventory-counts.routes.ts:16` | (router) requireAuth, permitir("POST /inventory-counts/:id/close") | sí |
| E-035 | HTTP POST | `POST /api/v1/inventory-counts/:id/cancel` | `src/modules/inventory-counts/inventory-counts.routes.ts:17` | (router) requireAuth, permitir("POST /inventory-counts/:id/cancel") | sí |
| E-036 | HTTP GET | `GET /api/v1/notifications` | `src/modules/notifications/notifications.routes.ts:16` | (router) requireAuth, permitir("GET /notifications") | sí |
| E-037 | HTTP GET | `GET /api/v1/notifications/unread-count` | `src/modules/notifications/notifications.routes.ts:17` | (router) crearLimitadorDeSondeo(env.rateLimitMax) solo en `/unread-count` (`:12`), (router) requireAuth, permitir("GET /notifications/unread-count") | sí |
| E-038 | HTTP POST | `POST /api/v1/notifications/read-all` | `src/modules/notifications/notifications.routes.ts:19` | (router) requireAuth, permitir("POST /notifications/read-all") | sí |
| E-039 | HTTP POST | `POST /api/v1/notifications/:id/read` | `src/modules/notifications/notifications.routes.ts:20` | (router) requireAuth, permitir("POST /notifications/:id/read") | sí |
| E-040 | HTTP GET | `GET /api/v1/products` | `src/modules/products/product.routes.ts:19` | (router) requireAuth, permitir("GET /products") | sí |
| E-041 | HTTP GET | `GET /api/v1/products/export` | `src/modules/products/product.routes.ts:20` | (router) requireAuth, permitir("GET /products/export") | sí |
| E-042 | HTTP GET | `GET /api/v1/products/lookup` | `src/modules/products/product.routes.ts:22` | (router) requireAuth, permitir("GET /products/lookup") | sí |
| E-043 | HTTP GET | `GET /api/v1/products/labels` | `src/modules/products/product.routes.ts:23` | (router) requireAuth, permitir("GET /products/labels") | sí |
| E-044 | HTTP GET | `GET /api/v1/products/:id` | `src/modules/products/product.routes.ts:24` | (router) requireAuth, permitir("GET /products/:id") | sí |
| E-045 | HTTP GET | `GET /api/v1/products/:id/movements` | `src/modules/products/product.routes.ts:25` | (router) requireAuth, permitir("GET /products/:id/movements") | sí |
| E-046 | HTTP GET | `GET /api/v1/products/:id/movements/export` | `src/modules/products/product.routes.ts:26` | (router) requireAuth, permitir("GET /products/:id/movements/export") | sí |
| E-047 | HTTP GET | `GET /api/v1/products/:id/price-history` | `src/modules/products/product.routes.ts:27` | (router) requireAuth, permitir("GET /products/:id/price-history") | sí |
| E-048 | HTTP GET | `GET /api/v1/products/:id/cost-history` | `src/modules/products/product.routes.ts:28` | (router) requireAuth, permitir("GET /products/:id/cost-history") | sí |
| E-049 | HTTP GET | `GET /api/v1/products/:id/lots` | `src/modules/products/product.routes.ts:30` | (router) requireAuth, permitir("GET /products/:id/lots") | sí |
| E-050 | HTTP POST | `POST /api/v1/products/import` | `src/modules/products/product.routes.ts:33` | (router) requireAuth, permitir("POST /products/import"), validate(importProductsSchema). Además, parser JSON de 5mb en `src/app.ts:66` | sí |
| E-051 | HTTP POST | `POST /api/v1/products` | `src/modules/products/product.routes.ts:36` | (router) requireAuth, permitir("POST /products"), upload.single("image"), verificarFirmaDeImagen, validate(createProductSchema) | sí |
| E-052 | HTTP PUT | `PUT /api/v1/products/:id` | `src/modules/products/product.routes.ts:37` | (router) requireAuth, permitir("PUT /products/:id"), upload.single("image"), verificarFirmaDeImagen, validate(updateProductSchema) | sí |
| E-053 | HTTP DELETE | `DELETE /api/v1/products/:id` | `src/modules/products/product.routes.ts:38` | (router) requireAuth, permitir("DELETE /products/:id") | sí |
| E-054 | HTTP PATCH | `PATCH /api/v1/products/:id/restore` | `src/modules/products/product.routes.ts:39` | (router) requireAuth, permitir("PATCH /products/:id/restore") | sí |
| E-055 | HTTP POST | `POST /api/v1/products/:id/movements` | `src/modules/products/product.routes.ts:40` | (router) requireAuth, permitir("POST /products/:id/movements"), validate(createManualMovementSchema) | sí |
| E-056 | HTTP PATCH | `PATCH /api/v1/products/bulk-stock` | `src/modules/products/product.routes.ts:41` | (router) requireAuth, permitir("PATCH /products/bulk-stock"), validate(bulkStockSchema) | sí |
| E-057 | HTTP GET | `GET /api/v1/purchase-orders` | `src/modules/purchase-orders/purchase-orders.routes.ts:16` | (router) requireAuth, permitir("GET /purchase-orders") | sí |
| E-058 | HTTP GET | `GET /api/v1/purchase-orders/export` | `src/modules/purchase-orders/purchase-orders.routes.ts:17` | (router) requireAuth, permitir("GET /purchase-orders/export") | sí |
| E-059 | HTTP GET | `GET /api/v1/purchase-orders/suggestions` | `src/modules/purchase-orders/purchase-orders.routes.ts:19` | (router) requireAuth, permitir("GET /purchase-orders/suggestions") | sí |
| E-060 | HTTP POST | `POST /api/v1/purchase-orders/suggestions` | `src/modules/purchase-orders/purchase-orders.routes.ts:20` | (router) requireAuth, permitir("POST /purchase-orders/suggestions"), validate(generarDesdeSugerenciasSchema) | sí |
| E-061 | HTTP GET | `GET /api/v1/purchase-orders/:id` | `src/modules/purchase-orders/purchase-orders.routes.ts:21` | (router) requireAuth, permitir("GET /purchase-orders/:id") | sí |
| E-062 | HTTP POST | `POST /api/v1/purchase-orders` | `src/modules/purchase-orders/purchase-orders.routes.ts:22` | (router) requireAuth, permitir("POST /purchase-orders"), validate(createPurchaseOrderSchema) | sí |
| E-063 | HTTP POST | `POST /api/v1/purchase-orders/:id/receipts` | `src/modules/purchase-orders/purchase-orders.routes.ts:23` | (router) requireAuth, permitir("POST /purchase-orders/:id/receipts"), validate(receivePurchaseOrderSchema) | sí |
| E-064 | HTTP PATCH | `PATCH /api/v1/purchase-orders/:id` | `src/modules/purchase-orders/purchase-orders.routes.ts:24` | (router) requireAuth, permitir("PATCH /purchase-orders/:id"), validate(updatePurchaseOrderSchema) | sí |
| E-065 | HTTP DELETE | `DELETE /api/v1/purchase-orders/:id` | `src/modules/purchase-orders/purchase-orders.routes.ts:25` | (router) requireAuth, permitir("DELETE /purchase-orders/:id") | sí |
| E-066 | HTTP GET | `GET /api/v1/reports` | `src/modules/reports/index.ts:8` | (router) requireAuth, permitir("GET /reports") | sí |
| E-067 | HTTP GET | `GET /api/v1/reports/period` | `src/modules/reports/index.ts:9` | (router) requireAuth, permitir("GET /reports/period") | sí |
| E-068 | HTTP GET | `GET /api/v1/reports/abc` | `src/modules/reports/index.ts:10` | (router) requireAuth, permitir("GET /reports/abc") | sí |
| E-069 | HTTP GET | `GET /api/v1/reports/expiring` | `src/modules/reports/index.ts:11` | (router) requireAuth, permitir("GET /reports/expiring") | sí |
| E-070 | HTTP GET | `GET /api/v1/sale-orders` | `src/modules/sale-orders/sale-orders.routes.ts:11` | (router) requireAuth, permitir("GET /sale-orders") | sí |
| E-071 | HTTP GET | `GET /api/v1/sale-orders/export` | `src/modules/sale-orders/sale-orders.routes.ts:12` | (router) requireAuth, permitir("GET /sale-orders/export") | sí |
| E-072 | HTTP GET | `GET /api/v1/sale-orders/:id` | `src/modules/sale-orders/sale-orders.routes.ts:13` | (router) requireAuth, permitir("GET /sale-orders/:id") | sí |
| E-073 | HTTP GET | `GET /api/v1/sale-orders/:id/receipt` | `src/modules/sale-orders/sale-orders.routes.ts:15` | (router) requireAuth, permitir("GET /sale-orders/:id/receipt") | sí |
| E-074 | HTTP POST | `POST /api/v1/sale-orders` | `src/modules/sale-orders/sale-orders.routes.ts:16` | (router) requireAuth, permitir("POST /sale-orders"), validate(createSaleOrderSchema) | sí |
| E-075 | HTTP POST | `POST /api/v1/sale-orders/counter` | `src/modules/sale-orders/sale-orders.routes.ts:19` | (router) requireAuth, permitir("POST /sale-orders/counter"), validate(counterSaleSchema) | sí |
| E-076 | HTTP POST | `POST /api/v1/sale-orders/:id/ship` | `src/modules/sale-orders/sale-orders.routes.ts:23` | (router) requireAuth, permitir("POST /sale-orders/:id/ship") | sí |
| E-077 | HTTP PATCH | `PATCH /api/v1/sale-orders/:id` | `src/modules/sale-orders/sale-orders.routes.ts:24` | (router) requireAuth, permitir("PATCH /sale-orders/:id"), validate(updateSaleOrderSchema) | sí |
| E-078 | HTTP DELETE | `DELETE /api/v1/sale-orders/:id` | `src/modules/sale-orders/sale-orders.routes.ts:25` | (router) requireAuth, permitir("DELETE /sale-orders/:id") | sí |
| E-079 | HTTP GET | `GET /api/v1/settings` | `src/modules/settings/settings.routes.ts:12` | (router) requireAuth, permitir("GET /settings") | sí |
| E-080 | HTTP PATCH | `PATCH /api/v1/settings` | `src/modules/settings/settings.routes.ts:13` | (router) requireAuth, permitir("PATCH /settings"), validate(updateSettingsSchema) | sí |
| E-081 | HTTP GET | `GET /api/v1/settings/business` | `src/modules/settings/settings.routes.ts:16` | (router) requireAuth, permitir("GET /settings/business") | sí |
| E-082 | HTTP PUT | `PUT /api/v1/settings/logo` | `src/modules/settings/settings.routes.ts:17` | (router) requireAuth, permitir("PUT /settings/logo"), upload.single("logo"), verificarFirmaDeImagen | sí |
| E-083 | HTTP DELETE | `DELETE /api/v1/settings/logo` | `src/modules/settings/settings.routes.ts:18` | (router) requireAuth, permitir("DELETE /settings/logo") | sí |
| E-084 | HTTP GET | `GET /api/v1/stock-transfers` | `src/modules/stock-transfers/stock-transfers.routes.ts:11` | (router) requireAuth, permitir("GET /stock-transfers") | sí |
| E-085 | HTTP GET | `GET /api/v1/stock-transfers/:id` | `src/modules/stock-transfers/stock-transfers.routes.ts:12` | (router) requireAuth, permitir("GET /stock-transfers/:id") | sí |
| E-086 | HTTP POST | `POST /api/v1/stock-transfers` | `src/modules/stock-transfers/stock-transfers.routes.ts:13` | (router) requireAuth, permitir("POST /stock-transfers"), validate(createStockTransferSchema) | sí |
| E-087 | HTTP GET | `GET /api/v1/suppliers` | `src/modules/suppliers/suppliers.routes.ts:11` | (router) requireAuth, permitir("GET /suppliers") | sí |
| E-088 | HTTP GET | `GET /api/v1/suppliers/:id` | `src/modules/suppliers/suppliers.routes.ts:12` | (router) requireAuth, permitir("GET /suppliers/:id") | sí |
| E-089 | HTTP POST | `POST /api/v1/suppliers` | `src/modules/suppliers/suppliers.routes.ts:13` | (router) requireAuth, permitir("POST /suppliers"), validate(createSupplierSchema) | sí |
| E-090 | HTTP PUT | `PUT /api/v1/suppliers/:id` | `src/modules/suppliers/suppliers.routes.ts:14` | (router) requireAuth, permitir("PUT /suppliers/:id"), validate(updateSupplierSchema) | sí |
| E-091 | HTTP DELETE | `DELETE /api/v1/suppliers/:id` | `src/modules/suppliers/suppliers.routes.ts:15` | (router) requireAuth, permitir("DELETE /suppliers/:id") | sí |
| E-092 | HTTP GET | `GET /api/v1/tags` | `src/modules/tags/tags.routes.ts:11` | (router) requireAuth, permitir("GET /tags") | sí |
| E-093 | HTTP GET | `GET /api/v1/tags/:id` | `src/modules/tags/tags.routes.ts:12` | (router) requireAuth, permitir("GET /tags/:id") | sí |
| E-094 | HTTP POST | `POST /api/v1/tags` | `src/modules/tags/tags.routes.ts:13` | (router) requireAuth, permitir("POST /tags"), validate(createTagSchema) | sí |
| E-095 | HTTP PUT | `PUT /api/v1/tags/:id` | `src/modules/tags/tags.routes.ts:14` | (router) requireAuth, permitir("PUT /tags/:id"), validate(updateTagSchema) | sí |
| E-096 | HTTP DELETE | `DELETE /api/v1/tags/:id` | `src/modules/tags/tags.routes.ts:15` | (router) requireAuth, permitir("DELETE /tags/:id") | sí |
| E-097 | HTTP GET | `GET /api/v1/users` | `src/modules/users/users.routes.ts:13` | (router) requireAuth, permitir("GET /users") | sí |
| E-098 | HTTP POST | `POST /api/v1/users` | `src/modules/users/users.routes.ts:15` | (router) requireAuth, permitir("POST /users"), validate(invitarUsuarioSchema) | sí |
| E-099 | HTTP GET | `GET /api/v1/users/:id` | `src/modules/users/users.routes.ts:16` | (router) requireAuth, permitir("GET /users/:id") | sí |
| E-100 | HTTP PATCH | `PATCH /api/v1/users/:id/role` | `src/modules/users/users.routes.ts:17-24` | (router) requireAuth, permitir("PATCH /users/:id/role"), validate(z.object({ role: rolSchema })) | sí |
| E-101 | HTTP PATCH | `PATCH /api/v1/users/:id/activate` | `src/modules/users/users.routes.ts:25` | (router) requireAuth, permitir("PATCH /users/:id/activate") | sí |
| E-102 | HTTP PATCH | `PATCH /api/v1/users/:id/deactivate` | `src/modules/users/users.routes.ts:26` | (router) requireAuth, permitir("PATCH /users/:id/deactivate") | sí |
| E-103 | HTTP GET | `GET /api/v1/warehouses` | `src/modules/warehouses/warehouses.routes.ts:11` | (router) requireAuth, permitir("GET /warehouses") | sí |
| E-104 | HTTP GET | `GET /api/v1/warehouses/summary` | `src/modules/warehouses/warehouses.routes.ts:12` | (router) requireAuth, permitir("GET /warehouses/summary") | sí |
| E-105 | HTTP POST | `POST /api/v1/warehouses` | `src/modules/warehouses/warehouses.routes.ts:13` | (router) requireAuth, permitir("POST /warehouses"), validate(createWarehouseSchema) | sí |
| E-106 | HTTP PUT | `PUT /api/v1/warehouses/:id` | `src/modules/warehouses/warehouses.routes.ts:14` | (router) requireAuth, permitir("PUT /warehouses/:id"), validate(updateWarehouseSchema) | sí |
| E-107 | HTTP PATCH | `PATCH /api/v1/warehouses/:id/default` | `src/modules/warehouses/warehouses.routes.ts:15` | (router) requireAuth, permitir("PATCH /warehouses/:id/default") | sí |
| E-108 | HTTP PATCH | `PATCH /api/v1/warehouses/:id/activate` | `src/modules/warehouses/warehouses.routes.ts:16` | (router) requireAuth, permitir("PATCH /warehouses/:id/activate") | sí |
| E-109 | HTTP PATCH | `PATCH /api/v1/warehouses/:id/deactivate` | `src/modules/warehouses/warehouses.routes.ts:17` | (router) requireAuth, permitir("PATCH /warehouses/:id/deactivate") | sí |
| E-110 | HTTP GET | `GET /api/v1/health` | `src/routes/index.ts:34` | ninguna | sin permitir |
| E-111 | HTTP GET | `GET /api/v1/ready` | `src/routes/index.ts:48` | ninguna | sin permitir |
| E-112 | HTTP GET | `GET /api/v1/metrics` | `src/routes/index.ts:73` | ninguna en la declaración. El manejador comprueba `Authorization: Bearer` contra `env.metricsToken` (`:76-95`) y, en producción sin token, llama a `next()` (`:80`) | sin permitir |
| E-113 | HTTP USE (Swagger) | `/api/v1/docs` (`swaggerUi.serve` + `setup`) | `src/swagger.ts:250-257` (montaje condicional en `src/app.ts:86-88`) | ninguna en la declaración; solo se monta si `env.nodeEnv !== "production"` | sin permitir |

Módulos con `router.use(...)` antes de sus rutas (anotados una vez por archivo, ya aplicados en la columna de protección):
- `src/modules/audit-logs/audit-logs.routes.ts:7`: `use(requireAuth)`.
- `src/modules/brands/brands.routes.ts:9`: `use(requireAuth)`.
- `src/modules/categories/categories.routes.ts:9`: `use(requireAuth)`.
- `src/modules/customers/customers.routes.ts:9`: `use(requireAuth)`.
- `src/modules/inventory-counts/inventory-counts.routes.ts:9`: `use(requireAuth)`.
- `src/modules/notifications/notifications.routes.ts:12`: `use("/unread-count", crearLimitadorDeSondeo(env.rateLimitMax))`, solo para `/unread-count`.
- `src/modules/notifications/notifications.routes.ts:14`: `use(requireAuth)`.
- `src/modules/products/product.routes.ts:16`: `use(requireAuth)`.
- `src/modules/purchase-orders/purchase-orders.routes.ts:14`: `use(requireAuth)`.
- `src/modules/reports/index.ts:7`: `use(requireAuth)`.
- `src/modules/sale-orders/sale-orders.routes.ts:9`: `use(requireAuth)`.
- `src/modules/settings/settings.routes.ts:10`: `use(requireAuth)`.
- `src/modules/stock-transfers/stock-transfers.routes.ts:9`: `use(requireAuth)`.
- `src/modules/suppliers/suppliers.routes.ts:9`: `use(requireAuth)`.
- `src/modules/tags/tags.routes.ts:9`: `use(requireAuth)`.
- `src/modules/users/users.routes.ts:11`: `use(requireAuth)`.
- `src/modules/warehouses/warehouses.routes.ts:9`: `use(requireAuth)`.
- `src/modules/auth/auth.routes.ts`: sin `router.use`. Su protección es por ruta.

### Entradas sin usuario

| Tipo | Ubicación | Cómo se dispara |
|---|---|---|
| comando | `src/cli/resumen-semanal.ts:41` (`ejecutar`) y `:53-57` (bloque `if (require.main === module)`) | `pnpm resumen:enviar` (`package.json:19`: `tsx src/cli/resumen-semanal.ts`). En producción, `node dist/cli/resumen-semanal.js` según el comentario de `src/cli/resumen-semanal.ts:4`. El comentario `:6-8` dice que se programa desde fuera (cron, programador de tareas). Solo se ejecuta al invocar el archivo: importarlo no envía nada. |
| arranque (no es comando de usuario) | `src/server.ts:7-28` | `dev` (`package.json:7`: `nodemon src/server.ts`) y `start` (`package.json:11`: `node dist/server.js`). Arranca el servidor y conecta con Prisma. |
| tarea (no es temporizador) | `src/modules/notifications/notifications.service.ts:181-191` (`mantenerSiToca`) | Se invoca desde `GET /api/v1/notifications/unread-count` en `src/modules/notifications/notifications.controller.ts:18`. Lo dispara una petición HTTP, no un temporizador. |

Búsquedas de temporizadores y tareas (`setInterval|setTimeout|cron|schedule|mantenerSiToca`, sin `tests/` ni `generated/`):
- `setInterval`, `setTimeout` y `schedule`: 0 coincidencias.
- `cron`: 1 coincidencia, solo en comentario: `src/cli/resumen-semanal.ts:6`.
- `mantenerSiToca`: 2 coincidencias (`src/modules/notifications/notifications.service.ts:181` y `src/modules/notifications/notifications.controller.ts:18`).

Búsqueda de webhooks o callbacks (`-i "webhook|callback|notify"`, sin `tests/` ni `generated/`): 0 coincidencias en código. Las coincidencias de `callback` en `shared/` no aparecieron en la búsqueda.

### Matriz PERMISOS

Ubicación de la tabla: `src/contratos/api.ts:66-183` (`export const PERMISOS = {...} as const satisfies Record<...>`).

Grupos definidos en `src/contratos/api.ts`:

| Grupo | Roles que contiene | archivo:línea |
|---|---|---|
| `TODOS` | `ADMIN`, `USER`, `WAREHOUSE`, `SELLER` | `src/contratos/api.ts:38` |
| `SOLO_ADMIN` | `ADMIN` | `src/contratos/api.ts:39` |
| `ALMACEN` | `ADMIN`, `WAREHOUSE` | `src/contratos/api.ts:40` |
| `MOSTRADOR` | `ADMIN`, `SELLER` | `src/contratos/api.ts:42` |

Roles existentes (enum `rolSchema`): `ADMIN`, `USER`, `WAREHOUSE`, `SELLER` (`src/contratos/api.ts:34`).

| Clave ("MÉTODO /ruta") | Roles o grupo | archivo:línea |
|---|---|---|
| "GET /products" | TODOS | `src/contratos/api.ts:68` |
| "GET /products/export" | TODOS | `src/contratos/api.ts:69` |
| "GET /products/lookup" | TODOS | `src/contratos/api.ts:71` |
| "GET /products/labels" | TODOS | `src/contratos/api.ts:72` |
| "GET /products/:id" | TODOS | `src/contratos/api.ts:73` |
| "GET /products/:id/movements" | TODOS | `src/contratos/api.ts:74` |
| "GET /products/:id/movements/export" | TODOS | `src/contratos/api.ts:75` |
| "GET /products/:id/price-history" | TODOS | `src/contratos/api.ts:76` |
| "GET /products/:id/cost-history" | TODOS | `src/contratos/api.ts:77` |
| "GET /products/:id/lots" | TODOS | `src/contratos/api.ts:79` |
| "POST /products/import" | SOLO_ADMIN | `src/contratos/api.ts:80` |
| "POST /products" | SOLO_ADMIN | `src/contratos/api.ts:81` |
| "PUT /products/:id" | SOLO_ADMIN | `src/contratos/api.ts:82` |
| "DELETE /products/:id" | SOLO_ADMIN | `src/contratos/api.ts:83` |
| "PATCH /products/:id/restore" | SOLO_ADMIN | `src/contratos/api.ts:84` |
| "POST /products/:id/movements" | ALMACEN | `src/contratos/api.ts:85` |
| "PATCH /products/bulk-stock" | ALMACEN | `src/contratos/api.ts:86` |
| "GET /categories" | TODOS | `src/contratos/api.ts:88` |
| "GET /categories/:id" | TODOS | `src/contratos/api.ts:89` |
| "POST /categories" | SOLO_ADMIN | `src/contratos/api.ts:90` |
| "PUT /categories/:id" | SOLO_ADMIN | `src/contratos/api.ts:91` |
| "DELETE /categories/:id" | SOLO_ADMIN | `src/contratos/api.ts:92` |
| "GET /brands" | TODOS | `src/contratos/api.ts:93` |
| "GET /brands/:id" | TODOS | `src/contratos/api.ts:94` |
| "POST /brands" | SOLO_ADMIN | `src/contratos/api.ts:95` |
| "PUT /brands/:id" | SOLO_ADMIN | `src/contratos/api.ts:96` |
| "DELETE /brands/:id" | SOLO_ADMIN | `src/contratos/api.ts:97` |
| "GET /suppliers" | TODOS | `src/contratos/api.ts:98` |
| "GET /suppliers/:id" | TODOS | `src/contratos/api.ts:99` |
| "POST /suppliers" | SOLO_ADMIN | `src/contratos/api.ts:100` |
| "PUT /suppliers/:id" | SOLO_ADMIN | `src/contratos/api.ts:101` |
| "DELETE /suppliers/:id" | SOLO_ADMIN | `src/contratos/api.ts:102` |
| "GET /tags" | TODOS | `src/contratos/api.ts:103` |
| "GET /tags/:id" | TODOS | `src/contratos/api.ts:104` |
| "POST /tags" | SOLO_ADMIN | `src/contratos/api.ts:105` |
| "PUT /tags/:id" | SOLO_ADMIN | `src/contratos/api.ts:106` |
| "DELETE /tags/:id" | SOLO_ADMIN | `src/contratos/api.ts:107` |
| "GET /purchase-orders" | TODOS | `src/contratos/api.ts:109` |
| "GET /purchase-orders/export" | SOLO_ADMIN | `src/contratos/api.ts:110` |
| "GET /purchase-orders/suggestions" | TODOS | `src/contratos/api.ts:111` |
| "POST /purchase-orders/suggestions" | SOLO_ADMIN | `src/contratos/api.ts:112` |
| "GET /purchase-orders/:id" | TODOS | `src/contratos/api.ts:113` |
| "POST /purchase-orders" | SOLO_ADMIN | `src/contratos/api.ts:114` |
| "POST /purchase-orders/:id/receipts" | ALMACEN | `src/contratos/api.ts:115` |
| "PATCH /purchase-orders/:id" | SOLO_ADMIN | `src/contratos/api.ts:116` |
| "DELETE /purchase-orders/:id" | SOLO_ADMIN | `src/contratos/api.ts:117` |
| "GET /customers" | TODOS | `src/contratos/api.ts:119` |
| "GET /customers/:id" | TODOS | `src/contratos/api.ts:120` |
| "POST /customers" | SOLO_ADMIN | `src/contratos/api.ts:121` |
| "PUT /customers/:id" | SOLO_ADMIN | `src/contratos/api.ts:122` |
| "DELETE /customers/:id" | SOLO_ADMIN | `src/contratos/api.ts:123` |
| "GET /sale-orders" | TODOS | `src/contratos/api.ts:125` |
| "GET /sale-orders/export" | SOLO_ADMIN | `src/contratos/api.ts:126` |
| "GET /sale-orders/:id" | TODOS | `src/contratos/api.ts:127` |
| "GET /sale-orders/:id/receipt" | TODOS | `src/contratos/api.ts:129` |
| "POST /sale-orders" | SOLO_ADMIN | `src/contratos/api.ts:130` |
| "POST /sale-orders/counter" | MOSTRADOR | `src/contratos/api.ts:132` |
| "POST /sale-orders/:id/ship" | ALMACEN | `src/contratos/api.ts:133` |
| "PATCH /sale-orders/:id" | SOLO_ADMIN | `src/contratos/api.ts:134` |
| "DELETE /sale-orders/:id" | SOLO_ADMIN | `src/contratos/api.ts:135` |
| "GET /inventory-counts" | TODOS | `src/contratos/api.ts:137` |
| "POST /inventory-counts" | ALMACEN | `src/contratos/api.ts:138` |
| "GET /inventory-counts/:id" | TODOS | `src/contratos/api.ts:139` |
| "GET /inventory-counts/:id/lines" | TODOS | `src/contratos/api.ts:140` |
| "PATCH /inventory-counts/:id/lines" | ALMACEN | `src/contratos/api.ts:141` |
| "POST /inventory-counts/:id/close" | ALMACEN | `src/contratos/api.ts:142` |
| "POST /inventory-counts/:id/cancel" | ALMACEN | `src/contratos/api.ts:143` |
| "GET /warehouses" | TODOS | `src/contratos/api.ts:146` |
| "GET /warehouses/summary" | TODOS | `src/contratos/api.ts:147` |
| "POST /warehouses" | SOLO_ADMIN | `src/contratos/api.ts:148` |
| "PUT /warehouses/:id" | SOLO_ADMIN | `src/contratos/api.ts:149` |
| "PATCH /warehouses/:id/default" | SOLO_ADMIN | `src/contratos/api.ts:150` |
| "PATCH /warehouses/:id/activate" | SOLO_ADMIN | `src/contratos/api.ts:151` |
| "PATCH /warehouses/:id/deactivate" | SOLO_ADMIN | `src/contratos/api.ts:152` |
| "GET /stock-transfers" | TODOS | `src/contratos/api.ts:154` |
| "GET /stock-transfers/:id" | TODOS | `src/contratos/api.ts:155` |
| "POST /stock-transfers" | ALMACEN | `src/contratos/api.ts:156` |
| "GET /reports" | TODOS | `src/contratos/api.ts:158` |
| "GET /reports/period" | TODOS | `src/contratos/api.ts:159` |
| "GET /reports/abc" | TODOS | `src/contratos/api.ts:160` |
| "GET /reports/expiring" | TODOS | `src/contratos/api.ts:162` |
| "GET /users" | SOLO_ADMIN | `src/contratos/api.ts:164` |
| "POST /users" | SOLO_ADMIN | `src/contratos/api.ts:165` |
| "GET /users/:id" | SOLO_ADMIN | `src/contratos/api.ts:166` |
| "PATCH /users/:id/role" | SOLO_ADMIN | `src/contratos/api.ts:167` |
| "PATCH /users/:id/activate" | SOLO_ADMIN | `src/contratos/api.ts:168` |
| "PATCH /users/:id/deactivate" | SOLO_ADMIN | `src/contratos/api.ts:169` |
| "GET /settings" | SOLO_ADMIN | `src/contratos/api.ts:170` |
| "PATCH /settings" | SOLO_ADMIN | `src/contratos/api.ts:171` |
| "GET /settings/business" | TODOS | `src/contratos/api.ts:174` |
| "PUT /settings/logo" | SOLO_ADMIN | `src/contratos/api.ts:175` |
| "DELETE /settings/logo" | SOLO_ADMIN | `src/contratos/api.ts:176` |
| "GET /audit-logs" | SOLO_ADMIN | `src/contratos/api.ts:177` |
| "GET /notifications" | TODOS | `src/contratos/api.ts:179` |
| "GET /notifications/unread-count" | TODOS | `src/contratos/api.ts:180` |
| "POST /notifications/read-all" | TODOS | `src/contratos/api.ts:181` |
| "POST /notifications/:id/read" | TODOS | `src/contratos/api.ts:182` |

Total de filas en `PERMISOS`: 97.

Cruce mecánico (comando: extraer `permitir("…")` de `src/modules/**` sin `tests/` y comparar con las claves de `src/contratos/api.ts:66-183`):
- Claves distintas usadas en `permitir(...)`: 97.
- Claves en `PERMISOS`: 97.
- Usadas y no en `PERMISOS`: 0.
- En `PERMISOS` y no usadas por ninguna ruta: 0.

Columna «En PERMISOS» de la tabla HTTP: «sí» para las 97 rutas con `permitir(...)`; «sin permitir» para las 16 rutas sin `permitir` (12 de `/auth`, 3 de infraestructura, 1 de Swagger).

### Rutas del frontend

Fuente: `Stockly-F/src/routes/index.tsx` (único archivo de rutas en `Stockly-F/src/`). `ProtectedRoute` está definido en `Stockly-F/src/shared/components/ProtectedRoute.tsx:25-51`; se usa en `Stockly-F/src/routes/index.tsx` en las líneas 72, 84, 87, 102, 103 y 107.

El padre `/` (`Stockly-F/src/routes/index.tsx:70-75`) envuelve todo el bloque con `<ProtectedRoute>` sin parámetros, que exige sesión. Las rutas hijas que no declaran guardia propia heredan esa guardia de sesión.

| Ruta de la SPA | Componente | Guardia declarada (requireRole / requirePermiso / ninguna) | archivo:línea |
|---|---|---|---|
| `/auth/login` | LoginPage | ninguna | `Stockly-F/src/routes/index.tsx:59` |
| `/auth/register` | RegisterPage | ninguna | `Stockly-F/src/routes/index.tsx:60` |
| `/auth/forgot-password` | ForgotPasswordPage | ninguna | `Stockly-F/src/routes/index.tsx:61` |
| `/auth/reset-password` | ResetPasswordPage | ninguna | `Stockly-F/src/routes/index.tsx:62` |
| `/auth/confirm-account` | VerifyEmailPage | ninguna | `Stockly-F/src/routes/index.tsx:63` |
| `/auth/resend-verification` | ResendVerificationPage | ninguna | `Stockly-F/src/routes/index.tsx:64` |
| `/auth` (index) | Navigate a `/auth/login` | ninguna | `Stockly-F/src/routes/index.tsx:65` |
| `/` (index) | DashboardPage | ninguna propia; hereda sesión (`ProtectedRoute` del padre) | `Stockly-F/src/routes/index.tsx:77` |
| `/profile` | ProfilePage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:78` |
| `/reports` | ReportsPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:79` |
| `/reports/period` | InformePorPeriodoPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:81` |
| `/purchase-orders` | PurchaseOrdersPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:82` |
| `/purchase-orders/suggestions` | SugerenciasReposicionPage | requireRole="ADMIN" (más sesión heredada) | `Stockly-F/src/routes/index.tsx:84` |
| `/sale-orders` | SaleOrdersPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:85` |
| `/counter` | MostradorPage | requirePermiso="POST /sale-orders/counter" (más sesión heredada) | `Stockly-F/src/routes/index.tsx:87` |
| `/customers` | CustomersPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:89` |
| `/customers/:id` | CustomerDetailPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:90` |
| `/inventory-counts` | InventoryCountsPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:92` |
| `/inventory-counts/:id` | InventoryCountPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:93` |
| `/warehouses` | WarehousesPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:96` |
| `/stock-transfers` | TransfersPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:97` |
| `/expiry` | CaducidadesPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:99` |
| `/audit-logs` | AuditLogsPage | requireRole="ADMIN" (más sesión heredada) | `Stockly-F/src/routes/index.tsx:102` |
| `/settings` | SettingsPage | requireRole="ADMIN" (más sesión heredada) | `Stockly-F/src/routes/index.tsx:103` |
| `/admin/users` | UsersPage | requireRole="ADMIN" (más sesión heredada) | `Stockly-F/src/routes/index.tsx:107` |
| `/catalog` (layout) | CatalogPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:112` |
| `/catalog` (index) | Navigate a `/catalog/products` | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:114` |
| `/catalog/products` | ProductsPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:115` |
| `/catalog/products/:id/movements` | StockMovementsPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:116` |
| `/catalog/categories` | CategoriesPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:117` |
| `/catalog/brands` | BrandsPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:118` |
| `/catalog/suppliers` | SuppliersPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:119` |
| `/catalog/tags` | TagsPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:120` |
| `/*` bajo `/` | NotFoundPage | ninguna propia; hereda sesión | `Stockly-F/src/routes/index.tsx:123` |
| `/*` (global) | NotFoundPage | ninguna | `Stockly-F/src/routes/index.tsx:127-128` |

### Totales

Entradas de backend:

| Tipo | Total | Detalle |
|---|---|---|
| middleware global | 13 | 12 en `src/app.ts` (`:21, :23, :31, :52, :66, :67, :68, :69, :78, :82, :92, :94`) + Swagger (`src/swagger.ts:250`). Condicionales: `:78` (no `test`) y Swagger (no `production`). |
| montaje de router | 18 | `src/app.ts:84` (`/api/v1`) + 17 en `src/routes/index.ts:108-124` (bucle en `:127`). No se cuentan como middleware global. |
| `router.use` en módulos | 17 | 16 `use(requireAuth)` + 1 `use("/unread-count", limitador)` en `src/modules/notifications/notifications.routes.ts:12`. |
| HTTP GET | 50 | Incluye `/health`, `/ready` y `/metrics`. |
| HTTP POST | 30 | |
| HTTP PUT | 9 | |
| HTTP PATCH | 14 | |
| HTTP DELETE | 9 | |
| HTTP total (declaraciones de método) | 112 | 50 + 30 + 9 + 14 + 9. Más 1 montaje `app.use` de Swagger, que es 113 filas en la tabla. |
| comando | 1 | `src/cli/resumen-semanal.ts` (vía `resumen:enviar`, `package.json:19`). |
| tarea | 0 temporizadores | 1 función de mantenimiento disparada por petición: `mantenerSiToca`, `src/modules/notifications/notifications.service.ts:181`. |
| webhook | 0 | |

Entradas de frontend:

| Tipo | Total |
|---|---|
| Rutas de la SPA (entradas en `createBrowserRouter`) | 35 |
| Con guardia de rol explícita (`requireRole`) | 4 (`/purchase-orders/suggestions`, `/audit-logs`, `/settings`, `/admin/users`) |
| Con guardia por permiso (`requirePermiso`) | 1 (`/counter`) |
| Bajo `/` (heredan la guardia de sesión de `ProtectedRoute`) | 27 |
| Públicas (`/auth/*`, `/auth` index, `/*` global) | 8 |

## No se pudo completar

- No se revisaron los internos de `csrfProtection`, `crearLimitadorGlobal`, `crearLimitadorDeSondeo`, `authStrictLimiter`, `authRegisterLimiter`, `requireAuth`, `permitir`, `upload.single`, `verificarFirmaDeImagen` ni `validate`. Solo se anotó que aparecen en la declaración. No se ha valorado si la protección es correcta, porque el encargo no lo pide.
- Los prefijos de montaje se han resuelto desde el literal `MONTAJES` (`src/routes/index.ts:107-125`) y no por ejecución: el bucle `for ... router.use(prefijo, modulo)` (`:127`) no es dinámico, pero el literal sí es la única fuente de prefijos.
- `scripts/` (`auditoria.js`, `backup.js`, `generar-contratos.js`, `podar-produccion.js`, `postgres.js`, `restaurar.js`, `smoke.js`, `load/*.js`) y `prisma/` están fuera de `src/`. Se comprobó con una búsqueda que ninguno de estos archivos contiene `src/` ni `@/` (sin coincidencias). No se han leído en detalle. Los scripts `db:*`, `smoke`, `auditoria`, `carga:*` y `contratos:generar` de `package.json` no se consideran entradas de `src/`.
- Scripts `dev` y `start` de `package.json` (arranque de `src/server.ts`): anotados como arranque, no como comando de usuario. No se han ejecutado.
- Frontend: `Stockly-F/src/App.tsx` no declara rutas ni guardias (solo se usó `ProtectedRoute` como componente). No se hizo comprobación de `git status` en `Stockly-F`; solo en `Stockly-B`.
- Carpetas excluidas por encargo: `src/tests/`, `src/generated/`, `node_modules/`, `dist/`, `coverage/`, `.agents/`, `.claude/`, `docs/`. Las búsquedas de rutas se hicieron con esa exclusión, pero la primera búsqueda con `glob` no la aplicó y se repitió con `--glob '!tests/**'`.
- Búsqueda de `\.(get|post|put|patch|delete|all|use)\(`: se acotó a `*.routes.ts`, `routes/index.ts`, `reports/index.ts`, `app.ts` y `swagger.ts`. Los demás resultados son llamadas a servicios (`Map.get`, `Promise.all`, etc.) y no declaran rutas.
- No se ejecutó ningún comando del proyecto. La comparación de claves es un cruce de texto (grep/sed/comm) sobre el código, no una prueba de runtime.
- Los archivos generados y el seed (`prisma/`) no se revisaron (no se espera que expongan rutas).
- Verificación de estado (guardia antes/después) en `Stockly-B`: antes de escribir, `git status --porcelain` mostró `?? docs/auditoria/`. Después de escribir el archivo de salida se repite el comando; ver la respuesta final.
