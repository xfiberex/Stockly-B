# Stockly — Backend

API REST modular para el sistema de gestión de inventario Stockly. El frontend vive en un
repositorio hermano, `Stockly-F`, que se clona al lado de este.

Este README documenta **la API**. La documentación que cubre los dos repositorios está en
[`docs/`](docs/), porque la carpeta que los contiene no está bajo control de versiones:

| Documento | Para qué |
|---|---|
| [docs/CONTEXTO.md](docs/CONTEXTO.md) | **Empieza aquí al retomar el proyecto.** Estado, decisiones vivas y trampas del entorno ya pagadas |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Las 107 tareas con progreso y métricas. La fuente de verdad del trabajo |
| [docs/README-proyecto.md](docs/README-proyecto.md) | Arranque desde cero de los dos repositorios |
| [docs/adr/](docs/adr/) | Decisiones de arquitectura: por qué algo está hecho así, antes de simplificarlo |
| [docs/INFORME-AUDITORIA.md](docs/INFORME-AUDITORIA.md) | La auditoría del 2026-08-04. **Congelada**: describe un estado que ya no existe |
| [CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md) | Puerta de calidad y convención de commits; registro de cambios |

---

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22 + TypeScript 6 |
| Framework | Express 5 |
| ORM | Prisma 7 |
| Base de datos | PostgreSQL 16 |
| Autenticación | JWT (access 15 min) + refresh token en cookie |
| Subida de imágenes | Cloudinary + Multer |
| Correo | Nodemailer (SMTP) |
| Validación | Zod 4 |
| PDFs | PDFKit 0.18 |
| Documentación | Swagger UI (`/api/v1/docs`, desactivada en producción) |
| Tests | Jest + Supertest |
| Package manager | PNPM 11.21.0 *(fijado en `packageManager`; no usar npm ni yarn)* |

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
    │   └── env.ts              # Variables de entorno con validación manual (sin Zod)
    ├── modules/
    │   ├── auth/               # Registro, login, logout, JWT, perfil, contraseña, verificación
    │   ├── brands/             # CRUD de marcas
    │   ├── categories/         # CRUD de categorías
    │   ├── products/           # CRUD de productos, movimientos de stock, exportación CSV
    │   ├── purchase-orders/    # Órdenes de compra (PENDING → RECEIVED / CANCELLED)
    │   ├── sale-orders/        # Órdenes de venta (PENDING → SHIPPED / CANCELLED)
    │   ├── tags/               # Etiquetas de productos (many-to-many)
    │   ├── users/              # Panel admin: listar, cambiar rol, activar/desactivar
    │   ├── settings/           # Configuración de la app (key-value)
    │   ├── audit-logs/         # Registro de auditoría de acciones
    │   ├── reports/            # KPIs, métricas de rotación, exportación PDF
    │   └── suppliers/          # CRUD de proveedores
    ├── shared/
    │   ├── lib/                # Prisma, JWT, bcrypt, Cloudinary, Nodemailer, CSV, tokens
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
| `User` | Usuarios con roles `ADMIN` / `USER`, `isActive`, tokens de verificación, reset y refresh |
| `Product` | Producto con SKU, precio, stock, stock mínimo, imagen, categoría, marca, proveedor, etiquetas |
| `Category` | Categoría de producto |
| `Brand` | Marca de producto |
| `Supplier` | Proveedor |
| `Tag` | Etiqueta de producto (relación many-to-many con Product) |
| `StockMovement` | Historial de movimientos (`IN`, `OUT`, `ADJUSTMENT`, `IMPORT`) |
| `PriceHistory` | Registro automático de cambios de precio |
| `PurchaseOrder` | Orden de compra con ítems y estado |
| `PurchaseOrderItem` | Ítem de una orden de compra |
| `SaleOrder` | Orden de venta con ítems y estado |
| `SaleOrderItem` | Ítem de una orden de venta |
| `AppSetting` | Configuración clave-valor de la aplicación |
| `AuditLog` | Registro de auditoría de acciones del sistema |

---

## Configuración

```bash
cp .env.example .env
```

| Variable | Descripción | Requerida |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL | **Sí** |
| `JWT_SECRET` | Secreto para firmar JWT (mín. 32 caracteres) | **Sí** |
| `JWT_EXPIRES_IN` | Duración del access token (ej. `15m`) | **Sí** |
| `FRONTEND_URL` | URL del frontend (para CORS y correos) | **Sí** |
| `PORT` | Puerto del servidor (default `3000`) | No |
| `NODE_ENV` | `development` / `test` / `production` (default `development`) | No |
| `CLOUDINARY_CLOUD_NAME` | Cloud de Cloudinary | Solo con imágenes |
| `CLOUDINARY_API_KEY` | API Key de Cloudinary | Solo con imágenes |
| `CLOUDINARY_API_SECRET` | API Secret de Cloudinary | Solo con imágenes |
| `SMTP_HOST` | Servidor SMTP | Solo con correos |
| `SMTP_PORT` | Puerto SMTP (default `587`; `465` usa TLS implícito) | Solo con correos |
| `SMTP_USER` | Usuario SMTP | Solo con correos |
| `SMTP_PASS` | Contraseña SMTP | Solo con correos |
| `SMTP_FROM` | Dirección de envío | Solo con correos |

> **Cuatro variables bastan para arrancar.** Sin las credenciales de Cloudinary, la subida
> de imágenes responde **503** con un mensaje que dice qué falta; sin las de SMTP, ocurre
> lo mismo con el envío de correos (verificación de cuenta, reset de contraseña y alertas
> de bajo stock). El resto de la API funciona con normalidad.
>
> Los grupos son todo o nada: si defines tres de las cinco variables de SMTP, el arranque
> avisa por consola y la función queda desactivada igualmente.

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
pnpm db:backup        # Volcar la base a backups/, con retención (docs/operaciones.md)
pnpm db:restaurar     # Restaurar un volcado — por defecto en una base de ensayo

pnpm test             # Suite completa de tests
pnpm test:watch       # Modo watch
pnpm test:coverage    # Reporte de cobertura

pnpm smoke            # Arranca dist/server.js y comprueba /api/v1/health
pnpm verify           # Puerta de calidad completa (ver abajo)

pnpm contratos:generar  # Copia el contrato de la API a Stockly-F (ver abajo)
```

### El contrato de la API

`src/contratos/api.ts` es la **fuente de verdad** de la forma de las respuestas, y `Stockly-F`
consume una copia literal de ese archivo. Al cambiar la forma de una respuesta:

```bash
# 1. editar src/contratos/api.ts
pnpm contratos:generar   # 2. copiar al frontend
# 3. commitear en LOS DOS repositorios
```

Olvidarse del paso 2 pone `pnpm verify` en rojo en los dos repos, con el comando en el mensaje.
Tres tests sostienen la garantía: que los `z.enum` sean los de Prisma, que las respuestas **reales**
encajen en sus esquemas y que la copia esté al día. El porqué de copiar en vez de publicar un
paquete está en [ADR 0006](docs/adr/0006-contrato-copiado-entre-repositorios.md).

**El spec de Swagger sale de ahí también** (T4-02): `components.schemas` se genera desde el
contrato —las respuestas— y desde los `*.validator.ts` —las peticiones—, así que la documentación
no puede describir algo que el validador rechace. Cambiar un validador cambia el spec solo. Lo que
sí se sigue escribiendo a mano son las **rutas**, en `src/swagger.paths.ts`.

### `pnpm verify`

El proyecto **no usa CI**: la puerta de calidad se ejecuta en local y encadena
`prisma generate` → `prisma migrate deploy` → `check` → `test:coverage` → `build` → `smoke`.

El paso `smoke` no es redundante con `build`: `tsc` no reescribe los alias `@/`, así que un
build que compila puede seguir sin arrancar. Usa `SMOKE_PORT` (3100 por defecto) para no
chocar con el servidor de desarrollo.

Los tests corren siempre contra la base `Stockly_test`, que `jest.setup.js` deriva de
`DATABASE_URL`: nunca tocan los datos de desarrollo.

---

## Endpoints

Todas las rutas cuelgan del prefijo **`/api/v1`**. La documentación interactiva está en
`http://localhost:3000/api/v1/docs` (no se monta cuando `NODE_ENV=production`).

### Autenticación — `/api/v1/auth`

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `POST` | `/register` | Registro de usuario | — |
| `POST` | `/login` | Login → devuelve access token + refresh cookie | — |
| `POST` | `/logout` | Invalida el refresh token | — |
| `POST` | `/refresh` | Renueva el access token con la cookie | — |
| `GET` | `/me` | Perfil del usuario autenticado | JWT |
| `PUT` | `/me` | Actualizar nombre / correo | JWT |
| `PATCH` | `/me/password` | Cambiar contraseña | JWT |
| `POST` | `/verify-email` | Verificar correo con token | — |
| `POST` | `/resend-verification` | Reenviar correo de verificación | — |
| `POST` | `/forgot-password` | Solicitar reset de contraseña | — |
| `POST` | `/reset-password` | Aplicar nueva contraseña | — |

### Productos — `/api/v1/products`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar (paginado, filtros: búsqueda, categoría, tag, estado) | USER+ |
| `GET` | `/:id` | Obtener por ID | USER+ |
| `POST` | `/` | Crear producto (imagen + tags opcionales) | ADMIN |
| `PUT` | `/:id` | Actualizar producto | ADMIN |
| `DELETE` | `/:id` | Soft delete | ADMIN |
| `PATCH` | `/:id/restore` | Restaurar producto | ADMIN |
| `POST` | `/import` | Importación masiva por CSV | ADMIN |
| `GET` | `/export` | Exportar todos como JSON (default) | USER+ |
| `GET` | `/export?format=csv` | Exportar todos como CSV | USER+ |
| `PATCH` | `/bulk-stock` | Ajuste masivo de stock | ADMIN |
| `GET` | `/:id/movements` | Historial de movimientos | USER+ |
| `POST` | `/:id/movements` | Registrar movimiento manual | ADMIN |
| `GET` | `/:id/movements/export?format=csv` | Exportar movimientos como CSV | USER+ |
| `GET` | `/:id/price-history` | Historial de precios | USER+ |

### Etiquetas — `/api/v1/tags`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar etiquetas | USER+ |
| `GET` | `/:id` | Obtener etiqueta | USER+ |
| `POST` | `/` | Crear etiqueta | ADMIN |
| `PUT` | `/:id` | Actualizar etiqueta | ADMIN |
| `DELETE` | `/:id` | Eliminar etiqueta | ADMIN |

### Usuarios — `/api/v1/users`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar usuarios (paginado, filtros) | ADMIN |
| `PATCH` | `/:id/role` | Cambiar rol | ADMIN |
| `PATCH` | `/:id/activate` | Activar usuario | ADMIN |
| `PATCH` | `/:id/deactivate` | Desactivar usuario | ADMIN |

### Configuración — `/api/v1/settings`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Obtener todas las configuraciones | ADMIN |
| `PATCH` | `/` | Actualizar configuraciones en lote | ADMIN |

**Configuraciones disponibles:**

| Clave | Tipo | Default | Descripción |
|---|---|---|---|
| `lowStockAlertEnabled` | boolean | `false` | Envía correo a admins cuando el stock baja del mínimo |

### Auditoría — `/api/v1/audit-logs`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar registros (paginado, filtros) | ADMIN |

### Órdenes de venta — `/api/v1/sale-orders`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar órdenes (paginado) | USER+ |
| `POST` | `/` | Crear orden de venta | ADMIN |
| `GET` | `/:id` | Ver detalle | USER+ |
| `PATCH` | `/:id` | Actualizar (cambiar estado, campos cliente) | ADMIN |
| `DELETE` | `/:id` | Eliminar orden PENDING | ADMIN |
| `GET` | `/export?format=csv` | Exportar todas como CSV | ADMIN |

> Al cambiar el estado a `SHIPPED`, el backend descuenta el stock de cada ítem y dispara alertas de bajo stock si corresponde.

### Órdenes de compra — `/api/v1/purchase-orders`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar órdenes | USER+ |
| `POST` | `/` | Crear orden | ADMIN |
| `GET` | `/:id` | Ver detalle | USER+ |
| `PATCH` | `/:id` | Actualizar (estado, proveedor, notas) | ADMIN |
| `DELETE` | `/:id` | Eliminar orden PENDING | ADMIN |
| `GET` | `/export?format=csv` | Exportar todas como CSV | ADMIN |

### Categorías, Marcas, Proveedores

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/api/v1/categories` / `/api/v1/brands` / `/api/v1/suppliers` | USER+ |
| `POST` | `...` | ADMIN |
| `PUT` | `.../:id` | ADMIN |
| `DELETE` | `.../:id` | ADMIN |

### Reportes — `/api/v1/reports`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | KPIs, stock por categoría, top productos, movimientos por mes, bajo stock, **métricas de rotación** |
| `GET` | `/?format=pdf` | Descargar reporte completo en PDF |

---

## Tooling de IA versionado (`.agents/`, `.claude/`)

**Están en el repositorio a propósito.** No es un descuido ni un `.gitignore` que falta:
Stockly se trabaja desde varias máquinas y las skills tienen que viajar con el proyecto,
igual que el `README`. Quien clone Stockly-B se lleva el mismo tooling que quien lo escribió.

La contrapartida está medida: **104 archivos bajo `.agents/` y 9 bajo
`.claude/`, de 289 rastreados en total**. Eso ensucia dos cosas, y cada una tiene su
remedio:

| Ruido | Remedio |
|---|---|
| GitHub cuenta esos markdown como el lenguaje del proyecto | `.gitattributes` los marca `linguist-vendored` |
| Las búsquedas por texto devuelven sobre todo documentación | El alias `git buscar` de `.gitconfig-stockly` |

El alias hay que activarlo **una vez por clon**, porque vive en `.git/config`, que no se
versiona:

```bash
git config --local include.path ../.gitconfig-stockly
```

A partir de ahí:

```bash
git buscar useForm            # solo código de la aplicación
git buscar-archivos -i zod    # solo los archivos que coinciden
```

La diferencia es la que hace falta: `git grep -il z.object` devuelve **57** archivos y
`git buscar-archivos` devuelve **14**. Sin activarlo, el equivalente a mano es
`git grep X -- ':!.agents' ':!.claude'`.

## Seguridad

| Mecanismo | Detalle |
|---|---|
| Headers | `helmet` activado en todas las rutas |
| CORS | Restringido a `FRONTEND_URL` en producción |
| CSRF | Patrón double-submit: cookie `csrfToken` + cabecera `x-csrf-token` en métodos mutantes. Solo quedan exentas las siete rutas públicas de `/auth`; `logout`, `PUT /me` y `PATCH /me/password` exigen token |
| Correo | STARTTLS obligatorio (`requireTLS`); TLS implícito en el puerto 465. Un servidor sin cifrado aborta el envío en lugar de transmitir en claro |
| Rate limiting | 100 peticiones / 15 min por IP (10/15 min en login, 5/h en registro) |
| Autenticación | JWT en cookie `httpOnly` (15 min) + refresh token rotativo y hasheado |
| Roles | Middleware `requireRole("ADMIN")` en rutas de escritura |
| Contraseñas | `bcryptjs` con salt 12 |
| Integridad de stock | Ajustes con transacciones atómicas (decremento condicional, sin race conditions) |
| Soft delete | Los productos nunca se borran físicamente |
| Cuentas inactivas | `isActive: false` bloquea el login |

---

## Seed

El seed crea:

- **3 usuarios** (`admin@stockly.app`, `carlos@stockly.app` y `laura@stockly.app`)
- **6 categorías** y **8 marcas**
- **3 proveedores**
- **~30 productos** con precios, stock y stock mínimo variados
- **Movimientos de stock** de los últimos 6 meses
- **Órdenes de compra** en distintos estados
- **Historial de precios** para algunos productos

| Rol | Email | Contraseña |
|---|---|---|
| ADMIN | `admin@stockly.app` | `Admin1234!` |
| ADMIN | `carlos@stockly.app` | `Admin1234!` |
| USER | `laura@stockly.app` | `User1234!` |

> **El administrador inicial sale de aquí.** El registro público (`POST /auth/register`) crea **siempre** usuarios con rol `USER`. En un despliegue nuevo hay que ejecutar `pnpm db:seed` —o promover a alguien con `PATCH /api/v1/users/:id/role` desde una cuenta que ya sea ADMIN— porque ningún registro se convierte en administrador por sí solo.
