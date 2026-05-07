import { UsageTag } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";

const preferenceSchema = z.object({
  telegramUserId: z.coerce.bigint(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  languageCode: z.string().optional(),
  budgetMin: z.number().int().positive(),
  budgetMax: z.number().int().positive(),
  usageTag: z.enum([
    "STUDENT",
    "OFFICE",
    "DESIGN",
    "GAMING",
    "CODING",
    "GRAPHICS_DESIGN",
    "ARCHITECTURE",
    "READING",
    "DAILY_BROWSING"
  ]),
  ramGb: z.number().int().positive(),
  storageGb: z.number().int().positive()
});

export const userPreferenceRouter = Router();

userPreferenceRouter.post("/", async (req, res) => {
  const parsed = preferenceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const user = await prisma.telegramUser.upsert({
    where: { telegramUserId: parsed.data.telegramUserId },
    update: {
      username: parsed.data.username,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      languageCode: parsed.data.languageCode
    },
    create: {
      telegramUserId: parsed.data.telegramUserId,
      username: parsed.data.username,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      languageCode: parsed.data.languageCode
    }
  });

  const preference = await prisma.userPreference.create({
    data: {
      userId: user.id,
      budgetMin: parsed.data.budgetMin,
      budgetMax: parsed.data.budgetMax,
      usageTag: parsed.data.usageTag as UsageTag,
      ramGb: parsed.data.ramGb,
      storageGb: parsed.data.storageGb
    }
  });

  res.status(201).json(preference);
});
