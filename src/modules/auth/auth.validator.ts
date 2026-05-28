import { z } from "zod";

// Schema para el registro de usuarios
export const registerSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(80, "El nombre no puede superar 80 caracteres"),
    email: z.string().trim().email("El correo electrónico no es válido"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

// Schema para el inicio de sesión
export const loginSchema = z.object({
    email: z.string().trim().email("El correo electrónico no es válido"),
    password: z.string().min(1, "La contraseña es obligatoria"),
});

// Schema para validar solo el correo (reenvío de verificación, forgot-password)
export const emailSchema = z.object({
    email: z.string().trim().email("El correo electrónico no es válido"),
});

// Schema para la verificación del correo electrónico
export const verifyEmailSchema = z.object({
    token: z.string().min(1, "El token es obligatorio"),
});

// Schema para el restablecimiento de contraseña
export const resetPasswordSchema = z.object({
    token: z.string().min(1, "El token es obligatorio"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

// Schema para la actualización de perfil (nombre y correo)
export const updateProfileSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(80, "El nombre no puede superar 80 caracteres"),
    email: z.string().trim().email("El correo electrónico no es válido"),
});

// Schema para el cambio de contraseña (requiere contraseña actual)
export const updatePasswordSchema = z.object({
    currentPassword: z.string().min(1, "La contraseña actual es obligatoria"),
    password: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
});

// Tipos inferidos para usar en controllers/services
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;