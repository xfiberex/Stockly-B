# ROADMAP — Stockly

La fuente de verdad del **trabajo pendiente** de los dos repositorios. Cada tarea tiene un
identificador `T{tier}-{nº}` que se cita en commits y documentos:
`fix(T0-01): resolver alias de rutas en el build de producción`.

> **Estado al 2026-10-05: 127 de 129 cerradas.** Quedan `T5-14` y `T5-15`, que solo se abren con
> un caso de uso real.
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
| **5** | Funcionalidad de negocio: costes, compras, clientes, almacén, informes, avisos y roles | 13 / 15 |
| | **Total** | **127 / 129** |

Los Tiers 0 a 4 son la remediación de la auditoría del 2026-08-04: 100 tareas salieron de sus
hallazgos y de la consultoría de diseño del día siguiente, y otras 14 las abrió el cierre de una
anterior, casi siempre al medir. El Tier 5 se abrió el 2026-09-13 y no corrige nada: es
funcionalidad nueva.

**Los contadores se cuentan, no se recuerdan.** Este documento ya se desfasó más de una vez por
actualizar un número y olvidar otro. Al cerrar o abrir una tarea cambian la casilla, la cabecera,
esta tabla y la fila del índice; si no coinciden, manda el recuento:

```bash
grep -c '^- \[ \] \*\*\[T' docs/ROADMAP.md    # abiertas: 2
grep -c '^| T[0-9]-[0-9]* |' docs/ROADMAP.md  # cerradas: 127
```

---

## Tareas abiertas

*Las dos cambian dónde vive el stock, así que tocan casi todos los módulos, las pruebas de carga y
los informes. Se listan para que no hacerlas sea una decisión consciente. **Ninguna empieza sin un
caso de uso real escrito en su ficha.***

- [ ] **[T5-14] Varios almacenes**
  - **Área:** Negocio / Arquitectura
  - **Ubicación:** transversal, los dos repositorios
  - **Qué hacer:** `Product.stock` es un único número. Con varios almacenes pasa a una tabla `StockLevel(productId, warehouseId, stock)`, cada movimiento lleva su almacén y aparece un movimiento nuevo, la **transferencia**, que es una salida y una entrada en la misma transacción. Compras, ventas, conteos, alertas de mínimo (¿por almacén o globales?) y todos los informes cambian.
  - **Decisión previa:** si `Product.stock` se mantiene como suma desnormalizada (lecturas rápidas, riesgo de que diverja) o desaparece (una fuente de verdad, consultas más caras). Medirlo con el conjunto de 100 000 productos de [rendimiento.md](rendimiento.md) antes de decidir, no después, y dejarlo en un ADR.
  - **Criterio de aceptación:** una transferencia de 10 unidades no cambia el stock total y deja dos movimientos enlazados; la migración pone todo el stock actual en un almacén por defecto y el total no cambia; la prueba de carga no empeora más de lo que el ADR haya aceptado.
  - **Esfuerzo:** alto
  - **Depende de:** nada pendiente (T5-03, T5-04 y T5-07 ya están cerradas)

- [ ] **[T5-15] Lotes y fechas de caducidad**
  - **Área:** Negocio
  - **Ubicación:** transversal, los dos repositorios
  - **Qué hacer:** solo tiene sentido con producto perecedero o con trazabilidad obligatoria (alimentación, farmacia, cosmética). Lote con fecha de caducidad al recibir, salida **FEFO** (primero lo que caduca antes) al enviar, aviso de lotes próximos a caducar y ajuste de caducados como merma.
  - **Criterio de aceptación:** enviar una venta consume primero el lote que caduca antes; un lote caducado no se asigna a una venta; el informe de caducidades lista lo que vence en los próximos N días con su valor a coste.
  - **Esfuerzo:** alto
  - **Depende de:** decidir junto a T5-14: si se van a hacer las dos, el nivel de stock es `(producto, almacén, lote)` y conviene diseñarlo una sola vez.

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
| **La carga sostenida no se ha repetido** con las consultas de margen, reposición, periodo y ABC del Tier 5 | [rendimiento.md §8–§11](rendimiento.md) |
| **Lo legal que falta antes de tener usuarios reales o de cobrar**: privacidad, plazos de conservación, condiciones, marca | [legal.md §2](legal.md) |

---

## Una tarea nueva

Una ficha lleva **área, ubicación, qué hacer, criterio de aceptación, esfuerzo y dependencias**,
como las dos de arriba, y va en «Tareas abiertas». Si depende de una decisión de producto, la
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
