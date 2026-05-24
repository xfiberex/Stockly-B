# 📦 Stockly — Backend de Inventario de Productos

> API REST modular para gestión de inventario de productos con soporte de imágenes en la nube.

---

## 🗂️ Tabla de Contenidos

- [📋 Descripción](#-descripción)
- [🛠️ Stack Tecnológico](#️-stack-tecnológico)
- [📁 Estructura del Proyecto](#-estructura-del-proyecto)
- [⚙️ Variables de Entorno](#️-variables-de-entorno)
- [🚀 Instalación y Ejecución](#-instalación-y-ejecución)
- [🗃️ Base de Datos](#️-base-de-datos)
- [🔌 Endpoints de la API](#-endpoints-de-la-api)
- [🧩 Modelo de Datos](#-modelo-de-datos)
- [🏗️ Arquitectura](#️-arquitectura)
- [🔐 Seguridad](#-seguridad)

---

## 📋 Descripción

**Stockly Backend** es una API REST construida con **Express 5** y **TypeScript 6** que expone un CRUD completo para la gestión de productos. Soporta paginación, filtrado, búsqueda por texto, soft delete con restauración, y subida de imágenes a **Cloudinary**. La base de datos es **PostgreSQL** gestionada mediante **Prisma 7**.

---

## 🛠️ Stack Tecnológico

### 🔧 Core

| Paquete | Versión | Propósito |
|---|---|---|
| `express` | ^5.2.1 | Servidor HTTP |
| `typescript` | ^6.0.3 | Tipado estático |
| `prisma` + `@prisma/client` | ^7.8.0 | ORM principal |
| `@prisma/adapter-pg` + `pg` | ^7.8.0 / ^8.21.0 | Adaptador PostgreSQL con pool |

### 🖼️ Imágenes

| Paquete | Versión | Propósito |
|---|---|---|
| `cloudinary` | ^2.10.0 | Almacenamiento de imágenes en la nube |
| `multer` | ^2.1.1 | Procesamiento de `multipart/form-data` |

### 🛡️ Seguridad y Middlewares

| Paquete | Versión | Propósito |
|---|---|---|
| `helmet` | ^8.2.0 | Headers de seguridad HTTP |
| `cors` | ^2.8.6 | Control de Cross-Origin |
| `express-rate-limit` | ^8.5.2 | Limitación de peticiones (100/15 min) |
| `express-validator` | ^7.3.2 | Validación y sanitización de inputs |
| `cookie-parser` | ^1.4.7 | Parseo de cookies |
| `bcryptjs` | ^3.0.3 | Hashing (disponible para futuras features) |
| `jsonwebtoken` | ^9.0.3 | JWT (disponible para autenticación futura) |

### 📊 Observabilidad

| Paquete | Versión | Propósito |
|---|---|---|
| `morgan` | ^1.10.1 | Logging de requests HTTP |
| `colors` | ^1.4.0 | Logs con color en consola |

### 🔨 Desarrollo

| Paquete | Versión | Propósito |
|---|---|---|
| `nodemon` | ^3.1.14 | Hot-reload en desarrollo |
| `ts-node` | ^10.9.2 | Ejecución de TypeScript |
| `tsx` | ^4.22.3 | Ejecutor TS para el seed de Prisma |
| `dotenv` | ^17.4.2 | Variables de entorno |

> **Package manager:** PNPM ^11.2.2

---

## 📁 Estructura del Proyecto

```
Stockly-B/
├── 📂 prisma/
│   ├── schema.prisma              # Modelos de la base de datos
│   ├── seed.ts                    # Datos iniciales (8 productos de ejemplo)
│   └── migrations/                # Historial de migraciones
├── 📄 prisma.config.ts            # Configuración Prisma 7 (URL + seed command)
├── 📂 src/
│   ├── 📂 config/
│   │   └── env.ts                 # Validación de variables de entorno al arrancar
│   │
│   ├── 📂 common/                 # Piezas reutilizables entre módulos
│   │   ├── 📂 middlewares/
│   │   │   ├── error.middleware.ts    # Handler global de errores
│   │   │   ├── upload.middleware.ts   # Multer + helpers de Cloudinary
│   │   │   └── validate.middleware.ts # validationResult → respuesta 422
│   │   └── 📂 types/
│   │       └── index.ts               # ApiResponse, PaginationQuery, PaginationMeta
│   │
│   ├── 📂 modules/
│   │   └── 📂 products/           # Módulo autónomo de productos
│   │       ├── index.ts            # Re-exporta el router
│   │       ├── product.controller.ts
│   │       ├── product.routes.ts
│   │       ├── product.validator.ts
│   │       └── product.types.ts
│   │
│   ├── 📂 shared/
│   │   └── 📂 lib/
│   │       ├── prisma.ts           # Singleton de PrismaClient con PrismaPg
│   │       └── cloudinary.ts       # Cloudinary SDK configurado
│   │
│   ├── 📂 routes/
│   │   └── index.ts               # Router raíz: health + montaje de módulos
│   │
│   ├── app.ts                     # Express app + todos los middlewares globales
│   └── server.ts                  # Entry point: conecta DB y levanta el servidor
│
├── 📂 src/generated/prisma/       # Cliente Prisma generado (no editar)
├── 📄 .env                        # Variables de entorno locales (no commitear)
├── 📄 .env.example                # Plantilla de variables requeridas
├── 📄 nodemon.json                # Configuración de hot-reload
├── 📄 tsconfig.json               # Configuración de TypeScript
├── 📄 package.json
└── 📄 pnpm-lock.yaml
```

---

## ⚙️ Variables de Entorno

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `NODE_ENV` | Entorno de ejecución | `development` |
| `DATABASE_URL` | Cadena de conexión PostgreSQL | `postgresql://user:pass@localhost:5432/stockly` |
| `CLOUDINARY_CLOUD_NAME` | Nombre del cloud en Cloudinary | `mi-cloud` |
| `CLOUDINARY_API_KEY` | API Key de Cloudinary | `123456789012345` |
| `CLOUDINARY_API_SECRET` | API Secret de Cloudinary | `abc...xyz` |

> ⚠️ El servidor **no arranca** si alguna variable requerida está ausente. El módulo `src/config/env.ts` lanza un error explícito al inicio indicando cuál variable falta.

---

## 🚀 Instalación y Ejecución

### 1️⃣ Clonar e instalar dependencias

```bash
git clone <repo-url>
cd Stockly-B
pnpm install
```

### 2️⃣ Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 3️⃣ Configurar la base de datos

```bash
# Ejecutar migraciones
pnpm db:migrate

# Cargar datos de ejemplo (8 productos)
pnpm db:seed
```

### 4️⃣ Levantar el servidor

```bash
# Modo desarrollo (hot-reload)
pnpm dev

# Producción
pnpm build
pnpm start
```

El servidor estará disponible en `http://localhost:3000`

### 📋 Scripts disponibles

| Script | Comando | Descripción |
|---|---|---|
| `pnpm dev` | `nodemon src/server.ts` | Servidor en modo desarrollo con hot-reload |
| `pnpm build` | `tsc` | Compilar TypeScript a `dist/` |
| `pnpm start` | `node dist/server.js` | Ejecutar versión compilada |
| `pnpm check` | `tsc --noEmit` | Verificar tipos sin compilar |
| `pnpm db:migrate` | `prisma migrate dev` | Crear y aplicar migraciones |
| `pnpm db:seed` | `prisma db seed` | Poblar la base de datos con ejemplos |
| `pnpm db:studio` | `prisma studio` | Abrir GUI visual de la DB |
| `pnpm db:reset` | `prisma migrate reset` | Resetear y re-migrar la DB |

---

## 🗃️ Base de Datos

### Tecnología

- **PostgreSQL** como motor de base de datos
- **Prisma 7** como ORM — la URL de conexión se configura en `prisma.config.ts` (no en `schema.prisma`, comportamiento propio de Prisma 7)
- **`@prisma/adapter-pg`** para pool de conexiones nativo con estos parámetros:

```
max: 10 conexiones
idleTimeoutMillis: 30 000 ms
connectionTimeoutMillis: 5 000 ms
```

### Seed de ejemplo

El seed carga **8 productos** distribuidos en las categorías: `Electrónica`, `Periféricos`, `Audio` y `Muebles`.

---

## 🔌 Endpoints de la API

**Base URL:** `http://localhost:3000/api/v1`

### 🏥 Health Check

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Verifica que la API está operativa |

**Respuesta:**
```json
{
  "success": true,
  "message": "API corriendo correctamente"
}
```

---

### 📦 Productos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/products` | Listar productos con paginación, filtros y búsqueda |
| `GET` | `/products/:id` | Obtener un producto por su UUID |
| `POST` | `/products` | Crear un nuevo producto (imagen opcional) |
| `PUT` | `/products/:id` | Actualizar datos de un producto |
| `DELETE` | `/products/:id` | Soft delete — desactiva el producto y borra imagen |
| `PATCH` | `/products/:id/restore` | Reactivar un producto desactivado |

---

### 🔍 Parámetros de consulta — `GET /products`

| Parámetro | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| `page` | `number` | Página actual (default: 1) | `?page=2` |
| `limit` | `number` | Registros por página (default: 10) | `?limit=20` |
| `search` | `string` | Búsqueda por nombre o descripción | `?search=laptop` |
| `category` | `string` | Filtrar por categoría | `?category=Electrónica` |
| `isActive` | `boolean` | Filtrar por estado activo/inactivo | `?isActive=true` |

**Respuesta paginada:**
```json
{
  "success": true,
  "message": "Productos obtenidos correctamente",
  "data": {
    "data": [ ...productos ],
    "meta": {
      "total": 8,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
}
```

---

### ➕ Crear Producto — `POST /products`

Acepta `multipart/form-data` para subir imagen.

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `name` | `string` | ✅ | Nombre del producto |
| `price` | `number` | ✅ | Precio (decimal, ej: `99.99`) |
| `category` | `string` | ✅ | Categoría: `Electrónica`, `Periféricos`, `Audio`, `Accesorios`, `Muebles`, `Otros` |
| `stock` | `number` | ❌ | Unidades en stock (default: 0) |
| `description` | `string` | ❌ | Descripción del producto |
| `image` | `file` | ❌ | Imagen del producto (jpg, png, webp) |

---

## 🧩 Modelo de Datos

### `Product`

```prisma
model Product {
  id            String   @id @default(uuid())
  name          String
  description   String?
  price         Decimal  @db.Decimal(10, 2)
  stock         Int      @default(0)
  category      String
  imageUrl      String?           // URL pública de Cloudinary
  imagePublicId String?           // ID para borrar la imagen en Cloudinary
  isActive      Boolean  @default(true)  // false = soft deleted
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@map("products")
}
```

### Notas del modelo

- **`id`** — UUID generado automáticamente (no secuencial)
- **`price`** — `Decimal(10,2)` para evitar errores de punto flotante
- **`isActive`** — Soft delete: el registro nunca se borra físicamente
- **`imagePublicId`** — Necesario para eliminar la imagen de Cloudinary al hacer DELETE

### 🏷️ Categorías válidas

El campo `category` es validado por `express-validator` contra una lista fija definida en `product.validator.ts`:

| Categoría | Descripción |
|---|---|
| `Electrónica` | Laptops, monitores, computadoras |
| `Periféricos` | Teclados, mouse, webcams |
| `Audio` | Auriculares, altavoces, micrófonos |
| `Accesorios` | Cables, hubs, soportes y complementos |
| `Muebles` | Sillas, escritorios, estantes |
| `Otros` | Productos sin categoría específica |

> Enviar un valor fuera de esta lista devuelve **HTTP 422** con el mensaje de error correspondiente.

---

## 🏗️ Arquitectura

El proyecto sigue una **arquitectura modular por feature**. Cada módulo es autónomo y expone su propio router.

```
Petición HTTP
     │
     ▼
 app.ts (Middlewares globales: helmet, cors, morgan, rate-limit)
     │
     ▼
 routes/index.ts (Router raíz /api/v1)
     │
     ├── GET /health ──────────────────────── Respuesta directa
     │
     └── /products ──────────────────────────► product.routes.ts
                                                    │
                                              validate.middleware.ts
                                              upload.middleware.ts
                                                    │
                                              product.controller.ts
                                                    │
                                              ┌─────┴──────┐
                                           prisma.ts   cloudinary.ts
                                              │
                                          PostgreSQL
```

### Capas del módulo de productos

| Archivo | Responsabilidad |
|---|---|
| `product.types.ts` | Interfaces TypeScript del módulo |
| `product.validator.ts` | Reglas de validación con `express-validator` |
| `product.routes.ts` | Definición de rutas + encadenamiento de middlewares |
| `product.controller.ts` | Lógica de negocio + respuestas HTTP |

### Singleton de Prisma

El cliente de Prisma se instancia una sola vez (patrón singleton) usando `globalThis` para evitar múltiples conexiones en desarrollo con hot-reload:

```typescript
// src/shared/lib/prisma.ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

---

## 🔐 Seguridad

| Mecanismo | Implementación | Configuración |
|---|---|---|
| 🪖 **Headers seguros** | `helmet` | Activado por defecto en todas las rutas |
| 🌐 **CORS** | `cors` | `*` en desarrollo, `FRONTEND_URL` en producción |
| ⏱️ **Rate Limiting** | `express-rate-limit` | 100 peticiones cada 15 minutos por IP |
| ✅ **Validación de inputs** | `express-validator` | Valida campos de entrada; `category` restringida a 6 valores permitidos |
| 🔍 **Validación de env** | `src/config/env.ts` | Falla en arranque si falta alguna variable crítica |
| 🗑️ **Soft Delete** | Campo `isActive` | Los productos nunca se borran físicamente |

---

## 📝 Formato estándar de respuestas

Todos los endpoints retornan el mismo formato:

```typescript
interface ApiResponse<T = unknown> {
  success: boolean;   // true | false
  message: string;    // Mensaje legible
  data?: T;           // Payload (opcional)
}
```

Los errores de validación retornan **HTTP 422**. Los errores del servidor retornan **HTTP 500** y son capturados por `error.middleware.ts`.

---

<div align="center">

**Stockly Backend** — Express 5 · TypeScript 6 · Prisma 7 · PostgreSQL · Cloudinary

</div>
