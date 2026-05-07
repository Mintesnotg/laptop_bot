import { StorageType, UsageTag } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../prisma";
import { productCreateSchema } from "../../shared/contracts";
import { requireAdminApiKey } from "../middleware/requireAdminApiKey";

const productUpdateSchema = productCreateSchema.partial();

export const adminRouter = Router();

adminRouter.use(requireAdminApiKey);

adminRouter.get("/products", async (_req, res) => {
  const products = await prisma.product.findMany({
    include: {
      images: {
        select: { id: true, imageUrl: true, sortOrder: true },
        orderBy: { sortOrder: "asc" }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  res.json(products);
});

adminRouter.post("/products", async (req, res) => {
  const parsed = productCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const product = await prisma.product.create({
    data: {
      brand: parsed.data.brand,
      model: parsed.data.model,
      price: parsed.data.price,
      ramGb: parsed.data.ramGb,
      storageGb: parsed.data.storageGb,
      storageType: parsed.data.storageType as StorageType,
      cpu: parsed.data.cpu,
      gpu: parsed.data.gpu,
      usageTags: parsed.data.usageTags as UsageTag[],
      description: parsed.data.description,
      images: {
        create: parsed.data.imageUrls.map((url, index) => ({ imageUrl: url, sortOrder: index }))
      }
    },
    include: {
      images: true
    }
  });

  res.status(201).json(product);
});

adminRouter.put("/products/:id", async (req, res) => {
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const productId = req.params.id;

  const updated = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id: productId },
      data: {
        brand: parsed.data.brand,
        model: parsed.data.model,
        price: parsed.data.price,
        ramGb: parsed.data.ramGb,
        storageGb: parsed.data.storageGb,
        storageType: parsed.data.storageType as StorageType | undefined,
        cpu: parsed.data.cpu,
        gpu: parsed.data.gpu,
        usageTags: parsed.data.usageTags as UsageTag[] | undefined,
        description: parsed.data.description
      }
    });

    if (parsed.data.imageUrls) {
      await tx.productImage.deleteMany({ where: { productId } });
      if (parsed.data.imageUrls.length > 0) {
        await tx.productImage.createMany({
          data: parsed.data.imageUrls.map((url, index) => ({ productId, imageUrl: url, sortOrder: index }))
        });
      }
    }

    return product;
  });

  res.json(updated);
});

adminRouter.get("/analytics", async (_req, res) => {
  const [popularUsage, topBudgets, topResults] = await Promise.all([
    prisma.recommendationRequest.groupBy({
      by: ["usageTag"],
      _count: { _all: true }
    }),
    prisma.recommendationRequest.groupBy({
      by: ["budgetMin", "budgetMax"],
      _count: { _all: true }
    }),
    prisma.recommendationResult.groupBy({
      by: ["productId"],
      _count: { _all: true }
    })
  ]);

  const productIds = topResults.map((entry) => entry.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, brand: true, model: true }
  });

  const productMap = new Map(products.map((product) => [product.id, product]));

  res.json({
    popularUsage: popularUsage.sort((a, b) => b._count._all - a._count._all).slice(0, 10),
    topBudgets: topBudgets.sort((a, b) => b._count._all - a._count._all).slice(0, 10),
    topProducts: topResults
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10)
      .map((entry) => ({
      productId: entry.productId,
      count: entry._count._all,
      brand: productMap.get(entry.productId)?.brand ?? "Unknown",
      model: productMap.get(entry.productId)?.model ?? "Unknown"
      }))
  });
});
