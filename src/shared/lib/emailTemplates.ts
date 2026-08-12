// Plantillas de correo con layout basado en tablas, compatible con los
// principales gestores (Gmail, Outlook, Apple Mail, Yahoo) y responsive.
// La paleta coincide con la UI del frontend (blue-600 como color de marca).
//
// **Aquí no se escribe texto** (T4-12): el armazón pone la estructura y los estilos, y todo
// lo que se lee sale del catálogo de `shared/i18n/correos.es.ts`.

import { traducirCorreo, etiquetaDeIdioma, type Idioma } from "@/shared/i18n/correos";

export const BRAND = {
    name: "Stockly",
    color: "#2563eb", // blue-600
    colorDark: "#1d4ed8", // blue-700
    pageBg: "#f3f4f6", // gray-100
    cardBg: "#ffffff",
    text: "#111827", // gray-900
    muted: "#6b7280", // gray-500
    border: "#e5e7eb", // gray-200
    year: new Date().getFullYear(),
};

// Botón "bulletproof": ancho y alto fijos vía line-height para que Outlook lo
// renderice sin VML. `href` proviene del backend (confiable); `label` es estático.
export function emailButton(href: string, label: string): string {
    return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:8px auto 4px;">
        <tr>
            <td align="center" style="border-radius:8px;background:${BRAND.color};">
                <a href="${href}" target="_blank" rel="noopener"
                   style="background:${BRAND.color};border:1px solid ${BRAND.color};border-radius:8px;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:44px;text-align:center;text-decoration:none;width:260px;-webkit-text-size-adjust:none;">${label}</a>
            </td>
        </tr>
    </table>`;
}

interface EmailOptions {
    preheader: string; // texto de vista previa (oculto en el cuerpo)
    heading: string;
    bodyHtml: string; // contenido ya escapado / seguro
    /**
     * Idioma del destinatario (T4-12). Decide el `lang` del documento **y el pie**, que es
     * la única frase que no viene del cuerpo: estaba escrita aquí en español y salía así
     * aunque el resto del correo fuera inglés.
     */
    idioma: Idioma;
}

export function renderEmail({ preheader, heading, bodyHtml, idioma }: EmailOptions): string {
    return `<!DOCTYPE html>
<html lang="${etiquetaDeIdioma(idioma)}" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${BRAND.name}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.pageBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.pageBg};">
        <tr>
            <td align="center" style="padding:24px 12px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:100%;">
                    <!-- Cabecera de marca -->
                    <tr>
                        <td align="center" style="padding:8px 0 20px;">
                            <span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:${BRAND.color};letter-spacing:-0.5px;">◆ ${BRAND.name}</span>
                        </td>
                    </tr>
                    <!-- Tarjeta -->
                    <tr>
                        <td style="background-color:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:12px;padding:32px;">
                            <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:${BRAND.text};">${heading}</h1>
                            ${bodyHtml}
                        </td>
                    </tr>
                    <!-- Pie -->
                    <tr>
                        <td align="center" style="padding:20px 12px;">
                            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${BRAND.muted};">
                                ${traducirCorreo(idioma, "comun.pie", { marca: BRAND.name })}<br />
                                © ${BRAND.year} ${BRAND.name} · ${traducirCorreo(idioma, "comun.pieLema")}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

// Párrafo estándar reutilizable para el cuerpo.
export function emailParagraph(html: string): string {
    return `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:${BRAND.text};">${html}</p>`;
}

// Nota secundaria (expiración de enlaces, avisos).
export function emailNote(html: string): string {
    return `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:${BRAND.muted};">${html}</p>`;
}
