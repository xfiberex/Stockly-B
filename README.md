# Stockly — Backend

API REST modular para el sistema de gestión de inventario Stockly.

---

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20 + TypeScript 6 |
| Framework | Express 5 |
| ORM | Prisma 7 |
| Base de datos | PostgreSQL 16 |
| Autenticación | JWT (access 15 min) + refresh token en cookie |
| Subida de imágenes | Cloudinary + Multer |
| Correo | Nodemailer (SMTP) |
| Validación | Zod 4 |
| Documentación | Swagger UI (`/api-docs`) |
| Tests | Jest + Supertest |
| Package manager | PNPM 11+ |

---

## Estructura

```
Stockly-B/
├── prisma/
│   ├── schema.prisma           # Modelos de la base de datos
│   ├── seed.ts                 # Datos iniciales (productos, usuarios, movimientos)
│   └── migrations/             # Historial de migraciones
├── prisma.config.ts            # Configuración Prisma 7 (URL dinámica)
└── src/
    ├── config/
    │   └── env.ts              # Variables de entorno validadas con Zod
    ├── modules/
    │   ├── auth/               # Registro, login, logout, JWT, perfil, contraseña, verificación
    │   ├── brands/             # CRUD de marcas
    │   ├── categories/         # CRUD de categorías
    │   ├── products/           # CRUD de productos, movimientos de stock, importación CSV
    │   ├── purchase-orders/    # Órdenes de compra (PENDING → RECEIVED / CANCELLED)
    │   ├── reports/            # KPIs y datos agregados para dashboards
    │   └── suppliers/          # CRUD de proveedores
    ├── shared/
    │   ├── lib/                # Prisma, JWT, bcrypt, Cloudinary, Nodemailer, tokens
    │   └── middlewares/        # auth, validate, error, upload, rateLimiter
    ├── routes/
    │   └── index.ts            # Montaje central de todos los módulos
    ├── tests/                  # Tests de integración por módulo
    ├── app.ts                  # Express: middlewares globales + rutas
    ├── server.ts               # Arranque del servidor
    └── swagger.ts              # Definición OpenAPI
```

### Modelos Prisma

| Modelo | Descripción |
|---|---|
| `User` | Usuarios con roles `ADMIN` / `USER`, tokens de verificación, reset y refresh |
| `Product` | Producto con SKU, precio, stock, stock mínimo, imagen, categoría, marca, proveedor |
| `Category` | Categoría de producto |
| `Brand` | Marca de producto |
| `Supplier` | Proveedor |
| `StockMovement` | Historial de movimientos (`IN`, `OUT`, `ADJUSTMENT`, `IMPORT`) |
| `PriceHistory` | Registro automático de cambios de precio |
| `PurchaseOrder` | Orden de compra con ítems y estado |
| `PurchaseOrderItem` | Ítem de una orden de compra |

---

## Configuración

```bash
cp .env.example .env
```

| Variable | Descripción | Requerida |
|---|---|---|
| `PORT` | Puerto del servidor (default `3000`) | No |
| `NODE_ENV` | `development` / `production` | Sí |
| `DATABASE_URL` | Cadena de conexión PostgreSQL | Sí |
| `JWT_SECRET` | Secreto para firmar JWT (mín. 32 caracteres) | Sí |
| `JWT_EXPIRES_IN` | Duración del access token (ej. `15m`) | Sí |
| `CLOUDINARY_CLOUD_NAME` | Cloud de Cloudinary | Solo con imágenes |
| `CLOUDINARY_API_KEY` | API Key de Cloudinary | Solo con imágenes |
| `CLOUDINARY_API_SECRET` | API Secret de Cloudinary | Solo con imágenes |
| `SMTP_HOST` | Servidor SMTP | Solo con correos |
| `SMTP_PORT` | Puerto SMTP | Solo con correos |
| `SMTP_USER` | Usuario SMTP | Solo con correos |
| `SMTP_PASS` | Contraseña SMTP | Solo con correos |
| `SMTP_FROM` | Dirección de envío | Solo con correos |
| `FRONTEND_URL` | URL del frontend (para CORS y correos) | Sí |

> Cloudinary y SMTP son opcionales en desarrollo; el resto de la API funciona sin ellos.

---

## Comandos

```bash
pnpm dev              # Servidor con hot-reload (nodemon)
pnpm build            # Compilar TypeScript → dist/
pnpm start            # Ejecutar build de producción
pnpm check            # Type-check sin emitir

pnpm db:migrate       # Ejecutar migraciones pendientes
pnpm db:seed          # Poblar la base de datos con datos de ejemplo
pnpm db:reset         # Resetear DB y re-ejecutar migraciones + seed
pnpm db:studio        # Abrir Prisma Studio en el navegador

pnpm test             # Suite completa de tests
pnpm test:watch       # Modo watch
pnpm test:coverage    # Reporte de cobertura
```

---

## Endpoints

La documentación interactiva completa está en `http://localhost:3000/api-docs`.

### Autenticación — `/api/auth`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `POST` | `/register` | Registro de usuario | — |
| `POST` | `/login` | Login → devuelve access token + refresh cookie | — |
| `POST` | `/logout` | Invalida el refresh token | — |
| `POST` | `/refresh` | Renueva el access token con la cookie | — |
| `GET` | `/me` | Perfil del usuario autenticado | JWT |
| `PUT` | `/me` | Actualizar nombre / correo | JWT |
| `PUT` | `/me/password` | Cambiar contraseña | JWT |
| `POST` | `/verify-email` | Verificar correo con token | — |
| `POST` | `/resend-verification` | Reenviar correo de verificación | — |
| `POST` | `/forgot-password` | Solicitar reset de contraseña | — |
| `POST` | `/reset-password` | Aplicar nueva contraseña | — |

### Productos — `/api/products`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar (paginado, filtros, búsqueda) | USER+ |
| `GET` | `/:id` | Obtener por ID | USER+ |
| `POST` | `/` | Crear producto (imagen opcional) | ADMIN |
| `PUT` | `/:id` | Actualizar producto | ADMIN |
| `DELETE` | `/:id` | Soft delete | ADMIN |
| `PATCH` | `/:id/restore` | Restaurar producto | ADMIN |
| `POST` | `/import` | Importación masiva por CSV | ADMIN |
| `GET` | `/:id/movements` | Historial de movimientos | USER+ |
| `POST` | `/:id/movements` | Registrar movimiento manual | ADMIN |

### Categorías, Marcas, Proveedores

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/api/categories` / `/api/brands` / `/api/suppliers` | USER+ |
| `POST` | `...` | ADMIN |
| `PUT` | `.../:id` | ADMIN |
| `DELETE` | `.../:id` | ADMIN |

### Órdenes de compra — `/api/purchase-orders`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar órdenes | USER+ |
| `POST` | `/` | Crear orden | ADMIN |
| `GET` | `/:id` | Ver detalle | USER+ |
| `PATCH` | `/:id/receive` | Marcar como recibida (actualiza stock) | ADMIN |
| `PATCH` | `/:id/cancel` | Cancelar orden | ADMIN |
| `DELETE` | `/:id` | Eliminar orden PENDING | ADMIN |

### Reportes — `/api/reports`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | KPIs, stock por categoría, top productos, movimientos por mes, alertas de bajo stock |

---

## Seguridad

| Mecanismo | Detalle |
|---|---|
| Headers | `helmet` activado en todas las rutas |
| CORS | Restringido a `FRONTEND_URL` en producción |
| Rate limiting | 100 peticiones / 15 min por IP |
| Autenticación | JWT en header `Authorization: Bearer` |
| Roles | Middleware `requireRole("ADMIN")` en rutas de escritura |
| Contraseñas | `bcryptjs` con salt 12 |
| Soft delete | Los productos nunca se borran físicamente |

---

## Seed

El seed crea:

- **2 usuarios** (`admin@stockly.app` / `laura@stockly.app`)
- **6 categorías** y **8 marcas**
- **3 proveedores**
- **~30 productos** con precios, stock y stock mínimo variados
- **Movimientos de stock** de los últimos 6 meses
- **Órdenes de compra** en distintos estados
- **Historial de precios** para algunos productos

| Rol | Email | Contraseña |
|---|---|---|
| ADMIN | `admin@stockly.app` | `Admin1234!` |
| USER | `laura@stockly.app` | `User1234!` |
