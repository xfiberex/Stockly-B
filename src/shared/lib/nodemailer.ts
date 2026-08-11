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

export async function sendVerificationEmail(to: string, name: string, token: string) {
    requireSmtp();
    const url =`${env.frontendUrl}/auth/confirm-account?token=${token}`;
    const safeName = escapeHtml(name);

    const bodyHtml =
        emailParagraph(`Hola <strong>${safeName}</strong>,`) +
        emailParagraph("Gracias por registrarte en Stockly. Confirma tu cuenta para empezar a gestionar tu inventario.") +
        emailButton(url, "Verificar cuenta") +
        emailNote("El enlace expira en 24 horas. Si no creaste esta cuenta, puedes ignorar este correo.");

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: "Verifica tu cuenta — Stockly",
        html: renderEmail({
            preheader: "Confirma tu cuenta de Stockly para empezar.",
            heading: "Verifica tu cuenta",
            bodyHtml,
        }),
    });
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
    requireSmtp();
    const url =`${env.frontendUrl}/auth/reset-password?token=${token}`;
    const safeName = escapeHtml(name);

    const bodyHtml =
        emailParagraph(`Hola <strong>${safeName}</strong>,`) +
        emailParagraph("Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para elegir una nueva.") +
        emailButton(url, "Restablecer contraseña") +
        emailNote("El enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo y tu contraseña seguirá siendo la misma.");

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: "Restablecer contraseña — Stockly",
        html: renderEmail({
            preheader: "Restablece la contraseña de tu cuenta de Stockly.",
            heading: "Restablecer contraseña",
            bodyHtml,
        }),
    });
}

export async function sendLowStockAlertEmail(
    to: string,
    adminName: string,
    productName: string,
    currentStock: number,
    minStock: number,
) {
    requireSmtp();
    const safeAdmin =escapeHtml(adminName);
    const safeProduct = escapeHtml(productName);
    const url = `${env.frontendUrl}/products`;

    // Tabla de datos con estilos inline (email-safe).
    const stockTable = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:4px 0 8px;border:1px solid ${BRAND.border};border-radius:8px;">
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">Producto</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${BRAND.text};border-bottom:1px solid ${BRAND.border};">${safeProduct}</td>
        </tr>
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">Stock actual</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#b91c1c;border-bottom:1px solid ${BRAND.border};">${currentStock}</td>
        </tr>
        <tr>
            <td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.muted};">Stock mínimo</td>
            <td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${BRAND.text};">${minStock}</td>
        </tr>
    </table>`;

    const bodyHtml =
        emailParagraph(`Hola <strong>${safeAdmin}</strong>,`) +
        emailParagraph(`El producto <strong>${safeProduct}</strong> alcanzó un nivel de stock bajo y podría requerir reabastecimiento.`) +
        stockTable +
        emailButton(url, "Ver productos") +
        emailNote("Puedes desactivar estas alertas en la sección <strong>Configuración</strong> de Stockly.");

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: `⚠️ Alerta de bajo stock: ${productName} — Stockly`,
        html: renderEmail({
            preheader: `${safeProduct} está en ${currentStock} unidades (mínimo ${minStock}).`,
            heading: "Alerta de bajo stock",
            bodyHtml,
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
) {
    requireSmtp();
    const safeAdmin = escapeHtml(adminName);

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
        emailParagraph(`Hola <strong>${safeAdmin}</strong>,`) +
        emailParagraph(
            `El servidor devolvió <strong>${resumen.total} errores 5xx</strong> en los últimos ` +
                `${resumen.ventanaMinutos} minutos. Estas son las rutas afectadas:`,
        ) +
        tabla +
        (resumen.requestId
            ? emailNote(
                `Para investigar, busca en el registro por <strong>${escapeHtml(resumen.requestId)}</strong>: ` +
                    "es el identificador de una de las peticiones que falló y recupera todas sus líneas.",
            )
            : "") +
        emailNote("No se repetirá este aviso durante el periodo de enfriamiento, aunque los errores continúen.");

    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: `🚨 Pico de errores 5xx: ${resumen.total} en ${resumen.ventanaMinutos} min — Stockly`,
        html: renderEmail({
            preheader: `${resumen.total} errores 5xx en ${resumen.ventanaMinutos} minutos.`,
            heading: "Pico de errores del servidor",
            bodyHtml,
        }),
    });
}
