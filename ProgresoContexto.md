# Contexto de Mentoría — Proyecto Stockly

## Instrucción para la IA

Continúa la mentoría desde donde quedamos. El usuario escribe el código guiado por ti. No escribas el código por él — explica qué hacer y por qué, luego él lo implementa y lo comparte para revisión.

---

## Perfil del usuario

- Desarrollador aprendiendo el stack PERN (PostgreSQL, Express, React, Node.js)
- Tiene experiencia práctica con: Prisma, Zod, TanStack Query, TypeScript, Cloudinary, bcryptjs, jsonwebtoken
- Prefiere que se le explique el "por qué" antes del "cómo"
- Agrega comentarios al código deliberadamente — los usa como documentación personal para reutilizar lógica en proyectos futuros. **No señalar esto como algo a corregir.**
- Prefiere respuestas en español

---

## Proyecto

**Stockly** — Inventario de productos con autenticación completa.

| Parte      | Stack                                          | Ruta                      |
| ---------- | ---------------------------------------------- | ------------------------- |
| Stockly-B  | Express + TypeScript + Prisma + PostgreSQL     | `./Stockly-B/`            |
| Stockly-F  | React + TypeScript + TanStack Query + Vite     | `./Stockly-F/`            |

**Proyecto de referencia:** Cuadre — `c:\Users\User\Desktop\Cursos y Proyectos\06 - Proyectos con el Stack PERN\06-Cuadre\`

---

## Convenciones del proyecto (importantes para la IA)

- Imports usan el **alias `@/`** que mapea a `src/` (`@/shared/lib/...`, `@/config/env`, etc.)
- Parámetros en **camelCase** (`currentPassword`, no `current_password`)
- Validación con **Zod** (schemas en `*.validator.ts`; middleware `validate(schema)` en rutas)
- JWT guardado en **cookie httpOnly** (no localStorage)
- Variables de entorno agrupadas: `env.jwt.secret`, `env.smtp.host`, etc.
- Tokens de expiración en schema: `verifyExpires`, `resetExpires` (no `verifyTokenExpires`)
- Runtime de desarrollo usa **tsx** (resuelve el alias `@/` de tsconfig automáticamente)

---

## Schema Prisma — Modelo User

```prisma
model User {
  id             String    @id @default(uuid())
  name           String
  email          String    @unique
  password       String
  isVerified     Boolean   @default(false)
  verifyToken    String?
  verifyExpires  DateTime?
  resetToken     String?
  resetExpires   DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

---

## Patrón de validación con Zod

El `validate.middleware.ts` exporta una factory `validate(schema)` que:
1. Llama a `schema.safeParse(req.body)`
2. Si hay errores, responde 422 con `{ field, message }[]` usando `result.error.issues`
3. Si es válido, reemplaza `req.body` con los datos parseados/coercionados por Zod

En las rutas se usa directamente:
```ts
router.post("/register", authRegisterLimiter, validate(registerSchema), authController.register);
```

Los schemas viven en `*.validator.ts` y también exportan los tipos inferidos (`z.infer<typeof schema>`).

---

## Estado actual — Fase 1: Backend (Stockly-B)

| #  | Archivo                                                   | Estado |
|----|-----------------------------------------------------------|--------|
| 1  | Instalar dependencias (zod, nodemailer etc)               | ✅     |
| 2  | `src/config/env.ts`                                       | ✅     |
| 3  | `prisma/schema.prisma` (User model)                       | ✅     |
| 4  | `src/shared/lib/httpError.ts`                             | ✅     |
| 5  | `src/shared/middlewares/error.middleware.ts`               | ✅     |
| 6  | `src/shared/lib/jwt.ts`                                   | ✅     |
| 7  | `src/shared/lib/hash.ts`                                  | ✅     |
| 8  | `src/shared/lib/nodemailer.ts`                            | ✅     |
| 9  | `src/shared/middlewares/auth.middleware.ts`                | ✅     |
| 10 | `src/shared/middlewares/rateLimiter.middleware.ts`         | ✅     |
| 11 | `src/shared/middlewares/validate.middleware.ts` (Zod)     | ✅     |
| 12 | `src/modules/auth/auth.validator.ts` (Zod schemas)        | ✅     |
| 13 | `src/modules/auth/auth.service.ts`                        | ✅     |
| 14 | `src/modules/auth/auth.controller.ts`                     | ✅     |
| 15 | `src/modules/auth/auth.routes.ts`                         | ✅     |
| 16 | `src/modules/auth/index.ts`                               | ✅     |
| 17 | `src/modules/products/product.validator.ts` (Zod schemas) | ✅     |
| 18 | `src/modules/products/product.controller.ts`              | ✅     |
| 19 | `src/modules/products/product.routes.ts`                  | ✅     |
| 20 | `src/routes/index.ts`                                     | ✅     |

---

## Fase 2: Frontend (Stockly-F) — pendiente

| #  | Archivo                                          | Estado |
|----|--------------------------------------------------|--------|
| 1  | `src/api/auth.api.ts`                            | ⬜     |
| 2  | `src/hooks/useMe.ts` + hooks auth                | ⬜     |
| 3  | Schemas Zod auth                                 | ⬜     |
| 4  | Páginas: Login, Register, ForgotPassword, etc.   | ⬜     |
| 5  | `src/components/ProtectedRoute.tsx`              | ⬜     |
| 6  | Actualizar `App.tsx` y rutas                     | ⬜     |
