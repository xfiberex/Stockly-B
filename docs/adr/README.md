# Decisiones de arquitectura (ADR)

Registro de las decisiones no obvias de Stockly: las que un colaborador nuevo —o el propio
autor dentro de seis meses— podría deshacer por parecer complicadas de más, sin ver el
problema que resuelven.

**No están aquí todas las decisiones del proyecto**, solo aquellas en las que la opción
evidente es la equivocada. Si algo se hizo de la forma obvia, no necesita una entrada.

| # | Decisión | Estado |
|---|---|---|
| [0001](0001-decremento-condicional-de-stock.md) | Decremento condicional para cerrar la carrera de stock | Aceptada |
| [0002](0002-tokens-hasheados-en-base-de-datos.md) | Tokens de verificación y reset hasheados con SHA-256 | Aceptada |
| [0003](0003-path-restringido-de-la-cookie-de-refresh.md) | `path` restringido en la cookie de refresh | Aceptada |
| [0004](0004-correo-fuera-de-la-transaccion.md) | El correo se envía fuera de la transacción | Aceptada |
| [0005](0005-sin-integracion-continua.md) | Sin integración continua: la puerta de calidad es local | Aceptada |

## Formato

Cada entrada tiene tres apartados —**contexto**, **decisión** y **consecuencias**— y se
mantiene corta a propósito. Una ADR que nadie lee no sirve, y la forma más rápida de que
nadie las lea es que ocupen tres páginas.

Las decisiones no se reescriben: si una se sustituye, se añade una entrada nueva que la
deje **sustituida** y se enlazan entre sí. El valor de este registro está en poder leer por
qué se pensó algo entonces, no en que la lista parezca coherente hoy.
