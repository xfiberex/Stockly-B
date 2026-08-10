# 0001 — Decremento condicional para cerrar la carrera de stock

**Estado:** aceptada · **Fecha:** 2026-08-04 (registrada el 2026-08-10, T3-11)

## Contexto

Descontar stock parece un `leer → comprobar → escribir`:

```ts
const producto = await tx.product.findUnique({ where: { id } });
if (producto.stock < cantidad) throw new HttpError(400, "…");
await tx.product.update({ where: { id }, data: { stock: producto.stock - cantidad } });
```

Con una sola petición funciona. Con dos a la vez sobre el mismo producto, las dos leen
`stock = 5`, las dos comprueban que 5 ≥ 3, y las dos escriben: el stock acaba en 2 en vez
de en −1, y se han vendido 6 unidades de 5. Meter todo en una transacción **no lo arregla**:
el nivel de aislamiento por defecto de PostgreSQL, *read committed*, permite exactamente
esta secuencia. Haría falta `SERIALIZABLE` y reintentos, o un bloqueo explícito.

Y no es un escenario de laboratorio: dos operarios registrando salidas del almacén a la
vez, o una orden de venta que se envía mientras alguien ajusta stock a mano, bastan.

## Decisión

La comprobación y la escritura son **una sola sentencia**, y la condición viaja en el
`WHERE`:

```ts
const res = await tx.product.updateMany({
    where: { id: productId, stock: { gte: dto.quantity } },
    data: { stock: { decrement: dto.quantity } },
});
if (res.count === 0) throw new HttpError(400, "El stock no puede quedar negativo");
```

`res.count === 0` significa que la fila existía pero no cumplía la condición. La base de
datos evalúa el `WHERE` y aplica el `decrement` bajo el mismo bloqueo de fila, así que la
segunda petición ve el stock ya descontado y falla limpiamente.

El mismo patrón se aplica al revertir una orden de compra recibida
([`purchase-orders.service.ts`](../../src/modules/purchase-orders/purchase-orders.service.ts)):
si esas unidades ya salieron por una venta, la cancelación se rechaza entera en vez de
dejar stock negativo.

## Consecuencias

- **`updateMany` para actualizar una sola fila.** Es lo que chirría al leerlo y lo que
  invita a «simplificarlo» a `update`. Es deliberado: `update` no admite condiciones sobre
  campos que no sean la clave, así que no hay forma de expresar esto con él.
- **Hace falta una lectura extra** (`findUniqueOrThrow`) para saber el stock resultante,
  porque `updateMany` devuelve un recuento, no filas. Es el precio, y es pequeño: ocurre
  dentro de la misma transacción.
- **El error es 400, no 409.** El cliente no puede reintentar y esperar otro resultado: no
  hay stock. Un 409 sugeriría lo contrario.
- No se toca el nivel de aislamiento ni se añaden reintentos. Ambas alternativas resuelven
  el problema, pero pagan en toda la aplicación lo que aquí se paga en una sentencia.
