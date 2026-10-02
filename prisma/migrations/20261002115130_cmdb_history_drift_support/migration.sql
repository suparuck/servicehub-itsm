-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "supportUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ConfigurationItem" ADD COLUMN     "driftNote" TEXT;

-- CreateTable
CREATE TABLE "CIChangeLog" (
    "id" TEXT NOT NULL,
    "ciId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "what" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "CIChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CIChangeLog_ciId_at_idx" ON "CIChangeLog"("ciId", "at");

-- AddForeignKey
ALTER TABLE "CIChangeLog" ADD CONSTRAINT "CIChangeLog_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "ConfigurationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
