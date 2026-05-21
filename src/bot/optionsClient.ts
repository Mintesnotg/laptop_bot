import { env } from "../env";

export type BudgetOptionDto = { key: string; label: string; min: number; max: number };
export type RamOptionDto = { gb: number; label: string };
export type StorageOptionDto = { gb: number; label: string };
export type UsageTagOptionDto = { key: string; label: string };
export type TelegramPostingConfigDto = {
  sellerPhones: string[];
  telegramUsername: string;
  telegramProfileUrl: string;
  fullAddress: string;
  ctaText: string;
  fallbackImageUrl: string;
};

type OptionsSnapshot = {
  budgets: BudgetOptionDto[];
  ram: RamOptionDto[];
  storage: StorageOptionDto[];
  usageTags: UsageTagOptionDto[];
  fetchedAtMs: number;
};

let cache: OptionsSnapshot | null = null;
let postingConfigCache: { value: TelegramPostingConfigDto; fetchedAtMs: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${env.BOT_API_BASE_URL}${path}`, {
    headers: { "content-type": "application/json" }
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || `Failed to fetch ${path}`);
  }
  return response.json() as Promise<T>;
}

export async function getOptionsSnapshot(force = false): Promise<OptionsSnapshot> {
  const now = Date.now();
  if (!force && cache && now - cache.fetchedAtMs < CACHE_TTL_MS) {
    return cache;
  }

  const [budgets, ram, storage, usageTags] = await Promise.all([
    getJson<{ items: BudgetOptionDto[] }>("/api/options/budgets"),
    getJson<{ items: RamOptionDto[] }>("/api/options/ram"),
    getJson<{ items: StorageOptionDto[] }>("/api/options/storage"),
    getJson<{ items: UsageTagOptionDto[] }>("/api/options/usage-tags")
  ]);

  cache = {
    budgets: budgets.items ?? [],
    ram: ram.items ?? [],
    storage: storage.items ?? [],
    usageTags: usageTags.items ?? [],
    fetchedAtMs: now
  };

  return cache;
}

export async function getTelegramPostingConfigSnapshot(force = false): Promise<TelegramPostingConfigDto> {
  const now = Date.now();
  if (!force && postingConfigCache && now - postingConfigCache.fetchedAtMs < CACHE_TTL_MS) {
    return postingConfigCache.value;
  }

  const value = await getJson<TelegramPostingConfigDto>("/api/options/telegram-posting");
  postingConfigCache = {
    value,
    fetchedAtMs: now
  };

  return value;
}

