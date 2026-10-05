# Stockly — Sistema de gestión de inventario

Aplicación full-stack para el control de inventario: API REST y SPA. **Son dos repositorios que se
clonan uno al lado del otro:**

```
01-Stockly/
├── Stockly-B/     # API REST (Node 22 · Express 5 · Prisma 7 · PostgreSQL 17) + esta documentación
└── Stockly-F/     # SPA (React 19 · TypeScript 6 · Vite 8 · TailwindCSS 4)
```

**Los docs viven en `Stockly-B/docs/`** aunque cubran los dos: la carpeta que contiene ambos
repositorios no está bajo control de versiones, y alojarlos en el backend es lo que hace que
viajen con un `git pull`. Las rutas `Stockly-F/src/...` que aparecen en ellos se refieren al
repositorio hermano.

---

## Mapa de la documentación

| Documento | Qué es | Léelo… |
|---|---|---|
| [CONTEXTO.md](CONTEXTO.md) | Estado, trampas del entorno ya pagadas y decisiones que no conviene deshacer | **al retomar el proyecto** |
| [ROADMAP.md](ROADMAP.md) | Tareas abiertas, cabos sueltos e índice de las cerradas | antes de planificar trabajo |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Puerta de calidad, CI, orden de subida, commits y cómo se cierra una tarea | antes del primer push |
| [`design-system.md`](../../Stockly-F/docs/design-system.md) | Tokens, densidad, estados y los tests que los vigilan | antes de tocar una pantalla |
| [adr/](adr/) | Nueve decisiones de arquitectura donde la opción evidente es la equivocada | antes de simplificar algo |
| [operaciones.md](operaciones.md) | Copia de seguridad, restauración, reversión, alertas, versión de PostgreSQL y resumen semanal | antes de tocar una migración desplegada |
| [dependencias.md](dependencias.md) | Vulnerabilidades, licencias y la puerta de `pnpm auditoria` | antes de añadir una dependencia |
| [rendimiento.md](rendimiento.md) | Mediciones con 100 000 productos y cómo repetirlas | antes de tocar una consulta de listado |
| [accesibilidad.md](accesibilidad.md) | Lighthouse y recorrido de teclado, y lo que **no** se comprobó | antes de cambiar navegación o formularios |
| [legal.md](legal.md) | Qué cubre la AGPL y qué no: datos personales, privacidad, marca | antes de añadir un dato personal o un proveedor |
| [backend](../README.md) · [frontend](../../Stockly-F/README.md) | Referencia de cada repositorio: variables, comandos, API, pantallas | cuando haga falta |
| [../CHANGELOG.md](../CHANGELOG.md) | Registro de cambios de los dos repositorios | — |
| [historico/](historico/) | La auditoría del 2026-08-04 y las fichas de las 127 tareas cerradas. **Congelado**: describe estados que ya no existen | para saber por qué existe algo |

---

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 22 LTS |
| pnpm | **12.4.1**, fijado en `packageManager` de ambos repositorios — no usar npm ni yarn |
| PostgreSQL | 17 o superior, instalado o con Docker |

---

## Arranque desde cero

### 1. Base de datos

Sirve cualquier PostgreSQL **17 o superior** con la base `Stockly` creada. Con Docker, desde
`Stockly-B/`, que es donde vive el `docker-compose.yml`:

```bash
docker compose up db -d
```

> **El puerto no se fija aquí a propósito.** El proyecto se trabaja desde varios equipos y no es el
> mismo en todos; el valor bueno es el del `.env` local. `POSTGRES_HOST_PORT` cambia el que publica
> el contenedor.

> **La versión sí se fija, y hacia arriba.** `pg_restore` solo va hacia adelante: si en algún
> equipo se instala un PostgreSQL más nuevo que el del compose, hay que subir la imagen
> ([operaciones.md §9](operaciones.md)) o sus copias no se podrán restaurar en la pila.

### 2. Backend

```bash
cd Stockly-B
cp .env.example .env   # bastan 4: DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, FRONTEND_URL
pnpm install
pnpm db:migrate
pnpm db:seed           # sin esto no existe ningún administrador
pnpm dev               # http://localhost:3000 · Swagger en /api/v1/docs
```

### 3. Frontend

```bash
cd Stockly-F
cp .env.example .env   # solo VITE_API_URL
pnpm install
pnpm dev               # http://localhost:5173
```

Tras el seed, el administrador es `admin@stockly.app` / `Admin1234!`; el resto de cuentas, en el
[README del backend](../README.md#seed). **El registro público crea siempre usuarios `USER`**: en
un despliegue nuevo nadie es administrador hasta ejecutar el seed o hasta que un ADMIN promueva a
alguien.

### 4. La base de tests, una vez

Los tests del backend corren contra `Stockly_test` —el nombre lo deriva `jest.setup.js` de
`DATABASE_URL`— y `pnpm verify` solo migra la de desarrollo. Se crea una vez, y **cada migración
nueva hay que llevarla también ahí**:

```bash
createdb Stockly_test                                           # o CREATE DATABASE desde psql
psql -d Stockly_test -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm'
DATABASE_URL=postgresql://…/Stockly_test pnpm exec prisma db push
```

Lo que puede fallar aquí, en [CONTEXTO.md §4](CONTEXTO.md).

---

## Verificar

```bash
pnpm verify            # en cada repositorio tocado, antes de cada push
pnpm test:e2e:full     # desde Stockly-F: levanta él solo la base, el backend y el frontend
```

Qué encadena cada uno, qué necesita y cómo lo repite la CI, en
[CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Producción con Docker

Desde `Stockly-B/`:

```bash
docker compose up -d --build
```

Levanta PostgreSQL, el backend y el frontend tras nginx —que sirve la SPA y hace de proxy de
`/api`, así que hay un solo origen— en `http://localhost:8080`. Un servicio `migrate` aplica las
migraciones y termina; el backend no arranca hasta que sale bien. **La pila no se siembra sola**:
sin `pnpm db:seed` el login responde 401 y parece un fallo de credenciales.

Swagger **no se monta con `NODE_ENV=production`**. Copias de seguridad, alertas y reversión, en
[operaciones.md](operaciones.md).
