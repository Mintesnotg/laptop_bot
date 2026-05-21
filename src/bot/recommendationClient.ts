import { env } from "../env";
import { CLIENT_USAGE_VALUES } from "../shared/constants";

export const usageValues = CLIENT_USAGE_VALUES;
export type RecommendationUsage = (typeof usageValues)[number] | string;

const FETCH_TIMEOUT_MS = 30_000;

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

function parseApiError(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { message?: string; detail?: string };
    if (parsed.detail) {
      return `${parsed.message ?? "Recommendation API request failed"} (${parsed.detail})`;
    }
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    // Fall through to raw text.
  }

  return raw || "Recommendation API request failed";
}

export async function fetchRecommendations(payload: RecommendationPayload): Promise<RecommendationApiResponse> {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
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
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(parseApiError(raw));
    }

    return response.json() as Promise<RecommendationApiResponse>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Recommendation request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
