# Stockly — Backend

[![verify](https://github.com/xfiberex/Stockly-B/actions/workflows/verify.yml/badge.svg)](https://github.com/xfiberex/Stockly-B/actions/workflows/verify.yml)

API REST modular para el sistema de gestión de inventario Stockly. El frontend vive en un
repositorio hermano, `Stockly-F`, que se clona al lado de este.

Este README documenta **la API**. La documentación que cubre los dos repositorios está en
[`docs/`](docs/), porque la carpeta que los contiene no está bajo control de versiones:

| Documento | Para qué |
|---|---|
| [docs/CONTEXTO.md](docs/CONTEXTO.md) | **Empieza aquí al retomar el proyecto.** Estado, decisiones vivas y trampas del entorno ya pagadas |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Las 129 tareas con progreso y métricas. La fuente de verdad del trabajo |
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
| Base de datos | PostgreSQL 17 |
| Autenticación | JWT (access 15 min) + refresh token en cookie |
| Subida de imágenes | Cloudinary + Multer |
| Correo | Nodemailer (SMTP) |
| Validación | Zod 4 |
| PDFs | PDFKit 0.18 |
| Documentación | Swagger UI (`/api/v1/docs`, desactivada en producción) |
| Tests | Jest + Supertest |
| Package manager | PNPM 12.4.1 *(fijado en `packageManager`; no usar npm ni yarn)* |

---

## Estructura

```
Stockly-B/
├── .github/workflows/
│   └── verify.yml              # CI: `pnpm verify` en cada push a main y pull request (ADR 0008)
├── load/                       # Prueba de carga: `Stockly_carga`, EXPLAIN y k6 (fuera de verify)
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
    │   ├── products/           # CRUD de productos, movimientos de stock, exportación CSV,
    │   │                       # búsqueda por código y etiquetas con código de barras (T5-08)
    │   ├── purchase-orders/    # Órdenes de compra, recepción parcial y sugerencias de reposición
    │   ├── sale-orders/        # Órdenes de venta (PENDING → SHIPPED / CANCELLED)
    │   ├── inventory-counts/   # Conteo físico: sesiones, captura, cierre con ajustes (T5-07)
    │   ├── tags/               # Etiquetas de productos (many-to-many)
    │   ├── users/              # Panel admin: listar, cambiar rol, activar/desactivar
    │   ├── settings/           # Configuración de la app (key-value, catálogo tipado)
    │   ├── audit-logs/         # Registro de auditoría de acciones
    │   ├── reports/            # KPIs, rotación, margen, informe por periodo; CSV y PDF
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
| `User` | Usuarios con roles `ADMIN` / `USER` / `WAREHOUSE` (T5-13), `isActive`, tokens de verificación, reset y refresh |
| `Product` | Producto con SKU, código de barras (T5-08), precio, stock, stock mínimo, imagen, categoría, marca, proveedor, etiquetas |
| `Category` | Categoría de producto |
| `Brand` | Marca de producto |
| `Supplier` | Proveedor, con plazo de entrega en días (`leadTimeDays`, opcional) |
| `Tag` | Etiqueta de producto (relación many-to-many con Product) |
| `StockMovement` | Historial de movimientos (`IN`, `OUT`, `ADJUSTMENT`, `IMPORT`). Las entradas de una recepción apuntan a su línea de compra (`purchaseOrderItemId`), que es lo que las fecha |
| `PriceHistory` | Registro automático de cambios de precio |
| `CostHistory` | Cada cambio del coste medio ponderado, con su origen (recepción o manual) |
| `PurchaseOrder` | Orden de compra con ítems y estado (`PENDING`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`) |
| `PurchaseOrderItem` | Ítem de una orden de compra, con lo recibido hasta ahora (`receivedQuantity`) |
| `SaleOrder` | Orden de venta con ítems, estado y fecha de envío (`shippedAt`) |
| `SaleOrderItem` | Ítem de una orden de venta, con el coste congelado al enviarse (`unitCost`) |
| `AppSetting` | Configuración clave-valor de la aplicación |
| `InventoryCount` / `InventoryCountLine` | Conteo físico (T5-07): la sesión y, por producto, lo contado, lo que esperaba el sistema al contarlo y lo que se ajustó al cerrar |
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
| `METRICS_TOKEN` | Token de `GET /api/v1/metrics`. **Sin él, en producción el endpoint responde 404** | Solo con métricas |
| `ALERTA_5XX_HABILITADA` | Alerta por pico de 5xx (default `true`; en `test`, `false`) | No |
| `ALERTA_5XX_UMBRAL` | Errores que disparan el aviso (default `5`) | No |
| `ALERTA_5XX_VENTANA_MIN` | Ventana deslizante en minutos (default `5`) | No |
| `ALERTA_5XX_ENFRIAMIENTO_MIN` | Silencio tras un aviso, en minutos (default `30`) | No |

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

La puerta de calidad se ejecuta en local antes de cada push, y GitHub Actions la repite en cada
push y pull request ([ADR 0008](docs/adr/0008-integracion-continua.md)). Encadena
`prisma generate` → `prisma migrate deploy` → `check` → `test:coverage` → `build` → `smoke` → `auditoria`.

El paso `smoke` no es redundante con `build`: `tsc` no reescribe los alias `@/`, así que un
build que compila puede seguir sin arrancar. Usa `SMOKE_PORT` (3100 por defecto) para no
chocar con el servidor de desarrollo.

Los tests corren siempre contra la base `Stockly_test`, que `jest.setup.js` deriva de
`DATABASE_URL`: nunca tocan los datos de desarrollo. `verify` solo migra la base de `DATABASE_URL`,
así que **tras añadir una migración hay que llevarla también a `Stockly_test`**. En la CI se hace
en cada ejecución (la base nace vacía); en local, una vez, apuntando `DATABASE_URL` a
`Stockly_test` y ejecutando `pnpm exec prisma db push` —en este equipo la base de tests se
mantiene así y no con `migrate deploy`—. El entorno de los tests (SMTP y Cloudinary falsos) lo
define `jest.setup.js`, no el `.env` de quien los ejecuta.

---

## Integración continua

Un workflow, [`.github/workflows/verify.yml`](.github/workflows/verify.yml), con un job que
ejecuta **la misma puerta que en local**, no otra ([ADR 0008](docs/adr/0008-integracion-continua.md)).

| | |
|---|---|
| **Cuándo** | Cada push a `main`, cada pull request y a mano (`workflow_dispatch`). Un push nuevo cancela la ejecución en curso de la misma rama |
| **Dónde** | `ubuntu-latest`, Node 22 (el de la imagen de producción) y pnpm leído de `packageManager` |
| **Base de datos** | Un servicio `postgres:17-alpine`, la versión del compose. El job crea `Stockly_test` y la migra antes de `verify` |
| **Entorno** | Las cuatro variables imprescindibles, con valores de prueba: la base es desechable y el `JWT_SECRET` solo firma tokens de tests |
| **Qué ejecuta** | `pnpm install --frozen-lockfile` y `pnpm verify` tal cual: `check`, tests con cobertura, `build`, `smoke` y `auditoria` |
| **Tiempo máximo** | 20 minutos |

**Endurecido porque el repositorio es público:**

- `permissions: contents: read` y `persist-credentials: false`: el job no puede escribir en el
  repositorio.
- `pull_request` y **nunca** `pull_request_target`: el código de un fork no corre con secretos. El
  workflow tampoco usa ninguno.
- **Acciones fijadas por SHA**, con la versión en un comentario: una etiqueta se puede mover, un
  commit no. No se actualizan solas: para subir una, se resuelve la etiqueta nueva con
  `gh api repos/<acción>/commits/<etiqueta> --jq .sha` y se cambia el SHA y el comentario.

**Si falla en la CI y no en local**, casi siempre es algo que el portátil pone y la CI no: un
`.env`, una base ya migrada, el repositorio hermano al lado. La primera ejecución destapó dos de
esos (el SMTP y el Cloudinary reales del `.env`, y el `VITE_API_URL` del frontend).

### Orden de subida: primero el backend, en verde; después el frontend

La CI del frontend **no usa una versión fija del backend: clona el `main` de `Stockly-B` tal como
esté en ese momento**, tanto para comprobar la copia del contrato como para arrancar la API en el
E2E. Si el frontend se sube antes que el backend del que depende —un endpoint nuevo, una
migración, un cambio de contrato—, o con el `main` del backend en rojo, **la CI del frontend
falla aunque su código esté bien**.

1. `pnpm verify` en local en los dos repositorios.
2. **Push de `Stockly-B`** y esperar a que su workflow termine **en verde**:
   `gh run watch` (o `gh run list --workflow verify.yml -L 1`) desde `Stockly-B`, o la pestaña
   *Actions* en GitHub.
3. **Solo entonces, push de `Stockly-F`.**

Si el cambio es solo del frontend, el paso 2 se reduce a comprobar que la última ejecución del
backend está en verde. Si la del frontend falló por haberlo subido antes, no hace falta otro
commit: con el backend ya en verde, se relanza desde *Actions* (*Re-run all jobs*) o con
`gh run rerun <id>`.

---

## Endpoints

Todas las rutas cuelgan del prefijo **`/api/v1`**. La documentación interactiva está en
`http://localhost:3000/api/v1/docs` (no se monta cuando `NODE_ENV=production`).

**Ningún listado se devuelve entero.** Todos aceptan `page` y `limit` —con techo de 100— y
responden `{ data, meta }`, donde `meta` trae `total`, `page`, `limit` y `totalPages`. Sus
filtros se aplican **en la base**, nunca en el cliente. La última excepción era el histórico de
un producto, y costó caro: con 100 000 movimientos hundía la API entera (T4-15, medido en
[docs/rendimiento.md](docs/rendimiento.md)).

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
| `GET` | `/lookup?code=` | Buscar por código de barras o SKU **exacto** (T5-08). 404 si no es de nadie | USER+ |
| `GET` | `/labels?ids=&format=&copies=` | Etiquetas en PDF con código de barras (T5-08): `sheet` (A4, 3 × 8) o `label` (50 × 25 mm) | USER+ |
| `POST` | `/` | Crear producto (imagen + tags opcionales) | ADMIN |
| `PUT` | `/:id` | Actualizar producto | ADMIN |
| `DELETE` | `/:id` | Soft delete | ADMIN |
| `PATCH` | `/:id/restore` | Restaurar producto | ADMIN |
| `POST` | `/import` | Importación masiva por CSV | ADMIN |
| `GET` | `/export` | Exportar todos como JSON (default) | USER+ |
| `GET` | `/export?format=csv` | Exportar todos como CSV | USER+ |
| `PATCH` | `/bulk-stock` | Ajuste masivo de stock | ADMIN, WAREHOUSE |
| `GET` | `/:id/movements` | Historial de movimientos — **paginado** (`page`, `limit`) y filtrable (`type`, `dateFrom`, `dateTo`) | USER+ |
| `POST` | `/:id/movements` | Registrar movimiento manual | ADMIN, WAREHOUSE |
| `GET` | `/:id/movements/export?format=csv` | Exportar movimientos como CSV — acepta los **mismos filtros** que el listado | USER+ |
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
| `defaultLeadTimeDays` | number | `7` | Plazo que usan las sugerencias de reposición para un proveedor sin plazo propio (entero, 0–365) (T5-05) |
| `timezone` | string | `America/Santo_Domingo` | Zona horaria IANA del negocio: dónde empiezan y terminan los días y los meses de los informes (T5-09) |

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
| `POST` | `/:id/ship` | Enviar: descuenta el stock y fija `shippedAt` (T5-13) | ADMIN, WAREHOUSE |
| `PATCH` | `/:id` | Actualizar (cambiar estado, campos cliente) | ADMIN |
| `DELETE` | `/:id` | Eliminar orden PENDING | ADMIN |
| `GET` | `/export?format=csv` | Exportar todas como CSV | ADMIN |

> Al cambiar el estado a `SHIPPED`, el backend descuenta el stock de cada ítem y dispara alertas de bajo stock si corresponde.

### Conteos físicos — `/api/v1/inventory-counts` (T5-07)

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar sesiones con sus cifras (paginado, `?status=`) | USER+ |
| `POST` | `/` | Abrir: una línea por producto activo de `categoryId` o del catálogo | ADMIN, WAREHOUSE |
| `GET` | `/:id` | Una sesión: contados, diferencias en unidades y valor a coste | USER+ |
| `GET` | `/:id/lines` | Líneas paginadas (`?filter=pending\|counted\|difference`, `?search=`) | USER+ |
| `PATCH` | `/:id/lines` | Anotar lo contado; guarda también el stock esperado **en ese momento** | ADMIN, WAREHOUSE |
| `POST` | `/:id/close` | Cerrar: un `ADJUSTMENT` de `contado − esperado` por diferencia, en una transacción | ADMIN, WAREHOUSE |
| `POST` | `/:id/cancel` | Cancelar sin mover nada | ADMIN, WAREHOUSE |

> Un producto no puede estar en dos conteos abiertos, y un cierre que dejaría un producto en negativo no se aplica: hay que volver a contarlo.

### Órdenes de compra — `/api/v1/purchase-orders`

| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| `GET` | `/` | Listar órdenes | USER+ |
| `POST` | `/` | Crear orden | ADMIN |
| `GET` | `/:id` | Ver detalle | USER+ |
| `PATCH` | `/:id` | Actualizar (estado, proveedor, notas) | ADMIN |
| `DELETE` | `/:id` | Eliminar orden PENDING | ADMIN |
| `POST` | `/:id/receipts` | Registrar una entrega, parcial o completa, por línea (T5-04) | ADMIN, WAREHOUSE |
| `GET` | `/suggestions` | Sugerencias de reposición, paginadas (T5-05) | USER+ |
| `POST` | `/suggestions` | Generar una orden pendiente por proveedor con las líneas elegidas (T5-05) | ADMIN |
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
| `GET` | `/period` | Ventas enviadas y compras recibidas de un periodo: totales, por mes, por categoría y por producto (T5-09). `preset=this-month\|last-month\|this-quarter\|this-year`, o `from` y `to` (`AAAA-MM-DD`, incluidos, máximo 60 meses); sin nada, este mes. En la zona horaria del ajuste `timezone` |
| `GET` | `/period?format=csv` | Desglose por producto completo, en CSV |
| `GET` | `/period?format=pdf` | El informe del periodo en PDF |

### Operación — sin prefijo de módulo

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| `GET` | `/health` | Vivacidad: responde 200 mientras el proceso viva, aunque la base esté caída | No |
| `GET` | `/ready` | Disponibilidad: `SELECT 1` contra la base; **503** si falla (T2-25) | No |
| `GET` | `/metrics` | Métricas en formato Prometheus (T4-06). Ver [operaciones.md §8](docs/operaciones.md) | `METRICS_TOKEN` |

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
| Roles | `ADMIN`, `USER` (solo lectura) y `WAREHOUSE` (recibe, envía y mueve stock; T5-13). Cada ruta se protege con `permitir("<MÉTODO> <ruta>")`, que lee su fila de la matriz `PERMISOS` del contrato; `permisos.test.ts` recorre todas las rutas contra ella con cada rol. El 403 lleva el código `FORBIDDEN` |
| Contraseñas | `bcryptjs` con salt 12 |
| Integridad de stock | Ajustes con transacciones atómicas (decremento condicional, sin race conditions) |
| Soft delete | Los productos nunca se borran físicamente |
| Cuentas inactivas | `isActive: false` bloquea el login |

---

## Seed

El seed crea:

- **4 usuarios**: dos ADMIN, uno USER y uno de almacén
- **6 categorías** y **8 marcas**
- **3 proveedores**
- **~30 productos** con precios, stock y stock mínimo variados; cuatro de cada cinco con un **EAN-13** (prefijo 200, de uso interno) y el resto solo con SKU
- **Movimientos de stock** de los últimos meses, que cuadran con el stock de cada producto
- **Órdenes de compra** en todos los estados, con sus recepciones enlazadas a cada línea
- **Órdenes de venta** pendientes, enviadas y canceladas, con el coste congelado en las enviadas
- **Coste medio** calculado de las compras recibidas, y **plazo de entrega** en los proveedores (uno sin plazo, a propósito)
- **Historial de precios** para algunos productos
- **Un conteo físico abierto**, con una línea que cuadra y otra a la que le falta una unidad

| Rol | Email | Contraseña |
|---|---|---|
| ADMIN | `admin@stockly.app` | `Admin1234!` |
| ADMIN | `carlos@stockly.app` | `Admin1234!` |
| USER | `laura@stockly.app` | `User1234!` |
| WAREHOUSE | `almacen@stockly.app` | `Almacen1234!` |

> **El administrador inicial sale de aquí.** El registro público (`POST /auth/register`) crea **siempre** usuarios con rol `USER`. En un despliegue nuevo hay que ejecutar `pnpm db:seed` —o promover a alguien con `PATCH /api/v1/users/:id/role` desde una cuenta que ya sea ADMIN— porque ningún registro se convierte en administrador por sí solo.

---

## Licencia

Copyright © 2026 Ricky Angel Jiménez Bueno.

Stockly es software libre: puedes redistribuirlo y modificarlo bajo los términos de la
**[GNU Affero General Public License v3](LICENSE)** (`AGPL-3.0-only`). Quien ofrezca una versión
modificada a otros usuarios **por la red** tiene que ofrecerles también su código. El porqué de la
elección está en el [ADR 0009](docs/adr/0009-licencia-agpl.md). Las versiones publicadas antes del
2026-09-30 se distribuyeron con la MIT.
