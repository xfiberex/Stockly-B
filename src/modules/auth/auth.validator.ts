import { z } from "zod";

const emailField = z.string().trim().toLowerCase().email("El correo electrónico no es válido");

// Contraseña mínima: 8 chars, al menos 1 mayúscula, 1 minúscula y 1 número
const passwordField = (label = "La contraseña") =>
    z.string()
        .min(8, `${label} debe tener al menos 8 caracteres`)
        .regex(/[A-Z]/, `${label} debe contener al menos una mayúscula`)
        .regex(/[a-z]/, `${label} debe contener al menos una minúscula`)
        .regex(/[0-9]/, `${label} debe contener al menos un número`);

export const registerSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(80, "El nombre no puede superar 80 caracteres"),
    email: emailField,
    password: passwordField(),
});

export const loginSchema = z.object({
    email: emailField,
    password: z.string().min(1, "La contraseña es obligatoria"),
});

export const emailSchema = z.object({
    email: emailField,
});

export const verifyEmailSchema = z.object({
    token: z.string().min(1, "El token es obligatorio"),
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1, "El token es obligatorio"),
    password: passwordField(),
});

export const updateProfileSchema = z.object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(80, "El nombre no puede superar 80 caracteres"),
    email: emailField,
});

export const updatePasswordSchema = z.object({
    currentPassword: z.string().min(1, "La contraseña actual es obligatoria"),
    password: passwordField("La nueva contraseña"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;