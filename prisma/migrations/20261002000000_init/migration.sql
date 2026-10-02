-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('END_USER', 'AGENT', 'RESOLVER_GROUP_LEAD', 'CHANGE_MANAGER', 'CAB_MEMBER', 'CONFIG_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('HIGH', 'MED', 'LOW');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('P1', 'P2', 'P3', 'P4');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_USER', 'PENDING_VENDOR', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ServiceHealth" AS ENUM ('OK', 'DEGRADED', 'DOWN');

-- CreateEnum
CREATE TYPE "CiClass" AS ENUM ('BUSINESS_SERVICE', 'APPLICATION', 'SERVER', 'DATABASE', 'NETWORK_DEVICE', 'CLOUD_RESOURCE', 'END_USER_DEVICE', 'SOFTWARE_LICENSE');

-- CreateEnum
CREATE TYPE "CiLifecycle" AS ENUM ('PLANNED', 'LIVE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('DEPENDS_ON', 'RUNS_ON', 'CONNECTS_TO', 'HOSTS');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'PENDING_APPROVAL', 'FULFILLING', 'DELIVERED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProblemPhase" AS ENUM ('IDENTIFICATION', 'CONTROL', 'ERROR_CONTROL', 'KNOWN_ERROR', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('STANDARD', 'NORMAL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'SCHEDULED', 'IMPLEMENTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('HIGH', 'MED', 'LOW');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('INTERNAL', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SlaMetric" AS ENUM ('RESPONSE', 'RESOLVE');

-- CreateEnum
CREATE TYPE "SlaTimerState" AS ENUM ('RUNNING', 'PAUSED', 'MET', 'BREACHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'END_USER',
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AssignmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "category" TEXT,
    "ownerName" TEXT,
    "health" "ServiceHealth" NOT NULL DEFAULT 'OK',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "slaId" TEXT,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOffering" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ServiceOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sla" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calendar" TEXT NOT NULL DEFAULT '24x7',

    CONSTRAINT "Sla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaTarget" (
    "id" TEXT NOT NULL,
    "slaId" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "metric" "SlaMetric" NOT NULL,
    "minutes" INTEGER NOT NULL,

    CONSTRAINT "SlaTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaTimer" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "metric" "SlaMetric" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "targetMinutes" INTEGER NOT NULL,
    "achievedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "state" "SlaTimerState" NOT NULL DEFAULT 'RUNNING',

    CONSTRAINT "SlaTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationItem" (
    "id" TEXT NOT NULL,
    "ciId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "ciClass" "CiClass" NOT NULL,
    "classLabel" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'Prod',
    "lifecycle" "CiLifecycle" NOT NULL DEFAULT 'LIVE',
    "ownerGroupId" TEXT,
    "ownerUserId" TEXT,
    "ownerLabel" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "lastDiscoveredAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigurationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CIRelationship" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "RelationType" NOT NULL,

    CONSTRAINT "CIRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "ciId" TEXT NOT NULL,
    "vendor" TEXT,
    "purchasedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "impact" "Level" NOT NULL,
    "urgency" "Level" NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'NEW',
    "lifecycleStep" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT,
    "channel" TEXT,
    "isMajor" BOOLEAN NOT NULL DEFAULT false,
    "serviceId" TEXT,
    "groupId" TEXT,
    "assigneeId" TEXT,
    "managerId" TEXT,
    "reporterId" TEXT,
    "parentId" TEXT,
    "problemId" TEXT,
    "changeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentCI" (
    "incidentId" TEXT NOT NULL,
    "ciId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "IncidentCI_pkey" PRIMARY KEY ("incidentId","ciId")
);

-- CreateTable
CREATE TABLE "WorkNote" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorLabel" TEXT,
    "kind" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'neutral',
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'INTERNAL',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "slaText" TEXT NOT NULL,
    "serviceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "stage" INTEGER NOT NULL DEFAULT 1,
    "nextNote" TEXT,
    "catalogId" TEXT,
    "requesterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approver" TEXT NOT NULL,
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfilmentTask" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FulfilmentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "phase" "ProblemPhase" NOT NULL DEFAULT 'IDENTIFICATION',
    "phaseLabel" TEXT,
    "rootCause" TEXT,
    "workaround" TEXT,
    "workNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Change" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ChangeType" NOT NULL,
    "risk" "RiskLevel" NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'DRAFT',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3),
    "serviceId" TEXT,
    "problemId" TEXT,
    "implementationPlan" TEXT,
    "backoutPlan" TEXT,
    "outcome" TEXT,
    "cabApproval" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeCI" (
    "changeId" TEXT NOT NULL,
    "ciId" TEXT NOT NULL,

    CONSTRAINT "ChangeCI_pkey" PRIMARY KEY ("changeId","ciId")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'PUBLISHED',
    "views" INTEGER NOT NULL DEFAULT 0,
    "problemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImprovementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardSnapshot" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardSnapshot_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentGroup_name_key" ON "AssignmentGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SlaTarget_slaId_priority_metric_key" ON "SlaTarget"("slaId", "priority", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "SlaTimer_incidentId_metric_key" ON "SlaTimer"("incidentId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationItem_ciId_key" ON "ConfigurationItem"("ciId");

-- CreateIndex
CREATE INDEX "ConfigurationItem_ciClass_idx" ON "ConfigurationItem"("ciClass");

-- CreateIndex
CREATE INDEX "ConfigurationItem_lifecycle_idx" ON "ConfigurationItem"("lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "CIRelationship_sourceId_targetId_type_key" ON "CIRelationship"("sourceId", "targetId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetTag_key" ON "Asset"("assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_ciId_key" ON "Asset"("ciId");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_seq_key" ON "Incident"("seq");

-- CreateIndex
CREATE INDEX "Incident_status_priority_idx" ON "Incident"("status", "priority");

-- CreateIndex
CREATE INDEX "Incident_serviceId_idx" ON "Incident"("serviceId");

-- CreateIndex
CREATE INDEX "WorkNote_incidentId_createdAt_idx" ON "WorkNote"("incidentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_seq_key" ON "ServiceRequest"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_seq_key" ON "Problem"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Change_seq_key" ON "Change"("seq");

-- CreateIndex
CREATE INDEX "Change_windowStart_idx" ON "Change"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_seq_key" ON "KnowledgeArticle"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_incidentId_key" ON "SurveyResponse"("incidentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AssignmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "Sla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaTarget" ADD CONSTRAINT "SlaTarget_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "Sla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaTimer" ADD CONSTRAINT "SlaTimer_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationItem" ADD CONSTRAINT "ConfigurationItem_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "AssignmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigurationItem" ADD CONSTRAINT "ConfigurationItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CIRelationship" ADD CONSTRAINT "CIRelationship_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ConfigurationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CIRelationship" ADD CONSTRAINT "CIRelationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ConfigurationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "ConfigurationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AssignmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "Change"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentCI" ADD CONSTRAINT "IncidentCI_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentCI" ADD CONSTRAINT "IncidentCI_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "ConfigurationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkNote" ADD CONSTRAINT "WorkNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfilmentTask" ADD CONSTRAINT "FulfilmentTask_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeCI" ADD CONSTRAINT "ChangeCI_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "Change"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeCI" ADD CONSTRAINT "ChangeCI_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "ConfigurationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

