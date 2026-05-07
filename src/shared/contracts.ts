import { z } from "zod";
import { BUDGET_KEYS } from "./constants";

const usageKeys = [
  "STUDENT",
  "OFFICE",
  "DESIGN",
  "GAMING",
  "CODING",
  "GRAPHICS_DESIGN",
  "ARCHITECTURE",
  "READING",
  "DAILY_BROWSING"
] as const;

export const recommendationRequestSchema = z.object({
  telegramUserId: z.coerce.bigint().optional(),
  budgetKey: z.enum(BUDGET_KEYS),
  usage: z.enum(usageKeys),
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
  usageTags: z.array(z.enum(usageKeys)).min(1),
  description: z.string().optional(),
  imageUrls: z.array(z.string().url()).default([])
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
