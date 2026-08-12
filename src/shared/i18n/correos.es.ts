/**
 * Catálogo de los correos, en español (T4-12). **Este archivo manda.**
 *
 * Mismo trato que `Stockly-F/src/shared/i18n/es.ts`: aquí están todas las claves y
 * `correos.en.ts` es un `Record` sobre ellas, así que una traducción que falte **no
 * compila**. La diferencia con el frontend es qué se traduce: allí, lo que se pinta; aquí,
 * el asunto, el texto de vista previa, el título y el cuerpo de cada correo — el asunto y
 * el preencabezado son lo único que se lee en la bandeja de entrada, y quedarse en español
 * ahí es exactamente el fallo que esta tarea viene a arreglar.
 *
 * Los huecos van entre llaves: `{nombre}`. **Nunca se compone una frase concatenando
 * trozos** — el orden de las palabras cambia con el idioma, y una frase partida en dos no
 * se puede traducir sin rehacerla.
 */
export const correosEs = {
    // ── Comunes a todos los correos ──────────────────────────────────────────
    "comun.saludo": "Hola <strong>{nombre}</strong>,",
    "comun.pie": "Este es un correo automático de {marca}, por favor no respondas a este mensaje.",
    "comun.pieLema": "Gestión de inventario",

    // ── Verificación de cuenta ───────────────────────────────────────────────
    "verificacion.asunto": "Verifica tu cuenta — {marca}",
    "verificacion.preencabezado": "Confirma tu cuenta de {marca} para empezar.",
    "verificacion.titulo": "Verifica tu cuenta",
    "verificacion.cuerpo": "Gracias por registrarte en {marca}. Confirma tu cuenta para empezar a gestionar tu inventario.",
    "verificacion.boton": "Verificar cuenta",
    "verificacion.nota": "El enlace expira en 24 horas. Si no creaste esta cuenta, puedes ignorar este correo.",

    // ── Restablecer contraseña ───────────────────────────────────────────────
    "reset.asunto": "Restablecer contraseña — {marca}",
    "reset.preencabezado": "Restablece la contraseña de tu cuenta de {marca}.",
    "reset.titulo": "Restablecer contraseña",
    "reset.cuerpo": "Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para elegir una nueva.",
    "reset.boton": "Restablecer contraseña",
    "reset.nota": "El enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo y tu contraseña seguirá siendo la misma.",

    // ── Alerta de bajo stock ─────────────────────────────────────────────────
    "stock.asunto": "⚠️ Alerta de bajo stock: {producto} — {marca}",
    "stock.preencabezado": "{producto} está en {actual} unidades (mínimo {minimo}).",
    "stock.titulo": "Alerta de bajo stock",
    "stock.cuerpo": "El producto <strong>{producto}</strong> alcanzó un nivel de stock bajo y podría requerir reabastecimiento.",
    "stock.filaProducto": "Producto",
    "stock.filaActual": "Stock actual",
    "stock.filaMinimo": "Stock mínimo",
    "stock.boton": "Ver productos",
    "stock.nota": "Puedes desactivar estas alertas en la sección <strong>Configuración</strong> de {marca}.",

    // ── Pico de errores 5xx (T4-06) ──────────────────────────────────────────
    "errores.asunto": "🚨 Pico de errores 5xx: {total} en {minutos} min — {marca}",
    "errores.preencabezado": "{total} errores 5xx en {minutos} minutos.",
    "errores.titulo": "Pico de errores del servidor",
    "errores.cuerpo": "El servidor devolvió <strong>{total} errores 5xx</strong> en los últimos {minutos} minutos. Estas son las rutas afectadas:",
    "errores.notaTraza": "Para investigar, busca en el registro por <strong>{requestId}</strong>: es el identificador de una de las peticiones que falló y recupera todas sus líneas.",
    "errores.notaEnfriamiento": "No se repetirá este aviso durante el periodo de enfriamiento, aunque los errores continúen.",
} as const;

export type ClaveDeCorreo = keyof typeof correosEs;
