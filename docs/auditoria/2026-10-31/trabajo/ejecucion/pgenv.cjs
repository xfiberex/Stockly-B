// Convierte DATABASE_URL en variables PG* para psql (se usa con `eval`). No imprime nada más.
const u = new URL(process.env.DATABASE_URL);
const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const pw = decodeURIComponent(u.password);
const vars = {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: pw,
};
for (const [k, v] of Object.entries(vars)) console.log(`export ${k}=${q(v)}`);
