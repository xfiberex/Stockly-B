# Entorno de la verificación en ejecución (paso 1.3) de la auditoría 2026-10-31, sesión 4 (2026-11-01).
# Se carga con `source`. No imprime la URL ni credenciales: deriva la de la base aislada
# `stockly_auditoria` cambiando solo el nombre de la base, como hace `jest.setup.js` con `Stockly_test`.
_B="/c/Users/User/Desktop/Cursos y Proyectos/08 - Proyectos con el Stack PERN/Stockly - Gestor de Inventario Profesional/Stockly-B"
_URL=$(grep -m1 '^DATABASE_URL=' "$_B/.env" | cut -d= -f2- | tr -d '\r' | sed -E "s/^[\"']//; s/[\"']$//")
export DATABASE_URL=$(printf '%s' "$_URL" | sed -E 's#/[A-Za-z0-9_]+(\?.*)?$#/stockly_auditoria\1#')
export ADMIN_URL=$(printf '%s' "$_URL" | sed -E 's#/[A-Za-z0-9_]+(\?.*)?$#/postgres\1#')
unset _URL
# El seed borra todas las tablas de la base a la que apunte: nunca la de desarrollo.
case "$DATABASE_URL" in
  */stockly_auditoria|*/stockly_auditoria\?*) ;;
  *) echo "ABORTA: DATABASE_URL no apunta a stockly_auditoria" >&2; unset DATABASE_URL ADMIN_URL; return 1 ;;
esac
# Correo e imágenes a dominios reservados (RFC 2606): no sale nada. Mismos valores que jest.setup.js.
export SMTP_HOST=smtp.stockly.invalid SMTP_PORT=587 SMTP_USER=auditoria@stockly.invalid SMTP_PASS=no-es-una-contrasena
export SMTP_FROM='Stockly <no-reply@stockly.invalid>'
export CLOUDINARY_CLOUD_NAME=stockly-auditoria CLOUDINARY_API_KEY=$(printf %015d 0) CLOUDINARY_API_SECRET=no-es-un-secreto  # valores ficticios, los de jest.setup.js
export PSQL="/c/Program Files/PostgreSQL/17/bin/psql.exe"
export B="$_B" F="${_B%/Stockly-B}/Stockly-F"
export A="$_B/docs/auditoria/2026-10-31"
unset _B
# psql no entiende bien la URI en este equipo (intenta un socket «@localhost»): variables PG*.
eval "$(node "$A/trabajo/ejecucion/pgenv.cjs")"
export PGCLIENTENCODING=UTF8
