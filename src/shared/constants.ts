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
  { key: "STUDENT", label: "Student Use" },
  { key: "OFFICE", label: "Office Work" },
  { key: "GAMING", label: "Gaming" },
  { key: "CODING", label: "Programming" },
  { key: "GRAPHICS_DESIGN", label: "Video Editing / Graphics" },
  { key: "DESIGN", label: "Design" },
  { key: "UX_UI", label: "Design UI/UX" },
  { key: "DAILY_BROWSING", label: "Daily Browsing" }
] as const;

export const USAGE_KEYS = USAGE_OPTIONS.map((entry) => entry.key) as [
  (typeof USAGE_OPTIONS)[number]["key"],
  ...(typeof USAGE_OPTIONS)[number]["key"][]
];

export type UsageKey = (typeof USAGE_OPTIONS)[number]["key"];

const usageAliasMap: Record<string, UsageKey> = {
  "UX/UI": "UX_UI",
  UXUI: "UX_UI",
  UI_UX: "UX_UI",
  UIUX: "UX_UI",
  UI_UX_DESIGN: "UX_UI",
  VIDEO_EDITING: "GRAPHICS_DESIGN",
  VIDEO_EDIT: "GRAPHICS_DESIGN",
  VIDEOEDITING: "GRAPHICS_DESIGN",
  VIDEO_EDITOR: "GRAPHICS_DESIGN",
  VIDEO: "GRAPHICS_DESIGN",
  PROGRAMMING: "CODING",
  DEVELOPER: "CODING",
  DEVELOPERS: "CODING",
  SOFTWARE_DEVELOPMENT: "CODING",
  OFFICE_WORK: "OFFICE",
  OFFICEWORK: "OFFICE",
  STUDENT_USE: "STUDENT",
  DESIGN_UI_UX: "UX_UI"
};

export function normalizeUsageKey(raw: string): UsageKey | null {
  const trimmed = raw.trim();
  const normalized = trimmed.toUpperCase().replace(/[^\w]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

  if ((USAGE_KEYS as readonly string[]).includes(normalized)) {
    return normalized as UsageKey;
  }

  return usageAliasMap[normalized] ?? usageAliasMap[trimmed.toUpperCase()] ?? null;
}

export const CLIENT_USAGE_VALUES = [
  "STUDENT",
  "STUDENT_USE",
  "OFFICE",
  "OFFICE_WORK",
  "DESIGN",
  "GAMING",
  "CODING",
  "PROGRAMMING",
  "GRAPHICS_DESIGN",
  "VIDEO_EDITING",
  "ARCHITECTURE",
  "FINANCE",
  "MARKETING",
  "HR",
  "SALES",
  "ENGINEERING",
  "DEVOPS",
  "PRODUCT",
  "UX/UI",
  "ANALYTICS",
  "READING",
  "DAILY_BROWSING"
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
