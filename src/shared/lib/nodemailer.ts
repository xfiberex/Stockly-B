import nodemailer from "nodemailer";
import { env } from "@/config/env";

// Función para escapar caracteres HTML en el nombre del usuario
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Configura el transporter de nodemailer usando las variables de entorno
export const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    auth: { user: env.smtp.user, pass: env.smtp.pass },

    // Para usar un servicio de correo que requiere TLS, puedes agregar esta opción
    // secure: false, // true for 465, false for other ports
});

// Función para enviar el correo de verificación de cuenta
export async function sendVerificationEmail(to: string, name: string, token: string) {
    const url = `${env.frontendUrl}/auth/confirm-account?token=${token}`;
    const safeName = escapeHtml(name);
    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: "Verifica tu cuenta",
        html: `
            <p>Hola ${safeName},</p>
            <p>Por favor, haz clic en el siguiente enlace para verificar tu cuenta:</p>
            <a href="${url}" target="_blank">Verificar cuenta</a>
        `
    });
}

// Función para enviar el correo de restablecimiento de contraseña
export async function sendPasswordResetEmail(to: string, name: string, token: string) {
    const url = `${env.frontendUrl}/auth/reset-password?token=${token}`;
    const safeName = escapeHtml(name);
    await transporter.sendMail({
        from: env.smtp.from,
        to,
        subject: "Restablecer contraseña",
        html: `
            <p>Hola ${safeName},</p>
            <p>Por favor, haz clic en el siguiente enlace para restablecer tu contraseña:</p>
            <a href="${url}" target="_blank">Restablecer contraseña</a>
        `
    });
}