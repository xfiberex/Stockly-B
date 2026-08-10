# 0005 — Sin integración continua: la puerta de calidad es local

**Estado:** aceptada · **Fecha:** 2026-08-06 (registrada el 2026-08-10, T3-11)

## Contexto

Los dos repositorios están en GitHub y tienen suites amplias —362 tests en el backend, 419
en el frontend, más un E2E de Playwright—. Lo primero que sugiere cualquiera al ver eso es
añadir un workflow de GitHub Actions.

Se hizo, y se retiró deliberadamente el 2026-08-06.

Esta ADR existe porque **es la decisión que más probablemente se deshaga por reflejo**: no
hay ningún archivo que explique una ausencia, y un colaborador nuevo —o un asistente de
IA— vería un repositorio sin CI y lo leería como un descuido.

## Decisión

No hay CI. Ni GitHub Actions ni pipeline de ningún proveedor, y no deben proponerse. La
puerta de calidad es un comando local, uno por repositorio:

```bash
pnpm verify
```

En el backend encadena `prisma generate → prisma migrate deploy → check → test:coverage →
build → smoke`; en el frontend, `check → lint → test:coverage → build`. El paso `smoke`
arranca `dist/server.js` de verdad y consulta `/api/v1/health`, porque `tsc` puede compilar
un build que no arranca — es literalmente el fallo que costó la tarea T0-01.

Consecuencia práctica de la misma decisión: `playwright.config.ts` **no** depende de
`process.env.CI`. Las opciones que suelen condicionarse a ese flag —`forbidOnly`,
`retries`— están fijadas para ejecución local.

## Consecuencias

- **Nada impide subir código que no pasa `verify`.** La disciplina la pone quien hace el
  commit. A cambio, el ciclo de verificación es de segundos y no depende de que la
  ejecución de un proveedor esté disponible.
- **Los umbrales de cobertura son el sustituto del CI**, y por eso están en
  `jest.config.js` y en la configuración de Vitest en vez de en un workflow: `verify` falla
  si la cobertura baja del suelo (85 % backend, 42 % frontend), esté donde esté ejecutándose.
- **Al trabajar desde varias máquinas** —que es el caso, ver la nota de `.agents/` en el
  README— hay que ejecutar `verify` en la que se vaya a hacer el commit. Nadie lo hará por
  ti después.
- Si algún día se reintroduce CI, esta entrada se marca **sustituida** y se enlaza a la
  nueva. Reaparecer sin más un `.github/workflows/` deja el registro mintiendo.
