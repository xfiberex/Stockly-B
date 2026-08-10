import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import type { CreateBrandInput, UpdateBrandInput } from "@/modules/brands/brands.validator";

export const brandsService = {
    async getAll() {
        return prisma.brand.findMany({ orderBy: { name: "asc" } });
    },

    async getById(id: string) {
        const brand = await prisma.brand.findUnique({ where: { id } });
        if (!brand) throw new HttpError(404, "Marca no encontrada", "BRAND_NOT_FOUND");
        return brand;
    },

    async create(dto: CreateBrandInput) {
        const existing = await prisma.brand.findUnique({ where: { name: dto.name } });
        if (existing) throw new HttpError(409, "Ya existe una marca con ese nombre", "BRAND_NAME_EXISTS");

        return prisma.brand.create({ data: dto });
    },

    async update(id: string, dto: UpdateBrandInput) {
        await brandsService.getById(id);

        const taken = await prisma.brand.findFirst({ where: { name: dto.name, NOT: { id } } });
        if (taken) throw new HttpError(409, "Ya existe una marca con ese nombre", "BRAND_NAME_EXISTS");

        return prisma.brand.update({ where: { id }, data: dto });
    },

    async delete(id: string) {
        await brandsService.getById(id);
        // onDelete: SetNull en el schema pone brandId = null en los productos que la usen
        await prisma.brand.delete({ where: { id } });
    },
};
