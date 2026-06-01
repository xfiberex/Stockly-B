import nodemailer from "nodemailer";
import { env } from "@/config/env";

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
});

export async function sendVerificationEmail(to: string, name: string, token: string) {
    const url = `${env.frontendUrl}/auth/confirm-account?token=${token}`;
    const safeName = escapeHtml(name);
    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: "Verifica tu cuenta — Stockly",
        html: `
            <p>Hola ${safeName},</p>
            <p>Por favor, haz clic en el siguiente enlace para verificar tu cuenta:</p>
            <a href="${url}" target="_blank">Verificar cuenta</a>
            <p>El enlace expira en 24 horas.</p>
        `,
    });
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
    const url = `${env.frontendUrl}/auth/reset-password?token=${token}`;
    const safeName = escapeHtml(name);
    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: "Restablecer contraseña — Stockly",
        html: `
            <p>Hola ${safeName},</p>
            <p>Por favor, haz clic en el siguiente enlace para restablecer tu contraseña:</p>
            <a href="${url}" target="_blank">Restablecer contraseña</a>
            <p>El enlace expira en 1 hora.</p>
        `,
    });
}

export async function sendLowStockAlertEmail(
    to: string,
    adminName: string,
    productName: string,
    currentStock: number,
    minStock: number,
) {
    const safeAdmin = escapeHtml(adminName);
    const safeProduct = escapeHtml(productName);
    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: `⚠️ Alerta de bajo stock: ${safeProduct} — Stockly`,
        html: `
            <p>Hola ${safeAdmin},</p>
            <p>El producto <strong>${safeProduct}</strong> ha alcanzado un nivel de stock bajo.</p>
            <table style="border-collapse:collapse;margin-top:12px;">
                <tr>
                    <td style="padding:4px 12px 4px 0;color:#555;">Stock actual:</td>
                    <td style="padding:4px 0;font-weight:bold;color:#e53e3e;">${currentStock}</td>
                </tr>
                <tr>
                    <td style="padding:4px 12px 4px 0;color:#555;">Stock mínimo:</td>
                    <td style="padding:4px 0;">${minStock}</td>
                </tr>
            </table>
            <p style="margin-top:16px;">
                <a href="${env.frontendUrl}/products" target="_blank"
                   style="background:#3182ce;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;">
                    Ver productos
                </a>
            </p>
            <p style="margin-top:16px;color:#888;font-size:12px;">
                Puedes desactivar estas alertas en la sección <strong>Configuración</strong> de Stockly.
            </p>
        `,
    });
}
