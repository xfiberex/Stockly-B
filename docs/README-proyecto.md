# Stockly — Sistema de gestión de inventario

Aplicación full-stack para el control de inventario, con API REST y SPA. **Son dos repositorios
que se clonan uno al lado del otro:**

```
01-Stockly/
├── Stockly-B/                    # API REST (Node 22 / Express 5 / Prisma 7 / PostgreSQL 17)
│   ├── docker-compose.yml        # PostgreSQL + backend en contenedores
│   └── docs/                     # Documentación viva de TODO el proyecto
└── Stockly-F/                    # SPA (React 19 / TypeScript 6 / Vite 8 / TailwindCSS 4)
```

> **Por qué los docs viven en `Stockly-B/docs/`:** cubren los dos repositorios, pero la carpeta que
> los contiene no está bajo control de versiones. Alojarlos en el backend —que ya se clona— es lo
> que garantiza que viajen entre equipos con un `git pull`. Al leerlos, las rutas del tipo
> `Stockly-F/src/...` se refieren al repositorio hermano.

**Este archivo es solo el arranque desde cero.** Para lo demás:

| Documento | Para qué |
|---|---|
| [CONTEXTO.md](CONTEXTO.md) | **Empieza aquí al retomar el proyecto.** Estado, decisiones vivas y trampas del entorno ya pagadas |
| [ROADMAP.md](ROADMAP.md) | Las 114 tareas con progreso y métricas |
| [operaciones.md](operaciones.md) | Cuando algo ya ha pasado: copia de seguridad, restauración y reversión |
| [adr/](adr/) | Decisiones de arquitectura no obvias: por qué algo está así antes de simplificarlo |
| [INFORME-AUDITORIA.md](INFORME-AUDITORIA.md) | La auditoría del 2026-08-04. **Congelada**: describe un estado que ya no existe |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Puerta de calidad, flujo de ramas y convención de commits |
| [backend](../README.md) · [frontend](../../Stockly-F/README.md) | Referencia de cada repositorio: variables, comandos, endpoints |
| [design-system.md](../../Stockly-F/docs/design-system.md) | Lectura previa a tocar cualquier pantalla |

---

## Requisitos previos

| Herramienta | Versión |
|---|---|
| Node.js | 22 LTS |
| pnpm | **11.21.0**, fijado en `packageManager` de ambos repos — no usar npm ni yarn |
| Docker + Docker Compose | opcional: solo si no hay un PostgreSQL instalado |

---

## Arranque desde cero

### 1. Base de datos

Sirve cualquier PostgreSQL **17 o superior** con la base `Stockly` creada. Con Docker, **desde
`Stockly-B/`**, que es donde vive el `docker-compose.yml`:

```bash
cd Stockly-B
docker compose up db -d
```

> **El puerto no se fija aquí a propósito.** El proyecto se trabaja desde varios equipos y no es el
> mismo en todos; el valor bueno es el del `.env` local, que no viaja en git. Si algo falla al
> conectar, eso es lo primero que hay que mirar. `POSTGRES_HOST_PORT` cambia el que publica el
> contenedor.

> **La versión sí se fija, y hacia arriba** (T4-13). `pg_restore` solo va hacia adelante: un volcado
> de 17 no se restaura en un servidor 16. Si en algún equipo se instala un PostgreSQL **más nuevo**
> que el del compose, hay que subir la imagen —no basta con editar el número: ver
> [operaciones.md §9](operaciones.md)—, o las copias de ese equipo no se podrán restaurar aquí.

### 2. Backend

```bash
cd Stockly-B
cp .env.example .env   # bastan 4: DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, FRONTEND_URL
pnpm install
pnpm db:migrate
pnpm db:seed           # sin esto no existe ningún administrador
pnpm dev               # http://localhost:3000
```

### 3. Frontend

```bash
cd Stockly-F
cp .env.example .env   # solo VITE_API_URL
pnpm install
pnpm dev               # http://localhost:5173
```

Tras el seed, el administrador es `admin@stockly.app` / `Admin1234!`; la lista completa está en el
[README del backend](../README.md#seed). **El registro público crea siempre usuarios `USER`**, así
que en un despliegue nuevo nadie es administrador hasta ejecutar `pnpm db:seed` —o hasta que un
ADMIN promueva a alguien con `PATCH /api/v1/users/:id/role`—.

---

## Verificación

**El proyecto no usa CI**, y es una decisión deliberada
([ADR 0005](adr/0005-sin-integracion-continua.md)). La puerta de calidad se ejecuta en local, en el
repositorio que hayas tocado, antes de cada push:

```bash
pnpm verify
```

Qué encadena en cada repositorio y qué necesita para pasar, en
[CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Producción con Docker

Desde `Stockly-B/`:

```bash
docker compose up -d --build
```

Levanta PostgreSQL, el backend y el frontend tras nginx —que sirve la SPA y hace de proxy de `/api`,
así que hay un solo origen— en `http://localhost:8080`. La pila **no se siembra sola**: aplica las
migraciones al arrancar pero no ejecuta el seed, de modo que el login responde 401 hasta que se
lance a mano y parece un fallo de credenciales.

La documentación interactiva de la API (Swagger) está en `/api/v1/docs` y **no se monta con
`NODE_ENV=production`**.
