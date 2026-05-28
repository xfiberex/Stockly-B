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
