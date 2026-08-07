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
| [docs/ROADMAP.md](docs/ROADMAP.md) | 100 tareas con dependencias, progreso y métricas. La fuente de verdad del trabajo pendiente |
| [docs/INFORME-AUDITORIA.md](docs/INFORME-AUDITORIA.md) | Los hallazgos que justifican cada tarea del roadmap |
| [docs/README-proyecto.md](docs/README-proyecto.md) | Visión de conjunto y arranque de los dos repositorios |

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
- **Las doce variables de `validateEnv()`** presentes en `.env`. Cloudinary y SMTP admiten valores ficticios: los tests los mockean, pero su ausencia impide arrancar.
- `prisma generate` **antes** de `check` y `build`: el cliente se emite en `src/generated/prisma`, que está en `.gitignore`.

`jest.setup.js` reescribe el nombre de la base de `DATABASE_URL` a `Stockly_test`. Los tests nunca tocan la base de desarrollo.

## Convenciones

- Gestor de paquetes: **pnpm 11.2.2** (fijado en `packageManager`). No usar npm ni yarn.
- Comentarios y documentación **en español**, como el resto del código.
- Nunca versionar credenciales reales. El `.env` está ignorado y debe seguir así: una fuga de este tipo ya obligó a reescribir el historial del repositorio (tarea T0-06).
