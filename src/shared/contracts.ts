import { z } from "zod";
import { normalizeUsageKey, USAGE_KEYS, type UsageKey } from "./constants";

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

export const usageTagsSchema = z.array(usageTagSchema).min(1).transform((values) => Array.from(new Set(values)));

const recommendationUsageSchema = z
  .union([usageTagSchema, z.array(usageTagSchema).min(1)])
  .transform((value) => (Array.isArray(value) ? Array.from(new Set(value)) : [value]));

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

const featureLineSchema = z.string().trim().min(1).max(120);

export const recommendationRequestSchema = z.object({
  telegramUserId: z.coerce.bigint().optional(),
  budgetKey: z.string().trim().min(1),
  usage: recommendationUsageSchema,
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
  usageTags: usageTagsSchema,
  description: z.string().optional(),
  featureLines: z.array(featureLineSchema).max(8).default([]),
  imageUrls: z.array(imageLocationSchema).default([])
});

export const productUpdateSchema = z.object({
  brand: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  price: z.number().int().positive().optional(),
  ramGb: z.number().int().positive().optional(),
  storageGb: z.number().int().positive().optional(),
  storageType: z.enum(["SSD", "NVME", "HDD"]).optional(),
  cpu: z.string().min(1).optional(),
  gpu: z.string().optional(),
  usageTags: usageTagsSchema.optional(),
  description: z.string().optional(),
  featureLines: z.array(featureLineSchema).max(8).optional(),
  imageUrls: z.array(imageLocationSchema).optional()
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
