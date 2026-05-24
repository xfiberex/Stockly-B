import { body } from "express-validator";

const VALID_CATEGORIES = [
    "Electrónica",
    "Periféricos",
    "Audio",
    "Accesorios",
    "Muebles",
    "Otros",
];

export const createProductValidators = [
    body("name")
        .trim()
        .notEmpty()
        .withMessage("El nombre es obligatorio")
        .isLength({ max: 200 })
        .withMessage("El nombre no puede superar 200 caracteres"),

    body("description")
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage("La descripción no puede superar 1000 caracteres"),

    body("price")
        .notEmpty()
        .withMessage("El precio es obligatorio")
        .isFloat({ min: 0.01 })
        .withMessage("El precio debe ser un número mayor a 0"),

    body("stock")
        .optional()
        .isInt({ min: 0 })
        .withMessage("El stock debe ser un entero mayor o igual a 0"),

    body("category")
        .trim()
        .notEmpty()
        .withMessage("La categoría es obligatoria")
        .isIn(VALID_CATEGORIES)
        .withMessage(`Categoría inválida. Opciones: ${VALID_CATEGORIES.join(", ")}`,),
];

export const updateProductValidators = [
    body("name")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("El nombre no puede estar vacío")
        .isLength({ max: 200 })
        .withMessage("El nombre no puede superar 200 caracteres"),

    body("description")
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage("La descripción no puede superar 1000 caracteres"),

    body("price")
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage("El precio debe ser un número mayor a 0"),

    body("stock")
        .optional()
        .isInt({ min: 0 })
        .withMessage("El stock debe ser un entero mayor o igual a 0"),

    body("category")
        .optional()
        .trim()
        .isIn(VALID_CATEGORIES)
        .withMessage(`Categoría inválida. Opciones: ${VALID_CATEGORIES.join(", ")}`,),
];