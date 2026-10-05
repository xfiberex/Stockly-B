# Cómo contribuir a Stockly

Stockly son **dos repositorios** que se clonan uno al lado del otro, `Stockly-B` (API y
documentación) y `Stockly-F` (SPA). Esta guía vale para ambos y vive aquí por lo mismo que
`docs/`: la carpeta que los contiene no está bajo control de versiones.

---

## Antes de escribir código

1. **[`docs/CONTEXTO.md`](docs/CONTEXTO.md)**: el estado, las trampas del entorno ya pagadas y las
   decisiones que no conviene deshacer.
2. **[`docs/ROADMAP.md`](docs/ROADMAP.md)**: la fuente de verdad del trabajo pendiente.
3. Si tocas la interfaz, **[`design-system.md`](../Stockly-F/docs/design-system.md)**.
4. Si algo te parece complicado de más, **[`docs/adr/`](docs/adr/)** antes de simplificarlo.

---

## La puerta de calidad: `pnpm verify`

Antes de cada push, en el repositorio que hayas tocado —y en los dos si el cambio los cruza—:

```bash
pnpm verify
```

| Repositorio | Qué encadena |
|---|---|
| `Stockly-B` | `prisma generate` → `prisma migrate deploy` → `check` → `test:coverage` → `build` → `smoke` → `auditoria` |
| `Stockly-F` | `check` → `lint` → `test:coverage` → `build` → `auditoria` |

Debe terminar con **exit 0**. Lo que conviene saber de sus pasos:

- **El backend no tiene `pnpm lint`**: su comprobación estática es `pnpm check` (`tsc --noEmit`,
  también sobre `prisma/seed.ts`). En el frontend `lint` debe dar **0 errores y 0 avisos**: un
  aviso nuevo es una regresión, no ruido de fondo.
- **`smoke` arranca `dist/server.js` de verdad** y consulta `/api/v1/health`, porque `tsc` puede
  compilar un build que no arranca. Usa `SMOKE_PORT` (3100) para no chocar con el `dev`.
- **`auditoria` rompe la compilación** ante una vulnerabilidad alta o crítica en producción o una
  licencia fuera de la lista permitida. Sin red avisa y deja pasar; `--estricto` lo convierte en
  fallo ([docs/dependencias.md](docs/dependencias.md)).
- **La cobertura tiene suelo** (`jest.config.js`, `vite.config.ts`). Al subirla, se sube el suelo.
- **La prueba de carga (`load/`) no está en `verify`** y no debe estarlo: tarda minutos, necesita
  Docker y sus números dependen de la máquina ([docs/rendimiento.md](docs/rendimiento.md)).

### Qué necesita el backend para pasar

- **PostgreSQL accesible** y `DATABASE_URL` apuntando a él. El puerto varía según la máquina: se
  ajusta en el `.env`, no en la documentación.
- **Las cuatro variables imprescindibles**: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` y
  `FRONTEND_URL`. Sin las de Cloudinary o SMTP el servidor arranca y solo esa función responde 503.
- **La base `Stockly_test` al día.** Los tests nunca tocan la de desarrollo, pero `verify` tampoco
  migra la de tests: tras cada migración nueva,
  `DATABASE_URL=<la de Stockly_test> pnpm exec prisma db push`
  ([docs/CONTEXTO.md §4](docs/CONTEXTO.md)).

### El E2E

```bash
cd Stockly-F && pnpm test:e2e:full
```

No hay que levantar nada: `e2e/global-setup.ts` prepara la base y Playwright arranca backend y
frontend. Corre en `chromium` y en `Mobile Chrome`, **sin reintentos**: sus fallos intermitentes
han sido siempre defectos reales. **Resiembra la base de desarrollo**, y si falla de forma rara lo
primero es mirar los puertos 3000 y 5173 ([docs/CONTEXTO.md §4](docs/CONTEXTO.md)).

### Si tocas la forma de una respuesta de la API

La declara **un solo archivo**, `Stockly-B/src/contratos/api.ts`, y `Stockly-F` compila contra una
copia literal ([ADR 0006](docs/adr/0006-contrato-copiado-entre-repositorios.md)):

```bash
# 1. editar Stockly-B/src/contratos/api.ts
cd Stockly-B && pnpm contratos:generar   # 2. copiar al frontend
# 3. commitear en LOS DOS repositorios
```

Ese archivo **solo puede importar `zod`**. Olvidar el paso 2 pone `verify` en rojo en los dos
repositorios, con el comando en el mensaje.

---

## Integración continua

GitHub Actions repite **la misma puerta**, no otra
([ADR 0008](docs/adr/0008-integracion-continua.md)): en cada push a `main`, en cada pull request
y a mano. **No exime de ejecutarla antes**: cuando la CI avisa, el commit ya está en `main`.

| Repositorio | Jobs | Con qué |
|---|---|---|
| `Stockly-B` | `verify` | Node 22, pnpm de `packageManager` y un `postgres:17-alpine`. Crea `Stockly_test` y la migra antes |
| `Stockly-F` | `verify` y `e2e` | Clona **el `main` de `Stockly-B` al lado**, así la frescura del contrato se comprueba de verdad. El E2E sube `test-results` y `playwright-report` si falla |

**Endurecida porque los repositorios son públicos:** permisos de solo lectura, sin credenciales
persistidas, `pull_request` y nunca `pull_request_target`, y **acciones fijadas por SHA**. No se
actualizan solas: se resuelve la etiqueta con `gh api repos/<acción>/commits/<etiqueta> --jq .sha`
y se cambian el SHA y el comentario.

**Si falla en la CI y no en local**, casi siempre es algo que el portátil pone y la CI no: un
`.env`, una base ya migrada, el repositorio hermano al lado.

### Orden de subida: primero el backend, en verde; después el frontend

La CI del frontend clona el `main` del backend **tal como esté en ese momento**, para comprobar el
contrato y para arrancar la API en el E2E. Si el frontend llega antes que el backend del que
depende, o con el backend en rojo, falla aunque su código esté bien.

1. `pnpm verify` en local en los dos repositorios.
2. **Push de `Stockly-B`** y esperar a que su workflow termine en verde (`gh run watch`).
3. **Solo entonces, push de `Stockly-F`.**

Si el frontend falló por subirse antes, no hace falta otro commit: con el backend ya en verde, se
relanza (`gh run rerun <id>`).

---

## Convenciones

- **pnpm 12.4.1**, fijado en `packageManager` y en los `Dockerfile`. No usar npm ni yarn.
- **Comentarios y documentación en español.** Los comentarios explican *por qué*, no *qué*.
- **`.agents/` y `.claude/` se versionan a propósito**: el proyecto se trabaja desde varias
  máquinas y el tooling viaja con él. Para buscar solo en el código, `git buscar`
  ([docs/CONTEXTO.md §5](docs/CONTEXTO.md)).

### Ramas

El proyecto lo lleva una persona desde varias máquinas y el historial es lineal sobre `main`, con
una condición: `pnpm verify` en verde en la máquina desde la que se hace el push. En cuanto haya
más de una persona, o un cambio que se quiera poder revertir de una pieza, rama
(`git switch -c feat/…`) y pull request.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/), con la descripción en español y la
tarea en el cuerpo cuando exista:

```
feat(products): exportar el catálogo por lotes en vez de en memoria

Cierra T2-05. Medido con 50 000 productos y el heap limitado a 48 MB:
el camino anterior agota la memoria, este completa.
```

| Tipo | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de un defecto |
| `refactor` | Cambio interno sin efecto observable |
| `test` · `docs` | Solo tests · solo documentación |
| `chore` | Dependencias, configuración, mantenimiento |
| `perf` | Rendimiento, con la medida en el cuerpo |

**El historial no lo cumple del todo**: casi nueve de cada diez commits con prefijo son `feat`,
incluidos los que solo tocan documentación o dependencias. La tabla es hacia dónde vamos.

---

## Al cerrar una tarea del roadmap

Es lo que sobrevive entre sesiones y entre máquinas.

1. En [`docs/ROADMAP.md`](docs/ROADMAP.md), quita la ficha de «Tareas abiertas» y añade su fila al
   índice de cerradas, con la fecha.
2. Actualiza la cabecera y la tabla de resumen, y **comprueba el recuento** con los dos `grep` de
   ese documento.
3. En la nota de la fila y en el commit, **qué se verificó y cómo, con números**.
4. **Di lo que no se pudo verificar**, en lugar de darlo por bueno.
5. Si cambia el estado, las cifras de [`docs/CONTEXTO.md §3`](docs/CONTEXTO.md); si deja una
   decisión que no conviene deshacer, su línea en el §6; y su entrada en el
   [CHANGELOG](CHANGELOG.md).

Si al hacerla descubres que la ficha describía mal el problema —ha pasado siete veces—, dilo en la
nota: las fichas son pistas, no descripciones verificadas.

---

## Licencia de las contribuciones

Stockly se distribuye con la **GNU AGPL v3** ([ADR 0009](docs/adr/0009-licencia-agpl.md)), y lo
que se aporte se publica con esa misma licencia. **Si el proyecto llega a ofrecer una licencia
comercial además de la AGPL**, hará falta un acuerdo de cesión (CLA) **antes** de aceptar la
primera contribución externa: sin él, lo aportado es de quien lo escribió y no se puede
relicenciar.

## Seguridad

- **Nunca versionar credenciales reales.** El `.env` está ignorado y debe seguir así: una fuga de
  este tipo ya obligó a reescribir el historial (T0-06).
- **Nunca poner una contraseña real en `e2e/`**, que sí está versionado. Sus credenciales salen
  del seed y son sobreescribibles por variables de entorno.
- Los avisos de `pnpm audit` se atienden, no se silencian.
