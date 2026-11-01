# Lee la salida de `git log -p -U0 --format='@@C %h %ad'` y agrega las líneas AÑADIDAS que
# parecen secretos. Nunca imprime un valor: como mucho sus 4 primeros caracteres y su longitud.
# Sustituto parcial de gitleaks (auditoría 2026-10-31): menos reglas y sin entropía.
function mask(v) { return (length(v) <= 4 ? "****" : substr(v, 1, 4) "…(" length(v) ")") }
function apunta(regla, valor,   k) {
  k = regla SUBSEP f SUBSEP mask(valor)
  if (!(k in primero)) { primero[k] = c " " d; orden[++n] = k }
  if (!((k, c) in visto)) { visto[k, c] = 1; veces[k]++ }
}
/^@@C / { c = $2; d = $3; next }
/^\+\+\+ / { f = $0; sub(/^\+\+\+ (b\/)?/, "", f); next }
/^\+/ {
  l = substr($0, 2)
  if (match(l, /-----BEGIN [A-Z ]*PRIVATE KEY-----/)) apunta("clave-privada", "BEGIN-PRIVATE-KEY")
  if (match(l, /AKIA[0-9A-Z]{16}/)) apunta("aws", substr(l, RSTART, RLENGTH))
  if (match(l, /sk_(live|test)_[0-9A-Za-z]{10,}/)) apunta("stripe", substr(l, RSTART, RLENGTH))
  if (match(l, /(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/)) apunta("github", substr(l, RSTART, RLENGTH))
  if (match(l, /AIza[0-9A-Za-z_-]{35}/)) apunta("google", substr(l, RSTART, RLENGTH))
  if (match(l, /xox[baprs]-[0-9A-Za-z-]{10,}/)) apunta("slack", substr(l, RSTART, RLENGTH))
  if (match(l, /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/)) apunta("jwt", substr(l, RSTART, RLENGTH))
  if (match(l, /(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp|smtps?):\/\/[^:\/@ "']+:[^@ "']+@/)) {
    u = substr(l, RSTART, RLENGTH); sub(/^[a-z+]+:\/\/[^:]+:/, "", u); sub(/@$/, "", u)
    apunta("url-con-credenciales", u)
  }
  if (match(l, /cloudinary:\/\/[0-9]+:[^@ "']+@/)) {
    u = substr(l, RSTART, RLENGTH); sub(/^cloudinary:\/\/[0-9]+:/, "", u); sub(/@$/, "", u)
    apunta("cloudinary-url", u)
  }
  if (match(l, /(JWT_SECRET|SMTP_PASS|CLOUDINARY_API_SECRET|CLOUDINARY_API_KEY|METRICS_TOKEN|POSTGRES_PASSWORD|SECRET_KEY|API_KEY)[ \t]*[=:][ \t]*["']?[^"' \t,;)]{6,}/)) {
    u = substr(l, RSTART, RLENGTH); nombre = u; sub(/[ \t]*[=:].*/, "", nombre)
    sub(/^[^=:]*[=:][ \t]*["']?/, "", u)
    apunta("asignacion:" nombre, u)
  }
  if (match(l, /[Pp][Aa][Ss][Ss]([Ww][Oo][Rr][Dd])?[A-Za-z_]*["']?[ \t]*[=:][ \t]*["'][^"']{8,}["']/)) {
    u = substr(l, RSTART, RLENGTH); sub(/^[^=:]*[=:][ \t]*["']/, "", u); sub(/["']$/, "", u)
    apunta("contrasena-literal", u)
  }
}
END {
  printf "| Regla | Archivo | Valor (enmascarado) | Primera aparición | Commits |\n|---|---|---|---|---|\n"
  for (i = 1; i <= n; i++) {
    split(orden[i], p, SUBSEP)
    printf "| %s | `%s` | `%s` | %s | %d |\n", p[1], p[2], p[3], primero[orden[i]], veces[orden[i]]
  }
  printf "\nTotal: %d combinaciones distintas de regla, archivo y valor.\n", n
}
