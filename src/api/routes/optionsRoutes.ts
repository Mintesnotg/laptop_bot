import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { getTelegramPostingConfig } from "../../services/telegramPostingConfig";
import { DEFAULT_USAGE_OPTIONS, RAM_OPTIONS, STORAGE_OPTIONS } from "../../shared/constants";

export const optionsRouter = Router();

optionsRouter.get("/brands", async (_req, res) => {
  try {
    const rows = await prisma.brandOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });

    if (rows.length > 0) {
      return res.json({
        items: rows.map((row) => ({
          name: row.name,
          description: row.description
        }))
      });
    }
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2021" ||
      !(
        (typeof error.meta?.table === "string" && error.meta.table.includes("BrandOption")) ||
        error.message.toLowerCase().includes("brandoption")
      )
    ) {
      throw error;
    }
  }

  const productRows = await prisma.product.findMany({
    where: { isActive: true },
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" }
  });

  return res.json({
    items: productRows
      .map((row) => row.brand.trim())
      .filter((name, index, all) => name.length > 0 && all.findIndex((entry) => entry.toLowerCase() === name.toLowerCase()) === index)
      .map((name) => ({ name, description: "" }))
  });
});

optionsRouter.get("/budgets", async (_req, res) => {
  const rows = await prisma.budgetOption.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { min: "asc" }]
  });

  if (rows.length === 0) {
    return res.status(503).json({
      message: "Budget options are not configured. Please add at least one active budget range in admin options."
    });
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

