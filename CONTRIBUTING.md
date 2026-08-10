# Cómo contribuir a Stockly

Stockly son **dos repositorios** que se clonan uno al lado del otro:

```
01-Stockly/
├── Stockly-B/   ← API + documentación viva de los dos
└── Stockly-F/
```

Esta guía vale para ambos. Vive aquí por lo mismo que `docs/`: la carpeta que los contiene
no está bajo control de versiones.

---

## Antes de escribir código

1. **Lee [`docs/CONTEXTO.md`](docs/CONTEXTO.md).** Es el estado actual, las decisiones vivas
   y las trampas del entorno ya pagadas. Ahorra repetir errores que ya costaron una sesión.
2. **Mira [`docs/ROADMAP.md`](docs/ROADMAP.md).** Es la fuente de verdad del trabajo
   pendiente: 107 tareas con dependencias, criterios de aceptación y progreso.
3. Si tocas la interfaz, lee antes
   [`Stockly-F/docs/design-system.md`](../Stockly-F/docs/design-system.md).
4. Si una decisión te parece innecesariamente complicada, busca en
   [`docs/adr/`](docs/adr/) antes de simplificarla. Las que están ahí lo están porque la
   opción evidente es la equivocada.

---

## La puerta de calidad: `pnpm verify`

**Este proyecto no usa CI**, y es una decisión deliberada — ver
[ADR 0005](docs/adr/0005-sin-integracion-continua.md). No hay GitHub Actions ni pipeline de
ningún proveedor, y no deben proponerse.

Eso significa que **nadie va a comprobar tu trabajo después**. Antes de cada push, en el
repositorio que hayas tocado:

```bash
pnpm verify
```

| Repositorio | Qué encadena |
|---|---|
| `Stockly-B` | `prisma generate` → `prisma migrate deploy` → `check` → `test:coverage` → `build` → `smoke` |
| `Stockly-F` | `check` → `lint` → `test:coverage` → `build` |

Debe terminar con **exit 0** en el repositorio que tocaste, y en los dos si el cambio los
cruza (por ejemplo, la forma de una respuesta de la API).

Dos asimetrías que conviene conocer para no buscar comandos que no existen:

- **El backend no tiene `pnpm lint`.** Su comprobación estática es `pnpm check` (`tsc
  --noEmit`). El `lint` con ESLint solo existe en el frontend, y ahí debe terminar con **0
  errores y 0 avisos**: cualquier aviso nuevo es una regresión, no ruido de fondo.
- **El backend tiene `pnpm smoke`** y el frontend no. Arranca `dist/server.js` de verdad y
  consulta `/api/v1/health`, porque `tsc` puede compilar un build que no arranca — es el
  fallo exacto que costó la tarea T0-01.

### Requisitos para que `verify` pase en el backend

- **PostgreSQL accesible** y `DATABASE_URL` apuntando a él. Sirve Docker
  (`docker compose up db -d`) o un PostgreSQL instalado. **El puerto varía según la
  máquina**: ajústalo en tu `.env`, no en la documentación.
- Las cuatro variables imprescindibles en `.env`: `DATABASE_URL`, `JWT_SECRET`,
  `JWT_EXPIRES_IN` y `FRONTEND_URL`. Cloudinary y SMTP son opcionales de verdad.
- `jest.setup.js` reescribe el nombre de la base a `Stockly_test`: los tests **nunca** tocan
  la base de desarrollo.

### El E2E

```bash
cd Stockly-F && pnpm test:e2e:full
```

No hay que levantar nada a mano: `e2e/global-setup.ts` prepara la base y el `webServer`
arranca backend y frontend. Se ejecuta en `chromium` y en `Mobile Chrome`.

**Si falla de forma rara, mira primero el puerto 3000.** Playwright usa
`reuseExistingServer: true`, así que un backend huérfano de una pasada anterior se reutiliza
—y no lleva el `RATE_LIMIT_MAX` que el E2E inyecta—, lo que produce fallos por 429 que no
mencionan el límite. Está documentado en `docs/CONTEXTO.md`.

---

### Si tocas la forma de una respuesta de la API

La declara **un solo archivo**, `Stockly-B/src/contratos/api.ts`, y `Stockly-F` compila contra
una copia literal suya (T4-01, [ADR 0006](docs/adr/0006-contrato-copiado-entre-repositorios.md)):

```bash
# 1. editar Stockly-B/src/contratos/api.ts
cd Stockly-B && pnpm contratos:generar   # 2. copiar al frontend
# 3. commitear en LOS DOS repositorios
```

Ese archivo **solo puede importar `zod`**: cualquier otro import haría que la copia no compile
del otro lado. Olvidar el paso 2 pone `pnpm verify` en rojo en ambos repos, con el comando en el
mensaje de error.

---

## Herramientas

- **Gestor de paquetes: pnpm 11.21.0**, fijado en `packageManager` de ambos repositorios y
  en el `Dockerfile`. No usar npm ni yarn.
- **Comentarios y documentación en español**, como el resto del código. Los comentarios
  explican *por qué*, no *qué*: el qué ya está en la línea de abajo.

---

## Flujo de ramas

Hoy el proyecto lo lleva una persona desde varias máquinas, y el historial es lineal sobre
`main`. Eso está bien mientras siga siendo así, con una condición: **`pnpm verify` en verde
en la máquina desde la que se hace el push**, porque no hay CI que lo repita.

En cuanto haya más de una persona, o un cambio que quieras poder revertir de una pieza:

```bash
git switch -c feat/exportacion-por-lotes
# … trabajo …
pnpm verify            # en cada repositorio tocado
git push -u origin feat/exportacion-por-lotes
```

y se integra por PR. La rama por defecto es `main` en ambos repositorios.

---

## Convención de commits

[Conventional Commits](https://www.conventionalcommits.org/), con la descripción **en
español**:

```
<tipo>(<ámbito opcional>): <descripción en imperativo>
```

| Tipo | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de un defecto |
| `refactor` | Cambio interno sin efecto observable |
| `test` | Solo tests |
| `docs` | Solo documentación |
| `chore` | Dependencias, configuración, tareas de mantenimiento |
| `perf` | Cambio cuyo objetivo es el rendimiento, con la medida en el cuerpo |

**El historial actual no cumple esto del todo, y conviene saberlo**: en `Stockly-B`, de 52
commits solo 41 llevan un prefijo convencional, y **35 de esos 41 son `feat`** — incluidos
los que solo actualizan documentación (`feat(docs):`) o añaden tests. La tabla de arriba es
hacia dónde vamos, no una descripción de lo que hay.

Referencia la tarea del roadmap en el cuerpo cuando exista:

```
feat(products): exportar el catálogo por lotes en vez de en memoria

Cierra T2-05. Medido con 50 000 productos y el heap limitado a 48 MB:
el camino anterior agota la memoria, este completa.
```

---

## Al cerrar una tarea del roadmap

Esto no es opcional: **es lo que sobrevive entre sesiones y entre máquinas.**

1. Marca la casilla en `docs/ROADMAP.md` con la fecha.
2. Añade una fila en la tabla de **Progreso** con las cifras reales.
3. Actualiza las métricas (tests, cobertura) y el resumen por tier.
4. En la ficha, anota **qué se verificó y cómo**, con números.
5. **Di explícitamente lo que no se pudo verificar**, en lugar de darlo por bueno. Un
   criterio de aceptación que no se cumplió y se documenta vale más que uno que se da por
   cumplido sin medir.

Si al hacer la tarea descubres que la ficha describía mal el problema —ha pasado varias
veces—, corrígela ahí mismo. Las fichas vienen de una auditoría, no de una lectura línea a
línea del código.

---

## Seguridad

- **Nunca versionar credenciales reales.** El `.env` está ignorado y debe seguir así: una
  fuga de este tipo ya obligó a reescribir el historial del repositorio (T0-06).
- **Nunca poner una contraseña real en `e2e/`**, que sí está versionado. Las credenciales
  del E2E salen del seed y son sobreescribibles por variables de entorno.
- Los avisos de `pnpm audit` se atienden, no se silencian.
