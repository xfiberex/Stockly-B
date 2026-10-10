import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { parsePagination } from "@/shared/lib/pagination";
import { filtroDeEnum } from "@/shared/lib/enums";
import { $Enums, Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/shared/lib/hash";
import { generateToken } from "@/shared/lib/tokens";
import { requireSmtp, sendInvitationEmail } from "@/shared/lib/nodemailer";
import type { Idioma } from "@/shared/i18n/correos";

/**
 * T6-10 — lo que dura el enlace de una invitación. La hora de «olvidé mi contraseña» es poco:
 * quien la recibe no la ha pedido y puede tardar días en abrir el correo.
 */
export const DIAS_DE_INVITACION = 7;

const correoYaRegistrado = () => new HttpError(409, "El correo ya está registrado", "EMAIL_ALREADY_REGISTERED");

const USER_SELECT = {
    id: true,
    name: true,
    email: true,
    role: true,
    isActive: true,
    isVerified: true,
    createdAt: true,
    updatedAt: true,
} as const;

export const usersService = {
    async getAll(query: { page?: string; limit?: string; search?: string; role?: string; isActive?: string }) {
        const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });

        const isActiveFilter =
            query.isActive === "false" ? false
            : query.isActive === "true" ? true
            : undefined;

        const role = filtroDeEnum($Enums.Role, query.role, "role");

        const where = {
            ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
            ...(role && { role }),
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" as const } },
                    { email: { contains: query.search, mode: "insensitive" as const } },
                ],
            }),
        };

        const [users, total] = await prisma.$transaction([
            prisma.user.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, select: USER_SELECT }),
            prisma.user.count({ where }),
        ]);

        return { data: users, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    },

    /**
     * T6-10 — alta por invitación. Crea la cuenta con su rol y manda un enlace para que la
     * persona ponga su contraseña; **ninguna contraseña viaja por correo**. El enlace es el
     * token de restablecimiento, con otra caducidad, y `resetPassword` verifica la cuenta al
     * usarlo: abrirlo demuestra que el buzón es suyo.
     */
    async invite(datos: { name: string; email: string; role: $Enums.Role }, idioma: Idioma) {
        // Antes de crear nada: una cuenta creada y sin correo no se podría volver a invitar.
        requireSmtp();

        const existente = await prisma.user.findUnique({ where: { email: datos.email } });
        if (existente) throw correoYaRegistrado();

        // `password` es obligatorio. Nace con el hash de un secreto que nadie conoce —ni se
        // devuelve ni se guarda en claro—, no con una cadena vacía.
        const password = await hashPassword(generateToken().raw);
        const { raw, hash } = generateToken();
        const resetExpires = new Date(Date.now() + DIAS_DE_INVITACION * 24 * 60 * 60 * 1000);

        let user;
        try {
            user = await prisma.user.create({
                data: { ...datos, password, idioma, resetToken: hash, resetExpires },
                select: USER_SELECT,
            });
        } catch (error) {
            // Dos invitaciones a la vez al mismo correo: la segunda choca con el índice único.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw correoYaRegistrado();
            throw error;
        }

        // Fuera de cualquier transacción (ADR 0004), pero **esperado**: aquí el correo no es un
        // aviso accesorio, es la única forma de entrar. Si no sale, la cuenta se retira para que
        // el administrador pueda repetir la invitación, y se devuelve el error del envío.
        try {
            await sendInvitationEmail(user.email, user.name, raw, DIAS_DE_INVITACION, idioma);
        } catch (error) {
            await prisma.user.deleteMany({ where: { id: user.id, resetToken: hash } });
            throw error;
        }

        return user;
    },

    async getById(id: string) {
        const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
        if (!user) throw new HttpError(404, "Usuario no encontrado", "USER_NOT_FOUND");
        return user;
    },

    async updateRole(id: string, role: $Enums.Role, requesterId: string) {
        if (id === requesterId) throw new HttpError(400, "No puedes cambiar tu propio rol", "CANNOT_CHANGE_OWN_ROLE");
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) throw new HttpError(404, "Usuario no encontrado", "USER_NOT_FOUND");
        return prisma.user.update({ where: { id }, data: { role }, select: USER_SELECT });
    },

    async setActive(id: string, isActive: boolean, requesterId: string) {
        if (id === requesterId) throw new HttpError(400, "No puedes desactivar tu propia cuenta", "CANNOT_DEACTIVATE_OWN_ACCOUNT");
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) throw new HttpError(404, "Usuario no encontrado", "USER_NOT_FOUND");

        // Al desactivar la cuenta se invalida la sesión
        const data: Record<string, unknown> = { isActive };
        if (!isActive) {
            data.refreshToken = null;
            data.refreshExpires = null;
        }

        return prisma.user.update({ where: { id }, data, select: USER_SELECT });
    },
};
