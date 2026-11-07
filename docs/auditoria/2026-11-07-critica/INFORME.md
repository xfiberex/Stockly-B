# Crítica de diseño de Stockly, pantalla por pantalla — 2026-11-07

`/impeccable critique` (plugin Impeccable 4.8.0) sobre **las 31 pantallas del frontend**, más el
marco de la aplicación (barra lateral, cabecera, campana, menú móvil). Se hizo el 2026-11-06 y 07,
al cerrar `AUD-008`, y abrió las tareas `AUD-011` a `AUD-019` del [ROADMAP](../../ROADMAP.md).

## Cómo se hizo

- **Siete bloques, dos evaluaciones aisladas por bloque**, como manda la crítica de Impeccable:
  - una **revisión de diseño** en el navegador, con las cuentas del seed por rol, a 1440 px y a
    390 px táctil, en tema claro y oscuro, con teclado;
  - el **detector** (`impeccable detect`) sobre el código del bloque y, en el navegador, su
    capa visual.
- **Solo lectura.** No se creó, envió, recibió, canceló ni borró nada. Se abrieron formularios y
  modales y se cancelaron; se enviaron vacíos o inválidos para ver la validación.
- **Rúbrica:** las 10 heurísticas de Nielsen, de 0 a 4, por pantalla (/40). Severidad de cada
  problema de P0 (bloquea la tarea) a P3 (pulido). Modo de todas las pantallas: *Operate*.
- **Falsos positivos del detector en todo el proyecto**, descartados en todas las pantallas:
  `overused-font` (Inter está fijada en `PRODUCT.md`) y `shape-assembled-illustration` sobre el
  logo de las devtools de TanStack Query, que solo existe en desarrollo.
- Las instantáneas de cada bloque están en `Stockly-F/.impeccable/critique/2026-11-07T12-35-*`.

## Notas

| Bloque | Pantalla | Nota | Banda |
|---|---|---|---|
| Panel | Panel principal (`/`) | **30** | Buena |
| Acceso | Iniciar sesión | 27 | Aceptable |
| | Registro | 25 | Aceptable |
| | Olvidé la contraseña | 28 | Buena |
| | Restablecer contraseña | **19** | **Pobre** |
| | Confirmar cuenta | 21 | Aceptable |
| | Reenviar verificación | 24 | Aceptable |
| Catálogo | Productos | 25 | Aceptable |
| | Movimientos de un producto | 27 | Aceptable |
| | Categorías | 25 | Aceptable |
| | Marcas | 25 | Aceptable |
| | Proveedores | 26 | Aceptable |
| | Etiquetas | 24 | Aceptable |
| Órdenes | Órdenes de compra | 24 | Aceptable |
| | Sugerencias de reposición | 27 | Aceptable |
| | Órdenes de venta | 25 | Aceptable |
| | Mostrador (con «Mis ventas de hoy») | 27 | Aceptable |
| | Clientes | 29 | Buena |
| | Ficha de cliente | 28 | Buena |
| Inventario | Conteos físicos | 28 | Buena |
| | Un conteo | 24 | Aceptable |
| | Transferencias | 29 | Buena |
| | Caducidades | 30 | Buena |
| | Almacenes | 27 | Aceptable |
| Reportes | Reportes | 25 | Aceptable |
| | Ventas y compras por periodo | 28 | Buena |
| Administración | Usuarios | **21** | Aceptable |
| | Bitácora de auditoría | 23 | Aceptable |
| | Configuración | 27 | Aceptable |
| | Perfil | 27 | Aceptable |
| | Página no encontrada | 24 | Aceptable |
| | Marco de la aplicación | 26 | Aceptable |

**Media: 25,9/40.** Ninguna pantalla es «Crítica»; una es «Pobre»; nueve, «Buena». El panel
pasó de 23 (2026-11-03) a 27, 27 y 30 a lo largo de `AUD-008`.

**El detector**, en código, salió limpio en los siete bloques. En el navegador solo marcó
pulido tipográfico: palabras sueltas en la última línea (`/sale-orders`, `/expiry`, `/settings`
y `/profile` a 390 px) y dos títulos desequilibrados en `/reports` a 390 px. Fuera de su
alcance, Chrome señaló campos sin `id` ni `name`, y uno sin etiqueta accesible: el buscador de
Productos (`ProductFilters.tsx:98-104`).

## Lo que se repite

Los problemas más serios no son de una pantalla, son patrones:

1. **El trabajo se pierde sin aviso** (P1). Las cifras de un conteo al cambiar de vista o
   escanear; la venta del mostrador al recargar o navegar; los ajustes de Configuración al
   salir; lo editado en Sugerencias al paginar; lo escrito en Categorías y Marcas si falla el
   guardado, porque el modal se cierra antes de que responda la API. → `AUD-011`.
2. **Acciones irreversibles de un toque** (P1). Borrar en las cinco pantallas del catálogo
   (Productos borra además la imagen de Cloudinary, que restaurar no devuelve); cancelar o
   eliminar una compra pendiente; marcar enviada, cancelar o eliminar una venta pendiente;
   cambiar un rol —se aplica al elegir en el select, y las flechas del teclado lo cambian— o
   desactivar a alguien; desactivar un almacén o hacerlo predeterminado. → `AUD-012`.
3. **El móvil de quien trabaja de pie** (P1). La tabla de Productos esconde el stock a 390 px; el
   modal de recepción esconde «Llega ahora»; en un conteo el primer campo cae en el pliegue; en el
   mostrador, el total y «Registrar venta». Usuarios, Clientes, Sugerencias y la Bitácora
   esconden columnas sin señal. → `AUD-013`.
4. **Los avisos de 3 s son el único sitio de los errores del servidor** en las pantallas de
   acceso, y lo propio de Stockly —la aprobación por un ADMIN— solo se cuenta ahí. → `AUD-014`.
5. **Los roles no llegan al marco.** SELLER ve 16 destinos; USER, WAREHOUSE y SELLER no pueden
   elegir tema ni idioma; Etiquetas ofrece botones que acaban en 403. → `AUD-016`.

## Por bloque

### Panel — 30/40
Sin P1: cumple el criterio de `AUD-008`, que se cerró con esta crítica. Sus dos P2 se arreglaron
en la misma tanda (`bb51d7b`): el aviso de fallo del resumen ya no lo ven quienes no tienen
resumen, y el «Reintentar» de la fila dice que está trabajando. Quedan dos P2 en `AUD-019`.

### Acceso — 19 a 28/40
- **P1** Login: «pendiente de aprobación» y «credenciales inválidas» en un aviso de 3 s.
- **P1** Registro: no anticipa la confirmación por correo ni la aprobación.
- **P1** Restablecer contraseña: sin token o con token inválido, un callejón sin salida, sin
  `h1` ni enlace para pedir otro.
- **P1** Confirmar cuenta: «ya verificada» se presenta como error.
- **P1** Reenviar verificación: error ambiguo, en un aviso; además, revela si la cuenta existe.
- **P2** Placeholder `••••••••` que parece relleno; sin «mostrar contraseña»; burbuja nativa del
  `type="email"` junto a la validación propia; «Token» en la interfaz.

### Catálogo — 24 a 27/40
- **P1** Productos a 390 px: la tabla mide 1099 px en 357 y esconde el stock.
- **P1** Borrar sin confirmación, en las cinco pantallas.
- **P1** Categorías y Marcas cierran el modal antes de guardar.
- **P1** Etiquetas: acciones visibles para quien la API rechaza.
- **P2** La ficha que abre el escáner no deja mover stock ni escanear otro; formulario de
  edición confuso con el stock; pestañas de Movimientos sin semántica; `aria-label` sin el nombre
  de la fila; filtros fuera de la URL.

### Órdenes y clientes — 24 a 29/40
- **P1** Recepción a 390 px ilegible.
- **P1** Cancelar, eliminar y marcar enviada sin confirmación.
- **P1** Sugerencias: se generan órdenes sin ver ningún importe.
- **P1** Mostrador: total bajo el pliegue, y la venta se pierde al recargar.
- **P2** Filas desplegables como `div` con `onClick` (sin teclado); nombre de cliente en
  `text-accent`, ~3,8:1; la ficha de cliente rotula «Total» lo que es el subtotal; números de
  compra que son un trozo de UUID.

### Inventario — 24 a 30/40
- **P1** Un conteo pierde las cifras sin guardar.
- **P1** Un conteo, a 390 px: el primer campo en el pliegue y Guardar arriba.
- **P1** Almacenes: desactivar o cambiar el predeterminado de un clic.
- **P2** Vacíos que ignoran los filtros; «Quedan X» de transferencias, histórico pero leído como
  actual; sin escáner al transferir; `aria-label` que tapa el contenido del desplegable.

### Reportes — 25 y 28/40
- **P1** Las tarjetas no cuadran: venta − coste ≠ margen, porque coste y margen excluyen 27
  productos sin coste y la venta no.
- **P1** Tres gráficos con `role="application"`, sin nombre ni tabla equivalente.
- **P1** El informe por periodo abre vacío («Este mes») y deja exportar ceros.
- **P2** Eje de meses que se salta los vacíos; tarta de 9 categorías con 8 colores; periodo fuera
  de la URL.

### Administración, cuenta y marco — 21 a 27/40
- **P1** Usuarios: rol y desactivar sin confirmación.
- **P1** Bitácora: no dice sobre quién se actuó; sin filtros por usuario ni fecha.
- **P1** Configuración: cambios que se pierden al salir.
- **P1** Perfil: tema e idioma solo para ADMIN.
- **P1** Marco: navegación sin recortar por rol.
- **P2** Errores de carga que se leen como lista vacía (Usuarios, Bitácora); JSON crudo en la
  bitácora; la campana no ordena por urgencia; Escape no cierra el menú móvil; la 404 promete el
  «Dashboard» y anida un `<main>`.

## Lo que no se miró

- Ningún lector de pantalla real (solo el árbol de accesibilidad), como en `T4-17`.
- La interfaz en inglés.
- Los estados que exigen escribir: el registro completo, la pantalla «Hecha» del mostrador, un
  conteo cerrado, un reintento que sale bien después de un fallo real.
- La cámara real del escáner.
