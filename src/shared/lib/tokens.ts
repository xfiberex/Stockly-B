import crypto from "crypto";

// Genera un token aleatorio y su hash SHA-256.
// El token en claro se envía al usuario (email); solo el hash se guarda en BD.
// Esto evita que un dump de BD permita usar tokens activos.
export function generateToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    return { raw, hash };
}

export function hashToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
}
