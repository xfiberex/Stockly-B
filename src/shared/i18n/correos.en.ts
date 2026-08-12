import type { ClaveDeCorreo } from "@/shared/i18n/correos.es";

/**
 * Catálogo de los correos, en inglés (T4-12).
 *
 * El tipo es `Record<ClaveDeCorreo, string>` y no un objeto suelto: **una clave nueva en
 * `correos.es.ts` sin su traducción aquí no compila**, que es la única forma de que un
 * correo no salga a medias en dos idiomas. Los huecos `{…}` son los mismos y con el mismo
 * nombre; el orden dentro de la frase puede cambiar, y por eso se interpolan por nombre y
 * no por posición.
 */
export const correosEn: Record<ClaveDeCorreo, string> = {
    "comun.saludo": "Hi <strong>{nombre}</strong>,",
    "comun.pie": "This is an automated message from {marca}, please do not reply to it.",
    "comun.pieLema": "Inventory management",

    "verificacion.asunto": "Verify your account — {marca}",
    "verificacion.preencabezado": "Confirm your {marca} account to get started.",
    "verificacion.titulo": "Verify your account",
    "verificacion.cuerpo": "Thanks for signing up to {marca}. Confirm your account to start managing your inventory.",
    "verificacion.boton": "Verify account",
    "verificacion.nota": "The link expires in 24 hours. If you did not create this account, you can ignore this email.",

    "reset.asunto": "Reset your password — {marca}",
    "reset.preencabezado": "Reset the password of your {marca} account.",
    "reset.titulo": "Reset your password",
    "reset.cuerpo": "We received a request to reset your account password. Click the button to choose a new one.",
    "reset.boton": "Reset password",
    "reset.nota": "The link expires in 1 hour. If you did not request this change, ignore this email and your password will stay the same.",

    "stock.asunto": "⚠️ Low stock alert: {producto} — {marca}",
    "stock.preencabezado": "{producto} is down to {actual} units (minimum {minimo}).",
    "stock.titulo": "Low stock alert",
    "stock.cuerpo": "The product <strong>{producto}</strong> reached a low stock level and may need restocking.",
    "stock.filaProducto": "Product",
    "stock.filaActual": "Current stock",
    "stock.filaMinimo": "Minimum stock",
    "stock.boton": "View products",
    "stock.nota": "You can turn these alerts off in the <strong>Settings</strong> section of {marca}.",

    "errores.asunto": "🚨 5xx error spike: {total} in {minutos} min — {marca}",
    "errores.preencabezado": "{total} 5xx errors in {minutos} minutes.",
    "errores.titulo": "Server error spike",
    "errores.cuerpo": "The server returned <strong>{total} 5xx errors</strong> in the last {minutos} minutes. These are the affected routes:",
    "errores.notaTraza": "To investigate, search the log for <strong>{requestId}</strong>: it is the identifier of one of the failed requests and pulls up all of its lines.",
    "errores.notaEnfriamiento": "This alert will not be repeated during the cooldown period, even if the errors continue.",
};
