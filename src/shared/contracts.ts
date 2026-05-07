import { z } from "zod";
import { BUDGET_KEYS, normalizeUsageKey, USAGE_KEYS, type UsageKey } from "./constants";

export const usageTagSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeUsageKey(value);
  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid usage value. Allowed values: ${USAGE_KEYS.join(", ")} and UX/UI`
    });
    return z.NEVER;
  }

  return normalized as UsageKey;
});

const imageLocationSchema = z.string().refine((value) => {
  if (value.startsWith("/uploads/")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}, "Image URL must be https://... or /uploads/...");

export const recommendationRequestSchema = z.object({
  telegramUserId: z.coerce.bigint().optional(),
  budgetKey: z.enum(BUDGET_KEYS),
  usage: usageTagSchema,
  ramGb: z.number().int().min(4),
  storageGb: z.number().int().min(128),
  limit: z.number().int().min(1).max(10).default(5)
});

export type RecommendationRequestInput = z.infer<typeof recommendationRequestSchema>;

export const productCreateSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  price: z.number().int().positive(),
  ramGb: z.number().int().positive(),
  storageGb: z.number().int().positive(),
  storageType: z.enum(["SSD", "NVME", "HDD"]),
  cpu: z.string().min(1),
  gpu: z.string().optional(),
  usageTags: z.array(usageTagSchema).min(1),
  description: z.string().optional(),
  imageUrls: z.array(imageLocationSchema).default([])
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
