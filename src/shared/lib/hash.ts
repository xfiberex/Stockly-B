import bcrypt from "bcryptjs";

// 4 rounds en test para que los tests sean rápidos; 12 en producción (recomendado OWASP)
const SALT_ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);
export const comparePassword = (plain: string, hashed: string) => bcrypt.compare(plain, hashed);