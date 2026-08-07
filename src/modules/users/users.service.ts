import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import { parsePagination } from "@/shared/lib/pagination";

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

        const where = {
            ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
            ...(query.role && { role: query.role }),
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

    async getById(id: string) {
        const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
        if (!user) throw new HttpError(404, "Usuario no encontrado");
        return user;
    },

    async updateRole(id: string, role: string, requesterId: string) {
        if (id === requesterId) throw new HttpError(400, "No puedes cambiar tu propio rol");
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) throw new HttpError(404, "Usuario no encontrado");
        return prisma.user.update({ where: { id }, data: { role }, select: USER_SELECT });
    },

    async setActive(id: string, isActive: boolean, requesterId: string) {
        if (id === requesterId) throw new HttpError(400, "No puedes desactivar tu propia cuenta");
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) throw new HttpError(404, "Usuario no encontrado");

        // Invalidate session when deactivating
        const data: Record<string, unknown> = { isActive };
        if (!isActive) {
            data.refreshToken = null;
            data.refreshExpires = null;
        }

        return prisma.user.update({ where: { id }, data, select: USER_SELECT });
    },
};
