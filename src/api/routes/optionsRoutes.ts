import { Router } from "express";
import { prisma } from "../../prisma";
import { getTelegramPostingConfig } from "../../services/telegramPostingConfig";
import { BUDGET_RANGES, RAM_OPTIONS, STORAGE_OPTIONS, USAGE_OPTIONS } from "../../shared/constants";

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

optionsRouter.get("/usage-tags", (_req, res) => {
  // UsageTag is an enum (static), but we expose it here so the admin UI stays in sync.
  return res.json({
    items: USAGE_OPTIONS.map((entry) => ({ key: entry.key, label: entry.label }))
  });
});

optionsRouter.get("/telegram-posting", async (_req, res) => {
 
  const config = await getTelegramPostingConfig();
 
  return res.json(config);
});

