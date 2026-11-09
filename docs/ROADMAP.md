# ROADMAP — Stockly

La fuente de verdad del **trabajo pendiente** de los dos repositorios. Cada tarea tiene un
identificador `T{tier}-{nº}` que se cita en commits y documentos:
`fix(T0-01): resolver alias de rutas en el build de producción`. Desde la re-auditoría del
2026-10-31, las tareas nuevas llevan `AUD-NNN`, un identificador permanente que no cambia si
cambia el tier (`fix(AUD-005): …`). Las 139 `T` conservan el suyo.

> **Estado al 2026-11-09: ocho tareas abiertas.** `AUD-014` en `main`, con la tercera tanda hecha
> (la crítica del 2026-11-09 dio 27,8/40 y un P1, ya arreglado); para cerrarla falta repetir la
> crítica. `AUD-009` ya tiene decisión: los importes, solo para ADMIN.
>
> **Estado al 2026-11-07, noche (PC): ocho tareas abiertas, `AUD-014` con los once puntos hechos**
> en la rama `feat/aud-014-pantallas-de-acceso` de los dos repositorios (sin fusionar). Para
> cerrarla falta lo que no es código: la crítica dual repetida, el E2E contra `Stockly_e2e` y
> fusionar.
>
> **Estado al 2026-11-07, noche: ocho tareas abiertas, `AUD-014` a medias** en la rama
> `feat/aud-014-pantallas-de-acceso` de los dos repositorios (subida, sin fusionar). Su ficha dice
> qué está hecho, lo que falta —todo, también los P3, decidido por el propietario— y cómo cerrarla.
>
> **Estado al 2026-11-07, al cerrar `AUD-013`: ocho tareas abiertas.** A 390 px, el stock de
> Productos, el campo de cada línea de una recepción, el primer campo de un conteo con su «Guardar»
> y el cobro del mostrador se ven sin desplazar; y toda tabla que sigue a lo ancho lo dice. Lo
> siguiente sin decisión pendiente es `AUD-014`, las pantallas de acceso.
>
> **Estado al 2026-11-07, al cerrar `AUD-012`: nueve tareas abiertas.** Ninguna acción irreversible
> ocurre ya de un toque: borrar, cancelar, enviar, cambiar un rol o desactivar piden confirmación y
> dicen la consecuencia. En el Tier 2 solo queda `AUD-009`, que espera una decisión de producto; lo
> siguiente que se puede hacer sin ella es `AUD-013`, el móvil de quien trabaja de pie.
>
> **Estado al 2026-11-07, por la tarde: diez tareas abiertas.** Se cerró `AUD-011`: lo escrito en
> el conteo, el mostrador, Configuración, Sugerencias y los modales del catálogo ya no se pierde sin
> que la persona lo decida. La siguiente del Tier 2 es `AUD-012`, las acciones irreversibles de un
> toque. Lo de abajo es el estado de la mañana.
>
> **Estado al 2026-11-07: once tareas abiertas.** `AUD-008`, el rediseño del panel, se cerró con
> su crítica repetida (30/40, sin P1). Al cerrarla se pasó la misma crítica por **las 31
> pantallas** del frontend ([informe](auditoria/2026-11-07-critica/INFORME.md); media 25,9/40,
> ninguna crítica, una pobre: Restablecer contraseña). De ella salen `AUD-011` a `AUD-019`; las
> dos primeras, en el Tier 2, son trabajo que se pierde sin aviso y acciones irreversibles de un
> toque. Siguen abiertas `AUD-009` (decisión de producto pendiente) y `AUD-010`.
>
> **Estado al 2026-11-04: tres tareas abiertas, una de ellas a medias.** El 2026-11-03 una crítica
> de diseño del panel principal (con el plugin Impeccable; 23/40) abrió `AUD-008`, el rediseño del
> panel, y al hacerlo salieron `AUD-009` y `AUD-010`. **`AUD-008` está a medias, ya en `main`
> en los dos repositorios** (la rama `feat/panel-principal` se fusionó y se borró el 2026-11-04): su
> ficha dice qué pasos están hechos y cuáles faltan. Lo de abajo es el estado anterior.
>
> **Estado al 2026-11-02: ninguna tarea abierta.** Las seis de la re-auditoría del 2026-10-31
> ([informe](auditoria/2026-10-31/INFORME.md)) están cerradas: `AUD-006`, `AUD-004` y `AUD-001` —la
> Crítica— el 2026-11-01, y `AUD-005`, `AUD-002` y `AUD-003` el 2026-11-02. El mismo día se abrió y
> cerró `AUD-007`, que no sale de la auditoría: la carga con esqueleto. `pnpm verify` está en verde en
> los dos repositorios. Las 139 `T` siguen cerradas: `T5-15`, la última, se cerró el 2026-10-10. Lo que
> sigue sin hacerse y no es un defecto está en «Sin tarea».
>
> **Cerrada no quiere decir comprobada del todo.** `T4-17`, el recorrido con lector de pantalla,
> se **descartó sin ejecutarse**: el listón de accesibilidad del proyecto es teclado más árbol de
> accesibilidad, y lo que eso no cubre está escrito en [accesibilidad.md](accesibilidad.md).

| Para saber… | Mira |
|---|---|
| Qué se midió al cerrar cada tarea, y su ficha completa | [historico/ROADMAP-2026-10-05.md](historico/ROADMAP-2026-10-05.md) — congelado |
| Los hallazgos que originaron los Tiers 0 a 4 | [historico/INFORME-AUDITORIA.md](historico/INFORME-AUDITORIA.md) — congelado |
| En qué estado está el proyecto y qué no conviene deshacer | [CONTEXTO.md](CONTEXTO.md) |
| Cómo se anota el cierre de una tarea | [CONTRIBUTING.md](../CONTRIBUTING.md#al-cerrar-una-tarea-del-roadmap) |

---

## Resumen

| Tier | Qué es | Cerradas |
|---|---|---:|
| **0** | Crítico: despliegue roto, corrupción de inventario, credencial expuesta | 8 / 8 |
| **1** | Alta prioridad: funciones rotas, verificación local, autorización, accesibilidad grave | 26 / 26 |
| **2** | Mejoras sustanciales: rendimiento, accesibilidad, sistema de diseño, cobertura, infraestructura | 48 / 48 |
| **3** | Pulido y mantenimiento | 15 / 15 |
| **4** | Lo que la auditoría dejó fuera del alcance inmediato, abordado igualmente | 17 / 17 |
| **5** | Funcionalidad de negocio: costes, compras, clientes, almacén, informes, avisos y roles | 15 / 15 |
| **6** | Venta de mostrador y documento de venta: lo que SistemaVenta hace y Stockly no | 10 / 10 |
| | **Total** | **139 / 139** |

Los Tiers 0 a 4 son la remediación de la auditoría del 2026-08-04: 100 tareas salieron de sus
hallazgos y de la consultoría de diseño del día siguiente, y otras 14 las abrió el cierre de una
anterior, casi siempre al medir. El Tier 5 se abrió el 2026-09-13 y no corrige nada: es
funcionalidad nueva.

El Tier 6 se abrió el 2026-10-05, al comparar Stockly con SistemaVenta, un punto de venta en
ASP.NET Core MVC. De sus diez tareas, ocho son funcionalidad nueva —el mostrador y el documento de
venta— y dos, `T6-01` y `T6-02`, corrigen defectos de Stockly que salieron al comparar.

**Los contadores se cuentan, no se recuerdan.** Este documento ya se desfasó más de una vez por
actualizar un número y olvidar otro. Al cerrar o abrir una tarea cambian la casilla, la cabecera,
esta tabla y la fila del índice; si no coinciden, manda el recuento:

```bash
grep -c '^- \[ \] \*\*\[T' docs/ROADMAP.md    # abiertas: 0
grep -c '^| T[0-9]-[0-9]* |' docs/ROADMAP.md  # cerradas: 139
grep -c '^- \[ \] \*\*AUD-' docs/ROADMAP.md    # AUD abiertas: 8
grep -c '^| AUD-[0-9]* |' docs/ROADMAP.md     # AUD cerradas: 11
```

---

## Tareas abiertas

Ocho. `AUD-009` (Tier 2) y `AUD-010` (Tier 3) salieron el 2026-11-03 y 04 de la crítica del
panel. `AUD-011` a `AUD-019` salen de la crítica de todas las pantallas del 2026-11-07
([informe](auditoria/2026-11-07-critica/INFORME.md)): `AUD-011` y `AUD-012` (ya cerradas) en el Tier 2, el
resto en el Tier 3. Las seis de la re-auditoría del 2026-10-31 están cerradas. Las tareas van en los Tiers 0 a 4 de más abajo. El tier lo da la severidad, y dentro de cada tier van en el orden en que conviene
atacarlas. Las observaciones
de severidad Medio o Bajo de esa auditoría no tienen tarea, porque fue una pasada rápida: están
en el [informe](auditoria/2026-10-31/INFORME.md), apartado 3. Una tarea nueva se abre con su
ficha, como dice «Una tarea nueva», más abajo.

<!-- indice:inicio -->
**Última actualización:** 2026-11-07 · **Siguiente ID libre:** AUD-020 · **Último informe:** [2026-11-07, crítica de diseño](auditoria/2026-11-07-critica/INFORME.md)

| Tier | Abiertas | Cerradas | Esfuerzo de las abiertas (Bajo · Medio · Alto) |
|---|---|---|---|
| 0 · Crítico | 0 | 1 | — |
| 1 · Alto | 0 | 5 | — |
| 2 · Medio | 1 | 2 | 1 · 0 · 0 |
| 3 · Bajo | 7 | 3 | 1 · 6 · 0 |
| 4 · Propuestas | 0 | 0 | — |
| **Total** | **8** | **11** | **2 · 6 · 0** |

**Abiertas por área:** Diseño 5 (`AUD-014` a `AUD-017`, `AUD-019`) · Accesibilidad 1 (`AUD-018`) · Seguridad 1 (`AUD-009`) · Rendimiento 1 (`AUD-010`)
<!-- indice:fin -->

### Sin tarea: lo que hay que decidir, no consultar

Cabos que quedaron escritos al cerrar otras tareas. Ninguno es un defecto pendiente; son
decisiones de producto o mediciones sin repetir, y por eso no tienen ficha.

| Qué | Dónde está el detalle |
|---|---|
| **El recorrido con lector de pantalla no se ha hecho** (T4-17). Vuelve a la lista si aparece una máquina con NVDA o VoiceOver | [accesibilidad.md §4](accesibilidad.md) |
| **El buscador de texto del catálogo no mira el SKU.** La búsqueda exacta por SKU o código de barras sí existe (`GET /products/lookup`) | [rendimiento.md §7](rendimiento.md) |
| **Un informe por periodo de un año tarda ~1.8 s.** Lo que lo cambia de escala es una tabla con las cifras ya sumadas por mes y producto, no `work_mem` | [rendimiento.md §10](rendimiento.md) |
| **El trozo `vendor` del frontend sigue por encima de 250 kB** (346 kB el 2026-10-05). Separar React lo empeora, medido | comentario de `manualChunks` en `Stockly-F/vite.config.ts` |
| **La fila de la tabla de productos mide 48 px**, no los 36 del perfil denso: bajar exige quitar el SKU o encoger la miniatura | [CONTEXTO.md §6](CONTEXTO.md) |
| **La clase ABC podría filtrar al abrir un conteo físico**; hoy solo filtra la categoría | — |
| **La prueba de carga ya no cumple sus umbrales**, y no es de `T5-14`: repetida el 2026-10-10 con el código de antes, el panel da 2,2 s de p(95) (límite, 2 s; eran 337 ms tras `T4-16`) y arrastra a las demás rutas. Son las consultas que `getSummary` ganó en los Tiers 5 y 6, que solas no ordenan en disco y juntas, con diez usuarios, saturan la base. Pide tarea propia. **Auditoría del 2026-10-31:** Medio tras la verificación independiente (0 % de errores; que el cuello sea el pool y no la CPU no está medido); sin tarea por ser una pasada rápida | [rendimiento.md §15](rendimiento.md) · [informe](auditoria/2026-10-31/INFORME.md) |
| **Los lotes no tienen retirada, ni se eligen al vender, ni entran por CSV** (`T5-15`). De qué lote salió cada venta está guardado (`sale_order_item_lots`), pero no hay pantalla que liste a quién se vendió un lote; el lote lo elige siempre el orden de caducidad; la importación crea productos sin lotes; y el resumen semanal no habla de caducidades | [ADR 0011](adr/0011-lotes-como-dimension-del-nivel.md) |
| **El conteo físico es por producto, no por lote** (`T5-15`): lo que sobra queda «sin lote» y lo que falta sale por orden de caducidad | [ADR 0011](adr/0011-lotes-como-dimension-del-nivel.md) |
| **Lo legal que falta antes de tener usuarios reales o de cobrar**: privacidad, plazos de conservación, condiciones, marca | [legal.md §2](legal.md) |

## Tier 0 · Crítico

*Ninguna abierta.*

## Tier 1 · Alto

*Ninguna abierta.*

## Tier 2 · Medio

- [ ] **AUD-009 · `GET /reports` entrega los importes del negocio a todos los roles, aunque el panel ya solo se los enseña a ADMIN**
  - **Área:** Seguridad · **Severidad:** Medio · **Esfuerzo:** Bajo
  - **Origen:** `AUD-008`, paso 2 (un panel por rol). El panel dejó de pintar el valor a coste, el
    valor a precio de venta, el margen potencial y el valor por categoría a USER, WAREHOUSE y SELLER
    —SELLER ni siquiera pide `/reports`—, pero **ocultar no es proteger**: la ruta está en `TODOS`
    en `PERMISOS`, y cualquiera con sesión los lee llamándola.
  - **Ubicación:** `src/contratos/api.ts` (`PERMISOS`, `"GET /reports"`),
    `src/modules/reports/reports.service.ts` (`getSummary`: `totals.inventoryCostValue`,
    `inventoryValue`, `potentialMargin`, `stockByCategory[].value`, `margin`, `topByValue`).
  - **Decisión previa, tomada el 2026-11-09: solo ADMIN** recibe importes (la propuesta, ya
    aplicada en el panel), anotada en [CONTEXTO.md](CONTEXTO.md) §6. Para los demás roles, el mismo
    endpoint con la respuesta recortada y declarada en el contrato; Reportes sigue abierto a todos,
    sin importes para quien no es ADMIN. Ojo: **Informes** (`/reports` en la interfaz) también los enseña
    hoy a USER y WAREHOUSE, y no se tocó.
  - **Qué hacer:** según la decisión, o quitar esos campos de la respuesta para quien no es ADMIN
    (mismo endpoint, respuesta recortada y declarada en el contrato), o sacar `GET /reports` de
    `TODOS`. En cualquier caso, Informes tiene que dejar de pedir lo que no recibirá.
  - **Criterio de aceptación:** con sesión de SELLER y de WAREHOUSE, `GET /reports` no trae ninguno
    de esos importes (o da 403), fijado en `permisos.test.ts` o un test propio; ADMIN los sigue
    recibiendo; Informes no rompe con ningún rol.
  - **Dependencias:** ninguna; conviene hacerla junto con `AUD-010`, que toca la misma respuesta.

Las observaciones de severidad Medio de la auditoría del 2026-10-31 están en su [informe](auditoria/2026-10-31/INFORME.md), sin tarea.

## Tier 3 · Bajo

- [ ] **AUD-010 · Los recuentos de «Necesita atención» en `/reports`: el panel de ADMIN pasó de 1 petición a 6**
  - **Área:** Rendimiento · **Severidad:** Bajo · **Esfuerzo:** Medio
  - **Origen:** `AUD-008`. Para no tocar el backend, el bloque lee cada recuento de un listado con
    `limit: 1` y su `meta.total`: caducidades, conteos abiertos, compras `PENDING`, compras
    `PARTIALLY_RECEIVED` y ventas `PENDING`. Contra el límite global de la API —100 peticiones por
    IP cada 15 minutos— pesa: con la caché de 30 s, volver al panel no las repite, pero cada carga
    en frío son seis.
  - **Ubicación:** `Stockly-F/src/modules/dashboard/hooks/useAtencionDeHoy.ts`;
    `src/modules/reports/reports.service.ts` (`getSummary`) y `src/contratos/api.ts`.
  - **Qué hacer:** que el backend devuelva esos cinco recuentos (declarados en el contrato) y que
    `useAtencionDeHoy` los lea de ahí. **Medir antes**: la prueba de carga del panel ya no cumple
    sus umbrales (fila de «Sin tarea»), y cinco `COUNT` más en `getSummary` pueden empeorarla; si
    es así, una ruta propia y ligera es mejor que engordar `/reports`.
  - **Criterio de aceptación:** el panel de ADMIN hace una petición de datos (dos como mucho) en
    vez de seis, con las mismas cifras; la prueba de carga no empeora respecto a
    [rendimiento.md §15](rendimiento.md).
  - **Dependencias:** `AUD-008` ya fijó las filas (cerrada el 2026-11-07: stock, caducidades —con
    `summary.expiredCount`—, conteos, compras y ventas). Junto con `AUD-009`, que
    recorta la misma respuesta.

- [ ] **AUD-014 · Pantallas de acceso: errores que duran 3 s, la aprobación que no se anticipa y enlaces caducados sin salida**
  - **Área:** Diseño · **Severidad:** Bajo · **Esfuerzo:** Medio
  - **Origen:** crítica del 2026-11-07, bloque Acceso (19 a 28/40; Restablecer contraseña, 19,
    la única «Pobre» del proyecto). Cinco P1.
  - **Ubicación:** `Stockly-F/src/modules/auth/components/` (las seis pantallas) y
    `Stockly-F/src/main.tsx:16` (`autoClose={3000}`, sin `theme`).
  - **Qué hacer:**
    - Los errores del servidor (credenciales, cuenta pendiente, enlace caducado) en un bloque
      persistente dentro de la tarjeta, con `role="alert"`, no solo en el aviso.
    - El registro anticipa los dos pasos (confirmar el correo, esperar a un administrador) y,
      tras enviar, una pantalla propia «Revisa tu correo».
    - Restablecer y Confirmar sin token o con token inválido: la misma tarjeta, con `h1`, «Este
      enlace ya no sirve» y «Pedir un enlace nuevo». «Ya verificada» dice que espera aprobación.
    - Reenviar verificación responde de forma neutra, como Olvidé la contraseña.
    - Fuera «Token» de la interfaz, el placeholder `••••••••`, la burbuja nativa (`noValidate`);
      «mostrar contraseña»; requisitos fijos bajo el campo.
  - **Criterio de aceptación:** la crítica de Impeccable del bloque, repetida, sin P1 y ninguna
    pantalla por debajo de 24/40.
  - **Dependencias:** ninguna.
  - **Estado al 2026-11-07: a medias, en la rama `feat/aud-014-pantallas-de-acceso` de los dos
    repositorios (subida, sin fusionar en `main`).** Se siguió en el PC; esto es lo que hay que
    saber para retomarla.
    - **Hecho (primera tanda):**
      - *Backend:* `POST /auth/resend-verification` responde siempre lo mismo, exista o no la
        cuenta (antes un 400 lo revelaba); `POST /auth/verify-email` conserva la huella del enlace
        hasta que caduca, de modo que abrirlo otra vez devuelve 200 con
        `data: { alreadyVerified, pendingApproval }` en vez de «enlace inválido»
        (`auth.service.ts`, `auth.controller.ts`; 3 tests nuevos en `auth.test.ts`). Sin cambio de
        contrato: `api.ts` no tipa esa respuesta; el código `ACCOUNT_NOT_FOUND_OR_VERIFIED` queda en
        el contrato aunque ya no se emite.
      - *Frontend:* `MarcoDeAcceso` (marca, `h1` y tarjeta en las seis), `AvisoDeAcceso` (el error del
        servidor dentro de la tarjeta, `role="alert"`; los hooks ya no hacen `toast.error`),
        `CampoDeContrasena` («Mostrar la contraseña», requisito fijo debajo), `EnlaceCaducado`
        («Este enlace ya no sirve» con un siguiente paso), `PedirEnlacePorCorreo` (Olvidé y Reenviar,
        respuesta neutra y foco al mensaje), registro con los dos pasos anticipados y pantalla
        «Revisa tu correo», `noValidate`, sin «Token» ni `••••••••`, `codigoDeError()` en
        `errorApi.ts`, y `AvisosFlotantes` (tema de la aplicación y 6 s en vez de 3).
      - *Comprobado:* `pnpm verify` en verde en los dos (backend 1832, frontend 1051 y 1 omitido en
        94 archivos); E2E completo en local contra `Stockly_e2e`, 39 pasados y 3 omitidos (los
        `getByLabel("Contraseña")` del E2E pasaron a `{ exact: true }`: el botón «Mostrar la
        contraseña» también casaba).
    - **Crítica repetida (2026-11-07, dual-agent):** media **25,2/40** (antes 24) y **2 P1** (antes
      5): Login 26, Registro 27, Olvidé 25, **Restablecer 19**, Confirmar 29, Reenviar 25. Detector
      limpio. Instantánea en `Stockly-F/.impeccable/critique/2026-11-07T20-02-26Z__src-modules-auth-components.md`.
      **El criterio aún no se cumple.**
    - **Decidido por el propietario el 2026-11-07: se arregla todo, también los P3, y una invitación
      caducada ofrece «Restablecer contraseña»** (la cuenta ya existe al invitar, así que «Olvidé la
      contraseña» le manda un enlace nuevo sin depender de un administrador).
    - **Hecho (segunda tanda, 2026-11-07, en el PC): los once puntos de la crítica repetida.**
      1. *[P1] Restablecer comprueba el enlace al abrir.* `POST /auth/reset-password/check` (contrato
         `enlaceDeRestablecerSchema`, Swagger, exento de CSRF como las demás públicas, con
         `authStrictLimiter`): no lo consume y devuelve el correo de la cuenta, o el mismo 400
         `INVALID_OR_EXPIRED_TOKEN`. El token va en el cuerpo y no en la ruta, para que no quede en
         los registros de acceso. Vale también para las invitaciones, que usan el mismo `resetToken`.
         La pantalla espera la respuesta antes de enseñar el formulario; si caduca mientras se
         escribe, el envío cambia a la misma tarjeta. `EnlaceCaducado` lleva el foco a su `h1`.
         Backend: 3 tests nuevos en `auth.test.ts` y la ruta en `csrf.test.ts`.
      2. *[P1] Invitación caducada:* el botón principal es «Restablecer contraseña» →
         `/auth/forgot-password`, con un texto que dice que la cuenta ya existe; ya no hay dos
         «Volver al inicio de sesión».
      3. «El correo o la contraseña no son correctos», con «¿Olvidaste tu contraseña?» dentro del aviso.
      4. El éxito de restablecer o de guardar la contraseña de una invitación se dice en la tarjeta
         del login (`role="status"`, `AvisoDeAcceso tono="exito"`), con el correo ya puesto; fuera el
         aviso flotante.
      5. Cuando el error repite la ayuda («Mínimo 8 caracteres»), un solo texto; si dice otra cosa,
         el requisito sigue a la vista.
      6. El correo viaja en `location.state` (no en `?email=`, que quedaría en el historial y en los
         registros): login ↔ Olvidé/Reenviar, registro → login, restablecer → login
         (`useEstadoDeAcceso`). Con el correo puesto, el foco va a la contraseña.
      7. «Enviado» dice a qué dirección, la pista del spam y «Usar otro correo» (reinicia la mutación
         y devuelve el foco al campo, con lo escrito seleccionado).
      8. «El correo ya está registrado» ofrece «Inicia sesión» y «¿Olvidaste tu contraseña?».
      9. Enlaces sueltos con 44 px en táctil: `CLASES_ENLACE_SUELTO` en `clasesDeMarco.ts`;
         «¿Olvidaste…?» a `text-sm` y subrayado.
      10. En los estados caducados, la pestaña y el anuncio de ruta dicen «Este enlace ya no sirve»:
          `useTituloDePantalla` (almacén de módulo que lee `AnuncioDeRuta`). De paso, el efecto del
          título se separó del de navegar: cambiar el título (o el idioma) ya no sube la página ni
          mueve el foco.
      11. «email» → «correo» en la validación; fuera los subtítulos que repetían la marca (el del
          login dice ahora «Entra con tu correo y tu contraseña»); la línea de «Reenviar
          verificación» del login sale solo en el aviso de `EMAIL_NOT_CONFIRMED` y tras registrarse;
          `py-6` en `CLASES_MARCO_CENTRADO`; `autoFocus` en el nombre del registro; campo `username`
          oculto con el correo en Restablecer.
      - *Comprobado:* `pnpm verify` del frontend en verde (1061 tests y 1 omitido, en 94 archivos;
        10 nuevos en `pantallasDeAcceso.test.tsx` y `ResetPasswordPage.test.tsx`) y, en el backend,
        `check` y los 1836 tests. **Sin comprobar en el navegador, sin E2E y sin la crítica.**
    - **Fusionada en `main` el 2026-11-07** (las dos tandas), con los workflows de los dos
      repositorios en verde, **también el E2E** de la CI del frontend.
    - **Tercera crítica (2026-11-09, dual-agent):** media **27,8/40** (24 → 25,2 → 27,8): Login 29,
      Registro 28, Olvidé 31, **Restablecer 24** (antes 19), Confirmar 27, Reenviar 28. Ninguna por
      debajo de 24, pero **un P1**: la invitación caducada hablaba de «restablecer» y llevaba a
      «Recuperar contraseña» a quien nunca tuvo una. Detector: CLI limpio; en el navegador, solo el
      falso positivo de las devtools de TanStack y una palabra suelta en el aviso del login.
      Instantánea en `Stockly-F/.impeccable/critique/2026-11-09T15-07-22Z__src-modules-auth-components.md`.
    - **Hecho (tercera tanda, 2026-11-09; el propietario decidió «todo, también lo menor», y que el
      registro responda de forma neutra):**
      - *[P1] Invitación caducada:* «Pedir un enlace nuevo», con un texto que no habla de
        restablecer, y «Olvidé» llega sabiendo que viene de una invitación (`EstadoDeAcceso.invitacion`):
        título y pestaña «Elegir tu contraseña».
      - *Invitación con enlace bueno:* «Para {correo}» bajo el título, la pestaña dice «Elige tu
        contraseña», la etiqueta es «Contraseña» y hay «Volver al inicio de sesión» (también en
        Restablecer, que no tenía salida).
      - *El foco ya no cae en `<body>` al enviar:* `Button` con `isLoading` ya no se desactiva; se
        marca `aria-disabled` y el clic (y el envío implícito con Intro) no hace nada, el patrón de
        `ErrorDeCarga`. Vale para toda la aplicación. Y anillo de foco propio en los botones
        (`focus-visible:outline-accent`), que en el primario apenas se veía.
      - *Registro neutro* (decisión del propietario, en [CONTEXTO.md](CONTEXTO.md) §6): con un correo
        ya registrado, `POST /auth/register` responde el mismo 201, no crea ni cambia nada y manda
        «Ya tienes una cuenta» (`sendAccountExistsEmail`, en español e inglés); el hash se calcula
        antes de buscar. Fuera el 409 de Swagger. La pantalla siempre acaba en «Revisa tu correo».
      - *Confirmar anuncia el resultado:* foco al `h1` y la pestaña con su título, en «hecho» y en
        «error».
      - *Menores:* un solo «¿Olvidaste tu contraseña?» con el aviso de credenciales; sin subtítulo
        en futuro tras pedir un enlace y «Volver al inicio de sesión» como botón; la carga de las
        rutas de acceso en el sitio de la tarjeta y el `Spinner` con `border-t-accent`; la tarjeta
        arriba (`sm:pt-[16vh]`) y no centrada en vertical, para que el aviso no mueva el botón;
        `p-6` en el móvil; sin ejemplos en los campos de correo y nombre; vacía, «La contraseña es
        obligatoria»; `gap-2` en `EnlaceCaducado`; «Pide uno nuevo: llega en unos minutos»;
        `text-pretty` en los avisos; «Mostrar «Contraseña»» con el nombre de su campo; sin una alerta
        por campo al enviar vacío (`Input anunciarError={false}`; el foco ya va al primero);
        `autoFocus` solo con ratón en Registro y en Olvidé/Reenviar (`hayPunteroFino`); «Regístrate»
        e «Inicia sesión» con 44 px en táctil; un solo vocabulario, «confirmar» («Reenviar la
        confirmación», «Pedir un enlace nuevo»); y tras confirmar, a quién preguntar si la
        aprobación tarda.
      - *No se hizo:* el botón primario gris claro en el tema oscuro es del sistema de diseño, no de
        estas pantallas; el selector de idioma sin sesión es de `AUD-016`.
      - *Comprobado:* `pnpm verify` del frontend en verde (1065 tests y 1 omitido; los que fijaban
        `disabled` al cargar pasan a `aria-disabled`) y, en el backend, `check` y los 1836 tests.
    - **Para cerrarla:** repetir la crítica dual (sin P1, ninguna por debajo de 24).

- [ ] **AUD-015 · Reportes: tarjetas que no cuadran, gráficos sin alternativa y un informe por periodo que abre vacío**
  - **Área:** Diseño · **Severidad:** Bajo · **Esfuerzo:** Medio
  - **Origen:** crítica del 2026-11-07, bloque Reportes (25 y 28/40). Tres P1.
  - **Ubicación:** `Stockly-F/src/modules/reports/components/ReportsPage.tsx` (tarjetas,
    `:126-128`; gráficos, `:137-201`; meses, `:49`) e `InformePorPeriodoPage.tsx` (`:57`, `:171`).
  - **Qué hacer:**
    - Que las tres cifras de valor se puedan comparar: la exclusión de los productos sin coste
      dentro de cada tarjeta afectada, o el valor a precio de venta solo de los que tienen coste
      (el panel ya lo explica en una línea), y el aviso enlazado a `?aviso=sinCoste`.
    - Los tres gráficos con el patrón del informe por periodo: `aria-hidden` y una tabla
      equivalente.
    - El periodo en la URL; sin datos, ofrecer «Mes anterior» o «Este año» y desactivar exportar.
    - Los seis meses siempre en el eje; fuera la tarta de 9 categorías con 8 colores; ejes con
      token.
  - **Criterio de aceptación:** sin P1 en la crítica repetida del bloque; con el lector de
    pantalla del árbol de accesibilidad, ningún gráfico es una parada sin nombre.
  - **Dependencias:** conviene después de `AUD-009`, que puede cambiar qué importes ve cada rol en
    esta pantalla.

- [ ] **AUD-016 · Los roles no llegan al marco: navegación sin recortar, tema e idioma solo para ADMIN y acciones de Etiquetas que acaban en 403**
  - **Área:** Diseño · **Severidad:** Bajo · **Esfuerzo:** Medio
  - **Origen:** crítica del 2026-11-07 («Lo que se repite», 5). Tres P1 de dos bloques.
  - **Ubicación:**
    - `Stockly-F/src/App.tsx` (`NAVEGACION`, `visibleDeNav`): SELLER ve 16 destinos; los tres de
      WAREHOUSE empiezan a ~600 px en el menú móvil. `ocultoPara` (puesto en `AUD-008` para el
      panel de SELLER) admite un solo rol.
    - `SelectorDeTema` y `SelectorDeIdioma` solo se montan en `settings/components/SettingsPage.tsx`
      (`:266-267`), ruta de ADMIN.
    - `tags/components/TagsPage.tsx` (`:391`): «Nueva», «Editar» y «Eliminar» sin comprobar el
      permiso; la API es `SOLO_ADMIN`.
    - El rol no se ve en el perfil ni en el menú de usuario.
  - **Qué hacer:** que cada destino diga para qué roles existe (o derivarlo de `PERMISOS`) y
    ordenar lo del rol primero; la tarjeta «Apariencia» también en el Perfil; Etiquetas con
    `usePuede("POST /tags")`; una insignia de rol junto al nombre.
  - **Criterio de aceptación:** test de navegación por rol con la lista exacta de cada uno; un
    WAREHOUSE cambia el tema desde su perfil; un WAREHOUSE no ve acciones en Etiquetas.
  - **Dependencias:** ninguna.

- [ ] **AUD-017 · La bitácora y la campana no dicen lo que hace falta: sobre quién se actuó, filtros por usuario y fecha, y avisos sin orden de urgencia**
  - **Área:** Diseño · **Severidad:** Bajo · **Esfuerzo:** Medio
  - **Origen:** crítica del 2026-11-07, bloque Administración (Bitácora 23/40, marco 26/40). Un P1
    y dos P2.
  - **Ubicación:** `Stockly-F/src/modules/audit-logs/components/AuditLogsPage.tsx` (`:116-178`),
    `Stockly-F/src/modules/notifications/components/CampanaDeAvisos.tsx` (`:31-84`) y, para el
    nombre legible, la respuesta de `GET /audit-logs` en `Stockly-B`.
  - **Qué hacer:**
    - Bitácora: el nombre legible de la entidad (usuario, producto, número de venta) en vez de
      `Usuario #8652010f`, enlazado; filtros por usuario y por rango de fechas, en la URL;
      exportación por lotes (`enviarExportacion`); detalles como pares clave-valor traducidos, no
      JSON.
    - Campana: ordenar por gravedad (la aprobación pendiente salía la última de 11), un texto
      distinto para lo ya caducado, el almacén y el enlace a la orden concreta.
    - Usuarios y Bitácora: un estado de error con «Reintentar», que hoy se lee como lista vacía.
  - **Criterio de aceptación:** cada fila de la bitácora dice a quién o a qué afectó; filtrar por
    un usuario y un día devuelve solo sus filas (test del backend y de la pantalla); en la campana,
    lo que bloquea a alguien sale primero.
  - **Dependencias:** ninguna. Si añade campos a la respuesta, contrato regenerado en los dos
    repositorios.

- [ ] **AUD-018 · Accesibilidad que falta: filas desplegables sin teclado, pestañas sin rol, contraste del enlace verde y botones sin el nombre de su fila**
  - **Área:** Accesibilidad · **Severidad:** Bajo · **Esfuerzo:** Bajo
  - **Origen:** crítica del 2026-11-07, P2 de accesibilidad de varios bloques (árbol de
    accesibilidad, sin lector de pantalla real).
  - **Ubicación** (`Stockly-F/src/modules/`):
    - Filas desplegables como `div` con `onClick`, sin foco ni `aria-expanded`:
      `purchase-orders/components/PurchaseOrdersPage.tsx:637-640` y
      `sale-orders/components/SaleOrdersPage.tsx:608-611`. En Transferencias, el `aria-label` del
      desplegable tapa su contenido (`stock-transfers/components/TransfersPage.tsx:255`).
    - Pestañas sin `tablist`/`tab`/`aria-selected`: `products/components/StockMovementsPage.tsx:172-192`.
    - Nombre de cliente en `text-accent`, ~3,8:1 sobre blanco: `sale-orders/components/SaleOrdersPage.tsx:624`,
      `customers/components/CustomersPage.tsx:147`.
    - Botones de icono sin el nombre de la fila: `catalog/components/CatalogItemSection.tsx:181-191`,
      `suppliers/components/SuppliersPage.tsx:219-229`, compras (`:685, 696`), «Desactivar» de
      Usuarios; borrar línea sin nombre en el formulario de compra (`:473`).
    - Buscador de Productos sin etiqueta accesible (`products/components/ProductFilters.tsx:98-104`).
    - Escape no cierra el menú móvil (`Stockly-F/src/App.tsx`).
  - **Qué hacer:** `<button aria-expanded>` con chevron en las filas; el patrón de pestañas con
    flechas; `text-info` o un token fuerte para el enlace; `aria-label` con el nombre de la fila;
    `aria-label` en el buscador; Escape en el menú móvil devolviendo el foco al botón.
  - **Criterio de aceptación:** tests de accesibilidad de cada uno (rol, nombre, teclado) y
    contraste ≥ 4,5:1 medido en los dos temas.
  - **Dependencias:** ninguna.

- [ ] **AUD-019 · Pulido restante de la crítica del 2026-11-07 (P2 y P3 sin tarea propia)**
  - **Área:** Diseño · **Severidad:** Bajo · **Esfuerzo:** Medio
  - **Origen:** el resto de P2 y P3 del [informe](auditoria/2026-11-07-critica/INFORME.md), que
    no comparten causa con otra tarea. Hacer por bloques, repitiendo la crítica de cada uno.
  - **Qué hacer**, por pantalla:
    - **Panel:** «Mis ventas de hoy» visible en la tableta de SELLER (se resuelve con las dos
      columnas de `AUD-013`); `/expiry` dice los lotes, no solo las unidades.
    - **Catálogo:** la ficha que abre el escáner con «Registrar movimiento» y «Escanear otro»; el
      formulario de edición sin «Stock inicial»; filtros de Productos en la URL; spinner de borrado
      solo en su fila; notas de proveedor legibles.
    - **Órdenes:** importes en las sugerencias (subtotal, total por proveedor y en la confirmación);
      la ficha de cliente rotula «Subtotal» lo que lo es, y el número de venta enlaza a la venta;
      números de compra que se puedan dictar; emoji de contacto por Heroicons; filtros de Ventas
      plegados en móvil.
    - **Inventario:** vacíos que dicen el filtro; categorías ya en conteo marcadas en «Nuevo
      conteo»; «Quedan X» como «Tras la transferencia»; escáner en el formulario de transferencia;
      filtro «Solo caducado»; jerarquía de botones del conteo; conteo a ciegas que no enseña
      sobrante ni faltante mientras se cuenta.
    - **Administración:** la 404 dentro de la app sin `<main>` anidado ni «Dashboard»; zona horaria
      con búsqueda; logo que avisa de que se guarda al subirlo.
    - **Tipografía (detector):** `text-pretty` o espacios no separables donde quedan palabras
      sueltas a 390 px (`/sale-orders`, `/expiry`, `/settings`, `/profile`) y `text-balance` en los
      dos títulos de `/reports`.
  - **Criterio de aceptación:** cada bloque, con su crítica repetida, sin P2 de esta lista.
  - **Dependencias:** después de `AUD-011` a `AUD-018`, que cambian varias de estas pantallas.

## Tier 4 · Propuestas

Sin tareas abiertas.

---

## Una tarea nueva

Una ficha lleva **área, ubicación, qué hacer, criterio de aceptación, esfuerzo y dependencias**,
como las de arriba, y va en «Tareas abiertas». Si depende de una decisión de producto, la
ficha la nombra («Decisión previa») y la tarea no empieza hasta que esté tomada y anotada.

**Una ficha es una pista, no una descripción verificada.** Siete de las cerradas describían mal su
propio problema —la causa, el alcance o el remedio—; están marcadas en la columna «Nota» del
índice. Medir antes de arreglar, y medir otra vez después.

Para cerrarse, toda tarea cumple lo que ya cumplen las del Tier 5:

- **Migración solo hacia adelante** ([operaciones.md §6](operaciones.md)): columnas nuevas anulables o con valor por defecto.
- **Contrato regenerado y spec derivado**: una respuesta nueva se declara en `src/contratos/api.ts`, no a mano en el frontend.
- **Textos en español e inglés** y **errores con código estable**, nunca solo con `message`.
- **Permisos en la matriz `PERMISOS`**, no en una lista de roles junto a la ruta.
- **Auditoría:** una acción que cambia stock, costes o permisos añade su valor a `AuditAction` y deja rastro.
- **Estado con icono, no solo con color**, en las dos paletas.
- **Todo lo que mueve stock ocurre en una transacción** y con decremento condicional. Un flujo nuevo que toca inventario lleva **escenario E2E**.
- **`pnpm verify` en verde en los dos repositorios**, con los tests nuevos **falsificados**: se rompe a propósito lo que protegen y se comprueba que caen.

---

## Tareas cerradas

El índice. La ficha entera de cada una —con lo que se verificó y cómo— está en el
[histórico](historico/ROADMAP-2026-10-05.md), buscando por su identificador. Una tarea que se
cierre a partir de ahora añade aquí su fila; lo medido va en la nota y en el commit.

### Tier 0

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T0-01 | Resolver los alias `@/` en el JavaScript compilado | 2026-08-04 |  |
| T0-02 | Reparar la imagen Docker — cinco fallos independientes | 2026-08-04 |  |
| T0-03 | Reponer el stock al cancelar una orden de venta ya enviada | 2026-08-04 |  |
| T0-04 | Descontar el stock al cancelar una orden de compra ya recibida | 2026-08-04 |  |
| T0-05 | Tests de integración para las cancelaciones con efecto sobre el stock | 2026-08-04 |  |
| T0-06 | Eliminar la credencial personal versionada en el test E2E | 2026-08-04 |  |
| T0-07 | Revocar las sesiones activas al restablecer la contraseña | 2026-08-04 |  |
| T0-08 | Test de regresión de la revocación de sesiones tras reset | 2026-08-04 |  |

### Tier 1

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T1-01 | Guion de verificación local del backend | 2026-08-07 |  |
| T1-02 | Guion de verificación local del frontend | 2026-08-07 |  |
| T1-03 | Declarar `tagIds` en los esquemas de validación de producto | 2026-08-07 |  |
| T1-04 | Tests de asignación de etiquetas a productos | 2026-08-07 |  |
| T1-05 | Alinear el payload de `PATCH /settings` con el contrato del backend | 2026-08-07 |  |
| T1-06 | Corregir el tipo de `SettingEntry.value` en el frontend | 2026-08-07 |  |
| T1-07 | Añadir validación Zod al endpoint de configuración | 2026-08-07 |  |
| T1-08 | Eliminar el efecto de sincronización de `SettingsPage` | 2026-08-07 |  |
| T1-09 | Dejar `pnpm lint` en verde | 2026-08-07 |  |
| T1-10 | Corregir el `setState` en efecto de `App.tsx` y `ProductForm.tsx` | 2026-08-07 |  |
| T1-11 | Comprobar `isActive` en `requireAuth` | 2026-08-07 |  |
| T1-12 | Comprobar `isActive` también en el endpoint de refresh | 2026-08-07 |  |
| T1-13 | Centralizar `getActorEmail` y eliminar la consulta redundante | 2026-08-07 |  |
| T1-14 | Vincular los mensajes de error de formulario a sus campos | 2026-08-07 |  |
| T1-15 | Añadir los índices ausentes en la base de datos | 2026-08-07 |  |
| T1-16 | Sanear los parámetros de paginación para eliminar los 500 | 2026-08-07 |  |
| T1-17 | Reinicializar el formulario al editar una etiqueta | 2026-08-07 |  |
| T1-18 | Guardia de rol en las rutas de administración del frontend | 2026-08-07 |  |
| T1-19 | Sustituir la exención CSRF por prefijo por una lista explícita | 2026-08-07 |  |
| T1-20 | Exigir TLS en el transporte SMTP | 2026-08-07 |  |
| T1-21 | Ejecutar el contenedor con un usuario sin privilegios | 2026-08-07 | Verificada por ejecución el 2026-08-09 |
| T1-22 | Retirar la promoción automática a ADMIN del primer usuario | 2026-08-07 |  |
| T1-23 | Ampliar el smoke E2E a los flujos que estaban rotos | 2026-08-07 |  |
| T1-24 | Hacer reproducible la ejecución del E2E | 2026-08-07 |  |
| T1-25 | Corregir las rutas de API y el stack en los READMEs | 2026-08-07 |  |
| T1-26 | Resolver la contradicción sobre las variables de entorno obligatorias | 2026-08-07 |  |

### Tier 2

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T2-01 | Middleware 404 con respuesta JSON | 2026-08-09 |  |
| T2-02 | Bajar a SQL los agregados del resumen de reportes | 2026-08-09 |  |
| T2-03 | Paginar el listado de órdenes de compra en el backend | 2026-08-07 |  |
| T2-04 | Adaptar el frontend a la respuesta paginada de órdenes de compra | 2026-08-07 |  |
| T2-05 | Exportaciones por lotes y en streaming | 2026-08-09 |  |
| T2-06 | Reducir el chunk `vendor` del frontend | 2026-08-09 | Criterio cumplido a medias: `vendor` sigue por encima de 250 kB |
| T2-07 | No bloquear la respuesta HTTP con el envío de alertas | 2026-08-08 |  |
| T2-08 | Ajustar el lote de importación masiva al tamaño del pool | 2026-08-09 |  |
| T2-09 | Índice trigram para la búsqueda por nombre | 2026-08-09 |  |
| T2-10 | Logging estructurado con correlación de peticiones | 2026-08-08 |  |
| T2-11 | Enlace para saltar al contenido principal | 2026-08-08 |  |
| T2-12 | Respetar `prefers-reduced-motion` | 2026-08-09 |  |
| T2-13 | Nombres accesibles en la página de etiquetas | 2026-08-09 |  |
| T2-14 | Eliminar el anidamiento `<Link><Button>` de la tabla de productos | 2026-08-09 |  |
| T2-15 | Nombre accesible en las casillas de selección de fila | 2026-08-09 |  |
| T2-16 | Atributos ARIA y cierre con Escape en los menús de navegación | 2026-08-09 |  |
| T2-17 | Exponer el estado de los conmutadores de etiqueta del formulario de producto | 2026-08-07 |  |
| T2-18 | Gestión de foco y anuncio al cambiar de ruta | 2026-08-09 |  |
| T2-19 | Tests de las páginas de órdenes de venta y compra | 2026-08-09 |  |
| T2-20 | Tests de la página de gestión de usuarios | 2026-08-09 |  |
| T2-21 | Tests del dashboard y la página de reportes | 2026-08-09 |  |
| T2-22 | Umbrales de cobertura en ambos repositorios | 2026-08-09 |  |
| T2-23 | Cubrir las zonas de baja cobertura del backend | 2026-08-09 |  |
| T2-24 | Tests de contrato entre frontend y backend | 2026-08-09 |  |
| T2-25 | Healthcheck de aplicación y sonda de readiness | 2026-08-09 |  |
| T2-26 | Verificar la reproducibilidad del build de la imagen | 2026-08-09 |  |
| T2-27 | Externalizar las credenciales de PostgreSQL del compose | 2026-08-09 |  |
| T2-28 | Contenedorizar el frontend y añadirlo al compose | 2026-08-09 |  |
| T2-29 | Corregir el esquema `Product` de Swagger | 2026-08-07 |  |
| T2-30 | Documentar en Swagger los módulos ausentes | 2026-08-09 |  |
| T2-31 | Detección de reuso de refresh tokens | 2026-08-09 |  |
| T2-32 | Validar las imágenes por sus magic bytes | 2026-08-09 |  |
| T2-33 | Limitar el tamaño del cuerpo por ruta | 2026-08-09 |  |
| T2-34 | Descargar el CSV de movimientos vía axios y con codificación correcta | 2026-08-09 |  |
| T2-35 | Definir la capa de tokens semánticos en `@theme` | 2026-08-07 |  |
| T2-36 | Migrar `Button` y `Badge` a variantes semánticas | 2026-08-07 |  |
| T2-37 | Erradicar las utilidades de color crudas del resto de la interfaz | 2026-08-07 |  |
| T2-38 | Comunicar el estado con icono además de color | 2026-08-08 |  |
| T2-39 | Cifras tabulares en las columnas numéricas | 2026-08-08 |  |
| T2-40 | Densidad de tabla en escritorio y mínimo táctil en móvil | 2026-08-08 | Mínimo táctil, sí; la fila de 36 px, no: se quedó en 48 |
| T2-41 | Escala tipográfica explícita y recorte de pesos de Inter | 2026-08-08 |  |
| T2-42 | Permitir cancelar desde la interfaz una orden de venta ya enviada | 2026-08-08 |  |
| T2-43 | Índice por `createdAt` en `products` y revisión de `products_isActive_idx` | 2026-08-09 |  |
| T2-44 | Un único formato de importe en toda la interfaz | 2026-08-09 |  |
| T2-45 | Contener los scrollers horizontales para que no ensanchen el viewport en móvil | 2026-08-08 |  |
| T2-46 | Delimitar los ítems de los menús desplegables y separarlos entre sí | 2026-08-09 |  |
| T2-47 | La cabecera de la tabla de productos no debe partirse | 2026-08-09 |  |
| T2-48 | Volver al principio de la página al cambiar de ruta | 2026-08-09 |  |

### Tier 3

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T3-01 | Traducir los comentarios y el mensaje de error en inglés | 2026-08-10 |  |
| T3-02 | Convertir `User.role` y los campos de `AuditLog` a enums de Prisma | 2026-08-10 |  |
| T3-03 | Unificar el estilo de exportación del módulo de productos | 2026-08-10 | Ficha equivocada: eran cinco módulos, no uno |
| T3-04 | Simplificar el intercalado de enlaces de la navegación | 2026-08-10 |  |
| T3-05 | Unificar las cabeceras de exportación CSV entre repos | 2026-08-10 | Ficha equivocada: el botón nunca tuvo dos rutas |
| T3-06 | Decidir explícitamente sobre `.agents/skills/` en el control de versiones | 2026-08-10 |  |
| T3-07 | Limpiar los artefactos de build antes de compilar | 2026-08-04 | Resuelta como efecto de T0-01 |
| T3-08 | Marcar los iconos decorativos con `aria-hidden` | 2026-08-10 | Premisa falsa: Heroicons ya emitía `aria-hidden` |
| T3-09 | Evitar que el botón flotante tape la paginación en móvil | 2026-08-10 | Se quedaba corta: la paginación quedaba sin poder pulsarse |
| T3-10 | Añadir CHANGELOG y guía de contribución | 2026-08-10 |  |
| T3-11 | Registrar las decisiones de arquitectura como ADRs | 2026-08-10 |  |
| T3-12 | Declarar explícitamente que la aplicación no debe indexarse | 2026-08-10 |  |
| T3-13 | Asegurar `NODE_ENV=production` en entornos desplegados | 2026-08-10 |  |
| T3-14 | Unificar la escala de radios y sombras | 2026-08-10 |  |
| T3-15 | Documentar el sistema de diseño | 2026-08-10 |  |

### Tier 4

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T4-01 | Paquete compartido de contratos entre repositorios | 2026-08-10 | Se resolvió copiando el archivo, no con un paquete (ADR 0006) |
| T4-02 | Generar el OpenAPI desde los esquemas Zod | 2026-08-10 | Sin `zod-to-openapi`: lo hace Zod 4 |
| T4-03 | Modo oscuro | 2026-08-10 |  |
| T4-04 | Internacionalización | 2026-08-11 | Motor propio, sin `i18next` (ADR 0007) |
| T4-05 | Documentar la estrategia de backup y rollback | 2026-08-11 |  |
| T4-06 | Monitorización y alertas | 2026-08-11 |  |
| T4-07 | Auditoría de dependencias y licencias | 2026-08-11 |  |
| T4-08 | Pruebas de carga sobre los flujos de inventario | 2026-08-11 |  |
| T4-09 | Auditoría de navegador y de lector de pantalla | 2026-08-11 | Sin lector de pantalla: de ahí salió T4-17 |
| T4-10 | Navegación lateral en pantallas anchas | 2026-08-12 |  |
| T4-11 | Selector de tema en Configuración: claro, oscuro o automático | 2026-08-10 |  |
| T4-12 | Los correos siguen saliendo solo en español | 2026-08-12 |  |
| T4-13 | La versión de PostgreSQL no coincide entre el desarrollo y el compose | 2026-08-12 |  |
| T4-14 | El CLI de Prisma infla el árbol de producción | 2026-08-12 | La causa era otra: un *peer* opcional de `@prisma/client` |
| T4-15 | `GET /products/:id/movements` devuelve el histórico entero | 2026-08-12 | El alcance era mayor: la exportación tampoco iba por lotes |
| T4-16 | El dashboard a escala: `work_mem` y la consulta de rotación | 2026-08-12 | El remedio era otro: reescribir la consulta, no `work_mem` |
| T4-17 | Recorrido real con lector de pantalla | 2026-08-12 | **Descartada, no hecha** |

### Tier 5

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T5-01 | Coste del producto y coste medio ponderado | 2026-09-13 |  |
| T5-02 | Valor del inventario a coste y margen en los informes | 2026-09-13 |  |
| T5-03 | Stock comprometido y stock disponible | 2026-09-13 |  |
| T5-04 | Recepción parcial de órdenes de compra | 2026-09-13 |  |
| T5-05 | Plazo de entrega del proveedor y sugerencias de reposición | 2026-09-28 |  |
| T5-06 | Clientes como entidad | 2026-09-30 |  |
| T5-07 | Conteo físico de inventario | 2026-09-29 |  |
| T5-08 | Código de barras: búsqueda, escaneo y etiquetas | 2026-09-29 |  |
| T5-09 | Informes de ventas y compras por periodo | 2026-09-28 | Criterio del `EXPLAIN` relajado a «un mes» |
| T5-10 | Clasificación ABC de productos | 2026-09-29 |  |
| T5-11 | Resumen periódico por correo | 2026-10-01 |  |
| T5-12 | Notificaciones dentro de la aplicación | 2026-10-01 |  |
| T5-13 | Rol de almacén | 2026-09-29 |  |
| T5-14 | Varios almacenes | 2026-10-10 | **El caso de uso, que la ficha exigía escrito:** varias sucursales que venden y reciben cada una lo suyo y se pasan mercancía (decidido el 2026-10-10, con otras tres cosas: se hará `T5-15`, el mínimo sigue siendo del producto y no del almacén, y cada operación elige almacén con uno predeterminado). **La decisión previa, medida antes de tocar el esquema:** `products.stock` se conserva como total. Sobre 100 000 productos en tres almacenes, derivarlo de los niveles multiplica por 5–8 las cuatro consultas del panel que leen el catálogo entero y las manda a disco; conservarlo cuesta 0,2 ms más por movimiento ([ADR 0010](adr/0010-stock-total-desnormalizado.md)). El riesgo de que diverja se cierra por dos lados: **un solo sitio lo escribe** (`shared/lib/stock.ts`) y **la base no confirma un descuadre** —un disparador de restricción diferido comprueba al `COMMIT` que el total es la suma—. **Lo que hay:** `Warehouse`, `StockLevel` (dispersa: sin fila es cero) y `StockTransfer`; cada movimiento, venta, compra y conteo lleva su almacén; `stockAfter` sigue siendo el total y `warehouseStockAfter` lo que quedó en el almacén. Una transferencia son dos movimientos `TRANSFER` enlazados por `transferId`, en una transacción y sin «en tránsito». Lo disponible y lo comprometido son **del almacén de la venta**; el mínimo, su aviso, la reposición y el coste medio, del producto entero. **Quien no dice almacén opera sobre el predeterminado**, así que la API de antes vale tal cual. Rutas nuevas bajo `/warehouses` y `/stock-transfers`; dos pantallas, **Almacenes** y **Transferencias**, y el almacén en cada formulario que mueve stock. **Con un solo almacén activo la interfaz no pinta nada de esto.** **El criterio, comprobado:** una transferencia de 10 no cambia el total y deja dos movimientos enlazados (test y E2E); la migración pone todo el stock en un almacén y el total no cambia —14 940 100 = 14 940 100 sobre la base de carga, 975 = 975 sobre la de desarrollo, y un test ejecuta la sentencia del propio archivo—; y la prueba de carga, **antes y después en la misma máquina**: la escritura sube un 21 % de media (339 → 410 ms) bajo la mezcla saturada y nada medible sin saturar, que es lo que el ADR acepta. Falsificado: 135 roturas —77 en el backend y 58 en el frontend—. En el backend, 73 caídas a la primera; dos pasaban por tests flojos —nada miraba que una venta enviada dejara de estar comprometida, y una sola ronda de cambios simultáneos de predeterminado dejaba pasar la carrera una vez de cada dos— y se reforzaron; las otras dos son equivalentes. En el frontend, 57 a la primera; la que pasaba —un local recordado que ya no existe se seguía enviando en la venta, aunque el desplegable enseñara otro— se cubrió con un test. E2E en los dos proyectos: el almacén transfiere por la interfaz, se comprueban por la API el total, los niveles y los dos movimientos, lo transferido se vende en el mostrador desde la sucursal, y un almacén con existencias no se deja desactivar. **Cuatro cosas que salieron al hacerlo y no estaban en la ficha:** (1) cambiar el predeterminado dos veces a la vez dejaba dos —una sola sentencia no bastaba; lo cazó su test y ahora van en fila—; (2) `GET /warehouses` traía las cifras de cada almacén y la pedía cada formulario: 200 ms de agregado para pintar un selector; las cifras tienen ya su ruta; (3) el `Modal` recolocaba el foco cada vez que su padre se repintaba —un defecto anterior, que la lista de almacenes hizo visible—; (4) **la prueba de carga incumple cuatro de sus cinco umbrales con el código de antes**: no se había repetido desde agosto y el panel pasó de 337 ms a 2,2 s de p(95) (abajo, «Sin tarea»). **Sin comprobar:** las pantallas nuevas con un móvil de verdad; y `T4-17` sigue sin hacerse, así que tampoco con lector de pantalla. **A saber:** la migración **no es expansiva** —el código anterior no funciona contra la base migrada, y revertir es restaurar la copia—, reescribe `stock_movements` (77 s con 1,2 M de filas) y se aplica con la aplicación parada ([operaciones.md §6](operaciones.md)); no hay informe de ventas por sucursal —el listado y la exportación sí filtran y nombran el almacén—; el almacén de una orden no se cambia después de crearla; la importación por CSV entra siempre en el predeterminado; un usuario no tiene almacén asignado: el mostrador recuerda el suyo por dispositivo; y desactivar un almacén no bloquea contra una orden que se esté creando en ese mismo instante. |
| T5-15 | Lotes y fechas de caducidad | 2026-10-10 | **El caso de uso, que la ficha exigía escrito:** un comercio de catálogo mixto —parte perecedero, parte no—, donde se marca producto a producto, al darlo de alta, cuál lleva lote (decidido el 2026-10-10, con otras tres cosas: llevan lotes los productos que se marquen; al recibir, la fecha de caducidad es obligatoria y el código, opcional; y al vender elige siempre Stockly, por orden de caducidad). **Lo que hay:** el nivel de stock se abre por lote —`stock_levels` pasa a `(producto, almacén, lote)`, como dejó previsto el ADR 0010—, con `Lot` y `SaleOrderItemLot` ([ADR 0011](adr/0011-lotes-como-dimension-del-nivel.md)). «Sin lote» es una fila más: ahí está todo lo de un producto que no los lleva y lo que uno que sí tenía antes de marcarse, así que **marcar o desmarcar no mueve nada**; `tracksLots` gobierna solo si las entradas piden lote. **De qué lote sale cada unidad lo decide `shared/lib/stock.ts`, en una sentencia**: primero lo que no tiene lote, después por caducidad y a igual fecha por código. «Caducado» no es un estado sino una fecha comparada con hoy **en la zona del negocio**; lo caducado sigue en el stock hasta que se da de baja, pero no en el disponible. Cada línea de venta anota de qué lotes salió: lo imprime el comprobante y es lo que deja devolver cada unidad al suyo al cancelar. Cancelar una compra retira lo recibido del lote en el que entró. Dar de baja lo caducado es un `ADJUSTMENT` a cero de ese lote —tirar no es vender—, sin ruta propia. Una pantalla nueva, **Caducidades**; el lote en la recepción, en el movimiento a mano y en el alta del producto; el desglose por lote en la ficha; y el aviso `LOT_EXPIRING` en la campana, con el plazo del ajuste `expiryWarningDays`. **Un producto sin lotes no ve nada de esto.** **El criterio, comprobado:** enviar una venta consume primero el lote que caduca antes, aunque se recibiera después (test y E2E); un lote caducado no se asigna a una venta —ni al crearla, ni al enviarla si caducó entretanto, ni en el mostrador, ni en una transferencia— y el que caduca hoy todavía se vende; y el informe lista lo que vence en los próximos N días, y lo ya caducado, con su valor a coste, con los totales de todo el filtro y no de la página. **Lo medido** ([rendimiento.md §16](rendimiento.md)): por movimiento, una entrada pasa de 1,21 a 1,30 ms y una salida de 1,23 a 1,37 ms en un producto sin lotes; una salida que reparte entre lotes, 2,17 ms. **Lo que salió al medir:** la primera versión repartía en toda salida y costaba 1,70 ms —un 38 % más— también para quien no lleva lotes; lo quitó un camino corto. La migración, 2,6 s sobre 297 665 niveles; **no es expansiva** —cambia el índice único que la versión anterior usa en su `ON CONFLICT`— y se aplica con la aplicación parada. Falsificado: 174 roturas —100 en el backend y 74 en el frontend—. En el backend, 93 caídas a la primera, 6 tras reforzar los tests (el camino corto no sumaba los lotes al saldo del almacén; el lote de otro producto en una salida daba «sin stock» y no 404; el lote que caduca hoy, en la ficha y en el resumen del informe; una transferencia con lo caducado y lo comprometido a la vez; y las líneas de una transferencia, que dependían del orden en que la base devolviera sus movimientos y se sacaron a una función que se prueba en los dos órdenes) y 1 equivalente (el filtro `stock > 0` del aviso: un lote agotado no deja fila). En el frontend, 72 a la primera y 2 tras reforzar (pedir los lotes de un producto que no los lleva; el color de lo ya caducado). `pnpm verify` en verde en los dos: 1652 tests y 97.15 % en el backend, 910 y 80.93 % en el frontend; E2E, 39 pasados y 3 omitidos, dos pasadas. Pantallas vistas a 393 y 1280 px: Caducidades y su confirmación, la ficha con sus lotes, el movimiento a mano (entrada y salida), el alta de producto, la recepción y la campana —esta, antes de corregirle el texto: después solo la cubre su test—; **cuatro cosas se corrigieron al verlas** —el rótulo de la fecha, de otro tamaño que el de al lado; el lote, cortado en móvil al recibir; el aviso, que decía «está por caducar» de un lote ya vencido; y la nota del histórico, partida en seis líneas—. **Sin comprobar:** el detalle de la venta con sus lotes y el comprobante en PDF solo tienen test, no se miraron; el inglés, solo por test; nada con un móvil real ni con lector de pantalla; y la carga sostenida con k6 no se repitió (§15: ya no cumple por el panel). |

### Tier 6

*Sale de comparar Stockly, el 2026-10-05, con SistemaVenta (`xfiberex/SistemaVenta_ASP.NET_CORE_MVC`),
un punto de venta en ASP.NET Core MVC. **No es una fusión**: los dos llevan inventario y el de
Stockly ya cubre el del otro, así que solo se trae lo que aquel hace y este no. SistemaVenta es la
especificación, no el código —allí los totales los calcula el navegador y el servidor los guarda
como llegan, y el menú por rol solo oculta enlaces—: aquí se reescribe con las reglas de «Una tarea
nueva».*

**Decidido el 2026-10-05, antes de escribir las fichas:**

- **El comprobante es interno, por ahora.** No tiene valor fiscal y lo dice. Es temporal: si un día
  lo tiene, el número fiscal será **otro campo**, con su propia serie y emitido al enviar; el
  correlativo de `T6-04` no se reutiliza para eso. Hasta entonces, la palabra «factura» no aparece
  ni en la interfaz ni en el PDF.
- **Una tasa de impuesto global, guardada en cada línea** de la orden: si después hay productos
  exentos, solo cambia de dónde sale el valor.
- **Un rol nuevo de vendedor** para el mostrador, como se hizo con `WAREHOUSE` en `T5-13`.

**Lo que se dejó fuera, a propósito:** la exportación a `.xlsx` —el CSV ya abre en Excel, y sería
una dependencia más que auditar—; la foto de usuario —manda una cara a Cloudinary, que hoy solo
recibe imágenes de producto ([legal.md §2.1](legal.md))—; las tablas de roles y menús —la matriz
`PERMISOS` es más fuerte—; el tipo de documento «Boleta / Factura» —sin valor fiscal es solo una
etiqueta—; el estado activo de las categorías y la casilla «Mantener sesión».

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| T6-01 | La pantalla de ventas solo enseñaba las diez órdenes más recientes | 2026-10-05 | Índice nuevo por `createdAt`, decidido midiendo: sobre 330 000 órdenes el listado sin filtro pasa de 33 ms a 0,01 ms ([rendimiento.md §13](rendimiento.md)). El criterio de aceptación, comprobado en tests de los dos repositorios —falsificados: diez roturas, diez caídas— y en navegador con 26 órdenes, en escritorio y móvil. **La ficha se quedaba corta en una cosa:** el filtro nuevo metió un «Cancelado» oculto en la página y rompió un selector del E2E de `T0-03`, que ahora mira la insignia de su orden |
| T6-02 | El formulario de venta solo dejaba elegir los cien productos más recientes | 2026-10-06 | El desplegable se sustituye por `BuscadorDeProducto`, que consulta `GET /products?search=&isActive=true&limit=8` mientras se escribe, y un botón de escáner en los dos formularios; **el backend no se tocó**. El defecto, medido contra el servidor con 197 productos activos: `?limit=200&isActive=true` devuelve 100 y **no** trae el más antiguo; el buscador lo encuentra por su nombre, se vende y su stock baja de 10 a 7, en escritorio y a 393 px. El resto del criterio, en el escenario E2E nuevo (27 pasados en los dos proyectos) y en 14 tests de componente, falsificados: catorce roturas, catorce caídas. **La ficha no decía tres cosas:** que repetir un código suma una unidad a su línea en vez de abrir otra —decidido al hacerlo—; que la lista, dentro de un diálogo con scroll propio, quedaba cortada en la última línea con una sola opción a la vista —visto en una captura, no en un test: ahora se desplaza a la vista—; y que volver a «Escribir manualmente» no soltaba el `productId` del producto elegido antes —leído en el código, no reproducido—. Al cerrar, las dos puertas estaban en rojo por avisos ajenos (`proxy-addr`, `source-map-js`): [dependencias.md §2](dependencias.md) |
| T6-03 | Datos del negocio y moneda configurable | 2026-10-07 | **Decisión previa, tomada el 2026-10-07:** símbolo libre de 1 a 5 caracteres y formato numérico fijo, como recomendaba la ficha. Seis ajustes nuevos, `GET /settings/business` para cualquier rol y `PUT`/`DELETE /settings/logo`; sin migración. El formato pasa a ser uno solo, `escribirImporte`, en el contrato. El criterio, de punta a punta en `moneda.test.ts` —el ajuste en la base, la petición y lo que PDFKit escribe—: con `RD$`, los dos PDF de informes, las etiquetas y el resumen semanal no dejan ni un `$` suelto; un `USER` lee la moneda y recibe 403 en `GET /settings`; sin nada guardado todo sale como antes. En el frontend, el símbolo se espera en `ProtectedRoute`: el primer importe de una pantalla ya sale con la moneda buena (`monedaDelNegocio.test.tsx`). En navegador, a 1280 px, Reportes entero en `RD$`, ejes incluidos; y un logo de 800×400 subido de verdad a Cloudinary volvió como PNG de 600×300. **La ficha no decía cuatro cosas:** que «libre» tiene un límite que pone el PDF —la Helvetica de PDFKit dibuja `₡ ₲ ₱ ₹ ₩ ₺ ₽` con ancho 0, medido—, así que el validador solo admite lo que se imprime y un test mide cada carácter contra la fuente; que los dos formateadores no coincidían —un negativo salía `$-1,234.50` en el PDF y `-$1,234.50` en pantalla—; que la URL del logo no puede ser un ajuste del catálogo, porque `T6-07` la va a pedir desde el servidor y un `PATCH` la apuntaría a cualquier sitio; y que convertir el logo a PNG al subirlo le quita a `T6-07` la mitad de su «Atención». Y una quinta, que salió al repasar lo que quedaba sin comprobar: **multer respondía 500** a una imagen de más de 2 MB, a un tipo no admitido y a un archivo en otro campo, también en productos; ahora son 413 `IMAGE_TOO_LARGE`, 422 y 400, con código. Tests falsificados en total: 63 roturas, 63 caídas. Escenario E2E nuevo, en los dos proyectos (29 pasados, 1 omitido): la tarjeta cabe a 393 px, el nombre se guarda y lo lee el almacén, y con `RD$` Reportes no deja un `$`. **En ese escenario la moneda no se guarda de verdad:** se cambia lo que la página recibe de `GET /settings/business`, porque el símbolo es de toda la instalación y los escenarios de al lado comprueban importes en `$`; la mitad del servidor la prueba `moneda.test.ts`. El logo quitado desapareció de la cuenta (404 por la API de administración); la CDN lo siguió sirviendo unos minutos |
| T6-04 | Número correlativo de venta | 2026-10-07 | Cada venta lleva `number`, un entero consecutivo que se enseña con seis cifras (`#000123`): en la lista, la ficha del cliente, la nota de los movimientos, el aviso de venta sin stock, el resumen semanal y la exportación (columna `orderNumber`, además de `orderId`). Sale de **una fila de `counters`** —tabla nueva, por clave, para que un número fiscal sea otra fila— que se incrementa con un `INSERT … ON CONFLICT DO UPDATE` dentro de la transacción que crea la orden (`siguienteNumeroDeVenta`); no es una secuencia. Si la fila falta —la base de tests, que se levanta sin migraciones— arranca en la última orden. `GET /sale-orders?number=` busca exacto (`123` y `000123` son la misma) y responde 400 a lo que no son dígitos; la pantalla lo pide al dejar de teclear y acepta el número pegado con su `#`. La migración numera por `createdAt` e `id` y deja el contador en la última; las notas y los avisos ya escritos no se tocan, y un aviso sin `orderNumber` se sigue leyendo por el principio de su id. **El criterio, comprobado:** veinte ventas a la vez, veinte números consecutivos —también cuando compiten por crear el contador—; un 409 no gasta número, y tampoco uno tomado en una transacción que se deshace después; la migración, ejecutando su propio SQL en un test y sobre la base de desarrollo real (16 órdenes: 1 a 16 en orden de fecha, contador en 16); buscar `12` trae solo la `#000012`. Falsificado: 29 roturas, 29 caídas —entre ellas tomar el número fuera de la transacción y el «leer el último y sumar uno» de SistemaVenta—. E2E: la venta se busca por su número en los dos proyectos, y el seed numera sus órdenes por fecha. Vista la pantalla a 1280 y a 393 px. **Sin comprobar:** el resumen semanal y la exportación solo en tests, no abriendo el correo ni el CSV en Excel —que quitará los ceros de `orderNumber` al leerlo como número—. **A saber:** las ventas se crean de una en una mientras dura la transacción de cada una; es el precio de una serie sin huecos por rechazo. |
| T6-05 | Impuesto en la venta | 2026-10-07 | Dos ajustes nuevos en los datos del negocio: `taxRate` —de 0 a 100, dos decimales como mucho, **0 por defecto**— y `taxName`, que viaja en `GET /settings/business`. Al crear la orden la tasa se congela en cada línea (`sale_order_items.taxRate`, anulable: las líneas anteriores se quedan en `NULL`, que se lee «sin impuesto»). `subtotal`, `tax` y `total` —de la orden y de cada línea— **no se guardan**: los calcula `conTotales` al responder, con `Decimal`, y la interfaz deja de sumar. **El redondeo, decidido una vez** (`totalesDeLinea`): por línea, a dos decimales, medio céntimo hacia arriba; el impuesto de la orden es la suma del de sus líneas. `unitPrice` sigue sin impuesto, así que informes, ficha del cliente —que enseña el subtotal— y resumen semanal siguen en neto sin tocarlos. La exportación conserva `totalLine` sin impuesto y añade `taxRate`, `taxLine` y `totalLineWithTax`. **El criterio, comprobado:** 3 × 100,00 al 18 % da 300,00 / 54,00 / 354,00; el margen de `/reports` es idéntico con la tasa a 0 y al 18 %; subir al 20 % no altera la orden; totales o tasa enviados en el cuerpo se descartan; con la tasa a 0 el pie de la venta es el de siempre. Falsificado: 32 roturas, 31 caídas; la que pasa —leer la tasa del cuerpo— es equivalente, porque el validador ya la descarta antes. Un test se reforzó al falsificar: el de coma flotante no distinguía `number` de `Decimal`. E2E, solo en `chromium` porque la tasa es global: la venta nace al 18 %, la tasa pasa por el 20 % y vuelve a 0, y la pantalla sigue diciendo «ITBIS (18 %)». Vista la venta y el ajuste a 1280 y a 393 px. **Sin comprobar:** el CSV abierto en Excel. **A saber:** en el móvil el pie de importes queda dentro del desplazamiento horizontal de la tabla de líneas, como ya quedaba el total; el nombre del impuesto no se congela con la orden —si se renombra, las ventas antiguas enseñan el nombre nuevo con su tasa de entonces—; y el formulario de nueva venta no enseña el impuesto antes de guardar, porque calcularlo ahí sería volver a sumar en el navegador: lo necesitará el mostrador de `T6-08`. |
| T6-06 | Vendedor y documento del cliente en la venta | 2026-10-08 | Tres columnas nuevas, anulables: `customers.document`, `sale_orders.customerDocument` y `sale_orders.createdByEmail`. **Quién la registró** lo pone el servidor con el correo de la sesión, como texto; no viene en la petición y el `PATCH` no lo toca: quien edita, envía o cancela no pasa a ser quien vendió. **El documento** es texto libre de hasta 40 caracteres, sin caracteres de control —acaba en el comprobante de `T6-07`—; la venta copia el del cliente elegido si no trae uno propio, y el cliente que una venta crea por su correo nace con él. No es único y **no vincula**: una venta con documento y sin correo no va a ningún cliente. `GET /customers?search=` lo busca también. La exportación de ventas añade `customerDocument` y `createdByEmail`. **La migración** recupera el vendedor de la fila `CREATE` de `audit_logs` —la más antigua con correo— y avisa con un `RAISE NOTICE` de cuántas órdenes se quedan sin él. Sobre la base de desarrollo: 9 órdenes, 3 recuperadas —las creadas por la API, las tres coinciden con la auditoría— y 6 sin vendedor, que son las del seed; el seed ya las siembra con vendedor. **El criterio, comprobado:** la orden sigue diciendo quién la registró con la cuenta desactivada y también borrada; elegir un cliente copia su documento, editarlo después no cambia la orden y borrarlo deja el documento en la instantánea; `legal.md §2.1` recoge los dos datos. Falsificado: 32 roturas, 31 caídas; la que pasa —tomar el vendedor del cuerpo— es equivalente, porque el validador descarta el campo antes. Un test se reforzó al falsificar: el de la migración no distinguía una fila de auditoría sin correo. E2E, en los dos proyectos, dentro del escenario de `T5-06`: el documento escrito en una venta crea el cliente con él, la siguiente lo trae al elegirlo, el detalle dice «Registrada por» y la lista de clientes lo encuentra por su documento. Vistas la venta, su formulario y el del cliente a 1280 y a 393 px. **Sin comprobar:** el aviso de la migración solo se ve en el registro de PostgreSQL —`prisma migrate deploy` no lo enseña—; el recuento de arriba se sacó con una consulta. **A saber:** el correo de quien vendió lo lee todo el que lee ventas, `USER` incluido, que es lo que pedía la ficha; borrar un cliente no borra su documento de sus órdenes, y `legal.md` dice cómo se atiende una petición de supresión; y el E2E falló dos veces de cuatro al relanzarlo sin pausa tras otra pasada —esperas agotadas y un `ECONNRESET` en escenarios que no tocan ventas— y pasó limpio las dos veces que se esperó unos segundos: [CONTEXTO.md §4](CONTEXTO.md). |
| T6-07 | Comprobante de venta en PDF | 2026-10-08 | `GET /sale-orders/:id/receipt`, para los tres roles: un PDF en A4 y en español con el logo y los datos del negocio, el número, la fecha del envío en la zona del negocio, el cliente con su documento, quién la registró, las líneas y subtotal, impuesto y total. Se titula «Comprobante de venta» y lleva «Documento sin valor fiscal» en la cabecera y en el pie de cada página. **No calcula nada:** pinta los importes de `conTotales`, los mismos de la pantalla; sin impuesto, el pie es solo el total. **Qué órdenes lo tienen** lo dice `tieneComprobante`, en el contrato, para los dos lados: las enviadas, y las canceladas después de enviarse —`shippedAt` sobrevive a la cancelación—, que salen marcadas «ANULADA» en la cabecera y en el pie. Una pendiente o una cancelada sin enviar responde 409 `SALE_ORDER_NOT_SHIPPED`, y la interfaz no les pone el botón. `shippedAt` entra en el contrato de la orden: la API ya lo mandaba. **El logo** lo trae `traerLogoDelNegocio`, la única petición que el servidor hace a una URL guardada: tope de 3 s, solo `https://res.cloudinary.com`, sin redirecciones, 2 MB como mucho y solo PNG o JPEG por su firma; pase lo que pase devuelve `null` y el papel sale sin logo. **Lo que no hay no deja hueco:** sin datos del negocio no hay bloque del negocio, y sin cliente ni vendedor no hay bloque del cliente. La descripción de una línea no se recorta: la fila crece. En la interfaz, `BotonDeComprobante` —por `descargarDeLaApi`, no un enlace—: en el detalle de la venta y, como icono, en cada fila del historial del cliente. La paleta y el recorte de texto de los PDF pasan a `shared/lib/pdf.ts`; `conTotales` deja de perder el tipo de la línea. **El criterio, comprobado:** dos líneas al 18 % llevan número, datos del negocio, las dos líneas y `RD$2,968.00` / `ITBIS (18 %)` `RD$534.24` / `RD$3,502.24`; un `USER` y un `WAREHOUSE` lo descargan; la pendiente responde 409; con Cloudinary caído —y con otros siete fallos suyos— sale sin logo; sin datos del negocio sale sin líneas vacías. Falsificado: 54 roturas, 53 caídas a la primera; la que pasó —no mirar la firma de la imagen— tenía una segunda red en PDFKit y se le añadió un test propio: 54 de 54. E2E en los dos proyectos: la pendiente no lo ofrece y la API responde 409; enviada por la interfaz, se descarga y el texto del PDF —leído con pdf.js— lleva número, cliente, documento, vendedor, líneas y el total de la API; se descarga también desde la ficha del cliente; cancelada, dice «ANULADA». Y el de `T6-05` comprueba en el papel `Subtotal 300.00 · ITBIS (18 %) 54.00 · Total 354.00`. Vistos cuatro PDF de muestra —completo, anulado, mínimo y de tres páginas— y las dos pantallas a 1280 y a 393 px; en la ficha del cliente el botón iba el último y a 393 px quedaba fuera de la pantalla: va el segundo. **Sin comprobar:** el logo contra Cloudinary de verdad —los tests simulan `fetch`, y en este equipo no hay credenciales—; y el papel impreso. **A saber:** las notas de la orden no salen, que son internas. Lo que no está en Latin-1 **no se imprime**: la Helvetica de PDFKit mide «株式会社» con ancho cero y pierde la `Ł` de «Łódź», sin error; ya les pasaba a los nombres de producto en los informes, y arreglarlo es incrustar una fuente. La palabra vetada no está en el PDF ni en los textos de la interfaz, con test en los dos lados; «facturación», la de la clasificación ABC, es otra palabra y se queda. **Dos defectos encontrados al pasar el E2E, ninguno del comprobante:** una lista que se está cargando por primera vez cuando termina una mutación no se vuelve a pedir, y se queda con lo que leyó antes —reproducido: enviar una venta dentro de los 300 ms del filtro por número la deja en «Pendiente» con el aviso de éxito—; es de todos los módulos y **no se ha arreglado**. Y el `ECONNRESET` intermitente del E2E era la reutilización de conexiones que Node cierra a los 6 s: arreglado en `e2e/helpers.ts`. Los dos, en [CONTEXTO.md §4](CONTEXTO.md). |
| T6-08 | Venta de mostrador y rol de vendedor | 2026-10-08 | **La matriz, primero, y es la propuesta de la ficha:** `SELLER` entra en `TODOS` —lee lo que lee `USER`— y en un grupo nuevo, `MOSTRADOR`, con `ADMIN`, para una sola ruta. Un test lo fija: lo único que tiene y un `USER` no es `POST /sale-orders/counter`. **La venta de un paso:** `POST /sale-orders/counter` crea la orden y la deja enviada en **una transacción**. Cada línea es un producto y una cantidad; **el nombre y el precio los pone el producto**, leídos con su fila ya bloqueada, y el validador ni siquiera declara `unitPrice`. No hay líneas escritas a mano ni productos descatalogados (409 `INACTIVE_PRODUCT_SALE`). **El servicio, partido en sus dos mitades:** `reservarDisponible` —bloquear y comprobar lo disponible— la comparten `create` y el mostrador; `despachar` —descontar, congelar el coste, escribir el movimiento y marcar enviada— la comparten el envío y el mostrador. Se extrajo, no se copió: `update` se queda sin sesenta líneas. El movimiento dice «Venta de mostrador #000123»; la auditoría, `SALE_COUNTER`; el aviso de stock bajo sale después del `commit`. Migración: un valor en `Role` y otro en `AuditAction`. **La pantalla:** `/counter`, la segunda del menú para quien puede vender, guardada **por permiso** (`requirePermiso`, nuevo en `ProtectedRoute`). Una columna, sin tabla: buscar o escanear, un producto por línea con su − y su +, el disponible, un cliente opcional y lo que se va a cobrar; después, el número, el importe que devolvió la venta y el comprobante. **Una decisión de T6-05 se revierte a sabiendas:** `GET /settings/business` trae ahora `taxRate`, la tasa vigente. Sin ella el mostrador no podía decir cuánto cobrar **antes** de registrar la venta. La previsión la hace `totalesPrevistos`, en el contrato y en céntimos enteros; un test la compara con `totalesDeLinea` sobre 528 combinaciones de precio, cantidad y tasa. Lo que la pantalla enseña después de vender es lo del servidor. **El criterio, comprobado:** un `SELLER` vende dos productos y el stock baja, hay dos `OUT`, la orden está enviada con `unitCost` a cuatro decimales y el comprobante se descarga; 403 al crear una pendiente, al cancelar y al cambiar un precio, y la interfaz no le pone ninguno de los tres botones; un `unitPrice` de 0,01 en el cuerpo no cambia la línea; pedir de más es 409 y no queda ni orden, ni movimientos, ni cliente, ni número gastado; dos ventas a la vez de la última unidad dan 201 y 409 —y diez de un producto con cuatro, cuatro y seis, con los números del 1 al 4—. `permisos.test.ts` recorre el rol solo. Falsificado: 62 roturas, 59 caídas a la primera; dos pasaban por tests míos flojos —la cantidad a 0 se rechazaba por otro campo, y nada miraba que la ruta llevara su guardia— y se corrigieron; la tercera es equivalente: `checkLowStockAlert` vuelve a mirar el mínimo. E2E en los dos proyectos, con la cuenta nueva del seed (`vendedor@stockly.app`): busca dos productos, se pasa de lo disponible y corrige, registra, descarga el comprobante y lee en él las dos líneas; stock y movimientos, por la API; los tres 403, y el 409 sin mover nada; ni «Nueva orden», ni cancelar, ni editar el producto; `/settings` lo devuelve al panel, y el almacén no entra en `/counter`. Vista a 393 y a 1280 px. **Sin comprobar:** el escáner con cámara en el mostrador —el E2E busca por nombre; el escáner lo prueban los tests de componente con el lector simulado—, y el uso con un móvil de verdad en la mano. **A saber:** el mostrador no admite un cliente nuevo ni un documento escrito en el momento, solo elegir uno que ya exista —la API sí los admite—; no hay descuentos ni forma de pago, que no pedía la ficha; el disponible de una línea es el de cuando se añadió el producto, y si otro vende entretanto se entera al registrar, con el 409; y la previsión usa la tasa que el navegador leyó al entrar: si un administrador la cambia con el mostrador abierto, lo previsto y lo cobrado difieren hasta recargar. |
| T6-09 | Ventas por día y productos más vendidos en el panel | 2026-10-10 | `GET /reports` trae dos campos nuevos: `salesByDay` —hoy y los seis días anteriores del negocio, **siempre siete**, con los vacíos a cero— y `topSold`, los cinco más vendidos por unidades. «Lo más vendido» es una sola consulta (`shared/lib/ventasEnviadas.ts`) que comparten el panel y el resumen semanal. El criterio, en 11 tests del backend y 4 del panel, falsificados: trece roturas, trece caídas; y en el navegador, en escritorio y a 393 px. El `EXPLAIN` de las dos consultas sobre 330 000 órdenes, en [rendimiento.md §14](rendimiento.md): 105 y 79 ms, por el índice `(status, shippedAt)` y sin ordenar en disco. **Las ventas por día no agrupan por una expresión**: un `LATERAL` por día, como los movimientos por mes de `T4-16`; gana por poco —105 ms frente a 118— y se eligió por no depender de una estimación sin estadísticas. **Un error mío que cazaron los tests, no la revisión:** `generate_series` con argumentos `date` devuelve `timestamptz` en la zona de la sesión, y la venta de las 23:30 cambiaba de día; cayeron cuatro. **La ficha no decía dos cosas:** que `load/sembrar.js` estaba roto desde `T6-04` —insertaba ventas sin `number`— y hubo que arreglarlo para medir; y que en el móvil el eje escondía tres de las siete etiquetas. El gráfico lleva al lado una lista oculta con las mismas cifras, para quien no lo ve. **Sin medir:** el panel entero bajo carga sostenida con las dos consultas nuevas. Una de cuatro pasadas del E2E falló en el primer login, con el equipo saturado; las dos siguientes, limpias |
| T6-10 | Alta de usuarios por invitación | 2026-10-10 | `POST /users`, solo de `ADMIN`: crea la cuenta con su rol y manda un enlace para elegir la contraseña; **ninguna contraseña viaja por correo**. El enlace es el token de restablecimiento, con 7 días de caducidad, y lleva a la página de `reset-password`, que con `invitacion=1` dice «elige» en vez de «restablece». El criterio, en 24 tests del backend —con el enlace sacado del correo que se habría enviado, no de un mock— y 8 del frontend, falsificados: diecisiete roturas, diecisiete caídas. **Poner la contraseña con un token válido verifica la cuenta**, también la de quien se registró, no confirmó y restablece: ha demostrado lo mismo por otro correo; decidido a sabiendas y con su test. **La ficha no decía qué pasa si el envío falla** con el SMTP configurado: la cuenta se retira y se devuelve el error, para que la invitación se pueda repetir. El correo se espera, a diferencia de los avisos del ADR 0004: aquí es la única forma de entrar. **Sin comprobar:** el recorrido entero en un navegador con un buzón de verdad —el E2E no tiene buzón y el `.env` de desarrollo envía correo real—; en el navegador se vieron el formulario y la página de la contraseña, en escritorio y a 393 px, sin enviar nada. No hay ruta para reenviar una invitación: caducada, «olvidé mi contraseña» hace el mismo papel. Una de dos pasadas del E2E falló en el primer login de cuatro tests, como en `T6-09`; la siguiente, limpia |

### Re-auditoría del 2026-10-31

*Las tareas `AUD-NNN` salen del [informe](auditoria/2026-10-31/INFORME.md); su ficha completa queda en el historial de git de este documento.*

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| AUD-006 | La venta de `moneda.test.ts` dependía del reloj y tenía `pnpm verify` del backend en rojo desde el 2026-10-24 | 2026-11-01 | El test del PDF de informes con `RD$` contaba los importes de la sección de margen, cuya ventana son los últimos 30 días del reloj (`DIAS_DE_MARGEN`), con una venta fija del 2026-09-24: salió de la ventana el 2026-10-24 y el recuento bajó de más de 8 a 8. Ahora ese test crea **su propia** venta, enviada ayer respecto a `Date.now()` como en `margen.test.ts`, y la borra al terminar; la del 24 de septiembre se queda para el informe por periodo y el resumen semanal. No va en el `beforeAll` **a propósito**: con el reloj 60 días atrás caería en septiembre de 2026 y cambiaría las cifras de esos dos. El umbral del `8` no se tocó. **Comprobado:** reproducido antes del cambio (8, no > 8); después, 56 de 56; falsificado poniendo la venta 31 días atrás, cae con el mismo 8; `pnpm verify` llega en verde hasta `smoke` —1652 tests, 97,15 % de sentencias— y solo cae `auditoria`, que es `AUD-004`. **Sin comprobar:** el criterio con el reloj del sistema movido un año adelante y 60 días atrás no se ejecutó —cambiar la hora de Windows afecta a la sesión entera—; se razonó: la venta nueva y la ventana del margen se mueven con el mismo reloj, y los otros tests de la moneda usan fechas fijas con su rango explícito (`from`/`to` y `AHORA`). |
| AUD-004 | Subir `body-parser` a 2.4.0 (GHSA-27r3-jxmh-p828) y devolver a verde el paso `auditoria` de los dos repositorios | 2026-11-01 | **La ficha se quedaba corta:** al cerrarla ya no era un aviso alto sino tres en el backend —`body-parser`, `zod` (GHSA-mrhx-c7xc-m3w5) y `multer` (GHSA-q7qp-rjg7-q26m)— y tres en el frontend —`zod` y dos de `follow-redirects`—, más moderados en los dos. Todos tenían arreglo dentro de su versión mayor (patrón 1 y 3 de [dependencias.md §2](dependencias.md)). **Backend:** `express` 5.3.0, `zod` 4.6.7, `multer` 2.5.0, `nodemailer` 10.3.1 y `express-rate-limit` 8.7.2; `body-parser` 2.4.0, `ip-address` 10.7.5, `qs` 6.17.1 y `fast-uri` 3.1.9 con `pnpm update --depth 100` —**sin `--depth` pnpm 12 no movió `body-parser` y no avisó**, aunque `express` 5.3.0 ya lo admitía—; y los suelos de los `overrides` de `qs` y `fast-uri` suben, porque express sigue pidiendo `qs@^6.16.0`, que admite la vulnerable. **Frontend:** `zod` 4.6.7, `vite` 8.3.5 y `follow-redirects` 1.16.2. Ninguna versión tomada tenía menos de tres días (la más nueva, del 2026-10-29). Vite 8.3 avisaba de que `__dirname` en `vite.config.ts` no valdrá con el cargador nativo de configuración: pasa a `import.meta.dirname`. **El criterio, comprobado:** el lockfile resuelve `body-parser@2.4.0` en sus tres caminos; `pnpm audit --prod` da **0 avisos de cualquier severidad** en los dos repositorios; y `pnpm verify` sale con 0 en los dos —backend 1652 tests y 97,15 %, frontend 910 (+1 omitido) y 80,84 %—, con `auditoria` en «crítica 0, alta 0». E2E completo: 39 pasados y 3 omitidos a la primera. **Sin comprobar:** el ataque del aviso —un cuerpo gzip con bytes de más— no se repitió contra el servidor; la auditoría lo dejó como opcional y el arreglo es la versión. **Fuera de la ficha:** las dependencias de **desarrollo** del frontend siguen con avisos —`undici`, `browserslist`, `brace-expansion`, `vitest`, `minimatch`—, que no van a la imagen ni los mira `auditoria`. |
| AUD-001 | El registro abierto daba a cualquiera una cuenta `USER` que leía los datos personales de todos los clientes | 2026-11-01 | **La decisión previa, tomada el 2026-11-01:** registro **con aprobación**, y `USER` se conserva como rol de solo lectura —«Consulta» en pantalla—. Anotada en [CONTEXTO.md §6](CONTEXTO.md). **La ficha proponía `isActive: false` hasta aprobar, y no se hizo así:** «desactivada» ya significa otra cosa —la cuenta que un ADMIN dio de baja—, y no se habrían podido distinguir. Lo que hay es un valor nuevo de `Role`, **`PENDING`**, que no está en ningún grupo de `PERMISOS`: el registro lo pone, `login` lo detiene con `ACCOUNT_PENDING_APPROVAL` (después de `EMAIL_NOT_CONFIRMED`), y es el valor por defecto de la columna. **No se asigna** (`rolAsignableSchema`, en el contrato): ni al cambiar un rol ni al invitar; rechazar es desactivar. Al **confirmar el correo** —o al confirmarlo restableciendo la contraseña— cada ADMIN activo recibe el aviso `USER_PENDING` en la campana, que lleva a Usuarios ya filtrado (`?role=PENDING`). **Aprobar es dar el primer rol** desde Usuarios, donde la fila pendiente tiene «Aprobar como…»: un `updateMany` condicionado a que siga `PENDING`, para que dos administradores a la vez manden un correo y no dos; el aviso sale de todas las campanas y la persona recibe un correo en su idioma con el rol y un botón al inicio de sesión. El correo se espera pero **no deshace la aprobación si falla**, ni si no hay SMTP. Dos migraciones —el valor nuevo de un enum no se puede usar en la transacción que lo crea—, **expansivas**: el código anterior sigue funcionando contra la base migrada. Seed: `pendiente@stockly.app` con su aviso. **De paso:** cambiar un rol no dejaba rastro, aunque `USER_ROLE_CHANGE` existía desde T3-02; ahora sí, con `de`, `a` y `aprobada`. Y los enums de rol de Swagger, escritos a mano, salen del contrato. **El criterio, comprobado:** una cuenta registrada y confirmada no puede iniciar sesión, y con una sesión firmada a mano recibe 403 `FORBIDDEN` en `GET /customers`, `GET /sale-orders` y `GET /reports` (`registro-con-aprobacion.test.ts`, 22 tests); `permisos.test.ts` recorre además todas las rutas con `PENDING`. Falsificado: 29 roturas —17 en el backend y 12 en el frontend—. En el backend, 15 caídas a la primera y 2 tras reforzar: restablecer la contraseña de una cuenta ya confirmada reabría el aviso en todas las campanas, y la carrera de dos aprobaciones no se cruzaba nunca en el punto exacto —se fuerza con la lectura simulada—. En el frontend, 11 a la primera y 1 equivalente: quitar la guarda de «Aprobar como…», que no puede volver a elegirse. `pnpm verify` en verde en los dos: 1771 tests y 97,15 % en el backend, 922 y 80,71 % en el frontend; E2E, 39 pasados y 3 omitidos con el seed nuevo. **En el navegador**, a 1280 y a 393 px: el login de la cuenta pendiente enseña el mensaje; el admin ve el aviso, lo sigue y llega a Usuarios filtrado; la aprueba como Consulta y desaparece de las pendientes; por la API entra (200), la auditoría dice `PENDING → USER`, aprobada, y no le quedan avisos. **Lo que solo vio el navegador:** el enlace del aviso apuntaba a `/users` y la pantalla está en `/admin/users` —el test comprobaba la misma ruta equivocada que escribí—; corregido. **Sin comprobar:** el correo de aprobación con un buzón real —el `.env` de desarrollo envía correo de verdad y `stockly.app` no es nuestro, así que se aprobó con el SMTP vacío—; a 393 px, aprobar exige desplazar la tabla, como ya pasaba con el cambio de rol; y nada con lector de pantalla. **A saber:** una cuenta pendiente que nadie aprueba ni rechaza se queda para siempre; no hay ruta para borrar usuarios. |
| AUD-005 | Máquina de estados de las ventas bajo bloqueo: dos envíos o dos cancelaciones simultáneos movían el stock dos veces, y `PATCH` aceptaba `SHIPPED → PENDING` | 2026-11-02 | `update` leía la orden **fuera** de cualquier transacción y decidía con lo leído; bloquear los productos dentro de `despachar` no bastaba, porque las dos peticiones ya habían leído «pendiente» antes de esperar por ellos. Ahora `update` y `delete` son una transacción que empieza con `bloquearVenta` —`SELECT … FOR UPDATE` de la orden, como `bloquearOrden` en compras— y lee, decide y aplica dentro. Las transiciones están en un solo sitio, `TRANSICIONES` (`PENDING → SHIPPED | CANCELLED`, `SHIPPED → CANCELLED`); fuera de ellas, **409 `INVALID_STATUS_TRANSITION`**, con su traducción. Los dos casos que ya tenían código lo conservan —`ORDER_ALREADY_SHIPPED` y `CANNOT_MODIFY_CANCELLED_ORDER`, 400—, porque la interfaz ya los traduce y el criterio pedía el 400. Una enviada **sigue pudiéndose editar sin cambiar de estado** (datos del cliente y notas): es como se atiende la supresión del documento (T6-06). La cancelación de una enviada sale a `devolverEnviada`, junto a `despachar`, con el mismo cuerpo. Y `MAXIMO_DE_LINEAS_DE_VENTA` = 100 en el contrato, con su `.max()` en `POST /sale-orders`. En la interfaz: «Agregar ítem» se deshabilita en el tope y escanear de más lo dice; y un cambio de estado o un envío **rechazado vuelve a pedir la lista**, para que no quede en pantalla el estado viejo. **El criterio, comprobado** (`estados-de-venta.test.ts`, 8 tests, con la carrera forzada como en `recepcion-parcial.test.ts`: una transacción del test retiene la orden **y sus productos** mientras llegan las dos peticiones): dos envíos dan 200 y 400, el stock baja una vez y hay una fila de `sale_order_item_lots` por línea; dos cancelaciones devuelven el stock una vez; `PATCH { status: "PENDING" }` sobre una enviada da 409 y no mueve nada, tampoco las notas que venían en el mismo cuerpo. Además: un borrado que llega con el envío en curso espera y responde 400; 100 líneas se aceptan y 101 dan 422. Falsificado: 11 roturas —7 en el backend y 4 en el frontend—, 11 caídas; en el frontend, una tras añadir su test (escanear con todas las líneas ocupadas) y otra que el guion de falsificación aplicó mal y se repitió a mano. `pnpm verify` en verde en los dos: 1779 tests y 97,15 % en el backend, 926 y 80,86 % en el frontend; E2E, 39 pasados y 3 omitidos. **En el navegador, el 2026-11-02, con el tope real:** tras 99 clics el formulario tiene 100 líneas, «Agregar ítem» queda deshabilitado con su título y el clic 101 no añade nada; con las 100 ocupadas, escanear un código real muestra «Una orden admite 100 líneas como mucho.» y no abre otra. Y con la Venta #000021 enviada por la API a espaldas de la pantalla, pulsar «Marcar como enviada» da el aviso «La orden ya fue enviada» y la fila pasa sola a «Enviado», sin recargar. En los tests de Vitest el tope va bajado a 3, porque pintar 100 líneas en jsdom tarda 25 s. **A saber:** la transacción del envío espera ahora por la orden además de por los productos; con dos personas enviando la misma orden, la segunda tarda lo que la primera. |
| AUD-002 | `trust proxy` configurable: detrás de nginx, los limitadores llevaban un solo contador para todos y 10 logins fallidos de cualquiera bloqueaban el del comercio entero | 2026-11-02 | `app.set("trust proxy", env.trustProxy)`, con `TRUST_PROXY` validada en `env.ts` por `parseTrustProxy`: **solo un número de saltos**; vacía es `0` —la dirección del socket, lo correcto sin proxy— y `true` o cualquier otra cosa **no arranca**, porque confiaría en un `X-Forwarded-For` que escribe el cliente. El `docker-compose.yml` la pone a `1`. **Lo que la ficha no pedía y hacía falta:** con `TRUST_PROXY=1`, quien llegue al 3000 sin pasar por nginx escribe él mismo el último salto y elige su IP; así que el 3000 se publica solo en `127.0.0.1` y `docker-compose.prod.yml` lo cierra con `ports: !reset []`, como el 5432. Comprobado con `docker compose config`: en la superposición de producción el backend no publica ningún puerto. README (variable y fila de seguridad), `README-proyecto.md` y `.env.example` lo cuentan. **El criterio, comprobado** (`trust-proxy.test.ts`, 13 tests, con la app reimportada por caso y el limitador del login a 3): con `TRUST_PROXY=1`, agotar el cupo desde `203.0.113.1` deja el login de `203.0.113.2` en 401, no 429; cambiar lo que el cliente escribe **delante** del salto de nginx no da cupo nuevo; y sin la variable, la cabecera se ignora y todos comparten contador —el fallo de la auditoría, reproducido—. Más `parseTrustProxy` con sus valores y `validateEnv` rechazando `true`. Falsificado: 6 roturas, 6 caídas; `validateEnv` sin la comprobación pasaba, y su test se añadió entonces. `pnpm verify` en verde: 1793 tests en 71 archivos, 97,16 %. **Con la pila real, el 2026-11-02** (`docker compose -p stockly-prueba`, volumen propio, desmontada después): a través de nginx, desde el equipo, un login válido y nueve fallidos dan 200 y 401, el siguiente da 429 —el límite cuenta peticiones, no fallos— y el login válido queda bloqueado; cambiar `X-Forwarded-For` en cada intento sigue dando 429; y **desde otro contenedor de la red, el mismo login válido da 200**. El 3000 responde en `localhost` y no por la IP de la red; con `docker-compose.prod.yml`, el backend y la base no publican ningún puerto, el 3000 no conecta y la aplicación sigue entrando por el 8080. **No se hizo** el opcional de limitar el login también por correo: con la IP ya bien contada, es otra decisión. |
| AUD-003 | Guarda de entorno en el seed y un comando propio para el primer ADMIN: el despliegue documentado mandaba sembrar, y el seed vacía la base y deja administradores con la contraseña del README | 2026-11-02 | **La guarda**, en `shared/lib/guardaDelSeed.ts` y llamada al principio de `main()`, antes de `limpiar()`: el seed se niega con `NODE_ENV=production` **y también** con una `DATABASE_URL` que no sea `localhost`, `127.0.0.1` o `::1`, que cubre lo que la primera no ve —un `.env` de desarrollo apuntado por descuido al servidor—. Sale con 1 y dice qué usar en su lugar; `pnpm db:seed -- --forzar` la salta (comprobado que Prisma le pasa el argumento). El E2E y las dos CI siembran contra `localhost`, así que no les afecta. **El comando**, `src/cli/admin-crear.ts`, junto a `resumen-semanal.ts` y con su misma forma: `pnpm admin:crear` en desarrollo y `node dist/cli/admin-crear.js` en la imagen de producción, que no trae `tsx`. Lee `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NAME` (por defecto «Administrador»), los valida con `registerSchema` —la misma regla que el registro— y crea un ADMIN verificado **solo si no hay ningún ADMIN activo**: con uno, se niega y lo nombra, porque un comando que creara administradores siempre sería una puerta trasera de la consola. Un cerrojo consultivo (`pg_advisory_xact_lock`) evita que dos ejecuciones a la vez creen dos. Queda en la auditoría como `CREATE` de `User` sin actor y `via: "admin:crear"`. **Docs:** README (comandos, §Seed y una sección nueva para el primer administrador), `README-proyecto.md` (arranque y Docker), [operaciones.md §11](operaciones.md), nueva, y CONTEXTO §4 y §5; ninguno manda ya sembrar una base real. **El criterio, comprobado** (`primer-admin.test.ts`, 27 tests): el seed **de verdad**, lanzado con `tsx` y `NODE_ENV=production` contra la base de tests, sale con 1, no imprime «Base de datos limpiada» y la cuenta que había sigue ahí; `admin:crear` crea en una base vacía, no borra lo que hubiera, se niega con un ADMIN activo (no con uno desactivado), con un correo ya usado y con contraseñas que el registro rechaza; y con una transacción del test reteniendo el cerrojo, la segunda ejecución **espera** y luego se niega. Además, el compilado contra la base de tests con `NODE_ENV=production`: crea, se niega la segunda vez y sale con 1 sin variables. Falsificado: 13 roturas, 13 caídas, **dos tras arreglar el test**: el del correo repetido pasaba sin la comprobación porque el error de Prisma cita el código fuente de alrededor —con el texto del mensaje dentro— y la expresión regular lo encontraba ahí; ahora se compara el mensaje entero, ya resuelto. Y el de la carrera, lanzando las dos a la vez, pasaba sin cerrojo porque las consultas casi nunca se solapan; ahora el test retiene el cerrojo. `pnpm verify` en verde: 1820 tests en 72 archivos, 97,12 %; E2E, 39 pasados y 3 omitidos, con su seed. **En la imagen, el 2026-11-02**, sobre una base recién migrada y vacía: `pnpm db:seed` desde el contenedor `migrate` se niega con `NODE_ENV=production` y también sin él (la base está en `db`, no en esta máquina), sale con 1 y la base sigue con 0 usuarios y 0 productos; `docker compose exec … backend node dist/cli/admin-crear.js` crea el ADMIN verificado, se niega la segunda vez nombrándolo y sale con 1 sin variables; el seed, intentado de nuevo, no lo toca; la auditoría tiene la fila `CREATE` de `User` sin actor; y ese ADMIN entra por nginx con 200. **No se hizo:** rehacer el seed, que es otra tarea. |

### Después de la re-auditoría

| ID | Tarea | Cerrada | Nota |
|---|---|---|---|
| AUD-007 | Tier 3 · Diseño y rendimiento: las pantallas de datos cargan con esqueleto y lo pequeño con spinner, sin que la pantalla salte al llegar los datos | 2026-11-02 | **Decisión previa, del 2026-11-02:** esqueleto para las cargas con forma, spinner para botones y lo pequeño, «tomando en cuenta el rendimiento». **Medido antes de cambiar nada** (build de producción, Slow 4G y CPU ×4, CLS con `PerformanceObserver`): en escritorio ninguna pantalla pasaba de 0.05, pero en móvil **Ventas daba 0.183**, peor que el 0.1 de «bueno», y Productos 0.076. Así que el esqueleto no se justificaba por las métricas en general, sino por esas dos y por cómo se percibe la carga. **La ficha se quedaba corta:** el esqueleto a secas **empeoró** Productos de 0.050 a 0.343. Con un spinner, lo que llegaba tarde encima de la tabla empujaba pocos píxeles; con diez filas grises, media pantalla. Hubo que arreglar tres cosas que se repetirán en pantallas nuevas: en Ventas, los filtros salían solo «si hay órdenes» y ahora se pintan también mientras carga; en Productos, la leyenda ABC llegaba después que la tabla y ahora ocupa su sitio, invisible, con una fecha de relleno del mismo formato; y la barra de filtros de Productos crece al saber si hay etiquetas o varios almacenes, y como no se le puede reservar el hueco —con un solo almacén el selector no sale, y se cerraría—, la tabla **espera** (`esperando`): anuncia «Cargando…» pero no pinta formas hasta que la barra tiene su altura final. **Resultado:** Productos, 0.019 en escritorio y 0.013 en móvil; Ventas, 0 en los dos y también en Slow 3G; Compras, Clientes, Panel, Informes y Conteos, 0. **Rendimiento:** sin librería; el retraso de 200 ms es un `animation-delay`, no un temporizador de React; el pulso anima `opacity` del envoltorio —una capa, sin repintar— en vez de un brillo con `background-position`; el JS de entrada pasa de 13.49 a 13.68 kB comprimido y el CSS de 14.26 a 14.36. **Accesibilidad**, que no había: el `Spinner` era un `div` sin `role` y ningún lector lo anunciaba; ahora es un `status` con «Cargando…» (es y en), como el esqueleto, cuyas formas van con `aria-hidden`; el del botón es decorativo y lo anuncia el botón con `aria-busy`, y es un `span` porque un `div` no puede ir dentro de un `<button>`. Con movimiento reducido el esqueleto queda quieto. **Alcance:** 21 pantallas pasan a esqueleto (tabla, lista, rejilla, bloques o página entera); el spinner grande queda en cuatro sitios sin forma que anticipar —la carga de una ruta, la sesión, la verificación del correo, la cámara—, y `cargas.test.ts` falla si aparece en otro. La regla, en `Stockly-F/docs/design-system.md` §8, y el paso 7 de «Cómo añadir una página nueva». **Comprobado:** 21 tests nuevos en 4 archivos (`Esqueleto.test.tsx`, `cargas.test.ts`, `cargaDeVentas.test.tsx`, `cargaDeProductos.test.tsx`) y 3 reescritos que miraban la clase del spinner o daban por pintada la tabla —dos de ellos habrían pasado en vacío—. Falsificado: 24 roturas, 24 caídas, **dos tras reforzar su test**: la espera por las etiquetas y la espera por los almacenes; los dos comprobaban «no está» antes de que TanStack avisara del cambio. `pnpm verify` del frontend en verde: 947 tests, 81.08 %; E2E, 39 pasados y 3 omitidos. **A saber:** en Ventas, el selector de almacén puede llegar después que la lista; medido, llegan juntos y el CLS es 0, pero es una carrera y no una garantía. Si alguna vez se ve saltar, la solución es la misma `esperando` de Productos. Y la espera se aplicó **solo donde se midió el problema**: probada en las siete pantallas con selector de almacén, rompía 65 tests de seis pantallas que no la necesitaban. |
| AUD-008 | Tier 3 · Diseño: el panel principal, con lo pendiente primero, un panel «de hoy» por rol y sin estados rotos (crítica de Impeccable del 2026-11-03, 23/40) | 2026-11-07 | **Cuatro críticas, 23 → 27 → 27 → 30/40**, con dos revisiones independientes cada vez (diseño en el navegador y el detector de Impeccable). **El criterio, cumplido:** la última da **30/40, banda «Buena», sin ningún P1**; `pnpm verify` en verde en los dos repositorios (backend 1829 tests; frontend 998 y 1 omitido, más el test nuevo del aviso por rol: 57 en `resumen.test.tsx`). Los pasos 1 a 12 están en el historial de git de este documento (la ficha, del 2026-11-04 y 05). **Lo de la tercera crítica (2026-11-06, 27/40, un P1), decidido por el propietario —«todo, también el P3»—:** la cifra de stock de ADMIN **llevaba a la reposición sugerida**, que no es la misma lista (sale de las salidas y del plazo, no del mínimo): «4» abría seis líneas distintas a un clic de generar órdenes; ahora abre la lista filtrada, y la sugerencia queda aparte bajo «Reponer primero», diciendo de dónde sale. **Color por gravedad:** rojo para lo caducado o agotado, ámbar para el stock bajo y lo que va a caducar, neutro para las colas de trabajo. Las caducidades dicen cuántos lotes de cada: `summary.expiredCount` nuevo en `GET /reports/expiring` (contrato regenerado). **WAREHOUSE:** «Escanear» fijo abajo en móvil, sin los accesos que repetían una fila, y sus acciones detrás de «Necesita atención». **SELLER ya no tiene panel:** `/` lo lleva al mostrador, con «Mis ventas de hoy» debajo (`MisVentasDeHoy`, pasado de `dashboard/` a `sale-orders/`), y «Panel» sale de su navegación (`ocultoPara`). Sin ventas, una frase en vez de un gráfico a cero; un fallo del servidor se dice en lenguaje normal (`ErrorDeCarga`, para 5xx y 404) y la fila sin datos se reintenta desde ella misma. **De la cuarta (2026-11-07), sus dos P2:** el aviso del resumen caído ya no lo ven USER ni WAREHOUSE, que no tienen resumen, y el «Reintentar» de la fila lleva rueda y `aria-busy`, no repite y **no desaparece mientras reintenta** (la regla de `useFalloDeCarga`: TanStack v5 vuelve a `pending` y se llevaba el botón con el foco). **Comprobado en el navegador:** ADMIN a 1440, WAREHOUSE a 390 táctil (el botón fijo mide 48 px, sin tapar lo último), SELLER a 1024 táctil (entra en `/counter` y la pestaña dice «Mostrador»), y ADMIN con `/reports` caído. **Lo que la ficha no decía:** el backend de desarrollo quedó vivo entre sesiones, sirviendo código viejo, y el panel enseñó una cifra que no cuadraba hasta matarlo; y la base de tests de este equipo no tenía las migraciones de `AUD-001` (`Role.PENDING`): 524 tests en rojo hasta aplicar su SQL ([CONTEXTO.md §4](CONTEXTO.md)). **Sin hacer:** las cifras «de su almacén» y las compras vencidas siguen sin datos que las sostengan; `AUD-009` sigue sin decidir. Al cerrarla se pasó la crítica por **las 31 pantallas** ([informe](auditoria/2026-11-07-critica/INFORME.md)), que abrió `AUD-011` a `AUD-019`. |
| AUD-011 | Tier 2 · Diseño: el trabajo se pierde sin aviso — las cifras de un conteo, la venta del mostrador, los ajustes de Configuración, lo editado en Sugerencias y los modales de Categorías y Marcas (crítica del 2026-11-07) | 2026-11-07 | **El patrón, una vez y para las cinco**, anotado en `Stockly-F/docs/design-system.md` §8, «No perder lo escrito»: lo largo vive en la pestaña con `useEstadoDeSesion` (`sessionStorage`, con el «de quién» en la clave); lo que se confirma con un botón pregunta al irse con `AvisoDeCambiosSinGuardar` (`useBlocker` dentro de la aplicación, `beforeunload` al recargar o cerrar; «Salir sin guardar» borra también lo de la pestaña); y un modal se cierra en el `onSuccess`. **Conteo:** las cifras suben de la captura a la página —pasar a «Revisar» ya no las tira—, viven en la pestaña por conteo, «Guardar» envía **todas** las pendientes y no solo las de la página que se ve (antes enviaba esas y borraba el resto; en tandas de 500, el tope del `PATCH`), «Revisar» dice cuántas esperan, el cierre avisa de que lo no guardado no entra, e irse pregunta. Un conteo cerrado o cancelado vacía lo que quedara. **Mostrador:** líneas y cliente en la pestaña, por usuario; **sin pregunta al navegar**, a propósito: el vendedor sale a mirar un producto y la venta sigue ahí. **Configuración:** «Guardar cambios» baja a una barra pegada abajo con el recuento y «Descartar» (arriba quedaba fuera de la vista), e irse o recargar con cambios pregunta. **Sugerencias:** paginar ya no borra lo editado (va por producto), generar quita solo lo generado, e irse pregunta. **Categorías y Marcas:** el modal espera a la API, como Proveedores. **Los tests montan con un router de datos:** `renderWithProviders` pasa de `MemoryRouter` a `createMemoryRouter` —sin eso `useBlocker` lanza—, y la suite entera siguió en verde antes de tocar ninguna pantalla; `setup.ts` limpia `sessionStorage` antes de cada test. **Comprobado:** 22 tests nuevos (conteo 7, mostrador 4, Configuración 5, Sugerencias 3, Categorías 3); `pnpm verify` del frontend en verde, 1021 tests y 1 omitido en 92 archivos. **En el navegador a 390 px táctil:** conteo del seed como WAREHOUSE —escribir 3, pasar a «Revisar» (sale «1 cifra sin guardar en «Contar»»), recargar (sigue el 3 y «Guardar (1)»), irse por el enlace (sale «¿Salir sin guardar?», y salir deja la pestaña limpia)—; mostrador como SELLER —una línea, recargar, sigue con su total—. Nada se guardó ni se vendió en la base de desarrollo. **Sin hacer:** en Sugerencias, marcar y desmarcar una casilla cuenta como cambio aunque quede como estaba; y el disponible de un producto recuperado en el mostrador es el de cuando se añadió (el servidor lo vuelve a comprobar al vender). |
| AUD-012 | Tier 2 · Diseño: acciones irreversibles de un toque — borrar en el catálogo, cancelar o enviar órdenes, cambiar un rol, desactivar un almacén (crítica del 2026-11-07) | 2026-11-07 | **Un componente para todas:** `ConfirmarAccion` (`Stockly-F/src/shared/components/`), con el modelo de las que ya confirmaban (borrar un cliente, cancelar una venta enviada): el título nombra la acción y la cosa, el cuerpo dice la consecuencia que no se ve desde la fila, el botón lleva el verbo, «Volver» va antes en el teclado y el diálogo se cierra en el `onSuccess`. El patrón, en `Stockly-F/docs/design-system.md` §8, «Lo que no se deshace, se confirma». **Pantallas:** borrar en Productos, Categorías, Marcas, Proveedores y Etiquetas (cada una dice qué les pasa a sus productos); cancelar y eliminar una compra pendiente; marcar enviada —lista lo que sale y de qué almacén—, cancelar y eliminar una venta pendiente; en Usuarios, **el rol se elige en el desplegable pero solo se aplica al confirmar** («Laura pasará de Consulta a Admin»; con las flechas sobre el desplegable cerrado ya no cambia nada), igual que aprobar una cuenta pendiente, y desactivar confirma; en Almacenes, hacer predeterminado (dice adónde irá lo que no diga almacén) y desactivar confirman, y **con existencias «Desactivar» no se ofrece**: desactivado, con «Guarda N unidades: transfiérelas antes» atado por `aria-describedby`. **No confirman, a propósito,** las que devuelven sin quitar nada: reactivar a alguien o un almacén y restaurar un producto. **Backend:** desactivar un producto **ya no borra su imagen de Cloudinary** (`product.service.ts`): era un borrado lógico que `restore` deshacía a medias, devolviendo el producto sin foto; test nuevo en `products.test.ts`. **Comprobado:** `pnpm verify` en verde en los dos repositorios —backend 1830 tests, frontend 1029 y 1 omitido en 92 archivos—. Los 12 tests que fijaban la acción de un toque se reescribieron para pasar por la confirmación y comprobar que un toque solo no hace nada, y hay tests nuevos por pantalla (Productos, Categorías —también si borrar falla—, Proveedores, Etiquetas, eliminar una venta, Usuarios con el recorrido de teclado, Almacenes vacío y con existencias). **E2E** actualizado (tres envíos confirman; Almacenes espera el botón desactivado y recarga tras la transferencia por API) **pero no ejecutado**. **Sin comprobar en el navegador**: el criterio pedía tests de componente. **Sin hacer:** un «Deshacer» en el aviso en lugar de confirmar, que la ficha dejaba como alternativa; y los `aria-label` con el nombre en los botones de icono de Categorías, Marcas y Proveedores, que siguen en `AUD-019`. |
| AUD-013 | Tier 3 · Diseño: el móvil de quien trabaja de pie — el stock, la recepción, el conteo y el cobro quedaban fuera de la pantalla a 390 px (crítica del 2026-11-07) | 2026-11-07 | **El criterio, medido en el navegador a 390 px táctil:** **Productos** —la tabla pasa de 1099 a 357 px, sin desplazamiento, y el stock de la primera fila está en x≈177 (antes 661); la primera fila, en y=474 (antes 770)—: por debajo de `md` se queda con nombre, stock y acciones (estas, de dos en dos), sin el ancho mínimo; imagen, ABC, categoría, marca, precio y estado se ocultan (están en la ficha, a un toque), los cinco desplegables se pliegan tras «Filtros (n)» y la leyenda ABC no se pinta. **Recepción de compras** —el campo de cada línea, en x=262–358 dentro de un diálogo de 358 (antes x=576)—: producto y «Llega ahora», con «Pedido 5 · recibido 0» debajo del nombre. **Conteo** —el primer campo, en y=713–757 (antes 825, en el pliegue)—: buscador y «Escanear» en una fila y «Guardar» en una barra fija abajo. **Mostrador** —con tres líneas, el total en y=751 y el botón en y=788–832 de 844—: el cobro va en una barra fija hasta `lg`, con el hueco reservado (lo último de la página no queda tapado); desde `lg`, dos columnas, la venta a la izquierda y cliente y cobro a la derecha, `sticky` bajo la cabecera (comprobado a 1024 px). **Las columnas escondidas sin señal** (Usuarios, Clientes, Sugerencias, Categorías, Proveedores, Bitácora): `pista-de-desplazamiento`, en `CLASES_TABLA_DESPLAZABLE` y por tanto en las 39 tablas, desvanece el borde hacia el que sigue la tabla y se apaga al final —una animación ligada al desplazamiento, sin JavaScript; medido en Usuarios: 40 px a la derecha al principio, los dos bordes a mitad, solo la izquierda al final—. En Firefox, sin `animation-timeline`, queda como estaba. **Compartido:** `clasesDeBarraFija.ts` (la barra del panel del almacén pasa a usarla). **Regla de tablas** de `design-system.md` actualizada: en una pantalla de consulta ninguna columna se esconde; en una de trabajo de pie, sí, si lo oculto va debajo del nombre o en la ficha. **Comprobado:** `pnpm verify` del frontend en verde, 1037 tests y 1 omitido en 93 archivos; tests de densidad nuevos (`movilDePie.test.ts`, 7, que fijan las clases porque jsdom no aplica CSS) y el del plegado de filtros. El backend no cambia. **Sin hacer:** en Productos, en el móvil, el ajuste masivo y la selección siguen ahí pero el precio no se ve sin abrir la ficha; los cuatro botones de cabecera de Productos siguen ocupando dos filas; y en las pantallas de consulta las columnas siguen a lo ancho, ahora con señal, no en tarjetas. |
