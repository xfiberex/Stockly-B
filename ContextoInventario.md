# Contexto de Mentoría — Inventario de Productos

## Dinámica de trabajo
- Claude actúa como **mentor**: guía, explica y muestra código en el chat.
- El usuario **escribe y ejecuta** todo. Claude no edita archivos del proyecto.
- Se revisa cada paso antes de avanzar al siguiente.

---

## Estado actual del proyecto

**Servidor corriendo:** `http://localhost:3000`
**Health check:** `GET http://localhost:3000/api/v1/health` → `{ success: true, message: "API corriendo correctamente" }`

**Estado:** BACKEND COMPLETO ✅ — Todos los endpoints verificados con Postman.

---

## Archivos creados hasta ahora

### `prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

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
> En Prisma 7 la URL va en `prisma.config.ts`, no en el schema.

---

### `prisma.config.ts` (generado por Prisma 7)
```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

---

### `prisma/seed.ts`
```typescript
import "dotenv/config";
import { prisma, Prisma } from "../src/shared/lib/prisma";

const products: Prisma.ProductCreateInput[] = [
  { name: 'Laptop Pro 15', description: '...', price: new Prisma.Decimal('1299.99'), stock: 15, category: 'electronics' },
  { name: 'Monitor UltraWide 34"', description: '...', price: new Prisma.Decimal('549.99'), stock: 8, category: 'electronics' },
  { name: 'Teclado Mecánico RGB', description: '...', price: new Prisma.Decimal('89.99'), stock: 30, category: 'peripherals' },
  { name: 'Mouse Inalámbrico Ergonómico', description: '...', price: new Prisma.Decimal('45.00'), stock: 50, category: 'peripherals' },
  { name: 'Silla Gaming Lumbar', description: '...', price: new Prisma.Decimal('320.00'), stock: 5, category: 'furniture' },
  { name: 'Escritorio Standing Desk', description: '...', price: new Prisma.Decimal('450.00'), stock: 3, category: 'furniture' },
  { name: 'Auriculares Noise Cancelling', description: '...', price: new Prisma.Decimal('279.99'), stock: 12, category: 'audio' },
  { name: 'Webcam 4K', description: '...', price: new Prisma.Decimal('129.99'), stock: 20, category: 'peripherals' },
];

async function main() {
  console.log("Iniciando seeding de productos...");
  await prisma.product.deleteMany();
  for (const product of products) {
    await prisma.product.create({ data: product });
  }
  console.log("Seeding completado.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```

---

### `src/config/env.ts`
```typescript
import dotenv from "dotenv";
dotenv.config();

const required = [
  'DATABASE_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL!,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
  },
} as const;
```

---

### `src/shared/lib/prisma.ts`
```typescript
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../../config/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { Prisma } from "../../generated/prisma/client";
```

---

### `src/shared/lib/cloudinary.ts`
```typescript
import { v2 as cloudinary } from "cloudinary";
import { env } from "../../config/env";

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

export default cloudinary;
```

---

### `src/common/types/index.ts`
```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
  search?: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
```

---

### `src/app.ts`
```typescript
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env";
import { router } from "./routes";
import { errorHandler } from "./common/middlewares/error.middleware";

const app = express();

app.use(helmet());

app.use(cors({
  origin: env.nodeEnv === "production" ? process.env.FRONTEND_URL : "*",
  credentials: true,
}));

if (env.nodeEnv === "development") {
  app.use(morgan("dev"));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Demasiadas peticiones, intenta más tarde." },
}));

app.use("/api/v1", router);
app.use(errorHandler);

export default app;
```

---

### `src/routes/index.ts`
```typescript
import { Router } from "express";
import { productRouter } from "../modules/products";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "API corriendo correctamente" });
});

router.use("/products", productRouter);
```

---

### `src/server.ts`
```typescript
import "dotenv/config";
import colors from "colors";
import app from "./app";
import { prisma } from "./shared/lib/prisma";
import { env } from "./config/env";

async function main() {
  await prisma.$connect();
  console.log(colors.green("Conexión a la base de datos establecida"));

  app.listen(env.port, () => {
    console.log(colors.blue(`Servidor corriendo en http://localhost:${env.port}`));
  });
}

main().catch((error) => {
  console.error(colors.red("Error al iniciar el servidor:"), error);
  process.exit(1);
});
```

---

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "ignoreDeprecations": "6.0"
  },
  "include": ["src/**/*"]
}
```

---

### `nodemon.json`
```json
{
  "watch": ["src", "prisma"],
  "ext": "ts,json",
  "ignore": ["dist"],
  "exec": "ts-node --project tsconfig.json"
}
```

---

### `package.json` (scripts y estructura relevante)
```json
{
  "main": "dist/server.js",
  "scripts": {
    "dev": "nodemon src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "db:reset": "prisma migrate reset"
  }
}
```

---

## Problemas resueltos (histórico completo)

| Problema | Causa | Solución |
|---|---|---|
| `"type": "module"` en package.json | Conflicto con CommonJS | Eliminarlo |
| URL faltante en schema.prisma | Prisma 7 usa `prisma.config.ts` | URL va en `prisma.config.ts`, no en schema |
| Import `Prisma` namespace en seed.ts | No exportado desde `prisma.ts` | Agregar `export { Prisma }` en `prisma.ts` |
| `tsx` no instalado | `prisma.config.ts` lo referencia en seed command | `pnpm add -D tsx` |
| PNPM bloqueaba builds de Prisma/esbuild | PNPM 11 requiere aprobación explícita | `pnpm approve-builds` y seleccionar los 3 paquetes |
| Nodemon pasaba dos archivos a ts-node | `nodemon.json` exec hardcodeaba `server.ts` + script pasaba `src/server.ts` | Quitar filename del exec, dejarlo solo en el script |

---

## Proyecto completado ✅

Todos los archivos implementados y verificados con Postman. Ver `PlanInventario.md` para el detalle completo de endpoints.
