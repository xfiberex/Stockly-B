# Área 05 · Accesibilidad y semántica · hallazgos provisionales
Revisado (solo estática, profundidad rápida, WCAG 2.2 AA): leídos enteros `MostradorPage.tsx`, `TransfersPage.tsx`, `WarehousesPage.tsx`, `CaducidadesPage.tsx`, y los compartidos `Modal.tsx`, `EscanerModal.tsx`, `Select.tsx`, `Input.tsx`, `Button.tsx`, `clasesDeBoton.ts`, `SelectorDeAlmacen.tsx`, `BuscadorDeProducto.tsx`; `idioma.ts` (parte del `lang`) e `index.html`. Por muestra: `index.css` (tokens de contraste). No abiertos: `BuscadorDeCliente.tsx`, `BotonDeComprobante.tsx`, hooks, i18n, `design-system.md` y `accesibilidad.md`, ADR. Los tests solo se miraron para ver si hay pruebas de accesibilidad: no hay ni `eslint-plugin-jsx-a11y` ni axe en `package.json`, la configuración de ESLint o `e2e/`.
Herramientas ejecutadas: ninguna de análisis (solo `grep`/`ls`). No se usaron skills de apoyo.
Modelo: Sonnet 5.5 · medium.

## Hallazgos
Ninguno de severidad Crítico ni Alto. En el código revisado no hay una barrera que impida completar con teclado o lector de pantalla el flujo de venta, la transferencia, el alta de almacén ni la baja de un lote.

## Debajo del umbral (Medio/Bajo, una línea cada uno, sin desarrollar; no puntúan en profundidad rápida)
- Medio · `MostradorPage.tsx:139-168` (WCAG 2.4.3, 4.1.3): al registrar la venta se desmonta el formulario y el botón con foco desaparece, así que el foco cae en `body`; «Nueva venta» (`:162`) repite lo mismo. El aviso `role="status"` (`:143`) se inserta ya con su contenido, y algunos lectores no anuncian regiones así. Conviene mover el foco al encabezado o al aviso.
- Medio · `MostradorPage.tsx:86-96` y `TransfersPage.tsx:51-60` (4.1.3): al añadir o sumar una línea no hay mensaje de estado, solo cambia la lista. Un `aria-live` que diga «X añadido, cantidad N» lo cubriría.
- Medio · `CaducidadesPage.tsx:25-47` (2.4.3): tras dar de baja un lote la fila deja de existir, y `Modal.tsx:84` intenta devolver el foco a un elemento ya desmontado (`previouslyFocused?.focus?.()` no hace nada). El foco se pierde.
- Medio · `main.tsx:16` (2.2.1): `ToastContainer autoClose={3000}`. Los errores de mutación solo salen como toast de 3 s, poco para quien usa lector o tarda en leer. Confirmar qué errores usan toast y no un mensaje persistente.
- Bajo · `Modal.tsx:77-78`: enfoca siempre el botón «Cerrar» (el primer enfocable) y pisa el `autoFocus` del primer campo, p. ej. `WarehousesPage.tsx:42`. Es una molestia, no una barrera.
- Bajo · `Input.tsx`/`Select.tsx`: el error lleva `role="alert"` y `aria-describedby`, bien. Pero `Input` no marca `required` ni `aria-required` por sí mismo (`WarehousesPage.tsx:42` usa `required` nativo).
- Bajo · no hay `eslint-plugin-jsx-a11y` ni pruebas con axe. Es una propuesta de Tier 4, no un defecto.

## Matriz de autorización
No aplica (área 2).

## Hipótesis por verificar
- `TransfersPage.tsx:251-277`: el botón de despliegue tiene `aria-label` fijo («ver líneas de N»), que sustituye al contenido visible (origen, destino, fecha, unidades). Un usuario de lector no oye esos datos al recorrer la lista. Cumple 4.1.2 y probablemente 2.5.3 (la etiqueta visible debería estar en el nombre accesible). Hace falta ver el texto de la clave `transferencias.verLineasDe` y el árbol de accesibilidad.
- `BuscadorDeProducto.tsx:123-128`: el `blur` cierra la lista. En el mostrador, Tab desde el campo con la lista abierta no pierde nada, pero habría que comprobar que Enter justo tras escribir (antes de que acabe el debounce de 250 ms) no se queda sin elegir nada con un escáner de pistola. Es funcional más que de accesibilidad.

## Pendiente de verificar en ejecución
Para la sesión con chrome-devtools y `a11y-debugging`:
- Mostrador: venta completa solo con teclado (buscar, Intro, cantidad, Registrar). Mirar a dónde va el foco tras añadir una línea, tras «Registrar venta» y tras «Nueva venta». Comprobar que el lector anuncia el aviso de venta hecha y el cambio del total (`dl aria-live`; si anuncia demasiado, el `dl` entero se relee).
- Mostrador: el modal del escáner con teclado. Foco inicial en «Cerrar», Tab cíclico (el `input` de archivo con `display: none` entra en el selector `FOCUSABLE`), Escape y retorno del foco al botón «Escanear». El campo de texto como alternativa al lector, con Intro.
- Combobox de producto y de cliente: que se anuncien las opciones y el resultado «ningún producto». Tamaño de objetivo de las opciones.
- Transferencias: modal «Nueva transferencia» con el combobox dentro. Escape con la lista abierta cierra solo la lista. Mensaje de «supera el disponible» asociado a cada cantidad.
- Caducidades: foco tras «Dar de baja» y confirmación, y si el botón de la fila (`aria-label` largo) se anuncia bien.
- Contraste real en tema claro y oscuro: `text-warning` (`CaducidadesPage.tsx:125`), `text-danger` sobre `surface`, insignias de caducidad, borde de foco `accent` 3,8:1 (`index.css:103`).
- `lang` de `<html>`: que pase a `en` al cambiar el idioma (`idioma.ts:78-79`) y se mantenga tras recargar. El código lo hace; falta confirmarlo.
- `prefers-reduced-motion` (hay regla en `index.css:325`): comprobar que cubre el spinner de `Button`.

## Para escalar
Nada.

## Puntos fuertes
- Combobox ARIA 1.2 completo en `BuscadorDeProducto.tsx`: `role="combobox"`, `aria-activedescendant`, flechas, Intro y Escape que no cierra el diálogo padre.
- `Modal.tsx`: `role="dialog"`, `aria-modal`, `aria-labelledby`, trampa de foco, pila de modales, Escape, devolución del foco y scroll interno.
- `Input` y `Select` asocian etiqueta, error (`aria-describedby`, `aria-invalid`, `role="alert"`) con `useId`.
- Botones de icono con `aria-label` que nombra el producto o el almacén; iconos decorativos con `aria-hidden`; objetivos de 44 px en móvil.
- Cantidades con `aria-label`, `aria-describedby` y `aria-invalid` en mostrador y transferencias.
- El escáner tiene alternativa por teclado (campo de texto), por foto y por cámara.
- `lang` dinámico según el idioma efectivo, con tokens de contraste documentados y modo oscuro.

## Para otras áreas
- Área 13 (legal): sin lector de pantalla real recorrido (T4-17, ya registrado); no se reabre aquí.
- Área de calidad/CI: añadir `eslint-plugin-jsx-a11y` y una prueba con axe en `e2e/` sería la forma barata de proteger lo conseguido.
