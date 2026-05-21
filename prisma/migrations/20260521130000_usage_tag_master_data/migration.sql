-- Migrate usage-tag storage from enum-backed fields to string-backed master-data keys.
ALTER TABLE "UserPreference" ALTER COLUMN "usageTag" TYPE TEXT USING "usageTag"::TEXT;
ALTER TABLE "RecommendationRequest" ALTER COLUMN "usageTag" TYPE TEXT USING "usageTag"::TEXT;
ALTER TABLE "Product" ALTER COLUMN "usageTags" TYPE TEXT[] USING "usageTags"::TEXT[];
ALTER TABLE "Product" ALTER COLUMN "usageTags" SET DEFAULT ARRAY[]::TEXT[];

-- Drop old enum after all dependent columns are converted.
DROP TYPE "UsageTag";

-- Create usage-tag master-data table.
CREATE TABLE "UsageTagOption" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageTagOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageTagOption_key_key" ON "UsageTagOption"("key");
CREATE INDEX "UsageTagOption_isActive_sortOrder_idx" ON "UsageTagOption"("isActive", "sortOrder");

-- Seed baseline usage tags.
INSERT INTO "UsageTagOption" ("id", "key", "label", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  ('usage-student', 'STUDENT', 'Student Use', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-office', 'OFFICE', 'Office Work', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-design', 'DESIGN', 'Design', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-gaming', 'GAMING', 'Gaming', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-coding', 'CODING', 'Programming', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-graphics-design', 'GRAPHICS_DESIGN', 'Video Editing / Graphics', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-architecture', 'ARCHITECTURE', 'Architecture', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-finance', 'FINANCE', 'Finance', 7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-marketing', 'MARKETING', 'Marketing', 8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-hr', 'HR', 'HR', 9, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-sales', 'SALES', 'Sales', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-engineering', 'ENGINEERING', 'Engineering', 11, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-devops', 'DEVOPS', 'DevOps', 12, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-product', 'PRODUCT', 'Product', 13, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-ux-ui', 'UX_UI', 'Design UI/UX', 14, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-analytics', 'ANALYTICS', 'Analytics', 15, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-reading', 'READING', 'Reading', 16, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usage-daily-browsing', 'DAILY_BROWSING', 'Daily Browsing', 17, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Backfill any additional keys already present in product/preference/request records.
WITH distinct_usage_keys AS (
  SELECT DISTINCT "key"
  FROM (
    SELECT UNNEST("usageTags")::TEXT AS "key" FROM "Product"
    UNION ALL
    SELECT "usageTag"::TEXT AS "key" FROM "UserPreference"
    UNION ALL
    SELECT "usageTag"::TEXT AS "key" FROM "RecommendationRequest"
  ) usage_values
  WHERE "key" IS NOT NULL
    AND BTRIM("key") <> ''
)
INSERT INTO "UsageTagOption" ("id", "key", "label", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT
  CONCAT('usage-auto-', LOWER(REGEXP_REPLACE("key", '[^A-Z0-9_]+', '_', 'g'))),
  "key",
  INITCAP(REPLACE(LOWER("key"), '_', ' ')),
  1000,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM distinct_usage_keys
ON CONFLICT ("key") DO NOTHING;
