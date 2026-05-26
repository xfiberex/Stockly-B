import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

// Define el payload del JWT
export interface JwtPayload {
  userId: string;
}

// Función para generar un token JWT
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn } as jwt.SignOptions);
}

// Función para verificar un token JWT
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwt.secret) as JwtPayload;
}