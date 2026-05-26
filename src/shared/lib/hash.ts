import bcrypt from "bcryptjs";

// Función para hashear una contraseña
export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

// Función para comparar una contraseña sin hash con una contraseña hasheada
export const comparePassword = (plain: string, hashed: string) => bcrypt.compare(plain, hashed);