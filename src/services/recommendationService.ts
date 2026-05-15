import { UsageTag } from "@prisma/client";
import { prisma } from "../prisma";
import { findBudgetRange, usageLabelFromKey, type BudgetRange } from "../shared/constants";
import { RecommendationRequestInput } from "../shared/contracts";

async function resolveBudgetRange(budgetKey: string): Promise<BudgetRange | null> {
  const dbBudget = await prisma.budgetOption.findFirst({
    where: { key: budgetKey, isActive: true }
  });

  if (dbBudget) {
    return {
      key: dbBudget.key,
      label: dbBudget.label,
      min: dbBudget.min,
      max: dbBudget.max
    };
  }

  return findBudgetRange(budgetKey) ?? null;
}

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
  featureLines: string[];
  description: string | null;
  images: { imageUrl: string }[];
  score: number;
  source: "strict" | "relaxed";
};

type UsageIntentProfile = {
  cpuWeight: number;
  gpuWeight: number;
  ramWeight: number;
  usageWeight: number;
  prefersDedicatedGpu: boolean;
  targetRam: number;
};

const USAGE_INTENT_PROFILES: Record<UsageTag, UsageIntentProfile> = {
  STUDENT: { cpuWeight: 0.6, gpuWeight: 0.2, ramWeight: 0.5, usageWeight: 0.8, prefersDedicatedGpu: false, targetRam: 8 },
  OFFICE: { cpuWeight: 0.8, gpuWeight: 0.2, ramWeight: 0.7, usageWeight: 0.7, prefersDedicatedGpu: false, targetRam: 8 },
  DESIGN: { cpuWeight: 0.9, gpuWeight: 0.9, ramWeight: 0.9, usageWeight: 0.8, prefersDedicatedGpu: true, targetRam: 16 },
  GAMING: { cpuWeight: 1.0, gpuWeight: 1.2, ramWeight: 1.0, usageWeight: 0.8, prefersDedicatedGpu: true, targetRam: 16 },
  CODING: { cpuWeight: 1.0, gpuWeight: 0.4, ramWeight: 0.9, usageWeight: 0.9, prefersDedicatedGpu: false, targetRam: 16 },
  GRAPHICS_DESIGN: {
    cpuWeight: 1.0,
    gpuWeight: 1.1,
    ramWeight: 1.0,
    usageWeight: 0.9,
    prefersDedicatedGpu: true,
    targetRam: 16
  },
  ARCHITECTURE: {
    cpuWeight: 1.0,
    gpuWeight: 1.2,
    ramWeight: 1.1,
    usageWeight: 0.8,
    prefersDedicatedGpu: true,
    targetRam: 16
  },
  FINANCE: { cpuWeight: 0.8, gpuWeight: 0.2, ramWeight: 0.7, usageWeight: 0.7, prefersDedicatedGpu: false, targetRam: 8 },
  MARKETING: { cpuWeight: 0.8, gpuWeight: 0.4, ramWeight: 0.7, usageWeight: 0.7, prefersDedicatedGpu: false, targetRam: 8 },
  HR: { cpuWeight: 0.7, gpuWeight: 0.2, ramWeight: 0.6, usageWeight: 0.7, prefersDedicatedGpu: false, targetRam: 8 },
  SALES: { cpuWeight: 0.7, gpuWeight: 0.2, ramWeight: 0.6, usageWeight: 0.7, prefersDedicatedGpu: false, targetRam: 8 },
  ENGINEERING: { cpuWeight: 1.0, gpuWeight: 0.6, ramWeight: 0.9, usageWeight: 0.8, prefersDedicatedGpu: false, targetRam: 16 },
  DEVOPS: { cpuWeight: 1.0, gpuWeight: 0.4, ramWeight: 1.0, usageWeight: 0.8, prefersDedicatedGpu: false, targetRam: 16 },
  PRODUCT: { cpuWeight: 0.8, gpuWeight: 0.3, ramWeight: 0.7, usageWeight: 0.8, prefersDedicatedGpu: false, targetRam: 8 },
  UX_UI: { cpuWeight: 0.9, gpuWeight: 0.8, ramWeight: 0.9, usageWeight: 0.9, prefersDedicatedGpu: true, targetRam: 16 },
  ANALYTICS: { cpuWeight: 0.9, gpuWeight: 0.5, ramWeight: 0.9, usageWeight: 0.8, prefersDedicatedGpu: false, targetRam: 16 },
  READING: { cpuWeight: 0.5, gpuWeight: 0.1, ramWeight: 0.5, usageWeight: 0.6, prefersDedicatedGpu: false, targetRam: 8 },
  DAILY_BROWSING: {
    cpuWeight: 0.5,
    gpuWeight: 0.1,
    ramWeight: 0.5,
    usageWeight: 0.6,
    prefersDedicatedGpu: false,
    targetRam: 8
  }
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function parseCpuTier(cpu: string) {
  const text = cpu.toLowerCase();
  let tier = 2;

  if (text.includes("i9") || text.includes("ryzen 9")) {
    tier = 5;
  } else if (text.includes("i7") || text.includes("ryzen 7")) {
    tier = 4;
  } else if (text.includes("i5") || text.includes("ryzen 5")) {
    tier = 3;
  } else if (text.includes("i3") || text.includes("ryzen 3")) {
    tier = 2;
  } else if (text.includes("apple m3")) {
    tier = 5;
  } else if (text.includes("apple m2")) {
    tier = 4;
  } else if (text.includes("apple m1")) {
    tier = 3;
  }

  const generationMatch = cpu.match(/\b(1[0-9]|[4-9])(?:th)?\s*gen\b/i);
  const generation = generationMatch ? Number(generationMatch[1]) : 0;
  const generationBonus = generation >= 12 ? 0.6 : generation >= 10 ? 0.3 : 0;

  return clamp((tier + generationBonus) / 5);
}

function parseGpuTier(gpu: string | null) {
  if (!gpu) {
    return 0.2;
  }

  const text = gpu.toLowerCase();
  if (text.includes("rtx 40")) {
    return 1;
  }
  if (text.includes("rtx")) {
    return 0.92;
  }
  if (text.includes("rx 7") || text.includes("rx 6")) {
    return 0.88;
  }
  if (text.includes("gtx")) {
    return 0.75;
  }
  if (text.includes("mx")) {
    return 0.55;
  }
  if (text.includes("iris") || text.includes("vega") || text.includes("uhd") || text.includes("integrated")) {
    return 0.32;
  }

  return 0.45;
}

function calculateUsageMatchScore(productUsageTags: UsageTag[], selectedUsageTags: UsageTag[]) {
  if (selectedUsageTags.length === 0) {
    return 0.4;
  }

  const selectedSet = new Set(selectedUsageTags);
  const matched = productUsageTags.filter((tag) => selectedSet.has(tag)).length;
  return clamp(matched / selectedUsageTags.length);
}

function buildCombinedIntentProfile(selectedUsageTags: UsageTag[]) {
  if (selectedUsageTags.length === 0) {
    return USAGE_INTENT_PROFILES.DAILY_BROWSING;
  }

  const aggregate = selectedUsageTags.reduce(
    (acc, tag) => {
      const profile = USAGE_INTENT_PROFILES[tag] ?? USAGE_INTENT_PROFILES.DAILY_BROWSING;
      acc.cpuWeight += profile.cpuWeight;
      acc.gpuWeight += profile.gpuWeight;
      acc.ramWeight += profile.ramWeight;
      acc.usageWeight += profile.usageWeight;
      acc.prefersDedicatedGpu = acc.prefersDedicatedGpu || profile.prefersDedicatedGpu;
      acc.targetRam += profile.targetRam;
      return acc;
    },
    {
      cpuWeight: 0,
      gpuWeight: 0,
      ramWeight: 0,
      usageWeight: 0,
      prefersDedicatedGpu: false,
      targetRam: 0
    }
  );

  return {
    cpuWeight: aggregate.cpuWeight / selectedUsageTags.length,
    gpuWeight: aggregate.gpuWeight / selectedUsageTags.length,
    ramWeight: aggregate.ramWeight / selectedUsageTags.length,
    usageWeight: aggregate.usageWeight / selectedUsageTags.length,
    prefersDedicatedGpu: aggregate.prefersDedicatedGpu,
    targetRam: Math.round(aggregate.targetRam / selectedUsageTags.length)
  };
}

function scoreBudgetFit(price: number, budgetMin: number, budgetMax: number) {
  if (price >= budgetMin && price <= budgetMax) {
    const midpoint = (budgetMin + budgetMax) / 2;
    const distance = Math.abs(price - midpoint);
    const range = Math.max(1, budgetMax - budgetMin);
    return clamp(1 - distance / range);
  }

  const distanceOutside =
    price < budgetMin ? Math.abs(price - budgetMin) : Math.abs(price - budgetMax);
  const extendedRange = Math.max(1, budgetMax - budgetMin) * 0.7;
  return clamp(1 - distanceOutside / extendedRange);
}

function scoreRamFit(ramGb: number, requestedRamGb: number, targetRam: number) {
  const effectiveTarget = Math.max(requestedRamGb, targetRam);
  if (ramGb >= effectiveTarget) {
    return clamp(0.8 + Math.min(0.2, (ramGb - effectiveTarget) / 32));
  }

  return clamp(ramGb / effectiveTarget);
}

function scoreStorageFit(storageGb: number, requestedStorageGb: number) {
  if (storageGb >= requestedStorageGb) {
    return clamp(0.8 + Math.min(0.2, (storageGb - requestedStorageGb) / 1024));
  }
  return clamp(storageGb / requestedStorageGb);
}

function scoreProduct(
  product: {
    price: number;
    ramGb: number;
    storageGb: number;
    cpu: string;
    gpu: string | null;
    usageTags: UsageTag[];
  },
  budget: { min: number; max: number },
  requestedUsageTags: UsageTag[],
  requestedRamGb: number,
  requestedStorageGb: number
) {
  const profile = buildCombinedIntentProfile(requestedUsageTags);

  const budgetScore = scoreBudgetFit(product.price, budget.min, budget.max);
  const cpuScore = parseCpuTier(product.cpu);
  const gpuScore = parseGpuTier(product.gpu);
  const ramScore = scoreRamFit(product.ramGb, requestedRamGb, profile.targetRam);
  const storageScore = scoreStorageFit(product.storageGb, requestedStorageGb);
  const usageScore = calculateUsageMatchScore(product.usageTags, requestedUsageTags);

  const dedicatedGpuBonus =
    profile.prefersDedicatedGpu && gpuScore >= 0.7
      ? 0.1
      : profile.prefersDedicatedGpu && gpuScore < 0.5
        ? -0.1
        : 0;

  const weightedScore =
    budgetScore * 0.24 +
    cpuScore * (0.18 * profile.cpuWeight) +
    gpuScore * (0.18 * profile.gpuWeight) +
    ramScore * (0.14 * profile.ramWeight) +
    storageScore * 0.1 +
    usageScore * (0.16 * profile.usageWeight) +
    dedicatedGpuBonus;

  return Number((clamp(weightedScore, 0, 1.2) * 100).toFixed(2));
}

function dedupeProducts(items: RankedProduct[]) {
  const seen = new Set<string>();
  const output: RankedProduct[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    output.push(item);
  }

  return output;
}

function buildNoResultsHint(filters: RecommendationRequestInput) {
  const loweredRam = Math.max(4, filters.ramGb - 4);
  const loweredStorage = Math.max(128, Math.floor(filters.storageGb * 0.75));
  return [
    "No close matches found for your current filters.",
    `Try lowering RAM from ${filters.ramGb}GB to ${loweredRam}GB.`,
    `Try lowering storage from ${filters.storageGb}GB to around ${loweredStorage}GB.`,
    "Try switching to a related usage intent (for example Office, Programming, or Daily Browsing).",
    "Try moving to the next budget range."
  ].join(" ");
}

export async function recommendLaptops(filters: RecommendationRequestInput) {
  const budget = await resolveBudgetRange(filters.budgetKey);
  if (!budget) {
    throw new Error("Invalid budget range selected");
  }

  const enumUsageValues = new Set(Object.values(UsageTag));
  const validUsageSelections = filters.usage.filter((usage) => enumUsageValues.has(usage as UsageTag)) as UsageTag[];
  const usageLabels = validUsageSelections.map((usage) => usageLabelFromKey(usage));

  let userId: number | null = null;
  if (filters.telegramUserId) {
    const savedUser = await prisma.telegramUser.upsert({
      where: { telegramUserId: filters.telegramUserId },
      update: {},
      create: { telegramUserId: filters.telegramUserId }
    });
    userId = savedUser.id;
  }

  const strictProducts = await prisma.product.findMany({
    where: {
      isActive: true,
      price: { gte: budget.min, lte: budget.max },
      ramGb: { gte: filters.ramGb },
      storageGb: { gte: filters.storageGb }
    },
    include: {
      images: {
        select: { imageUrl: true },
        orderBy: { sortOrder: "asc" }
      }
    },
    take: 200
  });

  const relaxedProducts =
    strictProducts.length >= filters.limit
      ? []
      : await prisma.product.findMany({
          where: {
            isActive: true,
            price: {
              gte: Math.max(0, Math.floor(budget.min * 0.8)),
              lte: Math.ceil(budget.max * 1.25)
            },
            ramGb: { gte: Math.max(4, Math.floor(filters.ramGb * 0.75)) },
            storageGb: { gte: Math.max(128, Math.floor(filters.storageGb * 0.75)) }
          },
          include: {
            images: {
              select: { imageUrl: true },
              orderBy: { sortOrder: "asc" }
            }
          },
          take: 200
        });

  const rankedStrict: RankedProduct[] = strictProducts.map((product) => ({
    ...product,
    score: scoreProduct(product, budget, validUsageSelections, filters.ramGb, filters.storageGb),
    source: "strict"
  }));
  const rankedRelaxed: RankedProduct[] = relaxedProducts.map((product) => ({
    ...product,
    score: scoreProduct(product, budget, validUsageSelections, filters.ramGb, filters.storageGb),
    source: "relaxed"
  }));

  const ranked = dedupeProducts([...rankedStrict, ...rankedRelaxed]).sort(
    (a, b) => b.score - a.score || a.price - b.price || a.id.localeCompare(b.id)
  );

  const prioritized = ranked
    .filter((item) => item.usageTags.some((tag) => validUsageSelections.includes(tag)))
    .concat(ranked.filter((item) => !item.usageTags.some((tag) => validUsageSelections.includes(tag))));

  const topResults = dedupeProducts(prioritized).slice(0, filters.limit);
  const matchMode = topResults.some((item) => item.source === "relaxed") ? "relaxed" : "strict";
  const primaryUsage = (validUsageSelections[0] ?? UsageTag.DAILY_BROWSING) as UsageTag;

  try {
    const request = await prisma.recommendationRequest.create({
      data: {
        telegramUserId: userId,
        budgetMin: budget.min,
        budgetMax: budget.max,
        usageTag: primaryUsage,
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
  } catch (error) {
    console.warn("[recommendations] audit persistence failed", error);
  }

  try {
    await prisma.userActivityLog.create({
      data: {
        userId,
        action: "recommendation_requested",
        payload: {
          budgetKey: filters.budgetKey,
          budgetLabel: budget.label,
          usageLabel: usageLabels[0] ?? "-",
          usageLabels,
          usageKeys: filters.usage,
          ramGb: filters.ramGb,
          storageGb: filters.storageGb,
          resultsCount: topResults.length,
          matchMode
        }
      }
    });
  } catch (error) {
    console.warn("[recommendations] activity log failed", error);
  }

  const hintMessage = topResults.length === 0 ? buildNoResultsHint(filters) : undefined;

  return {
    filters: {
      budget: budget.label,
      usage: usageLabels,
      ramGb: filters.ramGb,
      storageGb: filters.storageGb
    },
    matchMode,
    hintMessage,
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
      usageTags: product.usageTags,
      featureLines: product.featureLines,
      description: product.description,
      score: product.score,
      imageUrl: product.images[0]?.imageUrl ?? null,
      imageUrls: product.images.map((image) => image.imageUrl)
    }))
  };
}
