# 0007 — La internacionalización se hace con un motor propio, no con `i18next`

**Estado:** aceptada · **Fecha:** 2026-08-11 (T4-04)

## Contexto

Toda la interfaz tenía los textos incrustados en los componentes y la API devolvía sus
mensajes de error en español, con el `message` del servidor pintado tal cual en quince
sitios del frontend. Para que el usuario pueda elegir idioma hacían falta tres piezas: un
catálogo por idioma, una forma de traducir desde un componente, y que los errores de la API
llegaran con algo traducible.

La respuesta habitual a esto es `i18next` + `react-i18next`. Antes de añadirlo se miró qué
resuelve, y qué de eso tiene este proyecto:

| Lo que aporta `i18next` | Situación en Stockly |
|---|---|
| Respaldo entre variantes regionales (`es-MX` → `es`) | Dos idiomas, sin variantes: `idiomaDelNavegador()` ya compara solo la parte primaria |
| Espacios de nombres y carga diferida de catálogos | El catálogo entero son ~2 500 palabras en dos archivos; partirlo costaría más de lo que ahorra |
| Seis categorías de plural, reglas CLDR | `Intl.PluralRules` viene en el navegador y es la misma fuente que usa la librería |
| Detección por cabecera, cookie, subdominio, backend remoto | La preferencia es de dispositivo y vive en `localStorage`, igual que el tema (T4-11) |
| Interpolación, formateo, `Trans` con marcado dentro de la frase | La interpolación son cuatro líneas; `Trans` es lo único que se echa en falta |

## Decisión

Un motor propio de unas treinta líneas en `Stockly-F/src/shared/i18n/`:

- **`es.ts` es el catálogo de referencia** y `en.ts` se declara `Record<keyof typeof es, string>`,
  así que una clave sin traducir **no compila**. Es el mismo mecanismo que el contrato de
  T4-01: una fuente de verdad y el compilador vigilando la copia.
- **`traducir(idioma, clave, valores)`** interpola `{nombre}` y **`traducirCantidad`** elige
  forma con `Intl.PluralRules`, con las claves `_one` / `_other`.
- **`useT()`** entrega `t`, `tn` y `te` leyendo la preferencia con `useSyncExternalStore`.
  **No hay contexto de React**: un proveedor obligaría a envolver los `render` de cincuenta
  archivos de test y a acordarse en el siguiente.
- **La preferencia va en `localStorage`** con tres estados —`auto`, `es`, `en`—, `auto` como
  el que ve quien nunca entra en Configuración, y el idioma efectivo se refleja en el `lang`
  de `<html>`, del que dependen el lector de pantalla y el corrector del navegador.

Y en el backend, lo que hace falta para que los errores se puedan traducir: `HttpError`
lleva `code` y `params`, el sobre de error los transporta, y el cliente compone la frase con
su catálogo. El `message` en español se queda —es lo que ve quien llama a la API sin
interfaz— pero deja de ser lo que se pinta.

### Lo que se renuncia, y cómo se paga

| Renuncia | Cómo se cubre |
|---|---|
| `Trans`: marcado dentro de una frase | Las frases se guardan enteras y se interpola texto, no nodos. Donde había un `<span>` en negrita a media frase —el diálogo de cancelar una venta— se quitó el resaltado: partir la frase para conservarlo la volvía intraducible |
| Extracción automática de cadenas | `literales.test.ts` recorre las pantallas y falla si encuentra un texto escrito a mano en un nodo JSX, en una prop visible o en un `toast` |
| Contexto gramatical (`context:`) | Las claves ya están separadas donde el género importa: `estado.compra.CANCELLED` («cancelada») y `estado.venta.CANCELLED` («cancelado») coinciden en inglés y no en español |

## Consecuencias

- **Cambiar de idioma no recarga la página ni pierde estado**: es un `useSyncExternalStore`
  sobre `localStorage`, así que se repinta lo que depende de él y nada más.
- **Una pantalla nueva con texto a mano pone `pnpm verify` en rojo.** Sin CI, esa guardia es
  lo único que impide que la traducción se erosione — igual que el suelo de cobertura.
- **El catálogo crece con la aplicación y hay que mantener dos.** El compilador impide
  olvidarse de una clave, pero no que la traducción sea mala; eso lo sigue viendo una persona.
- **Las exportaciones no se traducen.** Un CSV es formato de intercambio y sus columnas están
  emparejadas con las del backend por el test de T3-05: salen siempre en el idioma de
  referencia, y lo mismo los motivos de un movimiento de stock, que se **guardan** en la base.
- **Los mensajes por campo de un 422 siguen en español.** El sobre ya trae
  `code: "VALIDATION_ERROR"`, que el cliente traduce, pero `errors[]` lleva el texto del
  validador de Zod. En la práctica no se ven —cada formulario valida antes con su propio
  esquema—, y traducirlos exigiría un código por regla.
- **Los correos siguen saliendo en español.** El servidor no sabe qué idioma eligió el
  destinatario: la preferencia es de dispositivo y vive en el navegador. Llevarla al servidor
  pide una columna por usuario y enviarla en el registro; es otra tarea, y está anotada.
- Si algún día entran un tercer y un cuarto idioma, o hace falta `Trans` de verdad, la
  balanza cambia: `useT()` es la única superficie que consume la aplicación, así que
  sustituir el motor por `i18next` no toca las pantallas. Entonces esta entrada se marca
  **sustituida**.
