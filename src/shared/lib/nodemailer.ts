import nodemailer from "nodemailer";
import { env } from "@/config/env";
import { HttpError } from "@/shared/lib/httpError";
import {
    BRAND,
    renderEmail,
    emailButton,
    emailParagraph,
    emailNote,
} from "@/shared/lib/emailTemplates";
import {
    traducirCorreo,
    type Idioma,
    type ClaveDeCorreo,
    type Valores,
} from "@/shared/i18n/correos";

/**
 * T4-12 — **ningún texto de correo se escribe en este archivo.** Cada función recibe el
 * `idioma` de su destinatario —`users.idioma`— y saca de ahí el asunto, el preencabezado, el
 * título, el cuerpo, el rótulo del botón y las notas.
 *
 * El `idioma` es un parámetro obligatorio y no tiene valor por defecto **a propósito**: con
 * uno, cualquier sitio que se olvide de pasarlo compila y manda el correo en español, que es
 * exactamente el fallo de partida. Sin él, `tsc` señala cada llamada.
 */

/**
 * El traductor de un correo, con la marca ya puesta.
 *
 * `{marca}` aparece en casi todas las frases —asuntos, preencabezados, pie— y siempre vale
 * lo mismo; pasarlo en cada llamada es la clase de repetición que se olvida en una y deja un
 * `{marca}` literal en el asunto de un correo real.
 */
function traductorDeCorreo(idioma: Idioma) {
    return (clave: ClaveDeCorreo, valores?: Valores) =>
        traducirCorreo(idioma, clave, { marca: BRAND.name, ...valores });
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Sin `secure` ni `requireTLS`, Nodemailer negocia STARTTLS de forma oportunista y
// sigue en claro si el servidor no lo anuncia: por ahí se irían las credenciales SMTP
// y los tokens de verificación y de reset que viajan en el cuerpo del correo.
// `secure: true` es TLS implícito (puerto 465); en los demás puertos `requireTLS`
// obliga a STARTTLS y aborta el envío si el servidor no lo ofrece.
export const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    requireTLS: true,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
});

// Sin credenciales SMTP el servidor arranca igual (T1-26). El fallo se produce aquí,
// al intentar enviar, con un mensaje que dice qué falta.
function requireSmtp(): void {
    if (!env.smtp.configured) {
        throw new HttpError(
            503,
            "El envío de correo no está configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM en el .env.",
            "EMAIL_NOT_CONFIGURED",
        );
    }
}

export async function sendVerificationEmail(to: string, name: string, token: string, idioma: Idioma) {
    requireSmtp();
    const url =`${env.frontendUrl}/auth/confirm-account?token=${token}`;
    const t = traductorDeCorreo(idioma);

    const bodyHtml =
        emailParagraph(t("comun.saludo", { nombre: escapeHtml(name) })) +
        emailParagraph(t("verificacion.cuerpo")) +
        emailButton(url, t("verificacion.boton")) +
        emailNote(t("verificacion.nota"));

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: t("verificacion.asunto"),
        html: renderEmail({
            preheader: t("verificacion.preencabezado"),
            heading: t("verificacion.titulo"),
            bodyHtml,
            idioma,
        }),
    });
}

export async function sendPasswordResetEmail(to: string, name: string, token: string, idioma: Idioma) {
    requireSmtp();
    const url =`${env.frontendUrl}/auth/reset-password?token=${token}`;
    const t = traductorDeCorreo(idioma);

    const bodyHtml =
        emailParagraph(t("comun.saludo", { nombre: escapeHtml(name) })) +
        emailParagraph(t("reset.cuerpo")) +
        emailButton(url, t("reset.boton")) +
        emailNote(t("reset.nota"));

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: t("reset.asunto"),
        html: renderEmail({
            preheader: t("reset.preencabezado"),
            heading: t("reset.titulo"),
            bodyHtml,
            idioma,
        }),
    });
}

export async function sendLowStockAlertEmail(
    to: string,
    adminName: string,
    productName: string,
    currentStock: number,
    minStock: number,
    idioma: Idioma,
) {
    requireSmtp();
    const safeProduct = escapeHtml(productName);
    const url = `${env.frontendUrl}/products`;
    const t = traductorDeCorreo(idioma);

    // Tabla de datos con estilos inline (email-safe). Los rótulos de la columna izquierda
    // también se traducen: son texto, no datos.
    const stockTable = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:4px 0 8px;border:1px solid ${BRAND.border};border-radius:8px;">
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${t("stock.filaProducto")}</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${BRAND.text};border-bottom:1px solid ${BRAND.border};">${safeProduct}</td>
        </tr>
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${t("stock.filaActual")}</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#b91c1c;border-bottom:1px solid ${BRAND.border};">${currentStock}</td>
        </tr>
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};">${t("stock.filaMinimo")}</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${BRAND.text};">${minStock}</td>
        </tr>
    </table>`;

    const bodyHtml =
        emailParagraph(t("comun.saludo", { nombre: escapeHtml(adminName) })) +
        emailParagraph(t("stock.cuerpo", { producto: safeProduct })) +
        stockTable +
        emailButton(url, t("stock.boton")) +
        emailNote(t("stock.nota"));

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        // El asunto es texto plano: va el nombre sin escapar, porque `&amp;` en la bandeja
        // de entrada se lee como lo que es, un error.
        subject: t("stock.asunto", { producto: productName }),
        html: renderEmail({
            preheader: t("stock.preencabezado", { producto: safeProduct, actual: currentStock, minimo: minStock }),
            heading: t("stock.titulo"),
            bodyHtml,
            idioma,
        }),
    });
}

/**
 * Aviso de pico de errores 5xx (T4-06).
 *
 * A diferencia del resto de correos de este archivo, este **no lo provoca una persona**:
 * lo dispara el propio servidor al detectar que está fallando. Por eso dice qué mirar y
 * dónde —las rutas afectadas y un `requestId` con el que recuperar la traza entera— en vez
 * de mandar a nadie a la interfaz: cuando llega esto, la interfaz es lo que no funciona.
 */
export async function sendServerErrorAlertEmail(
    to: string,
    adminName: string,
    resumen: {
        total: number;
        ventanaMinutos: number;
        rutas: Array<{ ruta: string; total: number }>;
        requestId?: string;
    },
    idioma: Idioma,
) {
    requireSmtp();
    const t = traductorDeCorreo(idioma);

    const filas = resumen.rutas
        .slice(0, 5)
        .map(
            ({ ruta, total }) => `
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${escapeHtml(ruta)}</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#b91c1c;border-bottom:1px solid ${BRAND.border};">${total}</td>
        </tr>`,
        )
        .join("");

    const tabla = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:4px 0 8px;border:1px solid ${BRAND.border};border-radius:8px;">
        ${filas}
    </table>`;

    const bodyHtml =
        emailParagraph(t("comun.saludo", { nombre: escapeHtml(adminName) })) +
        emailParagraph(t("errores.cuerpo", { total: resumen.total, minutos: resumen.ventanaMinutos })) +
        tabla +
        (resumen.requestId
            ? emailNote(t("errores.notaTraza", { requestId: escapeHtml(resumen.requestId) }))
            : "") +
        emailNote(t("errores.notaEnfriamiento"));

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: t("errores.asunto", { total: resumen.total, minutos: resumen.ventanaMinutos }),
        html: renderEmail({
            preheader: t("errores.preencabezado", { total: resumen.total, minutos: resumen.ventanaMinutos }),
            heading: t("errores.titulo"),
            bodyHtml,
            idioma,
        }),
    });
}
