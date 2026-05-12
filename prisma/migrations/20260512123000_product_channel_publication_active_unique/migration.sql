-- CreateEnum
CREATE TYPE "ChannelPostKind" AS ENUM ('TEXT', 'PHOTO', 'ALBUM');

-- CreateTable
CREATE TABLE "ProductChannelPublication" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channelTarget" TEXT NOT NULL,
    "postKind" "ChannelPostKind" NOT NULL,
    "messageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrlsSnapshot" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastPublishedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductChannelPublication_pkey" PRIMARY KEY ("id")
);

-- DropIndex
DROP INDEX IF EXISTS "Product_brand_model_key";

-- CreateIndex
CREATE UNIQUE INDEX "ProductChannelPublication_productId_key" ON "ProductChannelPublication"("productId");

-- CreateIndex
CREATE INDEX "ProductChannelPublication_channelTarget_idx" ON "ProductChannelPublication"("channelTarget");

-- CreateIndex
CREATE UNIQUE INDEX "Product_active_brand_model_unique_idx"
ON "Product"(LOWER("brand"), LOWER("model"))
WHERE "isActive" = true;

-- AddForeignKey
ALTER TABLE "ProductChannelPublication" ADD CONSTRAINT "ProductChannelPublication_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
