import { env } from "../env";

type RecommendationPayload = {
  telegramUserId?: bigint;
  budgetKey: string;
  usage: string;
  ramGb: number;
  storageGb: number;
  limit?: number;
};

export async function fetchRecommendations(payload: RecommendationPayload) {
  const response = await fetch(`${env.BOT_API_BASE_URL}/api/recommendations`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
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
