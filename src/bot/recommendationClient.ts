import { env } from "../env";
import { CLIENT_USAGE_VALUES, type UsageKey } from "../shared/constants";

export const usageValues = CLIENT_USAGE_VALUES;
export type RecommendationUsage = (typeof usageValues)[number] | UsageKey;

type RecommendationPayload = {
  telegramUserId?: bigint;
  budgetKey: string;
  usage: RecommendationUsage[];
  ramGb: number;
  storageGb: number;
  limit?: number;
};

type RecommendationApiResponse = {
  filters: {
    budget: string;
    usage: string[];
    ramGb: number;
    storageGb: number;
  };
  matchMode?: "strict" | "relaxed";
  hintMessage?: string;
  items: Array<{
    id: string;
    brand: string;
    model: string;
    price: number;
    ramGb: number;
    storageGb: number;
    storageType: string;
    cpu: string;
    gpu: string | null;
    usageTags?: string[];
    featureLines?: string[];
    description?: string | null;
    score: number;
    imageUrl?: string | null;
    imageUrls?: string[];
  }>;
};

function toApiUsageValue(usage: RecommendationUsage): string {
  return usage === "UX/UI" ? "UX_UI" : usage;
}

export async function fetchRecommendations(payload: RecommendationPayload): Promise<RecommendationApiResponse> {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const response = await fetch(`${env.BOT_API_BASE_URL}/api/recommendations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": `bot-rec:${requestId}`
    },
    body: JSON.stringify({
      ...payload,
      usage: payload.usage.map((entry) => toApiUsageValue(entry)),
      telegramUserId: payload.telegramUserId ? payload.telegramUserId.toString() : undefined,
      limit: payload.limit ?? 5
    })
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || "Recommendation API request failed");
  }

  return response.json() as Promise<RecommendationApiResponse>;
}
