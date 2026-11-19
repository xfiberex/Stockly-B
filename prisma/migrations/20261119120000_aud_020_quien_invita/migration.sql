-- AUD-020 — quién invitó a cada cuenta creada por invitación (T6-10).
--
-- Anulable y sin rellenar: de las invitaciones anteriores no quedó constancia de quién las hizo
-- más que en la auditoría, y esas pantallas siguen diciendo «te han invitado», como hasta ahora.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "invitedById" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
