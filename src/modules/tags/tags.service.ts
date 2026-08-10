import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import type { CreateTagInput, UpdateTagInput } from "./tags.validator";

export const tagsService = {
    async getAll() {
        return prisma.tag.findMany({ orderBy: { name: "asc" } });
    },

    async getById(id: string) {
        const tag = await prisma.tag.findUnique({ where: { id } });
        if (!tag) throw new HttpError(404, "Etiqueta no encontrada", "TAG_NOT_FOUND");
        return tag;
    },

    async create(dto: CreateTagInput) {
        const existing = await prisma.tag.findUnique({ where: { name: dto.name } });
        if (existing) throw new HttpError(409, "Ya existe una etiqueta con ese nombre", "TAG_NAME_EXISTS");
        return prisma.tag.create({ data: dto });
    },

    async update(id: string, dto: UpdateTagInput) {
        await tagsService.getById(id);
        if (dto.name) {
            const taken = await prisma.tag.findFirst({ where: { name: dto.name, NOT: { id } } });
            if (taken) throw new HttpError(409, "Ya existe una etiqueta con ese nombre", "TAG_NAME_EXISTS");
        }
        return prisma.tag.update({ where: { id }, data: dto });
    },

    async delete(id: string) {
        await tagsService.getById(id);
        await prisma.tag.delete({ where: { id } });
    },
};
