# 0009 — Licencia: GNU AGPL v3, no MIT

**Estado:** aceptada · **Fecha:** 2026-09-30

## Contexto

Los dos repositorios se publicaron con la **MIT**: cualquiera puede tomar el código, cerrarlo y
venderlo sin devolver nada. Era una elección por defecto, no una decisión, y el proyecto ya no es
pequeño: 124 tareas cerradas, más de 1 500 tests y dos repositorios públicos.

Se compararon tres familias:

- **Permisivas (MIT, Apache-2.0).** Máxima adopción, ninguna obligación de devolver cambios.
- **GPL v3.** Obliga a publicar los cambios **al distribuir** el programa. Stockly es una
  aplicación web: quien la monta en su servidor y la ofrece como servicio no distribuye nada, así
  que la GPL no le obligaría a nada. Es el llamado hueco del SaaS, y aquí es el caso normal de uso.
- **AGPL v3.** La GPL v3 más la cláusula 13: quien ofrece el programa **modificado por la red**
  tiene que ofrecer su código a quienes lo usan. Es la variante que cierra ese hueco, y la que usan
  aplicaciones web como Mastodon, Nextcloud o Grafana.

## Decisión

**AGPL-3.0-only** en los dos repositorios: el texto oficial en `LICENSE` y `"license":
"AGPL-3.0-only"` en cada `package.json`.

- **`-only` y no `-or-later`**, para que una versión futura de la licencia no se aplique sin que
  el autor lo decida.
- **La interfaz enlaza el código**, como pide la cláusula 13: el perfil —que abre cualquier rol—
  tiene «Acerca de Stockly» con la licencia, los dos repositorios, el texto de la licencia y el
  aviso de terceros. Las direcciones viven en `Stockly-F/src/shared/lib/codigoFuente.ts`, y quien
  despliegue una versión modificada tiene que apuntarlas a su propio código. La especificación de
  Swagger declara la licencia y el repositorio del backend, para quien use solo la API.

## Consecuencias

- **Lo ya publicado sigue siendo MIT.** Quien copiara el código antes del 2026-09-30 lo tiene con
  esa licencia; la AGPL rige de este commit en adelante.
- **Las dependencias no lo impiden.** Las de producción son MIT, ISC, BSD, Apache-2.0, MPL-2.0 y
  OFL-1.1 (la tipografía, que se distribuye aparte con su aviso), todas compatibles con la AGPL v3.
  Apache-2.0 es compatible con la versión 3 y no con la 2, que es otra razón para la 3.
- **Es posible la doble licencia.** El autor es el único titular del código, así que puede vender
  una licencia comercial a quien no quiera publicar sus cambios. **Eso deja de ser cierto con la
  primera contribución externa** que se acepte sin un acuerdo de cesión (CLA): a partir de ahí, esa
  parte es del contribuidor. Si la doble licencia entra en los planes, el CLA va antes que la
  primera contribución (ver [CONTRIBUTING](../../CONTRIBUTING.md#licencia-de-las-contribuciones)).
- **Aleja a algunas empresas**, que prohíben internamente usar código AGPL. Es buscado si se quiere
  cobrarles una licencia comercial, y un freno si lo que se busca es adopción amplia.
- **La auditoría de licencias no cambia.** `scripts/auditoria.js` revisa las de las dependencias,
  no la del propio proyecto, y ninguna de las permitidas choca con la AGPL.
