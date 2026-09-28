# 0008 — Integración continua: la misma puerta, también en GitHub

**Estado:** aceptada · **Fecha:** 2026-09-28 · **Sustituye a:** [0005](0005-sin-integracion-continua.md)

## Contexto

La [0005](0005-sin-integracion-continua.md) descartó la CI el 2026-08-06 con un argumento que
era cierto entonces: una sola persona trabajaba el proyecto, ejecutaba `verify` antes de cada
commit, y un pipeline no añadía nada a ese flujo.

Lo que cambió es que **los dos repositorios son públicos**. Con eso aparecen dos cosas que un
`verify` local no cubre:

- **Código que no pasó por la máquina de nadie del proyecto.** Un pull request de un fork llega
  sin que nadie haya ejecutado nada sobre él, y la puerta local solo existe si alguien la abre.
- **Una señal visible desde fuera.** Quien llega al repositorio no puede saber si `main` pasa
  sus propios tests; un check en verde en cada commit sí lo dice.

Y hubo un aviso previo de lo que cuesta no tenerla: **la auditoría de dependencias estuvo dos
semanas en rojo** (del 2026-09-13 al 2026-09-28) sin que el código cambiara. Se supo porque
alguien ejecutó `verify`; nada lo habría dicho si nadie lo hubiera hecho.

## Decisión

Un workflow `verify` por repositorio, en GitHub Actions, que ejecuta **la misma puerta que en
local y no otra**:

- **Stockly-B:** `pnpm verify` tal cual, con un PostgreSQL 17 de servicio —la versión del
  compose—. Lo único previo es crear y migrar `Stockly_test`, que en local se hace una vez a mano.
- **Stockly-F:** dos jobs. `verify`, con el backend clonado al lado para que la **frescura del
  contrato** (T4-01) se compruebe en vez de omitirse; y `e2e`, el `pnpm test:e2e:full` de siempre,
  en escritorio y móvil, con su base de servicio.

Se ejecutan en cada push a `main`, en cada pull request y a mano.

**Lo que no cambia:** `pnpm verify` sigue siendo la puerta, y sigue ejecutándose **antes** de
hacer commit. La CI no la sustituye: la repite donde nadie la habría repetido. Por eso el
workflow llama al mismo script y no reproduce sus pasos, que es la forma de que la CI y el
portátil no acaben pidiendo cosas distintas.

**Por ser públicos:** permisos de solo lectura (`contents: read`), acciones **fijadas por SHA**
—una etiqueta se puede mover, un commit no—, `pull_request` y **no** `pull_request_target`, para
que el código de un fork nunca corra con secretos, y ningún secreto en uso: la base es
desechable y el `JWT_SECRET` solo firma tokens de tests.

## Consecuencias

- **Un cambio de contrato se sube primero al backend.** El workflow del frontend clona el `main`
  del backend; si el frontend llega antes, la frescura del contrato falla, y con razón: la copia
  no coincide con la fuente publicada.
- **`playwright.config.ts` sí depende ahora de `process.env.CI`**, y solo para una cosa:
  `forbidOnly`. Un `.only` olvidado haría pasar la CI ejecutando un test. Los **reintentos siguen
  en 0**, también en la CI: los fallos intermitentes del E2E han sido siempre defectos reales.
- **En la CI la auditoría de dependencias tiene red**, así que su «sin red avisa y deja pasar»
  (T4-07) no se da en la práctica; si el registro de avisos está caído, avisa igual que en local.
- **Las acciones fijadas por SHA no se actualizan solas.** Subirlas es una tarea a mano: se
  resuelve la etiqueta nueva a su commit con `gh api repos/<acción>/commits/<etiqueta>` y se
  cambia el SHA con el comentario de versión al lado.
- **La 0005 queda como histórico**, marcada sustituida y enlazada aquí: sin esa marca, el
  registro diría una cosa y los repositorios otra.
