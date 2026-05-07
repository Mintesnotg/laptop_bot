-- CreateEnum
CREATE TYPE "UsageTag" AS ENUM ('STUDENT', 'OFFICE', 'DESIGN', 'GAMING', 'CODING', 'GRAPHICS_DESIGN', 'ARCHITECTURE', 'READING', 'DAILY_BROWSING');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('SSD', 'NVME', 'HDD');

-- CreateTable
CREATE TABLE "TelegramUser" (
    "id" SERIAL NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "languageCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "budgetMin" INTEGER NOT NULL,
    "budgetMax" INTEGER NOT NULL,
    "usageTag" "UsageTag" NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "storageGb" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "storageGb" INTEGER NOT NULL,
    "storageType" "StorageType" NOT NULL DEFAULT 'SSD',
    "cpu" TEXT NOT NULL,
    "gpu" TEXT,
    "usageTags" "UsageTag"[],
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationRequest" (
    "id" TEXT NOT NULL,
    "telegramUserId" INTEGER,
    "budgetMin" INTEGER NOT NULL,
    "budgetMax" INTEGER NOT NULL,
    "usageTag" "UsageTag" NOT NULL,
    "ramGb" INTEGER NOT NULL,
    "storageGb" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationResult" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "RecommendationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActivityLog" (
    "id" TEXT NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_telegramUserId_key" ON "TelegramUser"("telegramUserId");

-- CreateIndex
CREATE INDEX "UserPreference_userId_createdAt_idx" ON "UserPreference"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_price_idx" ON "Product"("price");

-- CreateIndex
CREATE INDEX "Product_ramGb_storageGb_idx" ON "Product"("ramGb", "storageGb");

-- CreateIndex
CREATE UNIQUE INDEX "Product_brand_model_key" ON "Product"("brand", "model");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "RecommendationRequest_createdAt_idx" ON "RecommendationRequest"("createdAt");

-- CreateIndex
CREATE INDEX "RecommendationRequest_usageTag_budgetMin_budgetMax_idx" ON "RecommendationRequest"("usageTag", "budgetMin", "budgetMax");

-- CreateIndex
CREATE INDEX "RecommendationResult_requestId_idx" ON "RecommendationResult"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationResult_requestId_productId_key" ON "RecommendationResult"("requestId", "productId");

-- CreateIndex
CREATE INDEX "UserActivityLog_action_idx" ON "UserActivityLog"("action");

-- CreateIndex
CREATE INDEX "UserActivityLog_createdAt_idx" ON "UserActivityLog"("createdAt");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRequest" ADD CONSTRAINT "RecommendationRequest_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "TelegramUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationResult" ADD CONSTRAINT "RecommendationResult_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RecommendationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationResult" ADD CONSTRAINT "RecommendationResult_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivityLog" ADD CONSTRAINT "UserActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TelegramUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
