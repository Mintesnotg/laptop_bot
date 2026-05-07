-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UsageTag" ADD VALUE 'FINANCE';
ALTER TYPE "UsageTag" ADD VALUE 'MARKETING';
ALTER TYPE "UsageTag" ADD VALUE 'HR';
ALTER TYPE "UsageTag" ADD VALUE 'SALES';
ALTER TYPE "UsageTag" ADD VALUE 'ENGINEERING';
ALTER TYPE "UsageTag" ADD VALUE 'DEVOPS';
ALTER TYPE "UsageTag" ADD VALUE 'PRODUCT';
ALTER TYPE "UsageTag" ADD VALUE 'UX_UI';
ALTER TYPE "UsageTag" ADD VALUE 'ANALYTICS';
