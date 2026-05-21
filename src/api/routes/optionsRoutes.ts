import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { getTelegramPostingConfig } from "../../services/telegramPostingConfig";
import { BUDGET_RANGES, DEFAULT_USAGE_OPTIONS, RAM_OPTIONS, STORAGE_OPTIONS } from "../../shared/constants";

export const optionsRouter = Router();

optionsRouter.get("/budgets", async (_req, res) => {
  const rows = await prisma.budgetOption.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { min: "asc" }]
  });

  if (rows.length === 0) {
    return res.json({ items: BUDGET_RANGES });
  }

  return res.json({
    items: rows.map((row) => ({
      key: row.key,
      label: row.label,
      min: row.min,
      max: row.max
    }))
  });
});

optionsRouter.get("/ram", async (_req, res) => {
  const rows = await prisma.ramOption.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { gb: "asc" }]
  });

  if (rows.length === 0) {
    return res.json({ items: RAM_OPTIONS.map((x) => ({ gb: x.gb, label: x.label })) });
  }

  return res.json({ items: rows.map((row) => ({ gb: row.gb, label: row.label })) });
});

optionsRouter.get("/storage", async (_req, res) => {
  const rows = await prisma.storageOption.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { gb: "asc" }]
  });

  if (rows.length === 0) {
    return res.json({ items: STORAGE_OPTIONS.map((x) => ({ gb: x.gb, label: x.label })) });
  }

  return res.json({ items: rows.map((row) => ({ gb: row.gb, label: row.label })) });
});

optionsRouter.get("/usage-tags", async (_req, res) => {
  try {
    const rows = await prisma.usageTagOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }]
    });

    if (rows.length === 0) {
      return res.json({
        items: DEFAULT_USAGE_OPTIONS.map((entry) => ({ key: entry.key, label: entry.label }))
      });
    }

    return res.json({
      items: rows.map((row) => ({ key: row.key, label: row.label }))
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2021" &&
      (typeof error.meta?.table === "string"
        ? error.meta.table.includes("UsageTagOption")
        : error.message.toLowerCase().includes("usagetagoption"))
    ) {
      return res.json({
        items: DEFAULT_USAGE_OPTIONS.map((entry) => ({ key: entry.key, label: entry.label }))
      });
    }
    throw error;
  }
});

optionsRouter.get("/telegram-posting", async (_req, res) => {
 
  const config = await getTelegramPostingConfig();
 
  return res.json(config);
});

