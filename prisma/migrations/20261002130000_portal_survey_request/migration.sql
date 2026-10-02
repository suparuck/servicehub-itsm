-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "SurveyResponse" ADD COLUMN     "requestId" TEXT,
ALTER COLUMN "incidentId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_requestId_key" ON "SurveyResponse"("requestId");

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

