# Stockly — Sistema de gestión de inventario

Aplicación full-stack para el control de inventario de productos, con backend REST y frontend SPA.

```
01-Stockly/
├── Stockly-B/                    # API REST (Node.js / Express / Prisma / PostgreSQL)
│   ├── docker-compose.yml        # PostgreSQL + backend en contenedores
│   └── docs/                     # Documentación viva de TODO el proyecto
│       ├── README-proyecto.md    # este archivo
│       ├── ROADMAP.md            # 107 tareas, dependencias y progreso
│       └── INFORME-AUDITORIA.md  # hallazgos que justifican cada tarea
└── Stockly-F/                    # SPA (React 19 / TypeScript / Vite / TailwindCSS)
```

> **Por qué los docs viven en `Stockly-B/docs/`:** cubren los dos repositorios, pero la carpeta que los contiene no está bajo control de versiones. Alojarlos en el backend —que ya se clona— es lo que garantiza que viajen entre equipos con un `git pull`. Al leerlos, las rutas del tipo `Stockly-F/src/...` se refieren al repositorio hermano, no a una subcarpeta del backend.

---

## Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| Node.js | 20 LTS |
| pnpm | 11.2+ |
| Docker + Docker Compose | cualquier versión reciente |

---

## Inicio rápido

### 1. Base de datos

Con Docker, **desde `Stockly-B/`** (ahí vive el `docker-compose.yml`):

```bash
cd Stockly-B
docker compose up db -d
```

Levanta PostgreSQL 16 en `localhost:5432` con la base de datos `Stockly`.

También sirve un PostgreSQL instalado en la máquina: solo tiene que existir la base y coincidir el puerto de `DATABASE_URL` en el `.env`.

### 2. Backend

```bash
cd Stockly-B
cp .env.example .env   # completar variables (ver Stockly-B/README.md)
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev               # http://localhost:3000
```

### 3. Frontend

```bash
cd Stockly-F
pnpm install
pnpm dev               # http://localhost:5173
```

---

## Credenciales del seed

| Rol | Email | Contraseña |
|---|---|---|
| ADMIN | `admin@stockly.app` | `Admin1234!` |
| USER | `laura@stockly.app` | `User1234!` |

---

## Docker (producción)

Desde `Stockly-B/`:

```bash
docker compose up --build
```

Levanta PostgreSQL + backend Express. El frontend se sirve por separado (Vite / Nginx).

---

## Verificación

Sin CI: todo se comprueba en local. Antes de dar por cerrada una tarea, en cada repositorio:

```bash
pnpm verify
```

En el backend encadena `prisma generate → migrate deploy → check → test:coverage → build → smoke` (el último arranca `dist/server.js` de verdad y consulta `/api/v1/health`). En el frontend, `check → lint → test:coverage → build`.

---

## Documentación

- Backend API (Swagger): `http://localhost:3000/api/v1/docs` — no se monta con `NODE_ENV=production`
- README Backend: [../README.md](../README.md)
- README Frontend: [../../Stockly-F/README.md](../../Stockly-F/README.md)
- Roadmap: [ROADMAP.md](ROADMAP.md)
- Auditoría: [INFORME-AUDITORIA.md](INFORME-AUDITORIA.md)
