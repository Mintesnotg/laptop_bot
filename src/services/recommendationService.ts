import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { normalizeUsageKey, usageLabelFromKey } from "../shared/constants";
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
  usageTags: string[];
  featureLines: string[];
  description: string | null;
  images: { imageUrl: string }[];
  score: number;
  source: "strict" | "closest";
  usageOverlapCount: number;
  hasExactRamStorageMatch: boolean;
  exactPreference: boolean;
};

type ResolvedBudgetRange = {
  key: string;
  label: string;
  min: number;
  max: number;
};

type ScoredBand = {
  score: number;
  band: "exact" | "near" | "minimum" | "below";
  isExact: boolean;
};

function clamp(value: number, min = 0, max = 1) {
  
  
  return Math.min(max, Math.max(min, value));
}

function budgetMidpoint(budget: { min: number; max: number }) {
  return (budget.min + budget.max) / 2;
}

function distanceFromBudgetRange(price: number, budgetMin: number, budgetMax: number) {
  if (price < budgetMin) {
    return budgetMin - price;
  }
  if (price > budgetMax) {
    return price - budgetMax;
  }
  return 0;
}

function pickMedianBudget(budgets: ResolvedBudgetRange[]) {
  const ordered = [...budgets].sort((a, b) => a.min - b.min || a.max - b.max || a.key.localeCompare(b.key));
  const medianIndex = Math.floor(ordered.length / 2);
  return ordered[medianIndex];
}

function pickNearestBudgetByMidpoint(budgets: ResolvedBudgetRange[], target: { min: number; max: number }) {
  const targetMidpoint = budgetMidpoint(target);
  return [...budgets].sort(
    (a, b) =>
      Math.abs(budgetMidpoint(a) - targetMidpoint) - Math.abs(budgetMidpoint(b) - targetMidpoint) ||
      a.min - b.min ||
      a.max - b.max ||
      a.key.localeCompare(b.key)
  )[0];
}

async function resolveBudgetRange(budgetKey: string): Promise<ResolvedBudgetRange> {
  const [activeBudgets, selectedAnyBudget] = await Promise.all([
    prisma.budgetOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { min: "asc" }],
      select: { key: true, label: true, min: true, max: true }
    }),
    prisma.budgetOption.findUnique({
      where: { key: budgetKey },
      select: { key: true, label: true, min: true, max: true, isActive: true }
    })
  ]);

  const normalizedActiveBudgets: ResolvedBudgetRange[] = activeBudgets.map((row) => ({
    key: row.key,
    label: row.label,
    min: row.min,
    max: row.max
  }));

  if (normalizedActiveBudgets.length === 0) {
    throw new Error("Budget options are not configured. Please add at least one active budget range in admin options.");
  }

  const activeSelection = normalizedActiveBudgets.find((budget) => budget.key === budgetKey);
  if (activeSelection) {
    return activeSelection;
  }

  if (selectedAnyBudget) {
    return pickNearestBudgetByMidpoint(normalizedActiveBudgets, selectedAnyBudget);
  }

  return pickMedianBudget(normalizedActiveBudgets);
}

async function loadResourceOptionValues() {
  const [ramRows, storageRows] = await Promise.all([
    prisma.ramOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { gb: "asc" }],
      select: { gb: true }
    }),
    prisma.storageOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { gb: "asc" }],
      select: { gb: true }
    })
  ]);

  const ram = Array.from(new Set(ramRows.map((row) => row.gb))).sort((a, b) => a - b);
  const storage = Array.from(new Set(storageRows.map((row) => row.gb))).sort((a, b) => a - b);

  return {
    ram: ram.length > 0 ? ram : [8, 16, 32],
    storage: storage.length > 0 ? storage : [256, 512, 1024]
  };
}

function getLowerOptionStep(requested: number, options: number[]) {
  const lowerSteps = options.filter((value) => value < requested);
  if (lowerSteps.length === 0) {
    return requested;
  }
  return lowerSteps[lowerSteps.length - 1];
}

function scoreResourceMatch(actual: number, requested: number, options: number[]): ScoredBand {
  if (actual === requested) {
    return { score: 1, band: "exact", isExact: true };
  }

  const minAcceptable = getLowerOptionStep(requested, options);

  if (actual > requested) {
    const distanceRatio = (actual - requested) / Math.max(requested, 1);
    return {
      score: clamp(0.9 - distanceRatio * 0.35, 0.65, 0.95),
      band: "near",
      isExact: false
    };
  }

  if (actual >= minAcceptable) {
    const spread = Math.max(1, requested - minAcceptable);
    const closeness = (actual - minAcceptable) / spread;
    return {
      score: clamp(0.62 + closeness * 0.18, 0.58, 0.8),
      band: "minimum",
      isExact: false
    };
  }

  const relative = actual / Math.max(requested, 1);
  return {
    score: clamp(relative * 0.48, 0.06, 0.45),
    band: "below",
    isExact: false
  };
}

function scorePriceFit(price: number, budgetMin: number, budgetMax: number) {
  const range = Math.max(1, budgetMax - budgetMin);
  const midpoint = (budgetMin + budgetMax) / 2;

  if (midpoint >= budgetMin && midpoint <= budgetMax) {

    const normalizedDistance = Math.abs(price - midpoint) / Math.max(1, range / 2);
     var value = clamp(1 - normalizedDistance * 0.35, 0.65, 1);
    return value;
  }

  const distanceOutside = price < budgetMin ? budgetMin - price : price - budgetMax;
  
  var value = clamp(0.64 - distanceOutside / (range * 1.2), 0, 0.64);
  
  return value;
}

function parseCpuTier(cpu: string) {
  const text = cpu.toLowerCase();
  let tier = 0.45;

  if (text.includes("i9") || text.includes("ryzen 9") || text.includes("apple m4") || text.includes("apple m3")) {
    tier = 1;
  } else if (text.includes("i7") || text.includes("ryzen 7") || text.includes("apple m2")) {
    tier = 0.9;
  } else if (text.includes("i5") || text.includes("ryzen 5") || text.includes("apple m1")) {
    tier = 0.75;
  } else if (text.includes("i3") || text.includes("ryzen 3")) {
    tier = 0.6;
  }

  const generationMatch = cpu.match(/\b(1[0-9]|[4-9])(?:th)?\s*gen\b/i);
  const generation = generationMatch ? Number(generationMatch[1]) : 0;
  const generationBonus = generation >= 13 ? 0.08 : generation >= 11 ? 0.04 : 0;

  return clamp(tier + generationBonus, 0, 1);
}

function  computeUsageOverlap(productUsageTags: string[], requestedUsageTags: string[]) {
  const requestedSet = new Set(requestedUsageTags);
  const overlapCount = productUsageTags.filter((tag) => requestedSet.has(tag)).length;
  const overlapRatio = requestedUsageTags.length > 0 ? overlapCount / requestedUsageTags.length : 0;

  return {
    overlapCount,
    overlapRatio: clamp(overlapRatio, 0, 1),
    allRequestedMatched: requestedUsageTags.length > 0 && overlapCount === requestedUsageTags.length
  };
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
  return [
    "No close matches found for your current filters.",
    "Matches are returned when at least one usage tag overlaps or when RAM and storage are both exact matches.",
    `Try lowering RAM .`,
    `Try lowering storage .`,
    "Try moving to the next budget range."
  ].join(" ");
}

function rankProducts(
  products: Array<{
    id: string;
    brand: string;
    model: string;
    price: number;
    ramGb: number;
    storageGb: number;
    storageType: string;
    cpu: string;
    gpu: string | null;
    usageTags: string[];
    featureLines: string[];
    description: string | null;
    images: { imageUrl: string }[];
  }>,
  source: RankedProduct["source"],
  params: {
    budget: ResolvedBudgetRange;
    requestedUsageTags: string[];
    requestedRamGb: number;
    requestedStorageGb: number;
    ramOptions: number[];
    storageOptions: number[];
  }
) {
  return products.map((product) => {
    const scored = scoreProduct({
      product,
      budget: params.budget,
      requestedUsageTags: params.requestedUsageTags,
      requestedRamGb: params.requestedRamGb,
      requestedStorageGb: params.requestedStorageGb,
      ramOptions: params.ramOptions,
      storageOptions: params.storageOptions
    });

    return {
      ...product,
      score: scored.score,
      source,
      usageOverlapCount: scored.usageOverlapCount,
      hasExactRamStorageMatch: scored.hasExactRamStorageMatch,
      exactPreference: scored.exactPreference
    } satisfies RankedProduct;
  });
}

function normalizeRequestedUsage(rawUsage: string[]) {
  const normalized = rawUsage.map((usage) => normalizeUsageKey(usage)).filter((usage): usage is string => Boolean(usage));
  return Array.from(new Set(normalized));
}

function scoreProduct(params: {
  product: {
    price: number;
    ramGb: number;
    storageGb: number;
    cpu: string;
    usageTags: string[];
  };
  budget: { min: number; max: number };
  requestedUsageTags: string[];
  requestedRamGb: number;
  requestedStorageGb: number;
  ramOptions: number[];
  storageOptions: number[];
}) {
  const { product, budget, requestedUsageTags, requestedRamGb, requestedStorageGb, ramOptions, storageOptions } = params;

  const usageMatch = computeUsageOverlap(product.usageTags, requestedUsageTags);
  const ramBand = scoreResourceMatch(product.ramGb, requestedRamGb, ramOptions);
  const storageBand = scoreResourceMatch(product.storageGb, requestedStorageGb, storageOptions);
  const priceScore = scorePriceFit(product.price, budget.min, budget.max);
  const cpuScore = parseCpuTier(product.cpu);
  const hasExactRamStorageMatch = ramBand.isExact && storageBand.isExact;


  //const midpoint = (budget.min + budget.max) / 2;

  const exactPreference =
    usageMatch.allRequestedMatched &&
    hasExactRamStorageMatch;

  const weightedScore =
    usageMatch.overlapRatio * 0.4 +
    storageBand.score * 0.24 +
    ramBand.score * 0.18 +
    priceScore * 0.14 +
    cpuScore * 0.04 +
    (exactPreference ? 0.08 : 0);

  return {
    score: Number((clamp(weightedScore, 0, 1.08) * 100).toFixed(2)),
    usageOverlapCount: usageMatch.overlapCount,
    hasExactRamStorageMatch,
    exactPreference,
    ramBand,
    storageBand
  };
}

function buildUsageOrExactResourceWhere(
  requestedUsage: string[],
  requestedRamGb: number,
  requestedStorageGb: number
): Prisma.ProductWhereInput {
  const usageClause: Prisma.ProductWhereInput | null =
    requestedUsage.length > 0 ? { usageTags: { hasSome: requestedUsage } } : null;

  const exactResourceClause: Prisma.ProductWhereInput = {
    ramGb: requestedRamGb,
    storageGb: requestedStorageGb
  };

  return usageClause
    ? {
        OR: [usageClause, exactResourceClause]
      }
    : exactResourceClause;
}

export async function recommendLaptops(filters: RecommendationRequestInput) {
  
  
  
  const budget = await resolveBudgetRange(filters.budgetKey);

  const requestedUsage = normalizeRequestedUsage(filters.usage);
  const usageLabels = requestedUsage.map((usage) => usageLabelFromKey(usage));
  const { ram: ramOptions, storage: storageOptions } = await loadResourceOptionValues();
  const usageOrExactResourceWhere = buildUsageOrExactResourceWhere(
    requestedUsage,
    filters.ramGb,
    filters.storageGb
  );

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
      ...usageOrExactResourceWhere
    },
    include: {
      images: {
        select: { imageUrl: true },
        orderBy: { sortOrder: "asc" }
      }
    },
    take: 250
  });

  const rankedStrict: RankedProduct[] = rankProducts(strictProducts, "strict", {
    budget,
    requestedUsageTags: requestedUsage,
    requestedRamGb: filters.ramGb,
    requestedStorageGb: filters.storageGb,
    ramOptions,
    storageOptions
  });

  let ranked = dedupeProducts(rankedStrict)
    .filter((item) => item.usageOverlapCount > 0 || item.hasExactRamStorageMatch)
    .sort(
      (a, b) =>
        Number(b.hasExactRamStorageMatch) - Number(a.hasExactRamStorageMatch) ||
        b.score - a.score ||
        Number(b.exactPreference) - Number(a.exactPreference) ||
        b.usageOverlapCount - a.usageOverlapCount ||
        a.price - b.price ||
        a.id.localeCompare(b.id)
    );

  let matchMode: "strict" | "closest" = "strict";

  if (ranked.length === 0) {
    const closestCandidates = await prisma.product.findMany({
      where: {
        isActive: true,
        ...usageOrExactResourceWhere
      },
      include: {
        images: {
          select: { imageUrl: true },
          orderBy: { sortOrder: "asc" }
        }
      },
      take: 250
    });

    const rankedClosest = rankProducts(closestCandidates, "closest", {
      budget,
      requestedUsageTags: requestedUsage,
      requestedRamGb: filters.ramGb,
      requestedStorageGb: filters.storageGb,
      ramOptions,
      storageOptions
    });

    ranked = dedupeProducts(rankedClosest)
      .filter((item) => item.usageOverlapCount > 0 || item.hasExactRamStorageMatch)
      .sort(
        (a, b) =>
          distanceFromBudgetRange(a.price, budget.min, budget.max) -
            distanceFromBudgetRange(b.price, budget.min, budget.max) ||
          Number(b.hasExactRamStorageMatch) - Number(a.hasExactRamStorageMatch) ||
          b.score - a.score ||
          b.usageOverlapCount - a.usageOverlapCount ||
          a.price - b.price ||
          a.id.localeCompare(b.id)
      );

    matchMode = "closest";
  }

  const topResults = ranked.slice(0, filters.limit);
  const primaryUsage = requestedUsage[0] ?? "DAILY_BROWSING";

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
          budgetKey: budget.key,
          budgetLabel: budget.label,
          budgetMin: budget.min,
          budgetMax: budget.max,
          usageLabel: usageLabels[0] ?? "-",
          usageLabels,
          usageKeys: requestedUsage,
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
      budgetKey: budget.key,
      budget: budget.label,
      budgetMin: budget.min,
      budgetMax: budget.max,
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
