import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import type { CreateCategoryInput, UpdateCategoryInput } from "@/modules/categories/categories.validator";

export const categoriesService = {
    async getAll() {
        return prisma.category.findMany({ orderBy: { name: "asc" } });
    },

    async getById(id: string) {
        const category = await prisma.category.findUnique({ where: { id } });
        if (!category) throw new HttpError(404, "Categoría no encontrada");
        return category;
    },

    async create(dto: CreateCategoryInput) {
        const existing = await prisma.category.findUnique({ where: { name: dto.name } });
        if (existing) throw new HttpError(409, "Ya existe una categoría con ese nombre");

        return prisma.category.create({ data: dto });
    },

    async update(id: string, dto: UpdateCategoryInput) {
        await categoriesService.getById(id);

        const taken = await prisma.category.findFirst({ where: { name: dto.name, NOT: { id } } });
        if (taken) throw new HttpError(409, "Ya existe una categoría con ese nombre");

        return prisma.category.update({ where: { id }, data: dto });
    },

    async delete(id: string) {
        await categoriesService.getById(id);
        // onDelete: SetNull en el schema pone categoryId = null en los productos que la usen
        await prisma.category.delete({ where: { id } });
    },
};
