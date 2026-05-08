-- CreateTable
CREATE TABLE "BudgetOption" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RamOption" (
    "id" TEXT NOT NULL,
    "gb" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RamOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageOption" (
    "id" TEXT NOT NULL,
    "gb" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetOption_key_key" ON "BudgetOption"("key");

-- CreateIndex
CREATE INDEX "BudgetOption_isActive_sortOrder_idx" ON "BudgetOption"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RamOption_gb_key" ON "RamOption"("gb");

-- CreateIndex
CREATE INDEX "RamOption_isActive_sortOrder_idx" ON "RamOption"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StorageOption_gb_key" ON "StorageOption"("gb");

-- CreateIndex
CREATE INDEX "StorageOption_isActive_sortOrder_idx" ON "StorageOption"("isActive", "sortOrder");
