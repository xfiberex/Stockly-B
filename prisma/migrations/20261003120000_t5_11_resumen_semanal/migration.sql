-- T5-11 — resumen semanal por correo: una fila por semana resumida.
--
-- `weekStart` es único: crear la fila es reclamar la semana, y eso es lo que impide que dos
-- ejecuciones del comando manden el mismo resumen dos veces.

-- CreateTable
CREATE TABLE "weekly_digests" (
    "id" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "weekEnd" TEXT NOT NULL,
    "sentToUserIds" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "weekly_digests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_digests_weekStart_key" ON "weekly_digests"("weekStart");

