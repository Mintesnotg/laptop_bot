import { UsageTag } from "@prisma/client";
import { prisma } from "../prisma";
import { findBudgetRange, usageLabelFromKey } from "../shared/constants";
import { RecommendationRequestInput } from "../shared/contracts";

type RankedProduct = {
  id: string;
  brand: string;
  model: string;
  price: number;
  ramGb: number;
  storageGb: number;
  storageType: string;
  cpu: string;
  gpu: string | null;
  usageTags: UsageTag[];
  description: string | null;
  images: { imageUrl: string }[];
  score: number;
};

function scoreProduct(
  price: number,
  ramGb: number,
  storageGb: number,
  usageTags: UsageTag[],
  filters: RecommendationRequestInput,
  budgetMin: number,
  budgetMax: number
) {
  const budgetMidpoint = (budgetMin + budgetMax) / 2;
  const budgetWindow = Math.max(budgetMax - budgetMin, 1);
  const priceDistance = Math.abs(price - budgetMidpoint);
  const normalizedPrice = Math.max(0, 1 - priceDistance / budgetWindow);

  const ramDelta = Math.max(0, ramGb - filters.ramGb);
  const storageDelta = Math.max(0, storageGb - filters.storageGb);

  const usageScore = usageTags.includes(filters.usage as UsageTag) ? 35 : 0;
  const priceScore = normalizedPrice * 30;
  const ramScore = Math.min(15, ramDelta * 2 + (ramGb >= filters.ramGb ? 8 : 0));
  const storageScore = Math.min(15, storageDelta / 128 + (storageGb >= filters.storageGb ? 8 : 0));

  const workloadBoost =
    filters.usage === "GAMING" || filters.usage === "DESIGN" || filters.usage === "GRAPHICS_DESIGN"
      ? ramGb >= 16
        ? 5
        : 0
      : 0;

  return Number((usageScore + priceScore + ramScore + storageScore + workloadBoost).toFixed(2));
}

export async function recommendLaptops(filters: RecommendationRequestInput) {
  const budget = findBudgetRange(filters.budgetKey);
  if (!budget) {
    throw new Error("Invalid budget range selected");
  }

  let userId: number | null = null;

  if (filters.telegramUserId) {
    const savedUser = await prisma.telegramUser.upsert({
      where: { telegramUserId: filters.telegramUserId },
      update: {},
      create: { telegramUserId: filters.telegramUserId }
    });
    userId = savedUser.id;
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      price: {
        gte: budget.min,
        lte: budget.max
      },
      ramGb: {
        gte: filters.ramGb
      },
      storageGb: {
        gte: filters.storageGb
      }
    },
    include: {
      images: {
        select: { imageUrl: true },
        orderBy: { sortOrder: "asc" }
      }
    },
    take: 100
  });

  const ranked: RankedProduct[] = products
    .map((product) => ({
      ...product,
      score: scoreProduct(
        product.price,
        product.ramGb,
        product.storageGb,
        product.usageTags,
        filters,
        budget.min,
        budget.max
      )
    }))
    .sort((a, b) => b.score - a.score);

  const exactUsageMatches = ranked.filter((product) => product.usageTags.includes(filters.usage as UsageTag));
  const topResults = (exactUsageMatches.length > 0 ? exactUsageMatches : ranked)
    .sort((a, b) => b.score - a.score)
    .slice(0, filters.limit);

  const request = await prisma.recommendationRequest.create({
    data: {
      telegramUserId: userId,
      budgetMin: budget.min,
      budgetMax: budget.max,
      usageTag: filters.usage as UsageTag,
      ramGb: filters.ramGb,
      storageGb: filters.storageGb
    }
  });

  if (topResults.length > 0) {
    await prisma.recommendationResult.createMany({
      data: topResults.map((product, index) => ({
        requestId: request.id,
        productId: product.id,
        score: product.score,
        rank: index + 1
      }))
    });
  }

  await prisma.userActivityLog.create({
    data: {
      userId,
      action: "recommendation_requested",
      payload: {
        budgetKey: filters.budgetKey,
        budgetLabel: budget.label,
        usageLabel: usageLabelFromKey(filters.usage),
        ramGb: filters.ramGb,
        storageGb: filters.storageGb,
        resultsCount: topResults.length
      }
    }
  });

  return {
    filters: {
      budget: budget.label,
      usage: usageLabelFromKey(filters.usage),
      ramGb: filters.ramGb,
      storageGb: filters.storageGb
    },
    items: topResults.map((product) => ({
      id: product.id,
      brand: product.brand,
      model: product.model,
      price: product.price,
      ramGb: product.ramGb,
      storageGb: product.storageGb,
      storageType: product.storageType,
      cpu: product.cpu,
      gpu: product.gpu,
      description: product.description,
      score: product.score,
      imageUrl: product.images[0]?.imageUrl ?? null
    }))
  };
}
