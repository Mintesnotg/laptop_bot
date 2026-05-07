export type BudgetRange = {
  key: string;
  label: string;
  min: number;
  max: number;
};

export const BUDGET_KEYS = ["40_60", "60_90", "90_130", "130_plus"] as const;

export const BUDGET_RANGES: BudgetRange[] = [
  { key: "40_60", label: "40k-60k ETB", min: 40000, max: 60000 },
  { key: "60_90", label: "60k-90k ETB", min: 60000, max: 90000 },
  { key: "90_130", label: "90k-130k ETB", min: 90000, max: 130000 },
  { key: "130_plus", label: "130k+ ETB", min: 130000, max: 999999 }
];

export const USAGE_OPTIONS = [
  { key: "STUDENT", label: "Student" },
  { key: "OFFICE", label: "Office" },
  { key: "DESIGN", label: "Design" },
  { key: "GAMING", label: "Gaming" },
  { key: "CODING", label: "Coding" },
  { key: "GRAPHICS_DESIGN", label: "Graphics Design" },
  { key: "ARCHITECTURE", label: "Architecture" },
  { key: "READING", label: "Reading" },
  { key: "DAILY_BROWSING", label: "Daily Browsing" }
] as const;

export const RAM_OPTIONS = [
  { gb: 8, label: "8 GB" },
  { gb: 16, label: "16 GB" },
  { gb: 32, label: "32 GB" }
] as const;

export const STORAGE_OPTIONS = [
  { gb: 256, label: "256 GB SSD" },
  { gb: 512, label: "512 GB SSD" },
  { gb: 1024, label: "1 TB SSD" }
] as const;

export function findBudgetRange(key: string) {
  return BUDGET_RANGES.find((range) => range.key === key);
}

export function usageLabelFromKey(key: string): string {
  const option = USAGE_OPTIONS.find((entry) => entry.key === key);
  return option?.label ?? key;
}
