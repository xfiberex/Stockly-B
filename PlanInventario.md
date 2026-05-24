# Plan: Backend — Inventario de Productos (CRUD Modular)

## Stack

| Paquete | Propósito |
|---|---|
| `express` | Servidor HTTP |
| `prisma` + `@prisma/client` + `pg` + `@prisma/adapter-pg` | ORM + PostgreSQL |
| `express-validator` | Validaciones de entrada |
| `multer` + `cloudinary` | Subida de imágenes de productos |
| `helmet` | Headers de seguridad HTTP |
| `cors` | Cross-Origin Resource Sharing |
| `morgan` | Logging de requests |
| `express-rate-limit` | Protección contra abuso de API |
| `cookie-parser` | Parseo de cookies |
| `colors` | Logs con color en consola |
| `dotenv` | Variables de entorno |
| `typescript` + `ts-node` + `tsx` + `nodemon` | Entorno de desarrollo TS |

Package manager: **PNPM**
Sin autenticación de usuarios (bcryptjs, jsonwebtoken, nodemailer, stripe no se usan).

---

## Arquitectura Modular

```
Backend/
├── prisma/
│   ├── schema.prisma              # Modelo Product
│   └── seed.ts                    # Datos de ejemplo
├── prisma.config.ts               # Config Prisma 7 (URL, seed command)
├── src/
│   ├── config/
│   │   └── env.ts                 # Validación de variables de entorno al arrancar
│   │
│   ├── common/                    # Piezas compartidas entre módulos
│   │   ├── middlewares/
│   │   │   ├── error.middleware.ts   # Handler global de errores
│   │   │   ├── upload.middleware.ts  # Multer + helpers Cloudinary
│   │   │   └── validate.middleware.ts # Corre validationResult → 422
│   │   └── types/
│   │       └── index.ts              # ApiResponse, PaginationQuery, PaginationMeta
│   │
│   ├── modules/
│   │   └── products/
│   │       ├── index.ts           # Re-exporta el router
│   │       ├── product.controller.ts
│   │       ├── product.routes.ts
│   │       ├── product.validator.ts
│   │       └── product.types.ts
│   │
│   ├── shared/
│   │   └── lib/
│   │       ├── prisma.ts          # PrismaClient singleton con PrismaPg adapter
│   │       └── cloudinary.ts      # Cloudinary SDK configurado
│   │
│   ├── routes/
│   │   └── index.ts               # Router raíz: health + módulos
│   │
│   ├── app.ts                     # Express app + middlewares globales
│   └── server.ts                  # Entry point: conecta DB + escucha
├── .env
├── .env.example
├── .gitignore
├── nodemon.json
├── tsconfig.json
└── package.json
```

---

## Pasos y estado

### Sesión 1 — Pasos 1–3 ✅
- Proyecto inicializado con PNPM
- TypeScript 6 configurado
- Variables de entorno con validación al arrancar

### Sesión 2 — Paso 4 ✅
- Prisma 7.8 con `prisma.config.ts` (URL en config, no en schema)
- `@prisma/adapter-pg` con pool de conexiones
- Cliente generado en `src/generated/prisma`
- Migración ejecutada, seed con 8 productos de ejemplo

### Sesión 3 — Pasos 5–7 ✅
- Cloudinary configurado en `src/shared/lib/cloudinary.ts`
- Tipos globales en `src/common/types/index.ts`
- App Express con helmet, cors, morgan, rate-limit
- Servidor corriendo en `http://localhost:3000`
- Health check: `GET /api/v1/health`

### Sesión 4 — Pasos 8–9 ⬅ PENDIENTE (siguiente sesión)
- [ ] `src/common/middlewares/upload.middleware.ts` (multer + Cloudinary helpers)
- [ ] `src/common/middlewares/validate.middleware.ts` (validationResult → 422)

### Sesión 5 — Pasos 10–11
- [ ] `src/modules/products/product.types.ts`
- [ ] `src/modules/products/product.validator.ts`
- [ ] `src/modules/products/product.controller.ts`

### Sesión 6 — Pasos 12–14
- [ ] `src/modules/products/product.routes.ts`
- [ ] `src/modules/products/index.ts`
- [ ] `src/routes/index.ts` (montar módulo)
- [ ] `src/common/middlewares/error.middleware.ts`

### Sesión 7 — Pasos 15–16
- [ ] Scripts finales en `package.json`
- [ ] Verificación completa con Thunder Client / Postman

---

## Endpoints finales previstos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/v1/products` | Listar con paginación, filtros, búsqueda |
| GET | `/api/v1/products/:id` | Obtener uno por ID |
| POST | `/api/v1/products` | Crear (con imagen opcional) |
| PUT | `/api/v1/products/:id` | Actualizar parcialmente |
| DELETE | `/api/v1/products/:id` | Soft delete + borrar imagen |
| PATCH | `/api/v1/products/:id/restore` | Reactivar producto |

---

## Modelo Product (Prisma)

```prisma
model Product {
  id            String   @id @default(uuid())
  name          String
  description   String?
  price         Decimal  @db.Decimal(10, 2)
  stock         Int      @default(0)
  category      String
  imageUrl      String?
  imagePublicId String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@map("products")
}
```
