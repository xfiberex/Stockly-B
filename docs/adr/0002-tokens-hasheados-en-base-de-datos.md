# 0002 — Tokens de verificación y reset hasheados con SHA-256

**Estado:** aceptada · **Fecha:** 2026-08-04 (registrada el 2026-08-10, T3-11)

## Contexto

Verificar una cuenta y restablecer una contraseña funcionan igual: se genera un token, se
manda por correo y se guarda para reconocerlo cuando vuelva. Lo natural es guardarlo tal
cual y buscarlo por igualdad.

El problema es lo que eso significa si alguien lee la base de datos —una copia de seguridad
mal guardada, una inyección SQL, un `SELECT` desde una consola de administración—. Con los
tokens en claro, **quien lea la tabla `users` puede restablecer la contraseña de cualquier
cuenta con un token de reset vivo**. No necesita la contraseña ni el correo del usuario: el
token *es* la credencial.

Es la misma razón por la que las contraseñas no se guardan en claro, aplicada a algo que
también abre la puerta.

## Decisión

Se genera un valor aleatorio de 32 bytes; **el usuario recibe el valor en claro y la base
guarda solo su SHA-256**. Al volver, se hashea lo recibido y se busca por el hash
([`shared/lib/tokens.ts`](../../src/shared/lib/tokens.ts)):

```ts
const raw = crypto.randomBytes(32).toString("hex");
const hash = crypto.createHash("sha256").update(raw).digest("hex");
```

Se usa **SHA-256 y no bcrypt**, a diferencia de las contraseñas, y la diferencia importa: un
token es aleatorio de 256 bits, así que no hay diccionario que probar ni fuerza bruta
viable. Lo que hace lento a bcrypt protege contra adivinar contraseñas humanas; aquí solo
añadiría latencia a cada verificación. Además el hash tiene que ser **determinista** para
poder buscar por él con un índice, y bcrypt no lo es.

Aplica a `verifyToken`, `resetToken` y —desde T2-31— también a `refreshToken` y
`previousRefreshToken`.

## Consecuencias

- **Un token perdido no se puede recuperar, solo regenerar.** No hay forma de leer de la
  base cuál se envió. Es el comportamiento correcto, pero descarta cualquier función del
  tipo «reenviar el mismo enlace».
- **La comparación es por igualdad de hash**, así que las columnas van indexadas
  (`@unique`) y la búsqueda sigue siendo directa.
- **El valor en claro solo existe en dos sitios**: en memoria durante la petición que lo
  crea y en el correo del usuario. Los registros no deben imprimirlo nunca.
- La caducidad (`verifyExpires`, `resetExpires`) es una defensa distinta y complementaria:
  el hash protege de quien lea la base, la caducidad de quien lea un correo antiguo.
