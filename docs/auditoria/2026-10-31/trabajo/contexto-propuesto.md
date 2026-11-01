# Fusión propuesta en `docs/CONTEXTO.md` (paso 1.5)

`CONTEXTO.md` hace de `CONTEXT.md` (acuerdo de la Fase 0). La guardia del plugin no deja tocarlo durante la Fase 1, así que la fusión espera el permiso del usuario.

- **Se conserva** todo lo que hay. No se reescribe nada medido el 2026-10-10: es historia.
- **Se actualizan** la fecha de la cabecera y la viñeta del seed de §5.
- **Se añaden** un párrafo en §3, una viñeta en §4 («El E2E») y una viñeta en §5.
- **No se repiten** dos trampas que ya están escritas: la `@` sin codificar de `DATABASE_URL`, que explica el fallo de `psql` en la ejecución (§4, «Windows y la consola»), y el `reuseExistingServer` del E2E (§4, «El E2E»).
- **Falsos positivos verificados:** ninguno. La verificación no descartó nada, y los rebajados están en el informe.

## 1. Cabecera

`# Contexto de trabajo — al 2026-10-10` → `# Contexto de trabajo — al 2026-11-01`

## 2. §3 Estado: párrafo nuevo, justo después de la tabla

> **Re-auditoría del 2026-10-31** ([informe](auditoria/2026-10-31/INFORME.md), veredicto *bloqueado*): seis tareas abiertas, `AUD-001` a `AUD-006`, en el [ROADMAP](ROADMAP.md). Una es Crítico: el registro abierto deja leer los datos personales de todos los clientes. La tabla de arriba ya no vale tal cual:
> - `pnpm verify` del backend falla desde el 2026-10-24, por un test que depende del reloj (`AUD-006`);
> - el paso `auditoria` de los dos repositorios falla por avisos publicados después del 2026-10-11 (`AUD-004`).
>
> Medido el 2026-10-31 y el 2026-11-01:
> - backend: 1.651 de 1.652 tests, con cobertura de sentencias del 97,15 %;
> - frontend: 910 tests (+1 omitido);
> - E2E: 39 pasados y 3 omitidos, sobre una base aislada (con la salvedad de §4).

## 3. §4 Trampas, «El E2E»: viñeta nueva al final

> - **En Windows, la pasada completa en paralelo contra el servidor de desarrollo puede caer sin ningún defecto detrás** (re-auditoría, 2026-11-01).
>   - Fallaron 8 de 39 escenarios: esperas de 5 s con el `main` vacío (la ruta diferida no llegó a pintarse), un `ERR_NETWORK_IO_SUSPENDED` y un contexto del navegador perdido.
>   - Los 8 pasaron al repetirlos con `--last-failed`; los tres últimos, solo con `--workers=1`.
>   - Antes de buscar el defecto, repetir en serie.

## 4. §5 Cosas que dependen de ti

**Viñeta del seed, ampliada** (después de «…desde una cuenta que ya sea ADMIN.»):

> **Ojo, hasta cerrar `AUD-003`:** ese seed vacía la base entera y deja dos ADMIN con la contraseña pública del README. Solo en una base vacía, y cambiando o borrando las cuentas de demostración en el acto.

**Viñeta nueva, la primera de la lista:**

> - **Decidir qué pasa con el registro público** (`AUD-001`, bloquea el primer despliegue): cerrarlo y dejar el alta solo por invitación, dejarlo con aprobación de un ADMIN, o quitar a `USER` los clientes y los datos de cliente de las ventas. Hoy, cualquiera que confirme un correo propio lee la agenda completa de clientes, con su documento de identidad. La decisión se anota en §6.
