import { env } from "../env";

export type BudgetOptionDto = { key: string; label: string; min: number; max: number };
export type RamOptionDto = { gb: number; label: string };
export type StorageOptionDto = { gb: number; label: string };

type OptionsSnapshot = {
  budgets: BudgetOptionDto[];
  ram: RamOptionDto[];
  storage: StorageOptionDto[];
  fetchedAtMs: number;
};

let cache: OptionsSnapshot | null = null;
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

  const [budgets, ram, storage] = await Promise.all([
    getJson<{ items: BudgetOptionDto[] }>("/api/options/budgets"),
    getJson<{ items: RamOptionDto[] }>("/api/options/ram"),
    getJson<{ items: StorageOptionDto[] }>("/api/options/storage")
  ]);

  cache = {
    budgets: budgets.items ?? [],
    ram: ram.items ?? [],
    storage: storage.items ?? [],
    fetchedAtMs: now
  };

  return cache;
}

