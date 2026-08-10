# Informe de auditoría técnica — Stockly

**Fecha:** 2026-08-04
**Auditores:** revisión senior (arquitectura, seguridad, QA, accesibilidad, documentación)
**Revisión previa:** revisión del 2026-07-15 (documento retirado el 2026-08-05 al quedar absorbido por este informe; sus mediciones de navegador se conservan en [ROADMAP.md → Línea base de navegador](ROADMAP.md#línea-base-de-navegador-2026-07-15))

---

> # ⚠ Documento congelado — describe el 2026-08-04, no el estado actual
>
> **Todo lo que sigue está escrito en presente y ya no lo es.** De los 70 hallazgos, **97 de las
> 107 tareas que generaron están cerradas** al 2026-08-10: los cuatro tiers de trabajo (0, 1, 2 y
> 3) están completos y solo queda el Tier 4, fuera del alcance inmediato. En particular, **los
> cinco problemas del resumen ejecutivo están todos corregidos y verificados** — el build arranca,
> la imagen Docker construye y sirve, las cancelaciones revierten stock, Configuración guarda y las
> etiquetas se asignan.
>
> **No se actualiza a propósito:** es el registro de un momento, y reescribirlo destruiría lo único
> que aporta hoy — la evidencia medida de por qué existe cada tarea. Para el estado real:
>
> | Para saber… | Mira |
> |---|---|
> | Qué está hecho y qué falta | [ROADMAP.md](ROADMAP.md) — casillas, Progreso y Métricas |
> | Qué hallazgo produjo qué tarea | [ROADMAP.md → Trazabilidad](ROADMAP.md#trazabilidad-hallazgo--tarea) |
> | En qué estado está el proyecto hoy | [CONTEXTO.md](CONTEXTO.md) |
>
> Lo que sigue vigente de este informe son las [zonas no cubiertas](#6-zonas-no-cubiertas) —lo que
> nunca se llegó a medir— y los [puntos fuertes](#5-puntos-fuertes), que son lo que **no** hay que
> tocar al refactorizar.

---

## Contexto del proyecto *(verificado, no asumido)*

| Campo | Valor |
|---|---|
| **Tipo de aplicación** | Web — SPA + API REST, dos repositorios git independientes |
| **Stack backend** | Node 22 / TypeScript 6.0.3 / Express 5.2.1 / Prisma 7.8 (adapter-pg) / PostgreSQL 16 / Zod 4.4 / Jest 30 + Supertest |
| **Stack frontend** | React 19.2 / TypeScript 6.0.2 / Vite 8 / TailwindCSS 4.3 / React Router 7.15 / TanStack Query 5.100 / React Hook Form 7.76 + Zod / Recharts 3.8 / Vitest 4.1 + Testing Library / Playwright 1.49 |
| **Servicios externos** | Cloudinary (imágenes), SMTP genérico (Nodemailer) |
| **Usuarios y escala** | Herramienta interna de gestión de inventario. La BD de desarrollo tiene 48 productos y 5 usuarios; no hay datos de carga real. Pool de conexiones fijado en 10. |
| **Entorno de despliegue** | `docker-compose.yml` (PostgreSQL + backend). El frontend no está contenedorizado. Sin proveedor cloud definido. Sin CI **por decisión del proyecto**: toda la verificación se ejecuta en local. |
| **Normativa aplicable** | Ninguna declarada. Se audita contra OWASP Top 10 y WCAG 2.2 AA como referencia de calidad. |
| **Alcance de la revisión** | Ambos repositorios completos (`Stockly-B`, `Stockly-F`) más la orquestación raíz. |
| **Idioma** | Producto en español; informe en español. |

**Método:** lectura estática completa del código de aplicación; ejecución real de ambas suites de test con cobertura; `tsc --noEmit` en ambos repos; `eslint`; build de producción del frontend con análisis de tamaños de chunk; ejecución del build de producción del backend; **construcción real de la imagen Docker** e inspección de su contenido; y **sondeo HTTP real contra la API con base de datos PostgreSQL viva** (Supertest sobre `Stockly_test`) para confirmar los hallazgos funcionales de mayor severidad. No se ejecutó auditoría de navegador (Lighthouse) ni pruebas de carga en esta pasada — ver §6.

---

## 1. Resumen ejecutivo

Stockly sigue siendo un proyecto **bien construido en su núcleo**: la arquitectura modular es limpia y consistente en ambos repos, la lógica de inventario resuelve correctamente las condiciones de carrera de stock con decrementos condicionales dentro de transacciones, y la postura de seguridad de la sesión (cookies `httpOnly`, rotación de refresh tokens, CSRF double-submit, rate limiting, bcrypt 12 rondas, tokens hasheados en BD) está muy por encima de la media. La cobertura del backend subió a **86.9 %** con 198 tests que ejercitan concurrencia y atomicidad reales.

Sin embargo, esta pasada — que por primera vez ejecuta el build de producción y sondea la API contra una BD viva — destapa una brecha grave: **el sistema no es desplegable y tiene tres funcionalidades rotas que las 379 pruebas en verde no detectan**. El patrón común es que cada lado se prueba contra su propia suposición del contrato, y nadie prueba la unión.

**Los 5 problemas más graves:**

1. **El build de producción no arranca.** `node dist/server.js` falla con `Cannot find module '@/app'`: `tsc` no reescribe los alias de ruta y no hay `tsc-alias` ni equivalente. `pnpm start` y el `CMD` del contenedor están rotos. *(Verificado ejecutándolo.)*
2. **La imagen Docker no llega ni a construirse.** `docker compose build backend` falla en el primer `pnpm install`. Sorteando cada fallo uno a uno aparecen **cinco defectos independientes** —rango de versión de pnpm que corepack rechaza, `pnpm-workspace.yaml` sin copiar, `prisma generate` sin `DATABASE_URL`, CLI de Prisma ausente en el runner y `prisma.config.ts` sin copiar—, y la imagen resultante sigue sin arrancar por el punto 1. No hay hoy ninguna ruta funcional a producción.
3. **Cancelar una orden enviada o recibida no revierte el stock.** Probado: venta de 30 uds. sobre stock 100 → `SHIPPED` deja 70 → `CANCELLED` (HTTP 200) deja **70**. Compra de 40 uds. → `RECEIVED` deja 140 → `CANCELLED` deja **140**. El inventario queda permanentemente corrupto y sin movimiento compensatorio en el historial.
4. **La página de Configuración nunca guarda nada.** El frontend envía `PATCH /settings {updates:{...}}` y el backend espera el objeto plano. Probado: HTTP 200, `data: []`, cero filas persistidas. Además el backend devuelve `value` como *boolean* y el frontend lo compara con la cadena `"true"`, así que el interruptor siempre se pinta apagado. Las alertas de bajo stock son, en la práctica, inactivables desde la UI.
5. **Las etiquetas de producto nunca se asignan.** `createProductSchema`/`updateProductSchema` no declaran `tagIds` y Zod descarta las claves desconocidas, por lo que `validate()` las borra de `req.body` antes de llegar al servicio. Probado: `POST /products` con `tagIds` → 201 con **0 etiquetas asignadas**. El selector de etiquetas del formulario es decorativo.

Añadido a esto: **no existe ninguna cadena de verificación repetible** (el proyecto verifica en local y ha descartado usar CI), `pnpm lint` falla con 26 errores, y la cobertura real del frontend es del **19.88 %** (medida ahora que `coverage.all` está activo).

---

## 2. Tabla de puntuación

| # | Área | Nota | Justificación |
|---|---|---|---|
| 1 | Auditoría de código | **7.0** | Código legible, tipado estricto, funciones cortas y comentarios que explican el *porqué*; penalizan los 500 por paginación no validada y la ausencia de logging estructurado. |
| 2 | Seguridad | **7.5** | Base sólida (sesión, CSRF, rate limit, hashing); restan el reset de contraseña que no revoca sesiones, una credencial versionada y el contenedor corriendo como root. |
| 3 | Rendimiento | **6.0** | Sin ningún índice no-único en BD, agregados de reportes calculados en memoria y exportaciones sin límite; el bundle vendor supera los 500 kB. |
| 4 | SEO | **8.5** | `lang`, `title` y meta description correctos. Al ser una app tras login, el SEO es marginal y está bien resuelto para su caso de uso. |
| 5 | Accesibilidad y semántica | **6.0** | HTML semántico, modal con focus-trap y menú móvil correctos; pero los errores de formulario no se anuncian, hay botones sin nombre accesible y cero soporte de `prefers-reduced-motion`. |
| 6 | Diseño responsivo y UI/UX | **6.5** | Responsive resuelto y estados de carga/vacío consistentes; penalizan Configuración rota, rutas de admin sin guardia en el router y ausencia de modo oscuro e i18n. |
| 7 | Arquitectura | **5.5** | Modularidad ejemplar y consistente, arruinada por un build que no arranca y tres contratos front↔back rotos por falta de una fuente de verdad compartida. |
| 8 | QA y testing | **6.0** | Backend genuinamente bien probado (86.9 %, concurrencia incluida); frontend al 19.88 % y ningún test cruza la frontera entre repos — de ahí que los tres bugs confirmados pasaran desapercibidos. |
| 9 | Refactorización y limpieza | **7.5** | Cero TODO/FIXME/código muerto en el código de aplicación; restan `getActorEmail` triplicado y el escapado CSV duplicado entre repos. |
| 10 | Ortografía y redacción | **9.0** | Textos de UI, mensajes de error y correos correctos y consistentes en español. Solo desentonan tres comentarios y un mensaje de error en inglés. |
| 11 | Documentación | **5.5** | READMEs extensos y bien estructurados, pero con rutas de API desactualizadas y una contradicción real sobre variables obligatorias; Swagger cubre 3 de 12 módulos. |
| 12 | DevOps y configuración | **3.0** | Sin cadena de verificación repetible y con una imagen de producción que falla en cinco puntos independientes y no llega a construirse; build no reproducible (`pnpm@latest`), sin healthcheck de aplicación ni estrategia de rollback. |
| | **Global ponderado** | **6.4** | Núcleo excelente, cadena de entrega rota. |

---

## 3. Hallazgos detallados

> Leyenda: **[V]** = verificado por ejecución real. **[E]** = verificado por lectura estática. **[P]** = pendiente de verificación en ejecución.

### Área 7 — Arquitectura

#### AR-01 · El artefacto compilado no arranca · **Crítico** · `Stockly-B/tsconfig.json:14-16`, `Stockly-B/package.json:8` **[V]**

**Problema.** `tsconfig.json` define `paths: { "@/*": ["src/*"] }` y todo el código importa con ese alias. `pnpm build` ejecuta `tsc` a secas, que **no reescribe los alias en el JavaScript emitido**. El resultado en `dist/server.js:8` es literalmente `require("@/app")`, que Node no puede resolver. No hay `tsc-alias`, ni `module-alias`, ni campo `imports` en `package.json`.

```
$ node dist/server.js
Error: Cannot find module '@/app'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1517:15)
    code: 'MODULE_NOT_FOUND'
```

**Impacto.** `pnpm start` no funciona. El `CMD` del Dockerfile no funciona. El backend solo puede ejecutarse en desarrollo vía `tsx`, que sí resuelve los `paths`. El proyecto es, hoy, indesplegable.

**Solución propuesta.** Añadir `tsc-alias` al pipeline de build (mínima fricción, no toca el código):

```json
"devDependencies": { "tsc-alias": "^1.8.10" },
"scripts": { "build": "tsc && tsc-alias" }
```

Alternativa sin dependencia nueva: sustituir `paths` por *subpath imports* nativos de Node (`"imports": { "#/*": "./dist/*.js" }`), que funcionan en tiempo de ejecución. Verificar en ambos casos con `node dist/server.js`.

**Esfuerzo:** bajo.

---

#### AR-02 · La imagen Docker falla en cinco puntos independientes · **Crítico** · `Stockly-B/Dockerfile`, `Stockly-B/package.json:22-28` **[V]**

**Problema.** `docker compose build backend` no llega ni al primer paso de instalación. Al ir sorteando cada fallo uno a uno con un Dockerfile de sondeo (idéntico al del proyecto salvo el cambio mínimo necesario para avanzar), aparecen **cinco defectos independientes en cascada**. Ninguno se había detectado porque nunca se había construido la imagen.

**1 · Corepack rechaza el rango de versión de pnpm** — `package.json:22-28`

```
> [builder 5/8] RUN pnpm install --frozen-lockfile:
Invalid package manager specification in package.json (pnpm@^11.2.2); expected a semver version
```

`devEngines.packageManager.version` declara `"^11.2.2"`, un rango. Corepack exige una versión exacta y aborta. Localmente no se nota porque pnpm está instalado globalmente y no pasa por el shim de corepack.

**2 · `pnpm-workspace.yaml` no se copia a la imagen** — `Dockerfile:9,26`

```
> [runner 5/8] RUN pnpm install --frozen-lockfile --prod:
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @prisma/engines@7.8.0, @scarf/scarf@1.4.0, prisma@7.8.0
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

Ese archivo contiene la lista `allowBuilds` que pnpm 11 exige para permitir los scripts de instalación de Prisma, pero el `COPY` solo trae `package.json` y `pnpm-lock.yaml`. `pnpm install` falla con código 1 en **ambos** stages.

**3 · `prisma generate` necesita `DATABASE_URL` en tiempo de build** — `Dockerfile:15`, `prisma.config.ts:13`

```
> [builder 7/8] RUN pnpm exec prisma generate:
Failed to load config file "/app" as a TypeScript/JavaScript module.
Error: PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL.
```

`prisma.config.ts` resuelve `env("DATABASE_URL")` de forma eager al cargarse, y `.dockerignore:3-4` excluye `.env` del contexto de build. No hay `ARG` ni `ENV` que la aporte.

**4 · El runner no tiene la CLI de Prisma** — `Dockerfile:27`

Verificado dentro de la imagen construida:

```
$ pnpm exec prisma --version
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command "prisma" not found
```

`prisma` está en `devDependencies` y `pnpm install --prod` no la instala. El `CMD` empieza precisamente por `pnpm exec prisma migrate deploy`.

**5 · `prisma.config.ts` tampoco llega al runner** — `Dockerfile:30-32`

```
$ ls prisma.config.ts
ls: prisma.config.ts: No such file or directory
```

Aunque la CLI estuviera disponible, `schema.prisma:11-13` declara el datasource **sin `url`**: la URL vive exclusivamente en ese archivo de configuración, que no se copia.

**Y, ya dentro de la imagen, AR-01 se confirma también en el contenedor:**

```
$ node dist/server.js
Error: Cannot find module '@/app'
  code: 'MODULE_NOT_FOUND'
```

**Impacto.** `docker compose up --build`, el comando que el README raíz documenta bajo el epígrafe «Docker (producción)», no produce ninguna imagen. Y si se sortean los tres primeros fallos, la imagen resultante entra en crash-loop: primero por la CLI ausente, y si se resolviera, por el módulo no encontrado. No existe hoy ninguna ruta funcional a producción.

**Solución propuesta.** Los cinco puntos se arreglan en un mismo cambio:

```dockerfile
# 1 — fijar la versión exacta (y en package.json usar "packageManager": "pnpm@11.2.2")
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

# 2 — copiar también el archivo con la lista allowBuilds
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# 3 — aportar una URL de build (no se usa para conectar, solo para cargar la config)
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm exec prisma generate
RUN pnpm build

# ── runner ──
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./          # 5

RUN pnpm add prisma@7.8.0                             # 4 — o mover a dependencies
USER node
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/server.js"]
```

Alternativa más limpia para el punto 3: mover `prisma generate` fuera del build de la imagen, o hacer que `prisma.config.ts` resuelva la URL de forma perezosa.

Criterio de cierre: `docker compose up --build` responde 200 en `/api/v1/health`.

**Esfuerzo:** medio.

> **Nota sobre el puerto.** En la máquina auditada, `docker-compose.yml:12-13` publica el 5432, ya ocupado por una instalación nativa de PostgreSQL. No llegó a ser un problema porque el build falla antes, pero es un conflicto que aparecerá al levantar el stack completo — recogido en T2-27.

---

#### AR-03 · Cancelar una orden enviada o recibida no revierte el stock · **Crítico** · `Stockly-B/src/modules/sale-orders/sale-orders.service.ts:79-88`, `Stockly-B/src/modules/purchase-orders/purchase-orders.service.ts:49-63` **[V]**

**Problema.** Ambos servicios calculan una única bandera de transición y, si no se cumple, hacen una actualización plana del estado sin tocar el inventario:

```ts
const beingShipped = existing.status !== "SHIPPED" && dto.status === "SHIPPED";
if (!beingShipped) {
    return prisma.saleOrder.update({ where: { id }, data: { ...customerData, status: dto.status } });
}
```

La guardia previa solo bloquea modificar órdenes **ya canceladas** (`existing.status === "CANCELLED"`) y re-enviar una ya enviada. La transición `SHIPPED → CANCELLED` y `RECEIVED → CANCELLED` está permitida por el validador (`sale-orders.validator.ts:23`, `purchase-orders.validator.ts:19`) y cae en la rama plana.

Sondeo real contra la API:

```
VENTA   stock inicial=100  tras SHIPPED=70   cancelar->HTTP 200  tras CANCELLED=70
COMPRA  stock inicial=100  tras RECEIVED=140 cancelar->HTTP 200  tras CANCELLED=140
```

**Impacto.** Corrupción silenciosa y permanente del inventario en el flujo central del producto. En la venta se pierden 30 unidades reales; en la compra quedan 40 unidades fantasma. El historial de `StockMovement` tampoco registra compensación, por lo que el error es indetectable desde la auditoría de movimientos y se propaga a los reportes y al valor de inventario.

**Solución propuesta.** Tratar la cancelación como una transición con efectos, simétrica al envío/recepción, dentro de la misma transacción:

```ts
const beingCancelled = dto.status === "CANCELLED"
    && (existing.status === "SHIPPED" /* o "RECEIVED" en compras */);

if (beingCancelled) {
    return prisma.$transaction(async (tx) => {
        const items = await tx.saleOrderItem.findMany({
            where: { saleOrderId: id, productId: { not: null } },
        });
        for (const item of items) {
            const p = await tx.product.update({
                where: { id: item.productId! },
                data: { stock: { increment: item.quantity } },   // decrement en compras
            });
            await tx.stockMovement.create({
                data: {
                    productId: item.productId!, type: "IN", delta: item.quantity,
                    stockAfter: p.stock, note: `Cancelación de orden de venta #${id.slice(0, 8)}`,
                },
            });
        }
        return tx.saleOrder.update({ where: { id }, data: { ...customerData, status: "CANCELLED" }, include: ORDER_INCLUDE });
    });
}
```

En compras, el decremento debe ser condicional (`stock: { gte: item.quantity }`) y devolver 400 si el stock ya se consumió — decidir explícitamente si se permite cancelar una recepción cuyo stock ya salió.

Si la decisión de producto es **no permitir** cancelar órdenes ya materializadas, la corrección alternativa es rechazarla en el servicio con un 400. Lo que no puede quedarse es el 200 silencioso actual.

**Esfuerzo:** medio.

---

#### AR-04 · La configuración de la aplicación nunca se guarda · **Alto** · `Stockly-F/src/modules/settings/api/settings.api.ts:11` vs `Stockly-B/src/modules/settings/settings.controller.ts:14` **[V]**

**Problema.** Dos incompatibilidades de contrato en el mismo endpoint.

*a) Forma del cuerpo.* El frontend envuelve el payload:

```ts
// Stockly-F/src/modules/settings/api/settings.api.ts:11
await api.patch("/settings", { updates });
```

El backend espera el objeto plano y filtra por catálogo cualquier clave desconocida:

```ts
// Stockly-B/src/modules/settings/settings.controller.ts:14
const data = await settingsService.updateMany(req.body);
// settings.service.ts:51 → Object.entries({ updates: {...} }) → set("updates", ...) → null → filtrado
```

*b) Tipo del valor.* El backend devuelve `value` ya parseado (`settings.service.ts:26,61-65`), es decir un **boolean**. El frontend lo tipa como `string` (`settings.types.ts:8`) y compara `entry.value === "true"` (`SettingsPage.tsx:8`).

Sondeo real con el payload exacto del frontend:

```
SETTINGS-FRONT  PATCH {updates:{...}} -> HTTP 200  data=[]  persistido=NADA
SETTINGS-GET    value=false  typeof=boolean  (el front compara con la cadena "true")
```

**Impacto.** El interruptor "Alertas de bajo stock por correo" siempre aparece apagado, y pulsarlo + Guardar muestra el toast "Configuración guardada" sin escribir nada en la base de datos. La única funcionalidad configurable del producto es inalcanzable desde la UI. Además, como `isDirty` compara `string` contra `boolean`, el botón Guardar queda permanentemente habilitado.

**Solución propuesta.** Alinear el frontend con el contrato que ya prueba el backend (`settings.test.ts:53` envía la forma plana):

```ts
// settings.api.ts
export const updateSettings = async (updates: SettingUpdates) => {
    const { data } = await api.patch<ApiResponse<SettingEntry[]>>("/settings", updates);
    return data.data!;
};

// settings.types.ts
value: boolean | string | number;

// SettingsPage.tsx
const isOn = entry.value === true || entry.value === "true";
```

Y añadir `validate()` al endpoint (hoy es el único endpoint mutante sin validación Zod) para que una forma incorrecta devuelva 422 en lugar de un 200 vacío.

**Esfuerzo:** bajo.

---

#### AR-05 · Las etiquetas de producto nunca se asignan · **Alto** · `Stockly-B/src/modules/products/product.validator.ts:26-49` **[V]**

**Problema.** El servicio lee `dto.tagIds` (`product.service.ts:98,130-132`) y el frontend los envía correctamente como campos repetidos de `FormData` (`product.api.ts:21-24`), pero ningún esquema Zod declara `tagIds`. Como `z.object()` descarta las claves desconocidas por defecto y el middleware reemplaza el cuerpo con el resultado parseado —

```ts
// validate.middleware.ts:20
req.body = result.data;
```

— la clave desaparece antes de llegar al servicio. `dto.tagIds?.length` es siempre `undefined` en `create`, y `dto.tagIds !== undefined` siempre `false` en `update`.

Sondeo real:

```
TAGS  POST /products con tagIds -> HTTP 201  etiquetas asignadas=0 (esperado 1)
```

**Impacto.** El selector de etiquetas del formulario de producto (`ProductForm.tsx:221-252`) no tiene ningún efecto, en alta y en edición. Todo el módulo de etiquetas queda reducido a un CRUD aislado sin uso real, incluido el filtro por etiqueta del catálogo, que nunca encontrará productos.

**Solución propuesta.** Declarar el campo en ambos esquemas, normalizando el caso de un único valor (`multipart` envía string cuando hay un solo elemento):

```ts
const tagIdsField = z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : Array.isArray(v) ? v : [v]),
    z.array(z.string().uuid("Cada etiqueta debe ser un UUID válido")).optional(),
);

export const createProductSchema = z.object({ /* ... */, tagIds: tagIdsField });
export const updateProductSchema = z.object({ /* ... */, tagIds: tagIdsField });
```

Acompañar con un test de integración que cree un producto con `tagIds` y verifique la relación persistida.

**Esfuerzo:** bajo.

---

#### AR-06 · Sin fuente de verdad compartida para los contratos de API · **Medio** · transversal **[E]**

**Problema.** Los tipos de request/response se declaran a mano y por duplicado en cada repo (`Stockly-B/src/modules/products/product.types.ts` ↔ `Stockly-F/src/modules/products/types/product.types.ts`, y equivalentes en settings, tags, users, orders). Nada obliga a que coincidan.

**Impacto.** Es la causa raíz común de AR-03, AR-04 y AR-05: tres contratos rotos que compilan sin error y pasan 379 tests. Cada divergencia futura tiene la misma probabilidad de llegar a producción sin ser detectada.

**Solución propuesta.** Por orden de coste creciente: (a) tests de contrato en el frontend que validen las respuestas mockeadas contra esquemas Zod derivados de los del backend; (b) un paquete `shared/` en el workspace pnpm con los esquemas Zod y los tipos inferidos, consumido por ambos lados; (c) generación de un cliente tipado desde el OpenAPI — inviable hoy porque el spec cubre 3 de 12 módulos (ver D-02).

**Esfuerzo:** alto.

---

#### AR-07 · Inconsistencia de estilo entre módulos del backend · **Bajo** · `Stockly-B/src/modules/products/product.controller.ts` **[E]**

**Problema.** `products` exporta funciones sueltas (`export async function getProducts(...)`), mientras el resto de módulos exportan objetos (`export const usersController = { ... }`). Igual en los servicios.

**Impacto.** Ninguno funcional; roza la predecibilidad que es el mayor activo de esta arquitectura.

**Solución propuesta.** Unificar en el estilo mayoritario (objeto) al tocar cada módulo. No justifica un cambio masivo aislado.

**Esfuerzo:** bajo.

---

### Área 2 — Seguridad

#### S-01 · El restablecimiento de contraseña no revoca las sesiones activas · **Alto** · `Stockly-B/src/modules/auth/auth.service.ts:127-140` **[E]**

**Problema.** `updatePassword` sí invalida el refresh token del usuario:

```ts
// auth.service.ts:202-205
data: { password: hashed, refreshToken: null, refreshExpires: null },
```

pero `resetPassword` —el flujo de recuperación de cuenta— no lo hace:

```ts
// auth.service.ts:136-139
await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, resetToken: null, resetExpires: null },
});
```

**Impacto.** El caso de uso principal del "he olvidado mi contraseña" es recuperar una cuenta comprometida. Tras el reset, el refresh token que posea el atacante sigue siendo válido hasta 7 días y le permite renovar su sesión indefinidamente mediante rotación. La víctima cree haber cerrado la puerta y no lo ha hecho. Es además una inconsistencia interna: el mismo proyecto ya implementa la revocación correctamente tres funciones más abajo.

**Solución propuesta.**

```ts
data: {
    password: hashed,
    resetToken: null, resetExpires: null,
    refreshToken: null, refreshExpires: null,   // ← cerrar todas las sesiones
},
```

Test de regresión: iniciar sesión, capturar la cookie de refresh, ejecutar reset-password, y verificar que `POST /auth/refresh` con esa cookie devuelve 401.

**Esfuerzo:** bajo.

---

#### S-02 · Credencial personal versionada en el repositorio · **Alto** · `Stockly-F/e2e/smoke.spec.ts:5` **[V]**

**Problema.**

```ts
const PASSWORD = process.env.E2E_PASSWORD ?? "«contraseña real, redactada»";
```

El archivo está rastreado por git (`git ls-files` lo confirma). La contraseña **no** es la del seed —`prisma/seed.ts:45` usa `Admin1234!`— lo que indica que es una credencial real de un entorno concreto, no un valor de ejemplo.

> El valor literal se omite deliberadamente de este informe. Un documento de auditoría se comparte, se adjunta a tickets y se sube a repositorios: reproducir aquí el secreto que denuncia solo ampliaría su exposición. El valor está en el commit `55efe3b` del historial previo a la purga, recuperable desde la copia de seguridad si hiciera falta para la rotación.

**Impacto.** Secreto expuesto en el historial de git, con todo lo que implica si el repositorio se publica o se comparte. Efecto secundario: el smoke test E2E falla contra cualquier base de datos recién sembrada, porque esa contraseña no existe ahí.

**Solución propuesta.** Sustituir el valor por defecto por el del seed documentado y exigir la variable para cualquier otro entorno:

```ts
const PASSWORD = process.env.E2E_PASSWORD ?? "Admin1234!";
```

Rotar la contraseña real allí donde se use y, si el repositorio va a compartirse, purgar el valor del historial (`git filter-repo`) — no basta con el commit correctivo.

**Esfuerzo:** bajo (la purga del historial, medio).

---

#### S-03 · `requireAuth` no comprueba si la cuenta sigue activa · **Medio** · `Stockly-B/src/shared/middlewares/auth.middleware.ts:14-17` **[E]**

**Problema.** El middleware selecciona únicamente `id` y `role`:

```ts
const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
});
```

`usersService.setActive` (`users.service.ts:63-68`) sí anula el refresh token al desactivar, lo cual limita el daño, pero el access token en curso sigue siendo aceptado. `authService.refresh` (`auth.service.ts:84-102`) tampoco valida `isActive` ni `isVerified`.

**Impacto.** Un usuario desactivado por un administrador conserva acceso completo durante el resto de la vida de su access token (`JWT_EXPIRES_IN`, 15 min por defecto). En un escenario de baja urgente —empleado despedido, cuenta comprometida— la desactivación no es inmediata como el panel sugiere.

**Solución propuesta.** Incluir la comprobación en el punto único por el que pasan todas las rutas autenticadas:

```ts
const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, isActive: true },
});
if (!user) { res.status(401).json({ success: false, message: "Usuario no encontrado" }); return; }
if (!user.isActive) {
    res.status(403).json({ success: false, message: "Tu cuenta ha sido desactivada" });
    return;
}
```

Añadir la misma guardia en `authService.refresh` como defensa en profundidad.

**Esfuerzo:** bajo.

---

#### S-04 · La exención CSRF cubre todo `/api/v1/auth/*`, incluidas rutas autenticadas · **Medio** · `Stockly-B/src/shared/middlewares/csrf.middleware.ts:25-28` **[E]**

**Problema.**

```ts
if (req.path.startsWith("/api/v1/auth/")) { next(); return; }
```

La exención es necesaria para `login`, `register`, `refresh`, `verify-email`, `forgot-password` y `reset-password`, que no pueden depender de un token previo. Pero arrastra también `POST /auth/logout`, `PUT /auth/me` (cambio de nombre y correo) y `PATCH /auth/me/password`, que sí son operaciones autenticadas y mutantes. Agrava el contexto que en producción las cookies se emiten con `sameSite: "none"` (`auth.controller.ts:10`), es decir, se envían en peticiones cross-site.

**Evaluación honesta del riesgo.** La explotación práctica está muy limitada por otras capas: `PUT` y `PATCH` con cuerpo JSON disparan preflight CORS, que el `origin: env.frontendUrl` rechaza; y `PATCH /me/password` exige además `currentPassword`. Lo que **sí** queda expuesto es `POST /auth/logout` mediante un formulario cross-site (petición simple, sin preflight): un sitio malicioso puede cerrar la sesión del usuario. Impacto real: molestia / denegación de servicio menor. Se clasifica como debilidad de defensa en profundidad, no como vulnerabilidad explotable de alto impacto.

**Solución propuesta.** Sustituir el prefijo por una lista explícita de rutas públicas:

```ts
const CSRF_EXEMPT = new Set([
    "/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh",
    "/api/v1/auth/verify-email", "/api/v1/auth/resend-verification",
    "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password",
]);
if (CSRF_EXEMPT.has(req.path)) { next(); return; }
```

**Esfuerzo:** bajo.

---

#### S-05 · El transporte SMTP no exige TLS · **Medio** · `Stockly-B/src/shared/lib/nodemailer.ts:20-24` **[E]**

**Problema.**

```ts
export const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
});
```

Sin `secure` ni `requireTLS`, Nodemailer usa STARTTLS de forma **oportunista**: si el servidor no lo anuncia, continúa en claro.

**Impacto.** Un atacante en posición de red puede suprimir la respuesta STARTTLS y capturar las credenciales SMTP y el contenido de los correos —que incluyen los tokens de verificación y de restablecimiento de contraseña en claro.

**Solución propuesta.**

```ts
export const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,   // TLS implícito
    requireTLS: true,                // aborta si no hay STARTTLS en 587/25
    auth: { user: env.smtp.user, pass: env.smtp.pass },
});
```

**Esfuerzo:** bajo.

---

#### S-06 · El contenedor ejecuta la aplicación como root · **Medio** · `Stockly-B/Dockerfile:19-37` **[E]**

**Problema.** El stage `runner` nunca cambia de usuario; el proceso Node corre como `uid 0`.

**Impacto.** Cualquier RCE en la aplicación obtiene root dentro del contenedor, ampliando notablemente la superficie de escape. La imagen `node:22-alpine` ya trae un usuario `node` sin privilegios.

**Solución propuesta.** Añadir `USER node` antes del `CMD`, ajustando la propiedad de `/app` (`COPY --chown=node:node`).

**Esfuerzo:** bajo.

---

#### S-07 · El primer usuario registrado obtiene rol ADMIN · **Medio** · `Stockly-B/src/modules/auth/auth.service.ts:16-18` **[E]**

**Problema.**

```ts
const userCount = await prisma.user.count();
const role = userCount === 0 ? "ADMIN" : "USER";
```

**Impacto.** En un despliegue de producción donde no se ejecute el seed, el primer visitante que descubra `/auth/register` se convierte en administrador. Además hay una condición de carrera: dos registros concurrentes con la tabla vacía leen ambos `count() === 0` y ambos obtienen ADMIN, porque la comprobación y la escritura no están en la misma transacción.

**Solución propuesta.** Retirar la promoción automática y crear el administrador inicial exclusivamente por seed o por un comando de bootstrap explícito. Si se conserva, envolver comprobación y creación en una transacción con nivel `Serializable`.

**Esfuerzo:** bajo.

---

#### S-08 · Rotación de refresh token sin detección de reuso · **Bajo** · `Stockly-B/src/modules/auth/auth.service.ts:84-102` **[E]**

**Problema.** La rotación es correcta —cada refresh emite un token nuevo e invalida el anterior— pero el reuso de un token ya rotado se trata como una simple expiración, sin invalidar la familia de tokens.

**Impacto.** Si un refresh token es robado, el primero que lo use gana; el legítimo recibe "Sesión expirada" y vuelve a entrar, pero el sistema no detecta ni registra la anomalía.

**Solución propuesta.** Persistir el hash del token anterior; si llega un refresh con un hash ya rotado, invalidar todas las sesiones del usuario y registrar el evento en `AuditLog`.

**Esfuerzo:** medio.

---

#### S-09 · Validación de imágenes basada solo en el mimetype declarado · **Bajo** · `Stockly-B/src/shared/middlewares/upload.middleware.ts:12-18` **[E]**

**Problema.** `fileFilter` confía en `file.mimetype`, que lo fija el cliente. El límite de 2 MB sí está bien aplicado.

**Impacto.** Bajo en la práctica: Cloudinary rechaza en segunda línea lo que no sea una imagen con `resource_type: "image"`. Pero el buffer llega igualmente al servidor y se transfiere a un tercero.

**Solución propuesta.** Verificar los *magic bytes* del buffer (p. ej. `file-type`) antes de subir.

**Esfuerzo:** bajo.

---

#### S-10 · Límite de cuerpo de 5 MB en todos los endpoints · **Bajo** · `Stockly-B/src/app.ts:26-27` **[E]**

**Problema.** `express.json({ limit: "5mb" })` se aplica globalmente, cuando solo `POST /products/import` (hasta 1000 productos) lo justifica.

**Impacto.** Amplía innecesariamente el coste de parseo de un ataque de agotamiento de memoria sobre cualquier endpoint. Mitigado por el rate limit global de 100 peticiones / 15 min.

**Solución propuesta.** Bajar el límite global a `100kb` y aplicar `express.json({ limit: "5mb" })` como middleware específico en la ruta de importación.

**Esfuerzo:** bajo.

---

#### S-11 · Fuga de rutas del sistema de archivos en respuestas de error · **Bajo** · `Stockly-B/src/shared/middlewares/error.middleware.ts:18-21` **[V]**

**Problema.** Fuera de producción se devuelve `err.message` íntegro. Un error de Prisma incluye la consulta completa y la ruta absoluta del archivo fuente:

```json
{"success":false,"message":"\nInvalid `prisma.product.findMany()` invocation in\nC:\\Users\\User\\Desktop\\..."}
```

**Impacto.** Nulo en producción (donde se devuelve el mensaje genérico) — se documenta por completitud y porque agrava la visibilidad del hallazgo C-01 en entornos de staging con `NODE_ENV != production`.

**Solución propuesta.** Mantener el comportamiento actual pero asegurar que staging corre con `NODE_ENV=production`; opcionalmente truncar el mensaje.

**Esfuerzo:** bajo.

---

### Área 1 — Auditoría de código

#### C-01 · Parámetros de paginación no validados provocan errores 500 · **Medio** · `Stockly-B/src/modules/products/product.service.ts:37-38` (y análogos) **[V]**

**Problema.** El patrón se repite en cuatro servicios:

```ts
const page = Math.max(1, parseInt(query.page ?? "1", 10));
const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "10", 10)));
```

`parseInt("abc")` es `NaN`, y `Math.max(1, NaN)` es `NaN` — los guardas no protegen. `NaN` llega a Prisma como `skip`/`take`. Sondeo real:

```
500  /api/v1/products?page=abc
500  /api/v1/products?limit=abc
500  /api/v1/users?page=xyz
500  /api/v1/audit-logs?limit=nope
200  /api/v1/products?categoryId=no-es-uuid   ← correcto, devuelve lista vacía
404  /api/v1/products/no-es-uuid              ← correcto
```

Afecta a `products`, `users`, `audit-logs` y `sale-orders`.

**Impacto.** Cualquier enlace mal formado, bot o cliente con un bug genera un 500 en lugar de un 400. Contamina los logs de error con ruido que enmascara fallos reales y ofrece un vector barato de generación de trazas.

**Solución propuesta.** Extraer un helper compartido y usarlo en los cuatro servicios:

```ts
// shared/lib/pagination.ts
export function parsePagination(query: { page?: string; limit?: string }, defaultLimit = 10) {
    const page = Math.max(1, Number.parseInt(query.page ?? "", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? "", 10) || defaultLimit));
    return { page, limit, skip: (page - 1) * limit };
}
```

(`Number.parseInt(...) || 1` convierte `NaN` en el valor por defecto.) Añadir tests con `?page=abc` para cada endpoint paginado.

**Esfuerzo:** bajo.

---

#### C-02 · `getActorEmail` duplicado en tres controladores con import dinámico · **Medio** · `Stockly-B/src/modules/products/product.controller.ts:7-13`, `sale-orders/sale-orders.controller.ts:7-13`, `purchase-orders/purchase-orders.controller.ts:7-13` **[E]**

**Problema.** La misma función, copiada literalmente tres veces:

```ts
async function getActorEmail(userId: string): Promise<string | undefined> {
    try {
        const { prisma } = await import("@/shared/lib/prisma");
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        return user?.email;
    } catch { return undefined; }
}
```

El `await import()` dinámico no aporta nada (el módulo ya está cargado) y añade una indirección innecesaria. Peor: se ejecuta una consulta extra a la base de datos **en cada mutación** para obtener un dato que `requireAuth` ya podría haber cargado.

**Impacto.** Duplicación pura y una consulta redundante por escritura, en el camino crítico de todas las operaciones de inventario.

**Solución propuesta.** Cargar el email en `requireAuth` (`select: { id, role, isActive, email }`), exponerlo como `req.userEmail`, y eliminar las tres copias. Combina bien con la corrección de S-03, que ya obliga a tocar ese `select`.

**Esfuerzo:** bajo.

---

#### C-03 · Las rutas desconocidas devuelven HTML en lugar del sobre JSON · **Bajo** · `Stockly-B/src/app.ts:45-51` **[V]**

**Problema.** No hay middleware 404; Express 5 responde con su página de error por defecto:

```
404  /api/v1/ruta-inexistente  <!DOCTYPE html> <html lang="en"> ... <pre>Cannot GET ...
```

Toda la API responde con `{ success, message, data }` salvo aquí.

**Impacto.** Un cliente que asuma JSON revienta al parsear. Rompe la consistencia del contrato.

**Solución propuesta.** Insertar entre el router y el `errorHandler`:

```ts
app.use("/api/v1", router);
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});
app.use(errorHandler);
```

**Esfuerzo:** bajo.

---

#### C-04 · Sin logging estructurado ni correlación de peticiones · **Bajo** · `Stockly-B/src/shared/middlewares/error.middleware.ts:15`, `Stockly-B/src/app.ts:22-24` **[E]**

**Problema.** `morgan("dev")` solo en desarrollo; en producción el único rastro es un `console.error` con texto plano. No hay identificador de petición, ni nivel, ni salida en JSON.

**Impacto.** Con la aplicación en producción, diagnosticar un incidente exige correlacionar a mano líneas sin contexto. No hay forma de seguir una petición a través de sus logs.

**Solución propuesta.** Adoptar `pino` con `pino-http`, generando un `requestId` por petición (`crypto.randomUUID()`), propagándolo al `errorHandler` y devolviéndolo en la cabecera `x-request-id` para que el usuario pueda citarlo al reportar un fallo.

**Esfuerzo:** medio.

---

#### C-05 · `PATCH /settings` es el único endpoint mutante sin validación · **Bajo** · `Stockly-B/src/modules/settings/settings.routes.ts:10` **[E]**

**Problema.** `settingsRouter.patch("/", settingsController.updateMany)` — sin `validate()`. `updateMany` hace `Object.entries(req.body)`, que lanza `TypeError` si el cuerpo es `null`.

**Impacto.** Un cuerpo malformado devuelve 500 en lugar de 422, y una forma incorrecta devuelve 200 sin efecto — que es exactamente cómo AR-04 pasó desapercibido.

**Solución propuesta.** Un esquema Zod derivado de `SETTINGS_CATALOG`:

```ts
const settingsSchema = z.object(
    Object.fromEntries(SETTINGS_CATALOG.map((d) => [d.key, z.union([z.boolean(), z.string(), z.number()]).optional()])),
).strict();
settingsRouter.patch("/", validate(settingsSchema), settingsController.updateMany);
```

**Esfuerzo:** bajo.

---

#### C-06 · `User.role` sigue siendo `String` mientras el resto migró a enums · **Bajo** · `Stockly-B/prisma/schema.prisma:154` **[E]**

**Problema.** La migración `20260601200000_convert_status_and_type_to_enums` convirtió `PurchaseOrderStatus`, `SaleOrderStatus` y `StockMovementType` a enums nativos, pero `role String @default("USER")` quedó fuera. `AuditLog.action` y `AuditLog.entity` también son `String`, pese a tener tipos unión bien definidos en TypeScript (`audit-logs.service.ts:4-11`).

**Impacto.** La integridad de los roles depende exclusivamente de la validación Zod en la capa HTTP (`users.routes.ts:15`), que sí es correcta. Una escritura directa a la base de datos o un futuro endpoint sin validador puede introducir un rol inexistente. Sin impacto hoy.

**Solución propuesta.** Añadir `enum Role { ADMIN USER }` y la migración correspondiente al tocar el módulo de usuarios.

**Esfuerzo:** bajo.

---

#### C-07 · Comentarios y un mensaje de error en inglés · **Bajo** · `Stockly-B/src/modules/users/users.service.ts:63`, `settings/settings.service.ts:3`, `audit-logs/audit-logs.service.ts:38`, `shared/middlewares/upload.middleware.ts:28` **[E]**

**Problema.** Cuatro puntos en inglés en una base de código cuyos comentarios están íntegramente en español. El cuarto, además, es un mensaje que llega al usuario: `new Error("Upload failed")`.

**Impacto.** El mensaje en inglés se muestra en la UI si Cloudinary falla; el resto es solo inconsistencia.

**Solución propuesta.** Traducir los cuatro. Para el mensaje: `new Error("No se pudo subir la imagen")`.

**Esfuerzo:** bajo.

---

### Área 3 — Rendimiento

> **Nota de método:** no se ejecutaron pruebas de carga ni se midieron tiempos de consulta. Los hallazgos de base de datos derivan del análisis del esquema y las migraciones; los de bundle sí están **medidos** sobre un build real de producción.

#### P-01 · Ningún índice no-único en toda la base de datos · **Alto** · `Stockly-B/prisma/schema.prisma` (completo), `prisma/migrations/**` **[E]**

**Problema.** Búsqueda exhaustiva sobre las migraciones: los únicos índices existentes son las restricciones `UNIQUE` (`users_email_key`, `products_sku_key`, `tags_name_key`, …) y el índice implícito de la tabla intermedia `_ProductToTag`. **Cero `@@index`** en el esquema. PostgreSQL —a diferencia de MySQL— **no crea índices automáticamente sobre las columnas de clave foránea**.

Consultas que hoy hacen recorrido secuencial completo:

| Consulta | Ubicación | Columna sin índice |
|---|---|---|
| `stockMovement.findMany({ where: { productId } })` | `product.service.ts:294` | `stock_movements.productId` |
| `priceHistory.findMany({ where: { productId } })` | `product.service.ts:422` | `price_history.productId` |
| `saleOrderItem.findMany({ where: { saleOrderId } })` | `sale-orders.service.ts:96` | `sale_order_items.saleOrderId` |
| `purchaseOrderItem.findMany({ where: { purchaseOrderId } })` | `purchase-orders.service.ts:68` | `purchase_order_items.purchaseOrderId` |
| filtros del catálogo | `product.service.ts:49-51` | `products.categoryId/brandId/supplierId` |
| `auditLog.findMany({ orderBy: createdAt })` | `audit-logs.service.ts:54` | `audit_logs.createdAt/entity/action` |
| agregados de rotación (JOIN + rango de fechas) | `reports.service.ts:53-70` | `stock_movements.createdAt` |

**Impacto.** Con los ~48 productos y pocos cientos de movimientos actuales es imperceptible. `stock_movements` y `audit_logs` crecen monótonamente con cada operación: es el tipo de degradación que no se nota hasta que la aplicación lleva meses en producción y entonces afecta a todo a la vez, incluidos los reportes y la carga del dashboard.

**Solución propuesta.** Una única migración:

```prisma
model StockMovement {
  // ...
  @@index([productId, createdAt])
  @@index([createdAt])
}
model PriceHistory      { /* ... */ @@index([productId]) }
model SaleOrderItem     { /* ... */ @@index([saleOrderId]) @@index([productId]) }
model PurchaseOrderItem { /* ... */ @@index([purchaseOrderId]) @@index([productId]) }
model Product           { /* ... */ @@index([categoryId]) @@index([brandId]) @@index([supplierId]) @@index([isActive]) }
model AuditLog          { /* ... */ @@index([createdAt]) @@index([entity, action]) }
model SaleOrder         { /* ... */ @@index([status, createdAt]) }
model PurchaseOrder     { /* ... */ @@index([status, createdAt]) }
```

Verificación: `EXPLAIN ANALYZE` sobre la consulta de movimientos antes y después debe pasar de `Seq Scan` a `Index Scan`.

**Esfuerzo:** bajo (alto valor).

---

#### P-02 · Los reportes cargan todos los productos activos en memoria · **Medio** · `Stockly-B/src/modules/reports/reports.service.ts:19-22,73-83` **[E]**

**Problema.** Junto a cinco consultas SQL crudas bien optimizadas, hay un `findMany` sin `take` cuyo resultado se agrega en JavaScript:

```ts
prisma.product.findMany({ where: { isActive: true }, select: { /* ... */ } }),
// ...
const inventoryValue = products.reduce((sum, p) => sum + Number(p.price) * p.stock, 0);
for (const p of products) { stockByCategory[cat] = (stockByCategory[cat] ?? 0) + p.stock; /* ... */ }
```

**Impacto.** El uso de memoria y el tiempo de respuesta crecen linealmente con el catálogo. Es la consulta que alimenta el **dashboard**, es decir, la primera pantalla tras el login. Con decenas de miles de productos, cada carga del dashboard materializa el catálogo completo en el proceso Node.

**Solución propuesta.** Bajar la agregación a SQL, en la línea de las otras cinco consultas del mismo método:

```sql
SELECT COALESCE(c.name, 'Sin categoría') AS name,
       SUM(p.stock)             AS stock,
       SUM(p.price * p.stock)   AS value
FROM products p
LEFT JOIN categories c ON c.id = p."categoryId"
WHERE p."isActive" = true
GROUP BY 1;
```

Y `SUM(price*stock)` / `COUNT(*) FILTER (WHERE stock <= "minStock")` para los totales. La cobertura de `reports.service.ts` es del 100 %, así que la refactorización tiene red de seguridad.

**Esfuerzo:** medio.

---

#### P-03 · `GET /purchase-orders` devuelve todas las órdenes sin paginar · **Medio** · `Stockly-B/src/modules/purchase-orders/purchase-orders.service.ts:13-18` **[E]**

**Problema.**

```ts
async getAll() {
    return prisma.purchaseOrder.findMany({ include: ORDER_INCLUDE, orderBy: { createdAt: "desc" } });
}
```

Sin `skip`/`take`, y con `include` de ítems y productos anidados. `sale-orders` (`sale-orders.service.ts:22-36`) sí pagina correctamente — es una inconsistencia dentro del mismo dominio.

**Impacto.** La respuesta crece sin límite con el historial de compras y arrastra el detalle completo de cada ítem. Es la única lista de la API sin techo.

**Solución propuesta.** Replicar el patrón de `saleOrderService.getAll`, incluyendo el objeto `meta`, y actualizar `usePurchaseOrders` en el frontend para consumir la nueva forma.

**Esfuerzo:** bajo.

---

#### P-04 · Las exportaciones no tienen límite ni streaming · **Medio** · `product.service.ts:208-239`, `sale-orders.service.ts:158-181`, `purchase-orders.service.ts:107-133` **[E]**

**Problema.** Los tres `exportAll()` cargan la tabla completa, construyen el array de filas en memoria y `buildCsv` concatena todo en una sola cadena antes de enviarla.

**Impacto.** Pico de memoria proporcional al tamaño de los datos, multiplicado por el número de exportaciones concurrentes. En `sale-orders` y `purchase-orders` es peor porque desnormaliza a nivel de ítem (una fila por línea de pedido).

**Solución propuesta.** Paginar en lotes (`cursor`-based) y escribir el CSV en streaming sobre `res`, enviando la cabecera primero y cada lote a continuación. Añadir un tope duro configurable como red de seguridad.

**Esfuerzo:** medio.

---

#### P-05 · El chunk `vendor` supera los 500 kB · **Medio** · `Stockly-F/vite.config.ts:19-30` **[V — medido]**

**Problema.** Salida real de `pnpm build`:

```
dist/assets/vendor-BGhxWwrH.js        549.93 kB │ gzip: 170.86 kB
dist/assets/vendor-charts-CT52-t9a.js 264.92 kB │ gzip:  67.24 kB
dist/assets/vendor-router-Cny9ztqX.js  94.74 kB │ gzip:  31.38 kB
dist/assets/vendor-query-BTlAA_d1.js   35.37 kB │ gzip:  10.40 kB
dist/assets/index-Cw4DKnpy.css         55.74 kB │ gzip:  10.13 kB
(!) Some chunks are larger than 500 kB after minification.
```

La función `manualChunks` agrupa en `vendor` todo lo que no sea recharts, react-router o @tanstack: React, react-dom, axios, react-hook-form, zod, heroicons, react-toastify, tailwind-merge y las cuatro variantes de Inter. Ese chunk se carga en **todas** las rutas, incluida la de login.

*Comprobación adicional:* se verificó que `@tanstack/react-query-devtools` **no** acaba en el bundle de producción pese al import estático en `main.tsx:4` — Rollup lo elimina correctamente. No es un hallazgo.

**Impacto.** ~680 kB sin comprimir (~210 kB gzip) de JavaScript para pintar un formulario de login. En red móvil o conexiones lentas es un coste real de primera carga.

**Solución propuesta.** Separar el núcleo de React del resto y cargar bajo demanda lo que solo usan páginas concretas:

```ts
manualChunks(id: string) {
    if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
    if (id.includes("react-router")) return "vendor-router";
    if (id.includes("@tanstack")) return "vendor-query";
    if (id.includes("react-hook-form") || id.includes("@hookform") || id.includes("zod")) return "vendor-forms";
    if (id.includes("/react/") || id.includes("/react-dom/")) return "vendor-react";
    if (id.includes("node_modules")) return "vendor";
}
```

Y reducir `@fontsource/inter` a los pesos realmente usados. Objetivo razonable: ningún chunk por encima de 250 kB sin comprimir.

**Esfuerzo:** bajo.

---

#### P-06 · El envío de alertas SMTP bloquea la respuesta HTTP · **Bajo** · `Stockly-B/src/shared/lib/stockAlerts.ts:23-27`, invocado en `product.service.ts:182,370,404` y `sale-orders.service.ts:143-145` **[E]**

**Problema.** La llamada está correctamente **fuera** de la transacción —lo cual es la decisión importante y está bien resuelta— pero sigue siendo `await`-eada dentro del ciclo de la petición. En `sale-orders.service.ts:143-145` se hace además en serie, una alerta por producto.

**Impacto.** Un servidor SMTP lento añade su latencia a la respuesta de cada movimiento de stock. Una orden de venta con 10 productos bajo mínimos encadena 10 envíos secuenciales antes de responder.

**Solución propuesta.** A corto plazo, disparar sin esperar y registrar el fallo: `void checkLowStockAlert(...).catch((e) => logger.warn(e))`. A medio plazo, una cola de trabajos ligera si el volumen lo justifica.

**Esfuerzo:** bajo.

---

#### P-07 · La importación masiva puede agotar el pool de conexiones · **Bajo** · `Stockly-B/src/modules/products/product.service.ts:253-285`, `shared/lib/prisma.ts:9-14` **[E]**

**Problema.** `importBulk` procesa lotes de 50 con `Promise.allSettled`, y cada elemento hace dos operaciones independientes. El pool está fijado en `max: 10` con `connectionTimeoutMillis: 5000`.

**Impacto.** Con lotes de 50 concurrentes contra 10 conexiones, las peticiones se encolan y algunas pueden superar el timeout de 5 s, apareciendo como errores por fila en el resultado de la importación. Los tests actuales no importan volúmenes suficientes para provocarlo.

**Solución propuesta.** Reducir `BATCH_SIZE` a ~10 (alineado con el pool) o usar `createMany` con `skipDuplicates` y registrar los movimientos en una segunda operación agrupada.

**Esfuerzo:** bajo.

---

#### P-08 · Búsqueda por `contains` sin índice adecuado · **Bajo** · `Stockly-B/src/modules/products/product.service.ts:48`, `users.service.ts:30-33` **[E]**

**Problema.** `{ contains: query.search, mode: "insensitive" }` se traduce a `ILIKE '%término%'`, que ningún índice B-tree puede aprovechar.

**Impacto.** Recorrido secuencial en cada búsqueda del catálogo. Irrelevante hoy; escala mal.

**Solución propuesta.** Índice GIN con `pg_trgm` mediante migración manual:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX products_name_trgm_idx ON products USING GIN (name gin_trgm_ops);
```

**Esfuerzo:** bajo.

---

### Área 5 — Accesibilidad y semántica

> Evaluación estática contra WCAG 2.2 AA. **No se ejecutó Lighthouse ni lector de pantalla en esta pasada** — la revisión de 2026-07-15 reportó 96/100 en accesibilidad y las correcciones de contraste, modal y menú móvil se confirman aplicadas en el código actual.

#### A-01 · Los errores de formulario no se anuncian a los lectores de pantalla · **Alto** · `Stockly-F/src/shared/components/Input.tsx:18-29`, `Select.tsx:22-47` **[E]**

**Problema.** El mensaje de error se pinta en un `<p>` suelto, sin relación programática con el campo:

```tsx
<input ref={ref} id={id} className={cn(/* ... */, error && "border-red-500")} {...props} />
{error && <p className="text-xs text-red-500">{error}</p>}
```

Faltan `aria-invalid` y `aria-describedby`. El único indicador del estado de error es el color del borde — que también incumple WCAG 1.4.1 (no usar el color como único medio).

**Impacto.** Es el hallazgo de accesibilidad de mayor alcance: `Input` y `Select` son los componentes base de **todos** los formularios de la aplicación (login, registro, perfil, producto, proveedor, etiqueta, catálogo, órdenes). Un usuario de lector de pantalla que envía un formulario inválido recibe el foco de vuelta sin saber qué campo falló ni por qué. Incumple WCAG 3.3.1 (Identificación de errores, nivel A) y 4.1.2.

**Solución propuesta.**

```tsx
export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, className, id, ...props }, ref) => {
        const errorId = `${id}-error`;
        return (
            <div className="flex flex-col gap-1">
                {label && <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}</label>}
                <input
                    ref={ref}
                    id={id}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className={cn(/* ... */)}
                    {...props}
                />
                {error && <p id={errorId} role="alert" className="text-xs text-red-600">{error}</p>}
            </div>
        );
    },
);
```

Idéntico en `Select.tsx`. Ambos componentes ya tienen tests (`Input.test.tsx`, `Select.test.tsx`), donde añadir las aserciones.

**Esfuerzo:** bajo (impacto alto).

---

#### A-02 · Botones sin nombre accesible en la página de etiquetas · **Medio** · `Stockly-F/src/modules/tags/components/TagsPage.tsx:63-73,135-144` **[E]**

**Problema.** Tres grupos de botones sin ningún texto ni etiqueta:

```tsx
<button type="button" onClick={() => setValue("color", c)}
        className="h-7 w-7 rounded-full ..." style={{ backgroundColor: c, ... }} />
```

```tsx
<Button variant="ghost" onClick={() => handleEdit(tag)}><PencilIcon className="h-3.5 w-3.5 ..." /></Button>
<Button variant="ghost" onClick={() => deleteMutation.mutate(tag.id)}><TrashIcon className="h-3.5 w-3.5 ..." /></Button>
```

Los diez selectores de color se anuncian como "botón" a secas, y el estado seleccionado se comunica solo con un `outline` CSS. Los botones de editar/eliminar tampoco tienen `title` (a diferencia de `ProductTable` y `SuppliersPage`, que sí lo tienen).

**Impacto.** La gestión de etiquetas es inoperable con lector de pantalla: no hay forma de saber qué color se está eligiendo, cuál está activo, ni qué hace cada icono. WCAG 4.1.2 (nivel A).

**Solución propuesta.**

```tsx
<button type="button" aria-label={`Color ${c}`} aria-pressed={selectedColor === c} onClick={() => setValue("color", c)} ... />
<Button variant="ghost" aria-label={`Editar etiqueta ${tag.name}`} onClick={() => handleEdit(tag)}>…</Button>
<Button variant="ghost" aria-label={`Eliminar etiqueta ${tag.name}`} …>…</Button>
```

Envolver los colores en `<div role="group" aria-label="Color de la etiqueta">`. Sustituir los nombres hexadecimales por nombres legibles ("Azul", "Verde"…) mejora aún más la experiencia.

**Esfuerzo:** bajo.

---

#### A-03 · `<Link>` envolviendo `<Button>` — anidamiento interactivo inválido · **Medio** · `Stockly-F/src/modules/products/components/ProductTable.tsx:156-160` **[E]**

**Problema.**

```tsx
<Link to={`/catalog/products/${product.id}/movements`}>
    <Button variant="ghost" title="Historial de movimientos" type="button">
        <ChartBarIcon className="h-4 w-4 text-blue-500" />
    </Button>
</Link>
```

Un `<button>` dentro de un `<a>` es HTML inválido: el modelo de contenido de `<a>` prohíbe contenido interactivo.

**Impacto.** Dos paradas de tabulación para una sola acción; los lectores de pantalla anuncian un enlace y un botón anidados; y el comportamiento de activación con teclado difiere entre navegadores. La acción aparece una vez por fila, así que en una tabla de 10 productos son 10 controles duplicados.

**Solución propuesta.** Usar un único elemento con la semántica correcta —es una navegación, luego un enlace estilado:

```tsx
<Link
    to={`/catalog/products/${product.id}/movements`}
    aria-label={`Historial de movimientos de ${product.name}`}
    className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-100 transition-colors"
>
    <ChartBarIcon className="h-4 w-4 text-blue-500" aria-hidden="true" />
</Link>
```

**Esfuerzo:** bajo.

---

#### A-04 · Casillas de selección de fila sin nombre accesible · **Medio** · `Stockly-F/src/modules/products/components/ProductTable.tsx:71-76` **[E]**

**Problema.**

```tsx
<input type="checkbox" checked={selectedIds?.has(product.id) ?? false}
       onChange={() => onToggleSelect!(product.id)} className="h-4 w-4 ..." />
```

Sin `<label>`, sin `aria-label`. Tampoco existe una casilla de "seleccionar todo".

**Impacto.** El flujo de ajuste masivo de stock —una de las operaciones destructivas del producto— es inaccesible: el usuario oye "casilla, no marcada" sin saber a qué producto corresponde. WCAG 4.1.2.

**Solución propuesta.** `aria-label={`Seleccionar ${product.name}`}` y añadir una casilla de cabecera con `aria-label="Seleccionar todos los productos"` y estado indeterminado.

**Esfuerzo:** bajo.

---

#### A-05 · Sin enlace para saltar al contenido principal · **Medio** · `Stockly-F/src/App.tsx:184-236` **[E]**

**Problema.** La barra de navegación contiene entre 3 y 12 controles (según el rol) y se repite en todas las páginas. No hay mecanismo para saltarla.

**Impacto.** Un usuario de teclado o lector de pantalla debe recorrer toda la navegación en cada cambio de página. WCAG 2.4.1 (Evitar bloques, nivel A).

**Solución propuesta.**

```tsx
<a href="#contenido"
   className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white">
    Saltar al contenido
</a>
{/* ... */}
<main id="contenido" tabIndex={-1}><Outlet /></main>
```

**Esfuerzo:** bajo.

---

#### A-06 · Sin soporte de `prefers-reduced-motion` · **Medio** · `Stockly-F/src/index.css` (completo) **[E]**

**Problema.** Búsqueda en todo `src/`: cero coincidencias de `prefers-reduced-motion`. La interfaz usa `transition-colors`, `transition-transform`, `transition-shadow`, `hover:scale-110` y `animate-spin` de forma generalizada.

**Impacto.** Usuarios con trastornos vestibulares o sensibilidad al movimiento no tienen forma de reducirlo, pese a haberlo declarado a nivel de sistema operativo.

**Solución propuesta.** Nueve líneas en `index.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Esfuerzo:** bajo.

---

#### A-07 · `NavDropdown` sin atributos ARIA de menú ni cierre con Escape · **Medio** · `Stockly-F/src/shared/components/NavDropdown.tsx:36-46` **[E]**

**Problema.** El `UserMenu` de `App.tsx:67-72` está bien resuelto (`aria-label`, `aria-haspopup`, `aria-expanded`, `role="menu"`, `role="menuitem"`). El `NavDropdown` —usado para Catálogo, Órdenes y Admin— no tiene ninguno de ellos. Ninguno de los dos cierra con Escape ni devuelve el foco al botón.

**Impacto.** El estado abierto/cerrado de los tres menús principales de navegación no se comunica. Un usuario de teclado que abre un menú no puede cerrarlo sin tabular fuera de él.

**Solución propuesta.** Replicar el patrón del `UserMenu` (`aria-haspopup="menu"`, `aria-expanded={open}`, `role="menu"`/`role="menuitem"`) y añadir en ambos un listener de `keydown` para Escape que cierre y restaure el foco al botón disparador.

**Esfuerzo:** bajo.

---

#### A-08 · Los conmutadores de etiqueta del formulario de producto no exponen su estado · **Medio** · `Stockly-F/src/modules/products/components/ProductForm.tsx:221-252` **[E]**

**Problema.** Los botones de etiqueta comunican la selección solo con color de fondo, sin `aria-pressed`. El grupo se etiqueta con un `<p>`, no con `fieldset`/`legend` ni `role="group"`.

**Impacto.** No hay forma no visual de saber qué etiquetas están seleccionadas. Agravado por que el color de fondo es arbitrario (`tag.color`), lo que puede producir texto blanco sobre un color claro y fallar el contraste. *(Este hallazgo queda subordinado a AR-05: hoy la selección no tiene efecto alguno.)*

**Solución propuesta.** `aria-pressed={isSelected}` en cada botón, envolver en `<div role="group" aria-label="Etiquetas del producto">`, y calcular la luminancia de `tag.color` para elegir texto blanco o negro.

**Esfuerzo:** bajo.

---

#### A-09 · Sin gestión de foco ni anuncio al cambiar de ruta · **Bajo** · `Stockly-F/src/routes/index.tsx` **[E]**

**Problema.** En una SPA, navegar no recarga la página: el foco permanece donde estaba y el lector de pantalla no anuncia nada.

**Impacto.** Tras pulsar un enlace de navegación, el usuario de lector de pantalla no recibe confirmación del cambio de contexto.

**Solución propuesta.** Un componente en el layout que, al cambiar `pathname`, mueva el foco a `<main tabIndex={-1}>` y actualice una región `aria-live="polite"` con el título de la página.

**Esfuerzo:** medio.

---

#### A-10 · Iconos decorativos sin `aria-hidden` · **Bajo** · transversal (Heroicons en `ProductTable`, `App.tsx`, `DashboardPage`, …) **[E]**

**Problema.** Solo `Select.tsx:43` marca su chevron con `aria-hidden="true"`. El resto de iconos decorativos no.

**Impacto.** Ruido menor en lectores de pantalla; los SVG sin `role` suelen ignorarse igualmente, por lo que el impacto real es bajo.

**Solución propuesta.** Añadir `aria-hidden="true"` a los iconos que acompañan a texto.

**Esfuerzo:** bajo.

---

### Área 6 — Diseño responsivo y UI/UX

#### U-01 · Las rutas de administración son alcanzables por usuarios sin rol ADMIN · **Medio** · `Stockly-F/src/routes/index.tsx:70-77`, `shared/components/ProtectedRoute.tsx:9-22` **[E]**

**Problema.** `ProtectedRoute` solo comprueba que exista sesión, no el rol. `/settings`, `/audit-logs` y `/admin/users` están protegidos en el backend con `requireRole("ADMIN")` (correcto), pero el router del frontend los monta para cualquier usuario autenticado. El menú de navegación sí los oculta (`App.tsx:209`), así que solo se llega por URL directa o marcador.

**Impacto.** No es un fallo de seguridad —el backend rechaza con 403— pero un usuario con rol USER que abra `/admin/users` ve una página rota con toasts de error en lugar de una redirección limpia.

**Solución propuesta.** Extender `ProtectedRoute` con un parámetro de rol:

```tsx
export function ProtectedRoute({ children, requireRole }: { children: ReactNode; requireRole?: "ADMIN" }) {
    const { user, isLoading, isError } = useAuth();
    if (isLoading) return <PantallaCarga />;
    if (isError || !user) return <Navigate to="/auth/login" replace />;
    if (requireRole && user.role !== requireRole) return <Navigate to="/" replace />;
    return <>{children}</>;
}
```

y envolver las tres rutas de administración.

**Esfuerzo:** bajo.

---

#### U-02 · `setState` síncrono dentro de efectos — riesgo de renderizado en cascada · **Medio** · `Stockly-F/src/modules/settings/components/SettingsPage.tsx:30-34`, `App.tsx:180-182`, `ProductForm.tsx:91-109` **[E — detectado por ESLint]**

**Problema.** Tres errores del plugin `react-hooks`: *"Calling setState synchronously within an effect can trigger cascading renders"*. El más serio es `SettingsPage`:

```tsx
const { data: settings = [], isLoading } = useSettings();
useEffect(() => {
    const initial: Record<string, string> = {};
    settings.forEach((s) => { initial[s.key] = s.value; });
    setLocalValues(initial);
}, [settings]);
```

Mientras la consulta carga, `data` es `undefined` y el valor por defecto `[]` crea **un array nuevo en cada render**. La dependencia cambia de identidad siempre → el efecto se ejecuta siempre → `setLocalValues` recibe un objeto nuevo siempre → nuevo render. El bucle solo se detiene cuando React Query devuelve una referencia estable.

**Impacto.** Renders desperdiciados y, potencialmente, el error *"Maximum update depth exceeded"* durante la carga. *No se ha reproducido en navegador* — el test unitario no lo detecta porque mockea el hook con datos estables desde el primer render. **Pendiente de verificación en ejecución.**

**Solución propuesta.** Derivar el estado en lugar de sincronizarlo, o estabilizar la dependencia:

```tsx
const { data, isLoading } = useSettings();
const settings = useMemo(() => data ?? [], [data]);   // referencia estable
const [overrides, setOverrides] = useState<Record<string, string>>({});
const valueOf = (s: SettingEntry) => overrides[s.key] ?? String(s.value);
const isDirty = settings.some((s) => valueOf(s) !== String(s.value));
```

Esto elimina el efecto por completo y resuelve de paso la mitad de AR-04.

**Esfuerzo:** bajo.

---

#### U-03 · El formulario de edición de etiquetas no carga los datos de la etiqueta · **Medio** · `Stockly-F/src/modules/tags/components/TagsPage.tsx:33-35,151` **[E]**

**Problema.** `TagFormModal` está montado permanentemente y recibe `tag` como prop, pero `useForm` solo aplica `defaultValues` en el primer montaje:

```tsx
const { register, ... } = useForm<TagFormData>({
    defaultValues: { name: tag?.name ?? "", color: tag?.color ?? PRESET_COLORS[0] },
});
```

Al pulsar "Editar", `tag` cambia pero el formulario no se reinicializa. `ProductsPage:255`, `SuppliersPage:183` y `CatalogItemSection:180` resuelven exactamente esto con `key={editing?.id ?? "new"}`; `TagsPage:151` es el único sitio que lo omite.

**Impacto.** Editar una etiqueta abre el modal con el campo de nombre vacío. Si el usuario guarda sin darse cuenta, la validación `required` lo detiene — pero si escribe un nombre pensando que está corrigiendo, sobrescribe con datos parciales.

**Solución propuesta.** Una línea, alineada con el resto del código base:

```tsx
<TagFormModal key={editingTag?.id ?? "new"} isOpen={formOpen} onClose={handleClose} tag={editingTag} />
```

**Esfuerzo:** bajo.

---

#### U-04 · Sin modo oscuro · **Bajo** · `Stockly-F/src/index.css` **[E]**

**Problema.** Cero clases `dark:` en todo el proyecto; ningún soporte de `prefers-color-scheme`. Las plantillas de correo, en cambio, sí declaran `color-scheme: light dark` (`emailTemplates.ts:44-45`) — una inconsistencia curiosa.

**Impacto.** Preferencia de usuario no atendida en una herramienta de uso diario prolongado.

**Solución propuesta.** Fuera del alcance inmediato. Si se aborda, hacerlo con tokens semánticos en `@theme` de Tailwind 4 antes que con clases `dark:` dispersas.

**Esfuerzo:** alto.

---

#### U-05 · Sin internacionalización · **Bajo** · transversal **[E]**

**Problema.** Todos los textos están incrustados en los componentes, y los mensajes de error del backend llegan en español desde la API.

**Impacto.** Ninguno hoy (producto en español). Bloquearía cualquier expansión futura.

**Solución propuesta.** Fuera del alcance inmediato. Requeriría extraer cadenas en ambos repos y devolver códigos de error en lugar de mensajes desde la API.

**Esfuerzo:** alto.

---

#### U-06 · El botón flotante puede tapar la paginación en móvil · **Bajo** · `Stockly-F/src/modules/products/components/ProductsPage.tsx:224-238` **[P]**

**Problema.** El botón "Movimiento manual" es `fixed bottom-6 right-6 z-50`; los controles de paginación son estáticos al final del contenido (`:240-252`).

**Impacto.** En pantallas estrechas con un producto seleccionado, el botón flotante probablemente solape "Siguiente". **Pendiente de verificación en navegador.**

**Solución propuesta.** Añadir `pb-24` al contenedor de página cuando el botón esté visible, o anclar el botón a la barra de acciones masivas que ya existe arriba.

**Esfuerzo:** bajo.

---

#### U-07 · La exportación de movimientos navega directamente a la API · **Bajo** · `Stockly-F/src/modules/products/api/product.api.ts:95-100` **[E]**

**Problema.**

```ts
const a = document.createElement("a");
a.href = `${api.defaults.baseURL}/products/${productId}/movements/export?format=csv`;
a.download = `stockly-movimientos-...csv`;
a.click();
```

Al ser una navegación de nivel superior a otro origen, el atributo `download` se ignora (el nombre lo impone el `Content-Disposition` del servidor) y la petición esquiva el interceptor de axios.

**Impacto.** Si la sesión ha caducado, el usuario descarga un archivo con el JSON de error 401 en lugar de ser redirigido al login. Además, el CSV se envía como `text/csv` sin `charset=utf-8` ni BOM (`product.controller.ts:133`), por lo que los acentos se ven mal al abrirlo en Excel en Windows.

**Solución propuesta.** Descargar vía axios como `blob` y reutilizar `downloadBlob`; y en el backend, `res.setHeader("Content-Type", "text/csv; charset=utf-8")` anteponiendo el BOM `﻿`.

**Esfuerzo:** bajo.

---

### Área 8 — QA y testing

**Estado medido (ejecución real en esta auditoría):**

| Suite | Resultado | Cobertura (sentencias / ramas / funciones / líneas) |
|---|---|---|
| Backend — Jest + Supertest | **198/198** en 18 suites, 15.8 s | **86.92 % / 70.60 % / 85.76 % / 88.11 %** |
| Frontend — Vitest + Testing Library | **181/181** en 20 archivos, 7.6 s | **19.88 % / 23.01 % / 13.02 % / 20.65 %** |
| Typecheck backend (`tsc --noEmit`) | ✅ sin errores | — |
| Typecheck frontend (`tsc -b`) | ✅ sin errores | — |
| Lint frontend (`eslint .`) | ❌ **26 errores, 4 avisos** | — |
| Build frontend (`vite build`) | ✅ 2.48 s | — |
| Build backend (`node dist/server.js`) | ❌ **MODULE_NOT_FOUND** (AR-01) | — |
| Imagen Docker (`docker compose build backend`) | ❌ **falla en el primer `pnpm install`** (AR-02) | — |
| E2E (Playwright) | no ejecutado — requiere ambos servidores y credencial (S-02) | — |

Las recomendaciones de la revisión anterior se aplicaron con solvencia: `coverage.all: true` está activo, existen `csrf.test.ts`, `env.test.ts`, `low-stock-alert.test.ts`, `products-extra.test.ts`, `axios.test.ts`, `ProductForm.test.tsx`, `SettingsPage.test.tsx` y un smoke E2E. El backend subió de 80.9 % a 86.9 %.

#### Q-01 · Ningún test cruza la frontera entre repositorios · **Alto** · transversal **[V]**

**Problema.** Con 379 tests en verde, los tres defectos funcionales confirmados en esta auditoría (AR-03, AR-04, AR-05) no producen un solo fallo. La razón es estructural: cada repositorio prueba contra su propia suposición del contrato. `settings.test.ts:53` envía la forma plana que el backend espera; el frontend envía otra distinta y nadie compara. `SettingsPage.test.tsx:20-23` mockea `value: "false"` como cadena, cuando la API real devuelve un boolean.

**Impacto.** La suite da una sensación de seguridad que no se corresponde con la realidad. Es el hallazgo de QA más importante: no es una cuestión de *cuánta* cobertura, sino de *qué frontera* se está probando.

**Solución propuesta.** Tres niveles, por orden de coste:

1. **Barato e inmediato:** ampliar el smoke E2E de Playwright para cubrir los flujos rotos —activar una configuración y recargar, crear un producto con etiqueta y verificarla, cancelar una orden enviada y comprobar el stock. Los tres bugs habrían caído aquí.
2. **Medio:** tests de contrato en el frontend que validen los mocks contra esquemas Zod compartidos, de modo que un mock desalineado con la API haga fallar los tests.
3. **Estructural:** el paquete compartido de AR-06.

**Esfuerzo:** medio.

---

#### Q-02 · Cobertura real del frontend: 19.88 % · **Alto** · `Stockly-F` **[V — medido]**

**Problema.** Ahora que `coverage.all: true` está activo, el número refleja la aplicación completa. Están al 0 %: `src/routes/`, `App.tsx`, y las páginas de Dashboard, Reports, SaleOrders, PurchaseOrders, Users, AuditLogs, StockMovements, Tags, Suppliers, Catalog, y las cuatro páginas de auth secundarias. Lo que sí está probado está bien hecho: `src/shared/api` al 87.23 % (el interceptor de axios con su cola de refresh, que era la mayor laguna anterior), los esquemas Zod al 100 %, y los componentes base con tests de interacción.

**Impacto.** Las páginas más complejas —órdenes de venta y compra con formularios de array dinámico, reportes con gráficos, movimientos de stock— no tienen red de seguridad. Cualquier refactor en ellas es a ciegas.

**Solución propuesta.** Priorizar por riesgo, no por porcentaje: primero `SaleOrdersPage` y `PurchaseOrdersPage` (formularios complejos y transiciones de estado con efectos sobre el inventario), luego `UsersPage` (acciones destructivas), luego `DashboardPage`/`ReportsPage`. Fijar un umbral de cobertura en `vite.config.ts` al nivel actual y subirlo progresivamente para que no retroceda.

**Esfuerzo:** alto.

---

#### Q-03 · `pnpm lint` falla · **Medio** · `Stockly-F/eslint.config.js` **[V]**

**Problema.** 26 errores y 4 avisos, en tres categorías:

- **23 errores** `react-refresh/only-export-components` en `routes/index.tsx:8-40`, por exportar los componentes creados con `lazy()`. Es un falso positivo: ese archivo no es un módulo de componentes.
- **3 errores** `react-hooks` de `setState` en efectos → ver U-02.
- **1 aviso** `Compilation Skipped: Use of incompatible library` en `TagsPage.tsx:37` (`watch("color")` de React Hook Form hace que el React Compiler descarte ese componente).
- **3 avisos** de directivas `eslint-disable` inútiles.

**Impacto.** No hay puerta de calidad de linting utilizable: como el comando siempre falla, los 3 errores reales de hooks se pierden en el ruido. Al no formar parte de ninguna secuencia de verificación, nadie lo ejecuta.

**Solución propuesta.** Desactivar la regla en el archivo de rutas y corregir los errores reales:

```js
{
  files: ['src/routes/**/*.tsx'],
  rules: { 'react-refresh/only-export-components': 'off' },
},
```

Objetivo: `pnpm lint` en verde, y añadirlo al guion de verificación local (V-01).

**Esfuerzo:** bajo.

---

#### Q-04 · El E2E no es ejecutable de forma reproducible · **Medio** · `Stockly-F/playwright.config.ts:21-26`, `e2e/smoke.spec.ts:5` **[E]**

**Problema.** El `webServer` de Playwright solo arranca el frontend; el backend y la base de datos deben estar levantados a mano. La credencial por defecto es la del hallazgo S-02 y no coincide con el seed. No hay un comando único que deje el entorno listo.

**Impacto.** El E2E no puede lanzarse de un tirón y, contra una base de datos recién sembrada, falla.

**Solución propuesta.** Componer el arranque completo (`docker compose up -d db` + `db:migrate` + `db:seed` + backend + frontend) mediante un `globalSetup` o un script `test:e2e:full`, y usar la credencial del seed. Añadir el proyecto `Mobile Chrome` de Playwright para cubrir de paso los hallazgos responsive.

**Esfuerzo:** medio.

---

#### Q-05 · Sin umbrales de cobertura · **Bajo** · `Stockly-B/jest.config.js`, `Stockly-F/vite.config.ts:40-53` **[E]**

**Problema.** Ninguna de las dos configuraciones define `coverageThreshold` / `thresholds`.

**Impacto.** Nada impide que la cobertura baje. En el frontend, al 19.88 %, es especialmente relevante fijar un suelo.

**Solución propuesta.** Fijar el umbral en el valor actual menos 2 puntos en ambos repos y subirlo con cada incorporación de tests.

**Esfuerzo:** bajo.

---

#### Q-06 · Zonas del backend con baja cobertura · **Bajo** · `Stockly-B/src/shared/lib/nodemailer.ts` (31.8 %), `shared/middlewares/upload.middleware.ts` (47.05 %), `sale-orders.controller.ts` (53.06 %) **[V — medido]**

**Problema.** `nodemailer` y `upload` están siempre mockeados, por lo que sus rutas de error nunca se ejercitan. `sale-orders.controller.ts:74-87` (exportación) y `sale-orders.service.ts:155-180` no tienen tests, pese a que el módulo gestiona salidas de inventario.

**Impacto.** Menor que las otras entradas de esta sección: son caminos de infraestructura o de exportación, no de integridad de datos. Se documenta por completitud.

**Solución propuesta.** Tests para la exportación de órdenes de venta (formato CSV y JSON) y para el `fileFilter` de multer con un mimetype no permitido.

**Esfuerzo:** bajo.

---

### Área 9 — Refactorización y limpieza

#### R-01 · Lógica de escapado CSV duplicada entre repositorios · **Bajo** · `Stockly-B/src/shared/lib/csv.ts:1-11` y `Stockly-F/src/modules/products/utils/importExport.ts:16-26` **[E]**

**Problema.** Las dos funciones de escapado son idénticas, incluido el comentario. Además, las cabeceras que exporta cada lado difieren: el backend incluye `sku`, `minStock` y `tags` (`product.service.ts:226-238`); el frontend no (`importExport.ts:5-14`).

**Impacto.** Un mismo botón "Exportar CSV" produce columnas distintas según la ruta usada. Y una futura corrección del escapado tendría que aplicarse dos veces — exactamente el riesgo que ya se materializó cuando se corrigió la inyección de fórmulas en la revisión anterior.

**Solución propuesta.** Unificar las cabeceras (candidato natural para el paquete compartido de AR-06) o, como mínimo, documentar la divergencia en un comentario en ambos archivos.

**Esfuerzo:** bajo.

---

#### R-02 · Documentación de tooling de IA versionada en ambos repos · **Bajo** · `Stockly-B/.agents/skills/**`, `Stockly-F/.agents/skills/**` **[V]**

**Problema.** Cientos de archivos markdown de skills (`zod`, `vitest`, `prisma-*`, `react-best-practices`, …) están rastreados por git en ambos repositorios. `git ls-files` confirma que forman parte del historial.

**Impacto.** Ruido considerable en clones, diffs y búsquedas por texto. No afecta a la ejecución.

**Solución propuesta.** Decidir explícitamente: si es tooling personal, añadir `.agents/` al `.gitignore`; si se comparte deliberadamente con el equipo, documentarlo en el README para que no parezca un descuido.

**Esfuerzo:** bajo.

---

#### R-03 · Intercalado de enlaces enrevesado en la barra de navegación · **Bajo** · `Stockly-F/src/App.tsx:195-208` **[E]**

**Problema.** Señalado ya en la revisión de 2026-07-15 y aún presente: `navLinks.slice(0, 1)` y `navLinks.slice(1)` para colocar los desplegables entre "Dashboard" y "Reportes".

**Impacto.** Legibilidad. Añadir un enlace exige entender la aritmética de los índices.

**Solución propuesta.** Un único array de elementos discriminados:

```tsx
const navItems = [
    { kind: "link", to: "/", label: "Dashboard", end: true, Icon: HomeIcon },
    { kind: "dropdown", label: "Catálogo", Icon: Squares2X2Icon, items: catalogLinks, width: "w-40" },
    { kind: "dropdown", label: "Órdenes", Icon: ClipboardDocumentListIcon, items: orderLinks, width: "w-36" },
    { kind: "link", to: "/reports", label: "Reportes", end: false, Icon: ChartBarIcon },
] as const;
```

**Esfuerzo:** bajo.

---

#### R-04 · Artefactos de build en el árbol de trabajo · **Bajo** · `Stockly-B/dist/`, `Stockly-B/coverage/`, `Stockly-F/dist/`, `Stockly-F/coverage/` **[V]**

**Problema.** Presentes en disco. Correctamente ignorados por git en ambos repos, así que no contaminan el historial.

**Impacto.** Ninguno más allá del espacio y de la posibilidad de ejecutar un `dist/` obsoleto por error — que es precisamente cómo se manifiesta AR-01.

**Solución propuesta.** `rimraf dist coverage` como paso previo en el script de build.

**Esfuerzo:** bajo.

---

### Área 10 — Ortografía y redacción

**Revisada. Sin hallazgos de ortografía.** Se revisaron los textos de interfaz de las 20 páginas, los mensajes de error del backend (validadores Zod, `HttpError`, middlewares), las tres plantillas de correo y los comentarios del código. La ortografía y la acentuación son correctas, y la terminología es consistente (*producto*, *stock*, *orden de compra/venta*, *etiqueta*, *movimiento*). El tono es uniforme: directo y en segunda persona.

Las únicas incidencias de redacción son de idioma, no de ortografía, y están recogidas en **C-07**: tres comentarios en inglés y el mensaje de usuario `"Upload failed"`.

Un detalle menor bien resuelto que merece mención: la pluralización condicional está aplicada de forma consistente (`{n} producto{n !== 1 ? "s" : ""}`, `proveedor{...ates "es"}`), incluido el caso irregular de "proveedores" en `SuppliersPage.tsx:125`.

---

### Área 11 — Documentación

#### D-01 · Los READMEs documentan una API que no coincide con la real · **Medio** · `Stockly-B/README.md`, `README.md` (raíz) **[V]**

**Problema.** Divergencias verificadas contra el código:

| README dice | Realidad | Ubicación real |
|---|---|---|
| Rutas bajo `/api/auth`, `/api/products`, `/api/tags`, … | Prefijo `/api/v1` | `src/app.ts:45` |
| Swagger en `http://localhost:3000/api-docs` | `/api/v1/docs` | `src/swagger.ts:209` |
| `PUT /me/password` | `PATCH /me/password` | `auth.routes.ts:28` |
| `env.ts # Variables de entorno validadas con Zod` | Validación manual con un array de strings | `config/env.ts:4-17,56-85` |
| Node.js 20 LTS | La imagen Docker es `node:22-alpine` | `Dockerfile:2,19` |
| «Cloudinary y SMTP son opcionales en desarrollo» | `validateEnv()` **exige** las 8 variables y lanza excepción | `config/env.ts:4-17,59-67` |

**Impacto.** La última fila es un bloqueador real de puesta en marcha: alguien que siga el README y omita SMTP/Cloudinary obtiene un backend que se niega a arrancar sin que la documentación explique por qué. Las rutas incorrectas hacen que cualquier prueba manual con curl falle.

**Solución propuesta.** Corregir las seis filas. Para la contradicción de variables, decidir una de dos: o marcarlas como obligatorias en el README, o —mejor— hacerlas realmente opcionales moviéndolas fuera del array `required` y fallando solo al usar la funcionalidad correspondiente.

**Esfuerzo:** bajo.

---

#### D-02 · Swagger cubre 3 de 12 módulos y su esquema está obsoleto · **Medio** · `Stockly-B/src/swagger.ts:70-204` **[E]**

**Problema.** El spec documenta `auth` (parcial), `products` (parcial) y `stock movements`. Faltan por completo: `categories`, `brands`, `suppliers`, `purchase-orders`, `sale-orders`, `reports`, `tags`, `users`, `settings`, `audit-logs`, y de products faltan `bulk-stock`, `price-history` y las exportaciones. Además el esquema `Product` está desactualizado:

```ts
category: { type: "string", enum: ["Electrónica", "Periféricos", "Audio", "Accesorios", "Muebles", "Otros"] },
```

`category` es hoy una relación (`{ id, name }`) y el campo de escritura es `categoryId` (un UUID). El `requestBody` de `POST /products` exige un campo `category` que el validador no acepta.

**Impacto.** Un consumidor que siga la documentación interactiva construye peticiones que fallan con 422. Y hace inviable la opción de generar un cliente tipado (AR-06).

**Solución propuesta.** Migrar de un objeto literal mantenido a mano a generación desde los esquemas Zod (`zod-to-openapi`), que ya son la fuente de verdad de la validación. Como paso intermedio de bajo coste, corregir el esquema `Product` y añadir los módulos de órdenes y reportes.

**Esfuerzo:** medio.

---

#### D-03 · Sin CHANGELOG, guía de contribución ni ADRs · **Bajo** · raíz de ambos repos **[V]**

**Problema.** No existen `CHANGELOG.md`, `CONTRIBUTING.md` ni registro de decisiones de arquitectura. El proyecto ha tomado decisiones no obvias y bien fundadas —decremento condicional para cerrar la carrera de stock, tokens hasheados con SHA-256 en BD, `path` restringido de la cookie de refresh, alertas de correo fuera de la transacción— que hoy solo viven en comentarios dispersos.

**Impacto.** Ese conocimiento se pierde si el proyecto cambia de manos, y un colaborador nuevo puede deshacer una decisión deliberada creyendo que simplifica.

**Solución propuesta.** Un `docs/adr/` con una entrada corta por decisión (contexto, decisión, consecuencias). Empezar por las cuatro citadas. `CHANGELOG.md` con formato *Keep a Changelog*.

**Esfuerzo:** bajo.

---

### Área 12 — DevOps y configuración

#### V-01 · No existe una cadena de verificación única y repetible · **Crítico** · raíz de ambos repos **[V]**

> **Nota (2026-08-06).** El proyecto ha decidido **no usar CI**: nada de GitHub Actions ni de ningún otro proveedor. Toda la verificación se ejecuta en local. El hallazgo sigue siendo válido —el problema real es que nada encadena las comprobaciones—, pero la solución propuesta se reformula como guion local en lugar de pipeline.

**Problema.** No existe ningún comando único que ejecute la secuencia completa de comprobaciones. Cada paso (typecheck, lint, tests, cobertura, build, arranque del artefacto) hay que recordarlo y lanzarlo a mano, por separado, en cada repositorio.

**Impacto.** Es el multiplicador de todos los demás hallazgos de esta auditoría. Por eso `pnpm lint` lleva tiempo fallando sin que se note (Q-03), y por eso AR-01 —un build de producción que no arranca— ha podido llegar hasta aquí sin ser detectado. Los 379 tests solo valen lo que valga la disciplina de ejecutarlos a mano, y esa disciplina falla precisamente cuando la secuencia no está escrita en ninguna parte.

**Solución propuesta.** Un script `verify` por repositorio, ejecutado en local antes de dar por cerrada cualquier tarea. Backend (requiere la base de datos levantada, `docker compose up -d db`):

```jsonc
// Stockly-B/package.json
"scripts": {
  "verify": "pnpm exec prisma generate && pnpm exec prisma migrate deploy && pnpm check && pnpm test:coverage && pnpm build && node scripts/smoke.js"
}
```

`scripts/smoke.js` arranca `dist/server.js` y comprueba `GET /api/v1/health` — es lo único que detecta AR-01, porque un build que compila puede seguir sin arrancar.

Frontend:

```jsonc
// Stockly-F/package.json
"scripts": {
  "verify": "pnpm check && pnpm lint && pnpm test:coverage && pnpm build"
}
```

Y, por encima, el E2E reproducible de Q-04 (`test:e2e:full`), que levanta base de datos, backend y frontend.

**Esfuerzo:** bajo.

---

#### V-02 · Build de imagen no reproducible · **Medio** · `Stockly-B/Dockerfile:7,23` **[E]**

**Problema.** `corepack prepare pnpm@latest --activate` en ambos stages. Cada build usa la versión de pnpm que sea la última ese día, que puede diferir de la que generó el `pnpm-lock.yaml`.

**Impacto.** Dos builds del mismo commit pueden producir árboles de dependencias distintos. Un cambio mayor de pnpm rompe el build sin que nada haya cambiado en el repositorio.

**Solución propuesta.** Fijar la versión, coherente con `devEngines.packageManager` de `package.json:22-28`:

```dockerfile
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
```

Mejor aún, añadir el campo `"packageManager": "pnpm@11.2.2"` a `package.json` y dejar que corepack lo resuelva.

**Esfuerzo:** bajo.

---

#### V-03 · Sin healthcheck de aplicación ni sonda de readiness · **Medio** · `docker-compose.yml:22-38`, `Stockly-B/src/routes/index.ts:17-19` **[E]**

**Problema.** El servicio `db` tiene healthcheck; el servicio `backend` no. Y el endpoint `/health` no comprueba nada:

```ts
router.get("/health", (_req, res) => {
    res.json({ success: true, message: "API corriendo correctamente" });
});
```

Responde 200 aunque la base de datos esté caída.

**Impacto.** Un orquestador considera sano un contenedor incapaz de servir una sola petición útil. No hay señal de readiness para despliegues sin corte.

**Solución propuesta.** Distinguir liveness de readiness y añadir el healthcheck al compose:

```ts
router.get("/health", (_req, res) => res.json({ success: true, message: "API corriendo correctamente" }));
router.get("/ready", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ success: true, message: "Listo" });
    } catch {
        res.status(503).json({ success: false, message: "Base de datos no disponible" });
    }
});
```

```yaml
backend:
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/v1/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
    interval: 10s
    retries: 5
```

**Esfuerzo:** bajo.

---

#### V-04 · Credenciales por defecto de PostgreSQL en compose · **Medio** · `docker-compose.yml:9-13` **[E]**

**Problema.** `POSTGRES_USER: postgres` / `POSTGRES_PASSWORD: postgres` incrustados, con el puerto 5432 publicado en el host.

**Impacto.** Aceptable en desarrollo local; inaceptable si ese mismo archivo se usa para desplegar, que es lo que el README raíz sugiere al titular la sección "Docker (producción)".

**Solución propuesta.** Externalizar a variables (`${POSTGRES_PASSWORD:?requerida}`), no publicar el puerto en el perfil de producción, y separar `docker-compose.yml` de `docker-compose.prod.yml` para que la distinción sea explícita.

**Esfuerzo:** bajo.

---

#### V-05 · El frontend no tiene ruta de despliegue · **Medio** · `docker-compose.yml`, `Stockly-F/` **[E]**

**Problema.** No hay `Dockerfile` en `Stockly-F`, ni servicio en el compose. El README raíz se limita a «El frontend se sirve por separado (Vite / Nginx)», sin más detalle.

**Impacto.** La mitad del producto no tiene procedimiento de despliegue reproducible. Además, con el frontend en un origen distinto al backend, la configuración de CORS y el `sameSite: "none"` de las cookies (S-04) quedan sin validar en un entorno realista.

**Solución propuesta.** `Dockerfile` multi-stage (build con Node, servido con `nginx:alpine`) con `try_files $uri /index.html` para el enrutado SPA, y su servicio en el compose. Documentar si frontend y backend comparten dominio, porque de ello depende si `sameSite` puede endurecerse a `lax`.

**Esfuerzo:** medio.

---

#### V-06 · Sin monitorización, backup ni estrategia de rollback · **Bajo** · transversal **[E]**

**Problema.** No hay recogida de métricas, ni agregación de logs, ni alertas, ni procedimiento documentado de copia de seguridad de la base de datos o de reversión de migraciones. El volumen `postgres_data` es la única persistencia.

**Impacto.** Un incidente en producción se detectaría por el reporte de un usuario, y no habría procedimiento de recuperación. Relevante en un sistema cuyo valor es precisamente la integridad de un histórico de inventario.

**Solución propuesta.** Documentar como mínimo: `pg_dump` programado con retención definida, procedimiento de restauración probado, y política de migraciones hacia adelante (dado que `prisma migrate` no genera *down migrations*). Un endpoint `/metrics` y un agregador de logs cuando el proyecto entre en producción real.

**Esfuerzo:** medio.

---

### Área 4 — SEO

**Revisada. Sin hallazgos accionables de severidad media o superior.**

`Stockly-F/index.html` declara correctamente `lang="es"`, un `<title>` descriptivo («Stockly — Gestión de inventario»), una `<meta name="description">` adecuada, el `viewport` y un favicon — todas las correcciones señaladas en la revisión anterior están aplicadas y verificadas.

La aplicación es una SPA íntegramente detrás de autenticación: no existe contenido público indexable, por lo que la ausencia de SSR/SSG, `sitemap.xml`, URLs canónicas y datos estructurados es **la decisión correcta**, no una carencia. La jerarquía de encabezados es coherente en las páginas revisadas (un único `<h1>` por página, `<h2>` para las secciones).

Única recomendación, de severidad baja: añadir un `public/robots.txt` con `User-agent: * / Disallow: /` para declarar explícitamente que no debe indexarse. Recogida como **T3-12** en el roadmap.

---

## 4. Plan de acción priorizado

### Quick wins (< 1 día en total)

Todos de esfuerzo bajo, todos con impacto desproporcionado respecto a su coste:

| Tarea | Hallazgo | Por qué primero |
|---|---|---|
| `tsc-alias` en el build | AR-01 | Desbloquea cualquier despliegue. 2 líneas. |
| `refreshToken: null` en `resetPassword` | S-01 | Cierra la sesión del atacante. 2 líneas. |
| Declarar `tagIds` en los esquemas Zod | AR-05 | Repara un módulo entero. |
| Corregir el payload y el tipo de settings | AR-04 | Repara la única opción configurable. |
| `key` en `TagFormModal` | U-03 | 1 línea. |
| `parsePagination` compartido | C-01 | Elimina cuatro fuentes de 500. |
| Middleware 404 JSON | C-03 | 4 líneas. |
| `aria-invalid` + `aria-describedby` en `Input`/`Select` | A-01 | Arregla la accesibilidad de todos los formularios a la vez. |
| Bloque `prefers-reduced-motion` | A-06 | 9 líneas de CSS. |
| Enlace "saltar al contenido" | A-05 | Cierra un incumplimiento WCAG de nivel A. |
| `requireTLS` en el transporte SMTP | S-05 | 2 líneas. |
| `USER node` en el Dockerfile | S-06 | 1 línea. |
| Fijar la versión de pnpm | V-02 | 1 línea. |
| Retirar la credencial del E2E | S-02 | 1 línea (+ rotarla donde se use). |
| Migración de índices | P-01 | Un archivo; evita una degradación difícil de diagnosticar más tarde. |

### Corto plazo (1–2 semanas)

1. **Reparar el despliegue de extremo a extremo** — AR-02 más la verificación de que `docker compose up --build` responde en `/api/v1/health`. Sin esto, ningún otro trabajo llega a un usuario.
2. **Reversión de stock al cancelar órdenes** — AR-03, con tests de integración que cubran las cuatro transiciones (`SHIPPED→CANCELLED`, `RECEIVED→CANCELLED` y sus casos de stock insuficiente). Es el único hallazgo que corrompe datos de forma permanente.
3. **Guion `verify` en ambos repositorios** — V-01. Debe entrar inmediatamente después de las correcciones anteriores, para que no puedan volver a romperse en silencio.
4. **Poner el lint en verde** — Q-03 y U-02, que van juntos.
5. **`isActive` en `requireAuth` + centralizar `getActorEmail`** — S-03 y C-02 tocan el mismo `select`; conviene hacerlos en un solo cambio.
6. **Guardia de rol en el router y accesibilidad de etiquetas** — U-01, A-02, A-03, A-04, A-07.
7. **Corregir READMEs y la contradicción de variables de entorno** — D-01.
8. **Ampliar el smoke E2E a los tres flujos que estaban rotos** — Q-01, nivel 1. Es la red de seguridad más barata contra este tipo de regresión.

### Medio plazo (1–3 meses)

1. **Contratos compartidos entre repos** — AR-06 y Q-01 nivel 2/3. Ataca la causa raíz de los tres bugs de esta auditoría, no sus síntomas.
2. **Subir la cobertura del frontend** por orden de riesgo — Q-02, empezando por órdenes de venta y compra.
3. **Rendimiento de reportes y exportaciones** — P-02, P-03, P-04, P-05.
4. **Logging estructurado con correlación de peticiones** — C-04, prerrequisito de cualquier observabilidad seria.
5. **Swagger generado desde los esquemas Zod** — D-02, que además habilita el cliente tipado.
6. **Despliegue del frontend y endurecimiento de la infraestructura** — V-05, V-03, V-04, V-06.
7. **Detección de reuso de refresh tokens** — S-08.

---

## 5. Puntos fuertes

Estos elementos son mejores que la media del sector y no deben tocarse en ninguna refactorización:

**Corrección de la concurrencia de inventario.** El decremento condicional dentro de la transacción (`product.service.ts:344-348`, `sale-orders.service.ts:104-113`) cierra correctamente la ventana leer-calcular-escribir que produce stock negativo bajo carga. Está además **probado** con tests que ejecutan salidas concurrentes reales. Es la parte más difícil del dominio y está bien resuelta.

**Atomicidad de las escrituras relacionadas.** Producto, historial de precios y movimiento de stock se escriben en una sola transacción (`product.service.ts:140-179`). Los envíos de correo se hacen deliberadamente **fuera** de ella para no retener bloqueos durante el SMTP, con un comentario que explica el porqué. Es una decisión de diseño madura.

**Postura de seguridad de la sesión.** Cookies `httpOnly` con `secure`/`sameSite` por entorno, refresh token con rotación y `path` restringido a `/api/v1/auth/refresh`, CSRF double-submit, `helmet`, rate limiting global más limitadores estrictos en autenticación, bcrypt con 12 rondas, tokens de verificación y reset hasheados con SHA-256 antes de persistirlos, política de contraseñas, longitud mínima obligatoria del secreto JWT, y `forgot-password` silencioso que no revela si un correo existe.

**Consistencia arquitectónica.** La estructura por módulos (`controller`/`service`/`routes`/`validator`/`types` en el backend; `api`/`components`/`hooks`/`types` en el frontend) es idéntica y predecible en los doce módulos. Encontrar cualquier cosa en este proyecto es trivial.

**Interceptor de axios con cola de refresh.** `shared/api/axios.ts` gestiona correctamente el caso difícil: varias peticiones que reciben 401 simultáneamente encolan y esperan a un único refresh en vuelo, en lugar de disparar N renovaciones en paralelo. Y desde la revisión anterior tiene tests (87.23 % de cobertura en `shared/api`).

**Calidad de los tests del backend.** No es solo el 86.9 %: los tests prueban lo que importa —guardias de autenticación, autorización por rol, validación, atomicidad y concurrencia— contra una base de datos real y separada (`Stockly_test`), no contra mocks.

**Plantillas de correo.** Reconstruidas desde la revisión anterior con layout de tablas, contenedor de 600 px, preheader, botón compatible con Outlook, cabecera de marca alineada con la paleta de la UI, y `escapeHtml` aplicado a todo dato de usuario. Están, hoy, por encima del estándar habitual.

**Higiene del código.** Cero `TODO`, `FIXME` o `HACK` en el código de aplicación. Cero `console.log` fuera del seed y del arranque del servidor. `tsc --noEmit` limpio en ambos repos con `strict` activado. Los comentarios explican decisiones, no repiten el código.

**Capacidad de respuesta a revisiones previas.** De las recomendaciones de 2026-07-15 se aplicaron: inyección CSV, contraste, menú móvil, metadatos, accesibilidad del modal, plantillas de correo, `coverage.all`, tests del interceptor de axios, tests de CSRF y de alertas de bajo stock, smoke E2E, y el dashboard consumiendo el endpoint de reportes en lugar de un límite de 100 productos. Es un ritmo de corrección sostenido y correcto.

---

## 6. Zonas no cubiertas

Lo que **no** se pudo revisar en esta pasada, y qué haría falta para hacerlo:

| Zona | Motivo | Qué se necesitaría |
|---|---|---|
| **Auditoría de navegador (Lighthouse, contraste real, lectores de pantalla)** | No se levantó la aplicación en un navegador en esta sesión. Los hallazgos de accesibilidad son estáticos. | Ejecutar Lighthouse y un recorrido con NVDA/VoiceOver sobre la app en marcha. La revisión de 2026-07-15 reportó 96/100 y esas correcciones se confirman en el código. |
| **Rendimiento real de base de datos** | **Cubierto en parte (2026-08-09).** T2-09, T2-02, T2-05 y T2-43 midieron con `EXPLAIN ANALYZE` sobre 40 000 productos y movimientos: búsqueda 24.9 → 0.35 ms, histórico 5.709 → 0.747 ms, dashboard 200 → 27 ms. Falta la **carga sostenida** contra el pool de 10 conexiones. | Prueba de carga con k6 sobre movimientos de stock — es lo que queda de T4-08. |
| **Core Web Vitals** | Requiere la app desplegada y build de producción servido. Solo se midieron tamaños de bundle. | Medición de LCP/CLS/INP sobre el build de producción tras un despliegue real. |
| ~~**Verificación del despliegue Docker**~~ | **Cubierto durante la auditoría.** Se ejecutó `docker compose build` con el daemon activo y se inspeccionó la imagen construida: AR-02 pasa de deducción estática a hecho verificado, con cinco causas en lugar de las tres previstas. | — |
| ~~**E2E de Playwright**~~ | **Cubierto (T1-24).** `pnpm test:e2e:full` levanta base, backend y frontend sin pasos previos, y corre en `chromium` y `Mobile Chrome`: 9 pasados, 1 omitido. La credencial de S-02 se sustituyó por la del seed. | — |
| **Integración con Cloudinary** | Siempre mockeada en los tests (`upload.middleware.ts` al 47 % de cobertura). El flujo real de subida y borrado de imágenes nunca se ejerció. | Un entorno con credenciales de Cloudinary y tests de integración contra una carpeta de pruebas. |
| **Envío real de correo** | `nodemailer` siempre mockeado (31.8 % de cobertura). No se verificó la renderización en clientes reales. | Un servidor SMTP de captura (Mailpit / MailHog) y revisión en Gmail, Outlook y Apple Mail. |
| **Auditoría de dependencias (SCA) y licencias** | No se ejecutó `pnpm audit` ni un análisis de licencias. | `pnpm audit --prod` en ambos repos y un informe de licencias (`license-checker`). Nota: `Stockly-B` declara licencia `ISC` en `package.json` pero incluye un archivo `LICENSE` — conviene verificar que coinciden. |
| **Comportamiento bajo concurrencia real** | Los tests cubren concurrencia a nivel de transacción, pero no carga sostenida contra el pool de 10 conexiones (ver P-07). | Prueba de carga con k6 o Artillery sobre los endpoints de movimientos de stock. |
| ~~**U-02 (bucle de render en Configuración) y U-06 (solape del botón flotante)**~~ | **Cubiertos (T1-08/T1-10 y T3-09).** U-06 se reprodujo en navegador con `elementFromPoint` y resultó **peor que lo descrito**: los controles de paginación no se podían pulsar, y no solo en móvil — pasa igual a 1280×800. | — |

---

*Todos los hallazgos de este informe tienen su tarea correspondiente en [ROADMAP.md](ROADMAP.md).*
