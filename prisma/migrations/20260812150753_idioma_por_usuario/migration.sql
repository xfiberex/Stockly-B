-- CreateEnum
CREATE TYPE "Idioma" AS ENUM ('ES', 'EN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "idioma" "Idioma" NOT NULL DEFAULT 'ES';
