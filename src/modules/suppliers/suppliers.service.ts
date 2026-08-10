import { prisma } from "@/shared/lib/prisma";
import { HttpError } from "@/shared/lib/httpError";
import type { CreateSupplierInput, UpdateSupplierInput } from "@/modules/suppliers/suppliers.validator";

export const suppliersService = {
    async getAll() {
        return prisma.supplier.findMany({ orderBy: { name: "asc" } });
    },

    async getById(id: string) {
        const supplier = await prisma.supplier.findUnique({ where: { id } });
        if (!supplier) throw new HttpError(404, "Proveedor no encontrado", "SUPPLIER_NOT_FOUND");
        return supplier;
    },

    async create(dto: CreateSupplierInput) {
        const email = dto.email?.trim() === "" ? null : (dto.email ?? null);

        if (email) {
            const existing = await prisma.supplier.findUnique({ where: { email } });
            if (existing) throw new HttpError(409, "Ya existe un proveedor con ese email", "SUPPLIER_EMAIL_EXISTS");
        }

        return prisma.supplier.create({ data: { ...dto, email } });
    },

    async update(id: string, dto: UpdateSupplierInput) {
        await suppliersService.getById(id);

        const email = dto.email?.trim() === "" ? null : (dto.email ?? null);

        if (email) {
            const taken = await prisma.supplier.findFirst({ where: { email, NOT: { id } } });
            if (taken) throw new HttpError(409, "Ya existe un proveedor con ese email", "SUPPLIER_EMAIL_EXISTS");
        }

        return prisma.supplier.update({ where: { id }, data: { ...dto, email } });
    },

    async delete(id: string) {
        await suppliersService.getById(id);
        await prisma.supplier.delete({ where: { id } });
    },
};
