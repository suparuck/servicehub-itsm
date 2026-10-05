-- CreateEnum
CREATE TYPE "EventSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "MonitoringSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "autoIncident" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMP(3),

    CONSTRAINT "MonitoringSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringEvent" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "ciId" TEXT,
    "ciRef" TEXT,
    "serviceCode" TEXT,
    "severity" "EventSeverity" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "message" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "ackedAt" TIMESTAMP(3),
    "ackedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "incidentRequestedAt" TIMESTAMP(3),
    "incidentId" TEXT,

    CONSTRAINT "MonitoringEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSource_name_key" ON "MonitoringSource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSource_tokenHash_key" ON "MonitoringSource"("tokenHash");

-- CreateIndex
CREATE INDEX "MonitoringEvent_status_severity_idx" ON "MonitoringEvent"("status", "severity");

-- CreateIndex
CREATE INDEX "MonitoringEvent_sourceId_dedupKey_status_idx" ON "MonitoringEvent"("sourceId", "dedupKey", "status");

-- CreateIndex
CREATE INDEX "MonitoringEvent_ciId_idx" ON "MonitoringEvent"("ciId");

-- CreateIndex
CREATE INDEX "MonitoringEvent_lastSeenAt_idx" ON "MonitoringEvent"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MonitoringSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "ConfigurationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_ackedById_fkey" FOREIGN KEY ("ackedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringEvent" ADD CONSTRAINT "MonitoringEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

