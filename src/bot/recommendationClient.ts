import { env } from "../env";
import { CLIENT_USAGE_VALUES, type UsageKey } from "../shared/constants";

export const usageValues = CLIENT_USAGE_VALUES;
export type RecommendationUsage = UsageKey | "UX/UI";

type RecommendationPayload = {
  telegramUserId?: bigint;
  budgetKey: string;
  usage: RecommendationUsage;
  ramGb: number;
  storageGb: number;
  limit?: number;
};

function toApiUsageValue(usage: RecommendationUsage): UsageKey {
  return usage === "UX/UI" ? "UX_UI" : usage;
}

export async function fetchRecommendations(payload: RecommendationPayload) {
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
      usage: toApiUsageValue(payload.usage),
      telegramUserId: payload.telegramUserId ? payload.telegramUserId.toString() : undefined,
      limit: payload.limit ?? 5
    })
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || "Recommendation API request failed");
  }

  return response.json();
}
