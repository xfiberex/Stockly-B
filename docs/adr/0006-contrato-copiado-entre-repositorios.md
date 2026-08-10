# 0006 — El contrato de la API se copia, no se comparte como paquete

**Estado:** aceptada · **Fecha:** 2026-08-10 (T4-01)

## Contexto

Los tipos de las respuestas de la API se declaraban **dos veces**, a mano, uno en cada
repositorio, sin nada que obligara a que coincidieran. Es la causa raíz común de T0-03,
T1-03 y T1-05: cada lado se probaba contra su propia suposición del contrato y 379 tests en
verde no detectaron tres funcionalidades rotas.

Al medirlo antes de tocar nada, la divergencia ya estaba ahí:

- `Product.price` y los tres `unitPrice` se declaraban `number` y **llegan como cadena**
  (`Decimal` de Prisma se serializa así). No reventaba porque el código lo parcheaba en los
  bordes: dos `Number(...)` defensivos, un `z.coerce.number()` en el formulario y un
  `formatearImporte` que acepta las dos cosas y lo documenta. El código sabía la verdad y
  el tipo no.
- `SettingEntry.value` seguía siendo `boolean | string | number`, la unión laxa que admite
  `{ type: "boolean", value: "false" }` — el defecto exacto de T1-06. T2-24 había endurecido
  su espejo en los tests, pero no el tipo de producción.
- Cuatro uniones de cadena copiaban enums de Prisma a mano.
- `description` e `imageUrl` se declaraban `string | undefined` y llegan `string | null`.

La ficha de T4-01 proponía «`shared/`, nuevo paquete del workspace pnpm». **Eso no puede
existir aquí:** Stockly son dos repositorios git independientes y la carpeta que los
contiene no está bajo control de versiones, así que ningún workspace de pnpm puede
abarcarlos — quien clone uno solo se quedaría sin la mitad.

## Decisión

`Stockly-B/src/contratos/api.ts` es la **fuente de verdad**: un único archivo que solo
importa `zod`. `pnpm contratos:generar` lo copia literal a
`Stockly-F/src/shared/contratos/api.generated.ts`, que se versiona en el frontend y es
contra lo que compila la aplicación.

La restricción de «solo importa `zod`» es lo que mantiene el mecanismo trivial: **copiar,
no transformar**. Por eso los enums se repiten en el contrato en lugar de importarse de
Prisma.

Tres guardianes sostienen la garantía, y los tres están falsificados:

| Qué vigila | Dónde | Qué pasa si falla |
|---|---|---|
| Los `z.enum` son los de Prisma | `Stockly-B/src/tests/contratos.test.ts` | Añadir un valor al `schema.prisma` sin traerlo rompe la suite |
| Las respuestas **reales** encajan en sus esquemas | ídem, contra una base viva | El contrato describe la API, no lo que se creía de ella |
| La copia está al día | ídem, y `Stockly-F/src/tests/contratos/frescura.test.ts` | `pnpm verify` en rojo, con el comando a ejecutar en el mensaje |

### Alternativas descartadas, y por qué

- **Publicar `@stockly/contratos` en un registro.** Es la solución canónica y aquí sale
  cara: sin CI (ver [0005](0005-sin-integracion-continua.md)) cada cambio de contrato serían
  cuatro pasos a mano —subir versión, publicar, actualizar los dos repos— y el build de
  Docker necesitaría un token de autenticación dentro de la imagen. En un proyecto de una
  persona, ese ritual se salta y el paquete se queda viejo.
- **Submódulo git con un tercer repositorio.** Funciona y comparte código de verdad, pero
  añade un repositorio más, ceremonia de `--recursive` en cada clon **en dos máquinas**, y
  el fallo clásico de commitear un puntero desactualizado — que es la misma clase de
  desincronización silenciosa que esto viene a eliminar.
- **Dependencia `file:../Stockly-B/…`.** La más corta de escribir y la que rompe dos
  caminos que hoy funcionan: `git clone Stockly-F && pnpm install` por separado, y el build
  de la imagen del frontend, cuyo contexto es `Stockly-F/` y no alcanza al hermano.

## Consecuencias

- **Una divergencia de contrato es ahora un error de compilación.** Al conectarlo salieron
  12 de golpe: 4 en código de producción y 8 en mocks a los que les faltaban campos que el
  backend sí envía. Ese era el criterio de aceptación de T4-01.
- **Hay un artefacto generado versionado en `Stockly-F`.** Es la contrapartida aceptada. Se
  mitiga con la cabecera del archivo, que dice de dónde viene y qué comando lo reescribe, y
  con el test de frescura, que hace inútil editarlo a mano.
- **Editar el contrato obliga a commitear en los dos repositorios.** El generador lo
  recuerda por consola al terminar.
- **La comprobación de frescura del frontend se omite si `Stockly-B` no está en disco**, y
  lo dice en la salida en vez de pasar en silencio. Clonar solo el frontend es legítimo; la
  comprobación que importa vive en el backend, que es donde se edita el contrato, y allí no
  se omite nunca.
- **`zod` pasa a ser dependencia de producción del contrato en ambos lados.** Ya lo era en
  los dos (4.4.3 exacto). Si algún día divergen de versión mayor, la copia dejará de
  compilar del otro lado — ruidoso, que es lo que se quiere.
- Si el proyecto crece a más de una persona o gana CI, la balanza cambia y conviene
  reevaluar el registro de paquetes. Entonces esta entrada se marca **sustituida**.
