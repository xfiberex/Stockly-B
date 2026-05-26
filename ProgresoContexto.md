# Contexto de Mentoría — Proyecto Stockly

## Instrucción para la IA

Continúa la mentoría desde donde quedamos. El usuario escribe el código guiado por ti. No escribas el código por él — explica qué hacer y por qué, luego él lo implementa y lo comparte para revisión.

---

## Perfil del usuario

- Desarrollador aprendiendo el stack PERN (PostgreSQL, Express, React, Node.js)
- Tiene experiencia práctica con: Prisma, express-validator, TanStack Query, TypeScript, Cloudinary, bcryptjs, jsonwebtoken
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

- Imports usan **rutas relativas** (`../../shared/lib/...`), NO el alias `@/`
- Parámetros en **camelCase** (`currentPassword`, no `current_password`)
- Validación con **express-validator** (no Zod — Zod es del proyecto Cuadre)
- JWT guardado en **cookie httpOnly** (no localStorage)
- Variables de entorno agrupadas: `env.jwt.secret`, `env.smtp.host`, etc.
- Tokens de expiración en schema: `verifyExpires`, `resetExpires` (no `verifyTokenExpires`)

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

## Estado actual — Fase 1: Backend (Stockly-B)

| #  | Archivo                                | Estado |
|----|----------------------------------------|--------|
| 1  | Instalar dependencias (nodemailer etc) | ✅     |
| 2  | `src/config/env.ts`                    | ✅     |
| 3  | `prisma/schema.prisma` (User model)    | ✅     |
| 4  | `src/shared/lib/httpError.ts`          | ✅     |
| 5  | `src/shared/middlewares/error.middleware.ts`      | ✅     |
| 6  | `src/shared/lib/jwt.ts`                | ✅     |
| 7  | `src/shared/lib/hash.ts`               | ✅     |
| 8  | `src/shared/lib/nodemailer.ts`         | ✅     |
| 9  | `src/shared/middlewares/auth.middleware.ts`       | ✅     |
| 10 | `src/shared/middlewares/rateLimiter.middleware.ts`| ✅     |
| 11 | `src/modules/auth/auth.validator.ts`   | ✅     |
| 12 | `src/modules/auth/auth.service.ts`     | ✅     |
| 13 | `src/modules/auth/auth.controller.ts`  | ⏳ EN PROGRESO |
| 14 | `src/modules/auth/auth.routes.ts`      | ⬜     |
| 15 | `src/modules/auth/index.ts`            | ⬜     |
| 16 | `src/routes/index.ts` (registrar auth) | ⬜     |

---

## Paso actual — Paso 13: auth.controller.ts

El controller es el puente entre HTTP y el servicio. No contiene lógica de negocio — solo recibe el request, llama al servicio, y envía la respuesta.

### Handlers requeridos

| Handler            | Método HTTP | Qué hace                                                                 |
|--------------------|-------------|--------------------------------------------------------------------------|
| `register`         | POST        | Llama a `authService.register`, responde 201                             |
| `verifyEmail`      | POST        | Llama a `authService.verifyEmail`, responde 200                          |
| `resendVerification` | POST      | Llama a `authService.resendVerification`, responde 200                   |
| `login`            | POST        | Llama a `authService.login`, firma JWT, setea cookie, responde 200       |
| `logout`           | POST        | Limpia la cookie, responde 200                                           |
| `forgotPassword`   | POST        | Llama a `authService.forgotPassword`, responde 200                       |
| `resetPassword`    | POST        | Llama a `authService.resetPassword`, responde 200                        |
| `getMe`            | GET         | Llama a `authService.getById(req.userId!)`, responde 200                 |
| `updateProfile`    | PUT         | Llama a `authService.updateProfile`, responde 200                        |
| `updatePassword`   | PUT         | Llama a `authService.updatePassword`, responde 200                       |

### Punto crítico — handler login

```ts
res.cookie("token", jwt, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
});
```

El `logout` usa `res.clearCookie("token")`.

Todos los handlers envueltos en `try/catch` que pasen el error a `next(err)`.

**Referencia:** `Cuadre/Backend/src/modules/auth/auth.controller.ts`

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
