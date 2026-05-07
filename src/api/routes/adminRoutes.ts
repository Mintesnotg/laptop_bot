import { Prisma, StorageType, UsageTag } from "@prisma/client";
import bcrypt from "bcryptjs";
import { type Request, Router } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../../env";
import { prisma } from "../../prisma";
import { productCreateSchema } from "../../shared/contracts";
import { requireAdminAuth } from "../middleware/requireAdminAuth";

const productUpdateSchema = productCreateSchema.partial();

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().optional()
});

const productStatusSchema = z.object({
  isActive: z.boolean()
});

const uploadDirAbsolutePath = path.resolve(process.cwd(), env.ADMIN_UPLOAD_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: (
      _req: Request,
      _file: Express.Multer.File,
      cb: (error: Error | null, destination: string) => void
    ) => {
      fs.mkdirSync(uploadDirAbsolutePath, { recursive: true });
      cb(null, uploadDirAbsolutePath);
    },
    filename: (
      _req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, filename: string) => void
    ) => {
      const extension = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: env.ADMIN_UPLOAD_MAX_FILE_MB * 1024 * 1024,
    files: 10
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }

    cb(new Error("Only image uploads are allowed"));
  }
});

export const adminRouter = Router();

adminRouter.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const username = parsed.data.username.toLowerCase();
  const admin = await prisma.adminUser.findUnique({ where: { username } });

  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, admin.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  const token = jwt.sign(
    {
      sub: admin.id,
      username: admin.username,
      type: "admin"
    },
    env.ADMIN_JWT_SECRET,
    {
      expiresIn: env.ADMIN_JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
    }
  );

  return res.json({
    token,
    user: {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      isActive: admin.isActive
    }
  });
});

adminRouter.get("/auth/me", requireAdminAuth, async (req, res) => {
  const requestWithAdmin = req as typeof req & { adminUserId?: string; adminUsername?: string };

  if (!requestWithAdmin.adminUserId) {
    return res.json({
      authMode: "apiKey",
      user: {
        id: "api-key",
        username: "api-key",
        displayName: "API Key Auth",
        isActive: true
      }
    });
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: requestWithAdmin.adminUserId },
    select: { id: true, username: true, displayName: true, isActive: true }
  });

  if (!admin || !admin.isActive) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  return res.json({ authMode: "token", user: admin });
});

adminRouter.use(requireAdminAuth);

adminRouter.get("/products", async (req, res) => {
  const parsed = listProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const { page, pageSize, search } = parsed.data;
  const skip = (page - 1) * pageSize;

  const where: Prisma.ProductWhereInput = search
    ? {
        OR: [
          { brand: { contains: search, mode: "insensitive" } },
          { model: { contains: search, mode: "insensitive" } }
        ]
      }
    : {};

  const [total, items] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: {
        images: {
          select: { id: true, imageUrl: true, sortOrder: true },
          orderBy: { sortOrder: "asc" }
        }
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return res.json({
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages
    }
  });
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
      isActive: true,
      images: {
        create: parsed.data.imageUrls.map((url, index) => ({ imageUrl: url, sortOrder: index }))
      }
    },
    include: {
      images: true
    }
  });

  return res.status(201).json(product);
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

  return res.json(updated);
});

adminRouter.patch("/products/:id/status", async (req, res) => {
  const parsed = productStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: { isActive: parsed.data.isActive },
    select: {
      id: true,
      brand: true,
      model: true,
      isActive: true,
      updatedAt: true
    }
  });

  return res.json(updated);
});

adminRouter.post("/uploads", upload.array("images", 10), async (req, res) => {
  const files = ((req as Request & { files?: Express.Multer.File[] }).files ?? []) as Express.Multer.File[];
  if (files.length === 0) {
    return res.status(400).json({ message: "No image files uploaded" });
  }

  return res.status(201).json({
    files: files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/${file.filename}`
    }))
  });
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

  return res.json({
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
