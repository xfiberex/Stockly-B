# 0003 — `path` restringido en la cookie de refresh

**Estado:** aceptada · **Fecha:** 2026-08-04 (registrada el 2026-08-10, T3-11)

## Contexto

La sesión usa dos cookies: un *access token* de vida corta (15 min) y un *refresh token* de
vida larga (7 días). Las dos son `httpOnly`, así que ningún script puede leerlas.

Pero `httpOnly` protege de **leer**, no de **enviar**. Una cookie con `path=/` viaja en
todas las peticiones al backend, y eso incluye las que dispare código inyectado en la
página. El access token expira en quince minutos; el refresh token vale una semana y sirve
para fabricar access tokens nuevos. Que la credencial más valiosa acompañe a cada petición
—incluidas las que solo listan productos— es superficie regalada.

## Decisión

La cookie de refresh se emite con el `path` del único endpoint que la necesita
([`auth.controller.ts`](../../src/modules/auth/auth.controller.ts)):

```ts
const REFRESH_COOKIE_OPTS = {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/v1/auth/refresh",
};
```

El navegador solo la adjunta a `POST /api/v1/auth/refresh`. En las otras ~40 rutas de la
API, la cookie sencillamente no viaja.

## Consecuencias

- **Borrarla exige repetir el `path`.** `res.clearCookie("refreshToken")` sin él no borra
  nada: el navegador identifica una cookie por nombre **y** ruta, así que la de `/api/v1/
  auth/refresh` sobrevive a un `clearCookie` con el `path` por defecto. Está repetido en
  `logout` y en `updatePassword`, y es el error que más fácil se cuela al añadir un tercer
  sitio donde cerrar sesión.
- **Cambiar el prefijo de la API rompe la sesión en silencio.** Si `/api/v1` pasara a
  `/api/v2`, las cookies existentes dejarían de enviarse y los usuarios verían un logout
  inexplicable. La constante debe moverse con la ruta.
- No sustituye a nada: `httpOnly`, `sameSite` y la rotación con detección de reuso
  (T2-31) siguen ahí. Esto reduce la exposición, no la elimina.
