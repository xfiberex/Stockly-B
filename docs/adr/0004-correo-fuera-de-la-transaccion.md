# 0004 — El correo se envía fuera de la transacción

**Estado:** aceptada · **Fecha:** 2026-08-04, ampliada el 2026-08-08 (T2-07) · registrada el 2026-08-10 (T3-11)

## Contexto

Varias operaciones deben avisar por correo: una salida de stock que deja un producto por
debajo del mínimo, una cuenta nueva que necesita verificación. Lo cómodo es enviarlo donde
se detecta la condición, dentro de la transacción que ya está abierta.

Eso junta dos cosas que no deben ir juntas:

1. **Una transacción abierta mantiene bloqueos de fila.** Enviar un correo tarda cientos de
   milisegundos —o el tiempo de espera entero si el servidor SMTP no responde—, y durante
   todo ese rato el producto queda bloqueado para cualquier otra operación.
2. **Un fallo de SMTP revertiría la operación.** El stock ya se descontó, la venta ya
   ocurrió; que el aviso no salga no puede deshacerla. Es exactamente al revés de lo que
   uno querría: el correo es lo prescindible.

Sacarlo de la transacción arregla las dos, pero deja una tercera: si se espera el envío
dentro del ciclo de la petición, **quien registra la salida paga en su tiempo de respuesta
la latencia del SMTP** — y en una orden de venta, una vez por producto, en serie.

## Decisión

El envío ocurre **fuera de la transacción y sin esperarlo**
([`shared/lib/stockAlerts.ts`](../../src/shared/lib/stockAlerts.ts)). La operación responde
en cuanto los datos están guardados.

Un `void promesa` habría bastado para no esperar, pero deja el envío sin poder testar y sin
poder apagar el proceso ordenadamente. En su lugar se lleva un registro de las promesas
vivas:

```ts
const enVuelo = new Set<Promise<unknown>>();
```

con `esperarAlertasEnVuelo()` para que los tests **esperen de verdad** en vez de dormir un
rato y cruzar los dedos, y un `.catch` que registra el fallo:

```ts
logger.warn({ err, productName }, "No se pudo enviar la alerta de bajo stock");
```

Sin esa línea, un correo que no sale desaparece en silencio.

## Consecuencias

- **La respuesta puede llegar antes que el correo**, y eso es correcto: el usuario no está
  esperando al correo, está esperando a que se guarde su movimiento.
- **Un fallo de SMTP no rompe nada y queda registrado.** Se ve en el log, con el
  `requestId` de la petición que lo originó (T2-10).
- **Los tests no pueden dar por hecho que el correo ya salió** al recibir la respuesta:
  tienen que llamar a `esperarAlertasEnVuelo()`. Es una llamada que hay que recordar, y ese
  es el coste de no bloquear.
- **No hay cola ni reintentos.** Para el volumen de esta aplicación es desproporcionado; si
  algún día los avisos dejan de ser accesorios, esta decisión se sustituye por una cola de
  verdad y se registra en una ADR nueva.
