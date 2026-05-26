import { body } from 'express-validator';

// Validadores para el registro de usuarios
export const registerValidators = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("El nombre es obligatorio")
        .isLength({ max: 80 })
        .withMessage("El nombre no puede superar 80 caracteres"),

    body("email")
        .trim()
        .notEmpty()
        .withMessage("El correo electrónico es obligatorio")
        .isEmail()
        .withMessage("El correo electrónico no es válido")
        .normalizeEmail(),

    body("password")
        .notEmpty()
        .withMessage("La contraseña es obligatoria")
        .isLength({ min: 8 })
        .withMessage("La contraseña debe tener al menos 8 caracteres"),
]

// Validadores para el inicio de sesión
export const loginValidators = [
    body("email")
        .trim()
        .notEmpty()
        .withMessage("El correo electrónico es obligatorio")
        .isEmail()
        .withMessage("El correo electrónico no es válido")
        .normalizeEmail(),

    body("password")
        .notEmpty()
        .withMessage("La contraseña es obligatoria"),
]

// Validadores para la actualización del perfil
export const emailValidators = [
    body("email")
        .trim()
        .notEmpty()
        .withMessage("El correo electrónico es obligatorio")
        .isEmail()
        .withMessage("El correo electrónico no es válido")
        .normalizeEmail(),
]

// Validadores para la verificación del correo electrónico
export const verifyEmailValidators = [
    body("token")
        .notEmpty()
        .withMessage("El token es obligatorio"),
]

// Validadores para el restablecimiento de contraseña
export const resetPasswordValidators = [
    body("token")
        .notEmpty()
        .withMessage("El token es obligatorio"),

    body("password")
        .notEmpty()
        .withMessage("La contraseña es obligatoria")
        .isLength({ min: 8 })
        .withMessage("La contraseña debe tener al menos 8 caracteres"),
]