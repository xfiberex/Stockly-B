# Stockly — Backend

API REST del sistema de inventario. El frontend vive en un repositorio hermano, `Stockly-F`, que se clona al lado de este.

```
01-Stockly/
├── Stockly-B/   ← este repositorio
└── Stockly-F/
```

## Documentación viva

Está en [`docs/`](docs/), y cubre **los dos repositorios**:

| Archivo | Qué es |
|---|---|
| [docs/CONTEXTO.md](docs/CONTEXTO.md) | **Empieza aquí al retomar el proyecto.** Estado actual, decisiones vivas, trampas del entorno ya pagadas y por dónde seguir |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 109 tareas con dependencias, progreso y métricas. La fuente de verdad del trabajo pendiente |
| [docs/INFORME-AUDITORIA.md](docs/INFORME-AUDITORIA.md) | Los hallazgos que justifican cada tarea. **Congelado a propósito:** está escrito en presente y describe el 2026-08-04, no el estado actual |
| [docs/README-proyecto.md](docs/README-proyecto.md) | Arranque desde cero de los dos repositorios |
| [docs/adr/](docs/adr/) | Decisiones de arquitectura no obvias: por qué algo está hecho así antes de simplificarlo |
| [Stockly-F/docs/design-system.md](../Stockly-F/docs/design-system.md) | Lectura previa a tocar cualquier pantalla. Varias de sus reglas ponen `pnpm verify` en rojo |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Puerta de calidad, convención de commits y qué anotar al cerrar una tarea |
| [CHANGELOG.md](CHANGELOG.md) | Registro de cambios de los dos repositorios |

Vive aquí porque la carpeta que contiene ambos repositorios no está bajo control de versiones. Las rutas del tipo `Stockly-F/src/...` que aparecen en esos documentos se refieren al repositorio hermano.

**Al cerrar una tarea, anótala en el ROADMAP** (marca la casilla, añade fila en Progreso y actualiza las métricas). Ese registro es lo que sobrevive entre sesiones y entre equipos.

## Verificación: sin CI, todo en local

Este proyecto **no usa CI**. No hay GitHub Actions ni pipeline de ningún proveedor, y no deben proponerse: se descartaron deliberadamente el 2026-08-06. La puerta de calidad es un comando local:

```bash
pnpm verify
```

Encadena `prisma generate → prisma migrate deploy → check → test:coverage → build → smoke`.

El paso `smoke` ([scripts/smoke.js](scripts/smoke.js)) arranca `dist/server.js` de verdad y consulta `/api/v1/health`. No es redundante con `build`: `tsc` no reescribe los alias `@/`, así que un build que compila puede seguir sin arrancar — es exactamente el fallo que costó la tarea T0-01. Usa `SMOKE_PORT` (3100 por defecto) para no chocar con el `dev`.

Requisitos para que `verify` pase:

- **PostgreSQL accesible** y `DATABASE_URL` apuntando a él. Sirve Docker (`docker compose up db -d`, desde este directorio) o un PostgreSQL instalado en la máquina — el puerto varía según el equipo, ajústalo en el `.env`.
- **Las cuatro variables imprescindibles** en `.env`: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` y `FRONTEND_URL`. Desde T1-26, Cloudinary y SMTP son opcionales de verdad: sin ellas el servidor arranca y solo la función correspondiente responde 503.
- `prisma generate` **antes** de `check` y `build`: el cliente se emite en `src/generated/prisma`, que está en `.gitignore`.

`jest.setup.js` reescribe el nombre de la base de `DATABASE_URL` a `Stockly_test`. Los tests nunca tocan la base de desarrollo.

## Convenciones

- Gestor de paquetes: **pnpm 11.21.0** (fijado en `packageManager` y en el `Dockerfile`). No usar npm ni yarn. Se subió desde 11.2.2 el 2026-08-09: las versiones `<11.8.0` arrastraban avisos de path traversal y de ejecución de lifecycle scripts.
- Comentarios y documentación **en español**, como el resto del código.
- **`.agents/` y `.claude/` se versionan a propósito** (T3-06): el proyecto se trabaja desde varias máquinas y el tooling viaja con él. Son la mayoría de los archivos rastreados, así que para buscar en el código conviene excluirlos: `git buscar X` —tras activar una vez `git config --local include.path ../.gitconfig-stockly`— o `git grep X -- ":!.agents" ":!.claude"`.
- Nunca versionar credenciales reales. El `.env` está ignorado y debe seguir así: una fuga de este tipo ya obligó a reescribir el historial del repositorio (tarea T0-06).
- **El spec de OpenAPI no se escribe a mano** (T4-02). `components.schemas` lo genera [`src/swagger.esquemas.ts`](src/swagger.esquemas.ts) desde el contrato y los validadores, con `z.toJSONSchema()` de Zod 4 —**no hace falta `zod-to-openapi`**, aunque la ficha lo pidiera—. Las **rutas** de [`src/swagger.paths.ts`](src/swagger.paths.ts) sí siguen escritas: no se deducen de un esquema.
- **Un error que se lance debe llevar código** (T4-04): `new HttpError(status, "mensaje en español", "CODIGO", { params })`, con el código dado de alta en `CODIGOS_DE_ERROR` del contrato. El `message` sigue siendo lo que ve quien consulta la API sin interfaz; el `code` es lo que permite al frontend enseñar la frase en el idioma del usuario, y los `params` son los huecos —una frase con los valores ya metidos no se puede traducir—. Un código nuevo sin traducción rompe la suite del frontend en cuanto se regenera el contrato. Ver [ADR 0007](docs/adr/0007-i18n-propio.md).
- **La forma de las respuestas de la API se declara una sola vez**, en [`src/contratos/api.ts`](src/contratos/api.ts) (T4-01). `Stockly-F` compila contra una copia literal de ese archivo. Al cambiarlo: `pnpm contratos:generar` y commitear en **los dos** repositorios. Ese archivo **solo puede importar `zod`** —es lo que permite copiarlo—, y sus enums se repiten a propósito, vigilados contra `$Enums` por un test. Ver [ADR 0006](docs/adr/0006-contrato-copiado-entre-repositorios.md).
