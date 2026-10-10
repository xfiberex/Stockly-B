# Stockly — Backend

[![verify](https://github.com/xfiberex/Stockly-B/actions/workflows/verify.yml/badge.svg)](https://github.com/xfiberex/Stockly-B/actions/workflows/verify.yml)

API REST del sistema de gestión de inventario Stockly. El frontend vive en un repositorio hermano,
[`Stockly-F`](https://github.com/xfiberex/Stockly-F), que se clona al lado de este.

Este README es la **referencia de la API**. La documentación del proyecto —que cubre los dos
repositorios— está en [`docs/`](docs/):

- **[docs/README-proyecto.md](docs/README-proyecto.md)** — arranque desde cero y mapa de todos los documentos.
- **[docs/CONTEXTO.md](docs/CONTEXTO.md)** — estado, trampas del entorno y decisiones vivas. Empieza aquí al retomar el proyecto.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — puerta de calidad, CI, orden de subida y commits.

---

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22 + TypeScript 6 |
| Framework | Express 5 |
| ORM y base de datos | Prisma 7 · PostgreSQL 17 |
| Validación y contrato | Zod 4 |
| Autenticación | JWT en cookie `httpOnly` + refresh token rotativo |
| Imágenes · correo · PDF | Cloudinary + Multer · Nodemailer · PDFKit |
| Registro y métricas | pino · prom-client |
| Documentación | Swagger UI en `/api/v1/docs` (no se monta en producción) |
| Tests | Jest + Supertest |
| Gestor de paquetes | pnpm 12.4.1 *(fijado en `packageManager`; no usar npm ni yarn)* |

---

## Estructura

```
Stockly-B/
├── .github/workflows/verify.yml   # CI: `pnpm verify` en cada push a main y pull request
├── docs/                          # Documentación del proyecto (los dos repositorios)
├── load/                          # Prueba de carga: `Stockly_carga`, EXPLAIN y k6 (fuera de verify)
├── observabilidad/                # Prometheus, Alertmanager y reglas de alerta con sus pruebas
├── prisma/
│   ├── schema.prisma              # Modelos
│   ├── migrations/                # Solo hacia adelante: una desplegada no se edita
│   └── seed.ts                    # Datos de ejemplo; su histórico cuadra con el stock
├── scripts/                       # smoke, auditoria, backup, restaurar, contratos, poda de la imagen
└── src/
    ├── app.ts · server.ts         # Express y arranque
    ├── cli/                       # resumen-semanal.ts: lo lanza un planificador externo
    ├── config/env.ts              # Variables de entorno y su validación
    ├── contratos/api.ts           # Forma de las respuestas, permisos y códigos de error
    ├── modules/                   # Un directorio por módulo: rutas, controlador, servicio, validador
    │   ├── auth · users · settings · audit-logs · notifications
    │   ├── products · categories · brands · suppliers · tags
    │   ├── purchase-orders · sale-orders · customers · inventory-counts
    │   └── reports
    ├── routes/index.ts            # Montaje de los módulos y sondas (`health`, `ready`, `metrics`)
    ├── shared/
    │   ├── i18n/                  # Catálogo de los correos, en español e inglés
    │   ├── lib/                   # Prisma, JWT, correo, CSV y exportación, costes, alertas, métricas
    │   └── middlewares/           # auth, csrf, validate, upload, rateLimiter, error, métricas
    ├── swagger*.ts                # Spec de OpenAPI: esquemas derivados, rutas escritas
    └── tests/                     # Tests de integración
```

**Modelos** (`prisma/schema.prisma`): `Product` con su `Category`, `Brand`, `Supplier` y `Tag`;
`StockMovement`, `PriceHistory` y `CostHistory` como históricos; `PurchaseOrder` y `SaleOrder`
con sus líneas, y `Customer`; `InventoryCount` con sus líneas; `ProductAbc` y `AbcCalculation`;
`User`, `AppSetting`, `AuditLog`, `Notification` y `WeeklyDigest`; y `Counter`, de donde sale el
número correlativo de cada venta.

---

## Configuración

```bash
cp .env.example .env
```

| Variable | Descripción | Requerida |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión de PostgreSQL | **Sí** |
| `JWT_SECRET` | Secreto de los JWT, 32 caracteres como mínimo | **Sí** |
| `JWT_EXPIRES_IN` | Duración del access token (`15m`) | **Sí** |
| `FRONTEND_URL` | URL del frontend: CORS y enlaces de los correos | **Sí** |
| `PORT` · `NODE_ENV` | `3000` · `development`, `test` o `production` | No |
| `CLOUDINARY_CLOUD_NAME` · `_API_KEY` · `_API_SECRET` | Subida de imágenes de producto | Solo con imágenes |
| `SMTP_HOST` · `_PORT` · `_USER` · `_PASS` · `_FROM` | Correo. El puerto 465 usa TLS implícito; en cualquier otro se exige STARTTLS | Solo con correos |
| `METRICS_TOKEN` | Protege `GET /api/v1/metrics`. **Sin él, en producción responde 404** | Solo con métricas |
| `ALERTA_5XX_HABILITADA` · `_UMBRAL` · `_VENTANA_MIN` · `_ENFRIAMIENTO_MIN` | Aviso por pico de 5xx: `true` · `5` · `5` · `30` | No |
| `RATE_LIMIT_MAX` · `AUTH_RATE_LIMIT_MAX` | Peticiones por IP cada 15 min: `100` y `10`. El E2E los sube | No |
| `EXPORT_MAX_ROWS` | Tope de filas de una exportación: `100000` | No |
| `LOG_LEVEL` | `info`; en `test`, `silent` | No |
| `COOKIE_SECURE` · `COOKIE_SAMESITE` | Por defecto `true` y `none` en producción, `false` y `lax` fuera | No |

**Cuatro variables bastan para arrancar.** Los grupos de Cloudinary y SMTP son todo o nada: sin
uno completo, el servidor arranca y solo esa función responde **503** con un mensaje que dice qué
falta. Las de la copia de seguridad (`BACKUP_*`, `PG_BIN`), en
[docs/operaciones.md §3](docs/operaciones.md).

---

## Comandos

```bash
pnpm dev                 # Servidor con recarga
pnpm build               # Compila a dist/
pnpm start               # Ejecuta el build
pnpm check               # Tipos, sin emitir (también de prisma/seed.ts)

pnpm db:migrate          # Crea y aplica migraciones en desarrollo
pnpm db:generate         # Regenera el cliente de Prisma
pnpm db:seed             # Siembra datos de ejemplo — vacía la base antes
pnpm db:reset            # Recrea la base, migra y siembra
pnpm db:studio           # Prisma Studio
pnpm db:backup           # Vuelca la base a backups/, con retención
pnpm db:restaurar        # Restaura un volcado; por defecto en una base de ensayo

pnpm test                # Suite completa, contra la base Stockly_test
pnpm test:watch
pnpm test:coverage

pnpm verify              # Puerta de calidad completa (CONTRIBUTING.md)
pnpm smoke               # Arranca dist/server.js y comprueba /api/v1/health
pnpm auditoria           # Vulnerabilidades y licencias de producción

pnpm contratos:generar   # Copia el contrato de la API a Stockly-F
pnpm resumen:enviar      # Envía el resumen semanal, si está activado
pnpm carga:sembrar       # Prueba de carga: también carga:consultas y carga:ejecutar
```

---

## API

Todo cuelga de **`/api/v1`**. La referencia exacta es la especificación interactiva de
`http://localhost:3000/api/v1/docs`, que se deriva del contrato y de los validadores; lo que sigue
es el mapa.

- **Sobre de respuesta:** `{ success, message, data }`.
- **Ningún listado se devuelve entero.** Todos aceptan `page` y `limit` —10 por defecto, 100 como
  máximo— y responden `{ data, meta }`, con `total`, `page`, `limit` y `totalPages`. Los filtros
  se aplican en la base.
- **Los errores llevan un `code` estable** (`INSUFFICIENT_STOCK`, `FORBIDDEN`…) además del
  `message` en español: el cliente compone la frase en su idioma.
- **Sesión:** cookies `httpOnly`. Las peticiones que modifican exigen además la cabecera
  `x-csrf-token` con el valor de la cookie `csrfToken`.

### Autenticación — `/auth`

No dependen del rol. Públicas: `POST /register`, `/login`, `/logout`, `/refresh`,
`/verify-email`, `/resend-verification`, `/forgot-password` y `/reset-password`. Con sesión:
`GET /me`, `PUT /me`, `PATCH /me/password` y `PATCH /me/idioma`.

### Rutas por módulo y rol

Hay cuatro roles: `USER` lee, `WAREHOUSE` además recibe, envía y mueve stock, `SELLER` además vende
en el mostrador, y `ADMIN` hace todo. `SELLER` no tiene columna en la tabla porque solo añade una
ruta a las de «Todos los roles»: `POST /sale-orders/counter`, que comparte con `ADMIN`.
La tabla es un reflejo de la matriz `PERMISOS` de [`src/contratos/api.ts`](src/contratos/api.ts),
que es **la única copia que cuenta**: con ella se protege cada ruta y con ella decide el frontend
qué botones enseñar.

| Módulo | Todos los roles | `WAREHOUSE` y `ADMIN` | Solo `ADMIN` |
|---|---|---|---|
| `/products` | `GET /` · `/:id` · `/lookup` · `/labels` · `/export` · `/:id/movements` · `/:id/movements/export` · `/:id/price-history` · `/:id/cost-history` | `POST /:id/movements` · `PATCH /bulk-stock` | `POST /` · `POST /import` · `PUT /:id` · `DELETE /:id` · `PATCH /:id/restore` |
| `/categories` `/brands` `/suppliers` `/tags` | `GET /` · `/:id` | — | `POST /` · `PUT /:id` · `DELETE /:id` |
| `/purchase-orders` | `GET /` · `/:id` · `/suggestions` | `POST /:id/receipts` | `POST /` · `POST /suggestions` · `PATCH /:id` · `DELETE /:id` · `GET /export` |
| `/sale-orders` | `GET /` · `/:id` · `/:id/receipt` | `POST /:id/ship` | `POST /` · `PATCH /:id` · `DELETE /:id` · `GET /export` |
| `/customers` | `GET /` · `/:id` | — | `POST /` · `PUT /:id` · `DELETE /:id` |
| `/inventory-counts` | `GET /` · `/:id` · `/:id/lines` | `POST /` · `PATCH /:id/lines` · `POST /:id/close` · `POST /:id/cancel` | — |
| `/reports` | `GET /` · `/period` · `/abc` | — | — |
| `/notifications` | `GET /` · `/unread-count` · `POST /read-all` · `POST /:id/read` — siempre los propios | — | — |
| `/users` | — | — | `GET /` · `/:id` · `POST /` (invitar) · `PATCH /:id/role` · `/:id/activate` · `/:id/deactivate` |
| `/settings` | — | — | `GET /` · `PATCH /` |
| `/audit-logs` | — | — | `GET /` |

### Lo que la tabla no dice

- **Productos.** `DELETE` es un borrado lógico y `restore` lo deshace. `GET /lookup?code=` busca
  por código de barras o SKU **exacto**, y es la del escáner. `GET /labels?ids=&format=&copies=`
  devuelve un PDF de etiquetas: `sheet` (A4, 3 × 8) o `label` (rollo de 50 × 25 mm). El listado
  filtra por texto, categoría, marca, proveedor, etiqueta, estado y clase ABC.
- **Stock.** Todo movimiento ocurre en una transacción y con decremento condicional. Una venta
  nueva no puede pedir más de lo **disponible** —stock menos lo comprometido en ventas
  pendientes— y responde 409. Enviar una venta descuenta el stock y congela el coste; cancelar una
  enviada lo repone.
- **Compras.** `POST /:id/receipts` registra una entrega parcial o completa, recalcula el coste
  medio ponderado y deja la orden «recibida a medias» hasta completarse. `GET /suggestions`
  propone qué pedir según salidas, plazo del proveedor, mínimo, disponible y pendiente de recibir.
- **Conteos físicos.** La captura guarda el stock esperado **en el momento de contar cada línea**,
  y cerrar convierte cada diferencia en un ajuste, todos en una transacción.
- **Informes.** `GET /reports?format=pdf` y `GET /reports/period?format=csv|pdf`. El periodo se
  pide con `preset` (`this-month`, `last-month`, `this-quarter`, `this-year`) o con `from` y `to`
  (`AAAA-MM-DD`, como mucho 60 meses), en la zona horaria del negocio.
- **Exportaciones.** `/products/export` (JSON, o `?format=csv`), `/products/:id/movements/export`,
  `/purchase-orders/export` y `/sale-orders/export`, por lotes y con tope de filas.
- **Avisos.** Tres tipos —`LOW_STOCK`, `SALE_UNSHIPPABLE` y `PURCHASE_OVERDUE`—, cada uno con sus
  datos en `data`; el texto lo compone el cliente.

### Ajustes — `/settings`

| Clave | Tipo | Por defecto | Qué hace |
|---|---|---|---|
| `lowStockAlertEnabled` | boolean | `false` | Correo a los administradores cuando el stock baja del mínimo |
| `weeklyDigestEnabled` | boolean | `false` | Resumen semanal por correo; lo envía `pnpm resumen:enviar`, programado desde fuera |
| `defaultLeadTimeDays` | number | `7` | Plazo de las sugerencias de reposición para un proveedor sin plazo propio |
| `timezone` | string | `America/Santo_Domingo` | Zona horaria IANA del negocio: dónde empiezan y terminan los días de los informes |
| `taxRate` | number | `0` | Porcentaje de impuesto de las ventas nuevas, de 0 a 100; cada orden lo congela en sus líneas |
| `taxName` | string | *(vacío)* | Cómo se llama el impuesto en la venta: ITBIS, IVA |

### Operación

| Ruta | Qué responde |
|---|---|
| `GET /health` | 200 mientras el proceso viva, aunque la base esté caída |
| `GET /ready` | `SELECT 1` contra la base; **503** si falla |
| `GET /metrics` | Métricas en formato Prometheus, con `METRICS_TOKEN` ([docs/operaciones.md §8](docs/operaciones.md)) |

---

## Seguridad

| Mecanismo | Detalle |
|---|---|
| Cabeceras y CORS | `helmet` en todas las rutas; CORS restringido a `FRONTEND_URL` |
| CSRF | *Double-submit*: cookie `csrfToken` y cabecera `x-csrf-token` en los métodos que modifican. Solo quedan exentas siete rutas públicas de `/auth` |
| Sesión | Access token de 15 min en cookie `httpOnly`; refresh token rotativo y hasheado, con detección de reuso: presentar uno ya rotado cierra la familia entera |
| Roles | Matriz `PERMISOS` del contrato; `permisos.test.ts` recorre todas las rutas con cada rol |
| Contraseñas | `bcryptjs` con 12 rondas. Restablecerla revoca las sesiones |
| Cuentas | Una cuenta desactivada pierde el acceso en la siguiente petición. El registro público crea siempre `USER`; con otro rol solo se entra por invitación de un `ADMIN`, que manda un enlace y nunca una contraseña |
| Límite de peticiones | 100 cada 15 min por IP; 10 en login y recuperación; 5 por hora en registro |
| Correo | STARTTLS obligatorio: un servidor sin cifrado aborta el envío |
| Subidas | Imágenes validadas por sus *magic bytes*, no solo por el `Content-Type` |
| Errores | Las respuestas no filtran rutas del sistema de archivos, en ningún entorno |
| Dependencias | `pnpm auditoria` en cada `verify` ([docs/dependencias.md](docs/dependencias.md)) |

---

## Seed

`pnpm db:seed` **vacía la base** y siembra un conjunto reproducible: usuarios, catálogo, unos 50
productos —la mayoría con código de barras—, compras en todos los estados con sus recepciones y su
coste medio, ventas pendientes, enviadas y canceladas, historial de precios, auditoría y un conteo
físico abierto. Los movimientos **cuadran con el stock** de cada producto.

| Rol | Email | Contraseña |
|---|---|---|
| ADMIN | `admin@stockly.app` | `Admin1234!` |
| ADMIN | `carlos@stockly.app` | `Admin1234!` |
| USER | `laura@stockly.app` | `User1234!` |
| WAREHOUSE | `almacen@stockly.app` | `Almacen1234!` |
| SELLER | `vendedor@stockly.app` | `Vendedor1234!` |

> **El administrador inicial sale de aquí.** En un despliegue nuevo hay que ejecutar el seed —o
> promover a alguien con `PATCH /api/v1/users/:id/role` desde una cuenta que ya sea ADMIN—, porque
> ningún registro se convierte en administrador por sí solo.

---

## Licencia

Copyright © 2026 Ricky Angel Jiménez Bueno.

Stockly es software libre: puedes redistribuirlo y modificarlo bajo los términos de la
**[GNU Affero General Public License v3](LICENSE)** (`AGPL-3.0-only`). Quien ofrezca una versión
modificada a otros usuarios **por la red** tiene que ofrecerles también su código. El porqué de la
elección está en el [ADR 0009](docs/adr/0009-licencia-agpl.md). Las versiones publicadas antes del
2026-09-30 se distribuyeron con la MIT.
