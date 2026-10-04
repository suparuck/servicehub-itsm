-- CreateEnum
CREATE TYPE "ImprovementStatus" AS ENUM ('OPEN', 'ON_HOLD', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "ImprovementItem" ADD COLUMN     "baseline" TEXT,
ADD COLUMN     "benefit" "Level" NOT NULL DEFAULT 'MED',
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "goal" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "problemId" TEXT,
ADD COLUMN     "result" TEXT,
ADD COLUMN     "seq" SERIAL NOT NULL,
ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "status" "ImprovementStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "targetDate" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "ImprovementItem_seq_key" ON "ImprovementItem"("seq");

-- CreateIndex
CREATE INDEX "ImprovementItem_status_idx" ON "ImprovementItem"("status");

-- CreateIndex
CREATE INDEX "ImprovementItem_ownerId_idx" ON "ImprovementItem"("ownerId");

-- AddForeignKey
ALTER TABLE "ImprovementItem" ADD CONSTRAINT "ImprovementItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementItem" ADD CONSTRAINT "ImprovementItem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementItem" ADD CONSTRAINT "ImprovementItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

