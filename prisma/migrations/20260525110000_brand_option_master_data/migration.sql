-- Create brand master-data table.
CREATE TABLE "BrandOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandOption_name_key" ON "BrandOption"("name");
CREATE INDEX "BrandOption_isActive_sortOrder_idx" ON "BrandOption"("isActive", "sortOrder");

-- Backfill brand options from existing products (case-insensitive distinct by brand name).
INSERT INTO "BrandOption" ("id", "name", "description", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT
  CONCAT('brand-auto-', md5(LOWER(distinct_brands.brand_name))),
  distinct_brands.brand_name,
  '',
  1000,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (LOWER(TRIM("brand")))
    TRIM("brand") AS brand_name
  FROM "Product"
  WHERE TRIM(COALESCE("brand", '')) <> ''
  ORDER BY LOWER(TRIM("brand")), "createdAt" ASC
) AS distinct_brands
ON CONFLICT ("name") DO NOTHING;
