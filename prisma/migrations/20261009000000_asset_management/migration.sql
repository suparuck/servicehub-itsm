-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ORDERED', 'IN_STOCK', 'IN_USE', 'IN_REPAIR', 'RETIRED');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "status" "AssetStatus" NOT NULL DEFAULT 'IN_USE',
ADD COLUMN "serialNo" TEXT,
ADD COLUMN "location" TEXT,
ADD COLUMN "costBaht" INTEGER,
ADD COLUMN "licenseQty" INTEGER,
ADD COLUMN "licenseUsed" INTEGER,
ADD COLUMN "assignedToId" TEXT,
ADD COLUMN "assignedAt" TIMESTAMP(3),
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_assignedToId_idx" ON "Asset"("assignedToId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
