# Contexto de trabajo — sesión del 2026-08-07

Arranque en frío para continuar en otro equipo. El detalle de cada tarea está en
[ROADMAP.md](ROADMAP.md); esto es lo que ese documento no cuenta.

---

## 1. Arrancar en la máquina nueva

```bash
git pull                                  # en Stockly-B y en Stockly-F
cd Stockly-B && cp .env.example .env      # completar las 12 variables
cd ../Stockly-F && cp .env.example .env   # solo VITE_API_URL
```

Los `.env` **no están en git** y no deben estarlo: sus valores (JWT_SECRET, Cloudinary,
SMTP) se pasan a mano. Cloudinary y SMTP admiten valores ficticios para desarrollo y
tests —están mockeados—, pero `validateEnv()` exige que existan o el servidor no arranca.

**Base de datos.** Sirve cualquier PostgreSQL con la base creada; solo tiene que
coincidir `DATABASE_URL`. En el equipo original era un PostgreSQL instalado en el
**puerto 5433**, no el de Docker — es lo primero que hay que ajustar si `verify` falla al
conectar. Con Docker: `docker compose up db -d` **desde `Stockly-B/`**, que es donde vive
ahora el `docker-compose.yml`.

Tras el seed, el admin es `admin@stockly.app` / `Admin1234!`.

---

## 2. Tres decisiones que gobiernan el trabajo

**Sin CI.** No hay GitHub Actions ni pipeline de ningún proveedor, y no deben proponerse.
Se eliminaron deliberadamente el 2026-08-06. La puerta de calidad es `pnpm verify` en
local, en cada repositorio, antes de dar por cerrada una tarea.

**Los docs viven en `Stockly-B/docs/`** aunque cubran los dos repositorios: la carpeta que
los contiene no está bajo control de versiones, así que alojarlos en el backend es lo que
hace que viajen entre equipos. Las rutas `Stockly-F/src/...` que aparecen en ellos se
refieren al repositorio hermano.

**Toda tarea cerrada se anota en el ROADMAP**: casilla marcada, fila en Progreso, métricas
al día, y una línea de «Verificado localmente» con cifras reales. Si algo del criterio de
aceptación no se pudo comprobar, se dice explícitamente en lugar de darlo por bueno.

---

## 3. Estado a fecha de hoy

| | Backend | Frontend |
|---|---|---|
| `pnpm verify` | ✅ exit 0 | ✅ exit 0 |
| Tests | **223/223** | **202/202** |
| Cobertura (sentencias) | 87.39 % | 25.81 % |
| Lint | — | **0 errores, 0 avisos** |

**Tier 0: 8/8** ✅ · **Tier 1: 17/26** · Total **26/100**.

Cerradas hoy: T1-01 a T1-14, T1-17, T1-18 y T1-22. La aplicación pasó de tener el guardado
de configuración roto, las etiquetas de producto inertes y una ventana de 15 minutos de
acceso para cuentas desactivadas, a tener las tres cosas corregidas y con tests.

**Pendientes de Tier 1 (9):** T1-15 (índices en BD), T1-16 (los cuatro endpoints que
devuelven 500 con `?page=abc`), T1-19/20/21 (CSRF, TLS en SMTP, contenedor sin
privilegios), T1-23/24 (E2E), T1-25/26 (documentación).

---

## 4. Trampas del entorno, ya pagadas

Cada una costó un fallo antes de entenderse. No hace falta redescubrirlas.

**El formato multipart no se puede probar por HTTP en la suite del backend.**
`upload.middleware` está mockeado en `products.test.ts`, así que multer —que es quien
parsea ese cuerpo— nunca corre y un `.field()` acaba en 422 con `req.body` sin parsear. La
normalización de `tagIds` se valida contra el esquema directamente.

**`process.exit()` en Windows aborta libuv** si hay un proceso hijo aún cerrándose
(`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`) y devuelve un código de salida
sin sentido *aunque la comprobación haya pasado*. Por eso `scripts/smoke.js` espera el
evento `exit` del hijo y usa `process.exitCode`. Usa `SMOKE_PORT` (3100) para no chocar
con el `dev`.

**jsdom no aplica las clases de Tailwind**, así que la navegación de escritorio y la móvil
están ambas en el DOM y los enlaces salen duplicados. Hay que acotar con `within` al
contenedor (`#mobile-menu`).

**Los listados paginados responden `res.body.data.data`**, con la lista dentro de `data`
junto a `meta`.

**Zod 4:** `z.ZodRawShape` es de solo lectura y `Object.fromEntries` infiere un tipo
demasiado estrecho para castear. Para construir un esquema dinámico, `Record<string,
z.ZodTypeAny>` y un bucle.

**No borrar productos en los tests del backend**: los de otros bloques tienen movimientos
de stock asociados y la FK lo impide. Basta con limpiar lo propio.

**CSRF** (double-submit): para un PATCH/POST manual contra el servidor hay que leer la
cookie `csrfToken` y reenviarla en la cabecera `x-csrf-token`. En `NODE_ENV=test` se
omite.

---

## 5. Dos cosas que dependen de ti, no del código

**Rotar la contraseña `Ad159753`.** Apareció en un conflicto de merge sin resolver que
estaba commiteado y pusheado en `Stockly-F/main` desde el 2026-08-05 (merge `4254582`),
dentro de `e2e/smoke.spec.ts`. El conflicto ya está resuelto a favor de la credencial del
seed, pero **la contraseña estuvo en el repositorio y sigue en el historial de ese merge**.
T0-06 había purgado esa misma credencial reescribiendo el historial; el merge la devolvió.

**En un despliegue nuevo nadie es administrador hasta ejecutar `pnpm db:seed`.** Desde
T1-22 el registro público crea siempre usuarios `USER`. Para promover a alguien:
`PATCH /api/v1/users/:id/role` desde una cuenta que ya sea ADMIN.

---

## 6. Por dónde seguir

Lo más rentable es **T1-16**: `parseInt("abc")` es `NaN`, `Math.max(1, NaN)` sigue siendo
`NaN`, y eso llega a Prisma como `skip`/`take`. Hoy `GET /products?page=abc` y otros tres
endpoints devuelven **500**. Es un helper compartido en `shared/lib/` y cuatro llamadas.

Después, **T1-15** (índices) tiene el mayor efecto por esfuerzo, pero requiere migración y
medir con `EXPLAIN ANALYZE` sobre datos reales.
