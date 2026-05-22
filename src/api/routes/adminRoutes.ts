import { Prisma, Product, ProductChannelPublication, ProductImage, StorageType } from "@prisma/client";
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
import {
  type ChannelPublicationPayload,
  normalizeTelegramChannelTarget,
  removePublishedProductFromChannel,
  replacePublishedProductOnChannel,
  sendFreshProductChannelPost,
} from "../../services/telegramChannelPublisher";
import {
  getTelegramPostingConfig,
  normalizeTelegramPostingConfig,
  upsertTelegramPostingConfig
} from "../../services/telegramPostingConfig";
import { DEFAULT_USAGE_OPTIONS, normalizeUsageKey } from "../../shared/constants";
import { productCreateSchema, productUpdateSchema } from "../../shared/contracts";
import { requireAdminAuth } from "../middleware/requireAdminAuth";

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

const budgetOptionCreateSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  min: z.number().int().min(0),
  max: z.number().int().min(0),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
});

const budgetOptionUpdateSchema = budgetOptionCreateSchema.partial();

const ramOptionCreateSchema = z.object({
  gb: z.number().int().min(1),
  label: z.string().trim().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
});

const ramOptionUpdateSchema = ramOptionCreateSchema.partial();

const storageOptionCreateSchema = z.object({
  gb: z.number().int().min(1),
  label: z.string().trim().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
});

const storageOptionUpdateSchema = storageOptionCreateSchema.partial();
const usageTagOptionCreateSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
});

const usageTagOptionUpdateSchema = usageTagOptionCreateSchema.partial();
const channelOptionUpdateSchema = z.object({
  channelTarget: z.string().trim().max(255)
});
const telegramPostingOptionUpdateSchema = z.object({
  sellerPhones: z.array(z.string().trim()).default([]),
  telegramUsername: z.string().trim().default(""),
  telegramProfileUrl: z.string().trim().default(""),
  fullAddress: z.string().trim().default(""),
  ctaText: z.string().trim().default(""),
  fallbackImageUrl: z.string().trim().default("")
});

const TELEGRAM_CHANNEL_SETTING_KEY = "telegramChannelTarget";
const CHANNEL_PUBLICATION_TABLE_MISSING_MESSAGE =
  "Telegram publication tracking is not initialized. Run Prisma migrations to create ProductChannelPublication and retry.";

const DUPLICATE_ACTIVE_PRODUCT_MESSAGE = (brand: string, model: string) =>
  `Product "${brand} ${model}" already exists. Please edit the existing product instead.`;

type ProductWithImagesAndChannelPublication = Product & {
  images: ProductImage[];
  channelPublication: ProductChannelPublication | null;
};

type ProductCompatibilityRow = Omit<Product, "featureLines"> & {
  images: ProductImage[];
  featureLines?: string[] | null;
  channelPublication?: ProductChannelPublication | null;
};

function isMissingProductChannelPublicationTableError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2021") {
    return false;
  }

  const tableName = typeof error.meta?.table === "string" ? error.meta.table : "";
  return tableName.includes("ProductChannelPublication");
}

function isMissingProductFeatureLinesColumnError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const column = typeof error.meta?.column === "string" ? error.meta.column : "";
    if (column.toLowerCase().includes("featurelines")) {
      return true;
    }
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error && typeof (error as { message?: string }).message === "string"
        ? (error as { message: string }).message
        : "";
  return message.toLowerCase().includes("product.featurelines");
}

function isMissingUsageTagOptionTableError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2021") {
    return false;
  }

  const tableName = typeof error.meta?.table === "string" ? error.meta.table : "";
  if (tableName.includes("UsageTagOption")) {
    return true;
  }

  const message = error.message.toLowerCase();
  return message.includes("usagetagoption");
}

function withFeatureLinesFallback<T extends ProductCompatibilityRow>(product: T) {
 debugger
  return {
    ...product,
    featureLines: Array.isArray(product.featureLines) ? product.featureLines : []
  };
}

function productListSelectWithoutFeatureLines(withChannelPublication: boolean) {
  const base = {
    id: true,
    brand: true,
    model: true,
    price: true,
    ramGb: true,
    storageGb: true,
    storageType: true,
    cpu: true,
    gpu: true,
    usageTags: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    images: { select: { id: true, imageUrl: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } }
  };

  if (!withChannelPublication) {
    return base;
  }

  return {
    ...base,
    channelPublication: { select: { id: true, lastPublishedAt: true, lastSyncError: true } }
  };
}

function productSelectForSingle(withFeatureLines: boolean, withChannelPublication: boolean) {
  const base = {
    id: true,
    brand: true,
    model: true,
    price: true,
    ramGb: true,
    storageGb: true,
    storageType: true,
    cpu: true,
    gpu: true,
    usageTags: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    images: { orderBy: { sortOrder: "asc" as const } }
  };

  const withFeatures = withFeatureLines ? { ...base, featureLines: true } : base;
  return withChannelPublication ? { ...withFeatures, channelPublication: true } : withFeatures;
}

async function isProductChannelPublicationTableAvailable() {
  try {
    await prisma.productChannelPublication.count();
    return true;
  } catch (error) {
    if (isMissingProductChannelPublicationTableError(error)) {
      return false;
    }
    throw error;
  }
}

async function findProductWithImagesAndPublication(
  productId: string
): Promise<ProductWithImagesAndChannelPublication | null> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: productSelectForSingle(true, true)
    });
    return product
      ? (withFeatureLinesFallback(product as ProductCompatibilityRow) as ProductWithImagesAndChannelPublication)
      : null;
  } catch (initialError) {
    if (!isMissingProductChannelPublicationTableError(initialError) && !isMissingProductFeatureLinesColumnError(initialError)) {
      throw initialError;
    }

    const fallbackPlan: Array<{ withFeatureLines: boolean; withChannelPublication: boolean }> = [];
    if (isMissingProductFeatureLinesColumnError(initialError)) {
      fallbackPlan.push({ withFeatureLines: false, withChannelPublication: true });
    }
    if (isMissingProductChannelPublicationTableError(initialError)) {
      fallbackPlan.push({ withFeatureLines: true, withChannelPublication: false });
    }
    fallbackPlan.push({ withFeatureLines: false, withChannelPublication: false });

    for (const candidate of fallbackPlan) {
      try {
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: productSelectForSingle(candidate.withFeatureLines, candidate.withChannelPublication)
        });
        if (!product) {
          return null;
        }

        const normalized = withFeatureLinesFallback(product as ProductCompatibilityRow);
        return {
          ...normalized,
          channelPublication: candidate.withChannelPublication
            ? ((normalized.channelPublication ?? null) as ProductChannelPublication | null)
            : null
        } as ProductWithImagesAndChannelPublication;
      } catch (error) {
        if (isMissingProductFeatureLinesColumnError(error) || isMissingProductChannelPublicationTableError(error)) {
          continue;
        }
        throw error;
      }
    }

    return null;
  }
}

async function upsertChannelPublicationRecord(
  productId: string,
  channelTarget: string,
  payload: ChannelPublicationPayload,
  lastSyncError: string | null
) {
  const norm = normalizeTelegramChannelTarget(channelTarget);
  const now = new Date();
  await prisma.productChannelPublication.upsert({
    where: { productId },
    create: {
      productId,
      channelTarget: norm,
      postKind: payload.postKind,
      messageIds: payload.messageIds,
      imageUrlsSnapshot: payload.imageUrlsSnapshot,
      lastPublishedAt: now,
      lastSyncedAt: now,
      lastSyncError
    },
    update: {
      channelTarget: norm,
      postKind: payload.postKind,
      messageIds: payload.messageIds,
      imageUrlsSnapshot: payload.imageUrlsSnapshot,
      lastPublishedAt: now,
      lastSyncedAt: now,
      lastSyncError
    }
  });
}

async function setChannelPublicationSyncError(productId: string, message: string) {
  await prisma.productChannelPublication.updateMany({
    where: { productId },
    data: {
      lastSyncedAt: new Date(),
      lastSyncError: message
    }
  });
}

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

adminRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store, must-revalidate");
  next();
});

async function getTelegramChannelTarget() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: TELEGRAM_CHANNEL_SETTING_KEY },
    select: { value: true }
  });

  return normalizeTelegramChannelTarget(setting?.value ?? "");
}

function normalizeUsageOptionKeyOrThrow(rawKey: string) {
  const normalized = normalizeUsageKey(rawKey);
  if (!normalized) {
    throw new Error("Usage key must be a non-empty value.");
  }
  return normalized;
}

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

adminRouter.get("/options/channel", async (_req, res) => {
  const channelTarget = await getTelegramChannelTarget();
  return res.json({ channelTarget });
});

adminRouter.put("/options/channel", async (req, res) => {
  const parsed = channelOptionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const normalizedChannelTarget = normalizeTelegramChannelTarget(parsed.data.channelTarget);

  const setting = await prisma.appSetting.upsert({
    where: { key: TELEGRAM_CHANNEL_SETTING_KEY },
    update: { value: normalizedChannelTarget },
    create: {
      key: TELEGRAM_CHANNEL_SETTING_KEY,
      value: normalizedChannelTarget
    }
  });

  return res.json({ channelTarget: setting.value });
});

adminRouter.get("/options/telegram-posting", async (_req, res) => {
  const config = await getTelegramPostingConfig();
  return res.json(config);
});

adminRouter.put("/options/telegram-posting", async (req, res) => {
  const parsed = telegramPostingOptionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const normalized = normalizeTelegramPostingConfig(parsed.data);
  const saved = await upsertTelegramPostingConfig(normalized);
  return res.json(saved);
});

adminRouter.get("/products", async (req, res) => {
  debugger;
  const parsed = listProductsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    debugger;
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

  let total = 0;
  let items: any[] = [];

  try {
    [total, items] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select: productListSelectWithoutFeatureLines(true),
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize
      })
    ]);
  } catch (error) {
    const missingPublication = isMissingProductChannelPublicationTableError(error);
    const missingFeatureLines = isMissingProductFeatureLinesColumnError(error);

    if (!missingPublication && !missingFeatureLines) {
      throw error;
    }

    const fallbackWithPublication = !missingPublication;

    const [fallbackTotal, fallbackItems] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select: productListSelectWithoutFeatureLines(fallbackWithPublication),
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize
      })
    ]);
   console.log( "fallbackTotal", fallbackTotal);
   
    total = fallbackTotal;
    items = fallbackItems.map((item) => ({
    
      ...withFeatureLinesFallback(item as ProductCompatibilityRow),
      channelPublication: fallbackWithPublication
        ? (((item as ProductCompatibilityRow).channelPublication ?? null) as ProductChannelPublication | null)
        : null
    }));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedItems = items.map((item) => ({
    ...withFeatureLinesFallback(item as ProductCompatibilityRow),
    channelPublication: ((item as ProductCompatibilityRow).channelPublication ?? null) as ProductChannelPublication | null
  }));

  
  return res.json({
    items: normalizedItems,
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

  const duplicate = await prisma.product.findFirst({
    where: {
      isActive: true,
      brand: { equals: parsed.data.brand, mode: "insensitive" },
      model: { equals: parsed.data.model, mode: "insensitive" }
    },
    select: { id: true }
  });

  if (duplicate) {
    return res.status(409).json({
      message: DUPLICATE_ACTIVE_PRODUCT_MESSAGE(parsed.data.brand, parsed.data.model),
      existingProductId: duplicate.id
    });
  }

  try {
    const hasPublicationTable = await isProductChannelPublicationTableAvailable();
    const createDataWithoutFeatureLines = {
      brand: parsed.data.brand,
      model: parsed.data.model,
      price: parsed.data.price,
      ramGb: parsed.data.ramGb,
      storageGb: parsed.data.storageGb,
      storageType: parsed.data.storageType as StorageType,
      cpu: parsed.data.cpu,
      gpu: parsed.data.gpu,
      usageTags: parsed.data.usageTags,
      description: parsed.data.description,
      isActive: true,
      images: {
        create: parsed.data.imageUrls.map((url, index) => ({ imageUrl: url, sortOrder: index }))
      }
    };
    const createDataWithFeatureLines = {
      ...createDataWithoutFeatureLines,
      featureLines: parsed.data.featureLines
    };

    if (!hasPublicationTable) {
      try {
        const product = await prisma.product.create({
          data: createDataWithFeatureLines,
          include: { images: true }
        });
        return res.status(201).json({ ...product, channelPublication: null });
      } catch (error) {
        if (!isMissingProductFeatureLinesColumnError(error)) {
          throw error;
        }

        const fallbackProduct = await prisma.product.create({
          data: createDataWithoutFeatureLines,
          include: { images: true }
        });
        return res.status(201).json({ ...fallbackProduct, channelPublication: null, featureLines: [] });
      }
    }

    try {
      const product = await prisma.product.create({
        data: createDataWithFeatureLines,
        include: {
          images: true,
          channelPublication: {
            select: { id: true, lastPublishedAt: true, lastSyncError: true }
          }
        }
      });

      return res.status(201).json(product);
    } catch (error) {
      if (!isMissingProductFeatureLinesColumnError(error)) {
        throw error;
      }

      const fallbackProduct = await prisma.product.create({
        data: createDataWithoutFeatureLines,
        include: {
          images: true,
          channelPublication: {
            select: { id: true, lastPublishedAt: true, lastSyncError: true }
          }
        }
      });

      return res.status(201).json({ ...fallbackProduct, featureLines: [] });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({
        message: DUPLICATE_ACTIVE_PRODUCT_MESSAGE(parsed.data.brand, parsed.data.model)
      });
    }

    throw error;
  }
});

adminRouter.post("/products/:id/publish", async (req, res) => {
  const productId = req.params.id;
  const channelTarget = await getTelegramChannelTarget();
  if (!channelTarget) {
    return res.status(400).json({
      message: "Channel target is not configured. Set it on the Options page."
    });
  }

  const hasPublicationTable = await isProductChannelPublicationTableAvailable();
  if (!hasPublicationTable) {
    return res.status(503).json({ message: CHANNEL_PUBLICATION_TABLE_MISSING_MESSAGE });
  }

  const product = await findProductWithImagesAndPublication(productId);

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (!product.isActive) {
    return res.status(400).json({ message: "Cannot publish an inactive product." });
  }

  let result;
  let payload: ChannelPublicationPayload | null = null;

  if (product.channelPublication) {
    ({ result, payload } = await replacePublishedProductOnChannel(
      channelTarget,
      product,
      product.channelPublication
    ));
  } else {
    ({ result, payload } = await sendFreshProductChannelPost(channelTarget, product));
  }

  if (payload && result.success) {
    await upsertChannelPublicationRecord(productId, channelTarget, payload, null);
  } else if (!result.success && product.channelPublication) {
    await setChannelPublicationSyncError(productId, result.message ?? "Publish replace failed");
  }

  const publication = await prisma.productChannelPublication.findUnique({
    where: { productId },
    select: { id: true, lastPublishedAt: true, lastSyncError: true }
  });

  return res.json({
    channelPost: result,
    publication: publication ?? undefined
  });
});

adminRouter.put("/products/:id", async (req, res) => {
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const productId = req.params.id;

  let updated;
  const baseUpdateData = {
    brand: parsed.data.brand,
    model: parsed.data.model,
    price: parsed.data.price,
    ramGb: parsed.data.ramGb,
    storageGb: parsed.data.storageGb,
    storageType: parsed.data.storageType as StorageType | undefined,
    cpu: parsed.data.cpu,
    gpu: parsed.data.gpu,
    usageTags: parsed.data.usageTags,
    description: parsed.data.description
  };

  const runProductUpdate = async (includeFeatureLines: boolean) =>
    prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: productId },
        data: includeFeatureLines
          ? {
              ...baseUpdateData,
              featureLines: parsed.data.featureLines
            }
          : baseUpdateData
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

  try {
    updated = await runProductUpdate(true);
  } catch (error) {
    if (isMissingProductFeatureLinesColumnError(error)) {
      updated = await runProductUpdate(false);
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const current = await prisma.product.findUnique({
        where: { id: productId },
        select: { brand: true, model: true }
      });
      return res.status(409).json({
        message: DUPLICATE_ACTIVE_PRODUCT_MESSAGE(
          parsed.data.brand ?? current?.brand ?? "",
          parsed.data.model ?? current?.model ?? ""
        )
      });
    } else {
      throw error;
    }
  }

  if (!updated) {
    return res.status(500).json({ message: "Failed to update product." });
  }

  try {
    const full = await findProductWithImagesAndPublication(productId);

    let channelSync: { attempted: boolean; success: boolean; message?: string } | undefined;

    if (full?.channelPublication) {
      const target = await getTelegramChannelTarget();
      const { result, payload } = await replacePublishedProductOnChannel(target, full, full.channelPublication);
      channelSync = result;
      if (payload && result.success) {
        await upsertChannelPublicationRecord(productId, target, payload, null);
      } else if (!result.success) {
        await setChannelPublicationSyncError(productId, result.message ?? "Channel listing replace failed");
      }
    }

    return res.json({ ...updated, channelSync });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const current = await prisma.product.findUnique({
        where: { id: productId },
        select: { brand: true, model: true }
      });
      return res.status(409).json({
        message: DUPLICATE_ACTIVE_PRODUCT_MESSAGE(
          parsed.data.brand ?? current?.brand ?? "",
          parsed.data.model ?? current?.model ?? ""
        )
      });
    }

    throw error;
  }
});

adminRouter.patch("/products/:id/status", async (req, res) => {
  const parsed = productStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const productId = req.params.id;

  const before = await findProductWithImagesAndPublication(productId);

  if (!before) {
    return res.status(404).json({ message: "Product not found" });
  }

  let updated;
  try {
    updated = await prisma.product.update({
      where: { id: productId },
      data: { isActive: parsed.data.isActive },
      select: {
        id: true,
        brand: true,
        model: true,
        isActive: true,
        updatedAt: true
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({
        message: DUPLICATE_ACTIVE_PRODUCT_MESSAGE(before.brand, before.model)
      });
    }

    throw error;
  }

  let channelSync: { attempted: boolean; success: boolean; message?: string } | undefined;

  if (!parsed.data.isActive && before.channelPublication) {
    const target = await getTelegramChannelTarget();
    const { result } = await removePublishedProductFromChannel(target, before.channelPublication);
    channelSync = result;

    if (result.success) {
      await prisma.productChannelPublication.deleteMany({ where: { productId } });
    } else {
      await setChannelPublicationSyncError(productId, result.message ?? "Channel listing removal failed");
    }
  }

  return res.json({ ...updated, channelSync });
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

adminRouter.get("/options/budgets", async (_req, res) => {
  const items = await prisma.budgetOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { min: "asc" }]
  });
  return res.json({ items });
});

adminRouter.post("/options/budgets", async (req, res) => {
  const parsed = budgetOptionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const created = await prisma.budgetOption.create({ data: parsed.data });
  return res.status(201).json(created);
});

adminRouter.put("/options/budgets/:id", async (req, res) => {
  const parsed = budgetOptionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const updated = await prisma.budgetOption.update({
    where: { id: req.params.id },
    data: parsed.data
  });
  return res.json(updated);
});

adminRouter.delete("/options/budgets/:id", async (req, res) => {
  await prisma.budgetOption.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

adminRouter.get("/options/ram", async (_req, res) => {
  const items = await prisma.ramOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { gb: "asc" }]
  });
  return res.json({ items });
});

adminRouter.post("/options/ram", async (req, res) => {
  const parsed = ramOptionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const created = await prisma.ramOption.create({ data: parsed.data });
  return res.status(201).json(created);
});

adminRouter.put("/options/ram/:id", async (req, res) => {
  const parsed = ramOptionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const updated = await prisma.ramOption.update({
    where: { id: req.params.id },
    data: parsed.data
  });
  return res.json(updated);
});

adminRouter.delete("/options/ram/:id", async (req, res) => {
  await prisma.ramOption.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

adminRouter.get("/options/storage", async (_req, res) => {
  const items = await prisma.storageOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { gb: "asc" }]
  });
  return res.json({ items });
});

adminRouter.post("/options/storage", async (req, res) => {
  const parsed = storageOptionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const created = await prisma.storageOption.create({ data: parsed.data });
  return res.status(201).json(created);
});

adminRouter.put("/options/storage/:id", async (req, res) => {
  const parsed = storageOptionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const updated = await prisma.storageOption.update({
    where: { id: req.params.id },
    data: parsed.data
  });
  return res.json(updated);
});

adminRouter.delete("/options/storage/:id", async (req, res) => {
  await prisma.storageOption.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

adminRouter.get("/options/usage-tags", async (_req, res) => {
  try {
    const items = await prisma.usageTagOption.findMany({
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }]
    });
    return res.json({ items });
  } catch (error) {
    if (!isMissingUsageTagOptionTableError(error)) {
      throw error;
    }

    return res.json({
      items: DEFAULT_USAGE_OPTIONS.map((entry, index) => ({
        id: entry.key,
        key: entry.key,
        label: entry.label,
        sortOrder: index,
        isActive: true
      })),
      migrationRequired: true
    });
  }
});

adminRouter.post("/options/usage-tags", async (req, res) => {
  const parsed = usageTagOptionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  let key: string;
  try {
    key = normalizeUsageOptionKeyOrThrow(parsed.data.key);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "Invalid usage key."
    });
  }

  try {
    const created = await prisma.usageTagOption.create({
      data: {
        key,
        label: parsed.data.label,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive
      }
    });
    return res.status(201).json(created);
  } catch (error) {
    if (isMissingUsageTagOptionTableError(error)) {
      return res.status(503).json({ message: "Usage tag options table is not initialized. Run migrations first." });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: `Usage key "${key}" already exists.` });
    }
    throw error;
  }
});

adminRouter.put("/options/usage-tags/:id", async (req, res) => {
  const parsed = usageTagOptionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const data: {
    key?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
  } = {
    label: parsed.data.label,
    sortOrder: parsed.data.sortOrder,
    isActive: parsed.data.isActive
  };

  if (parsed.data.key !== undefined) {
    try {
      data.key = normalizeUsageOptionKeyOrThrow(parsed.data.key);
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Invalid usage key."
      });
    }
  }

  try {
    const updated = await prisma.usageTagOption.update({
      where: { id: req.params.id },
      data
    });
    return res.json(updated);
  } catch (error) {
    if (isMissingUsageTagOptionTableError(error)) {
      return res.status(503).json({ message: "Usage tag options table is not initialized. Run migrations first." });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: `Usage key "${data.key}" already exists.` });
    }
    throw error;
  }
});

adminRouter.delete("/options/usage-tags/:id", async (req, res) => {
  try {
    await prisma.usageTagOption.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    if (isMissingUsageTagOptionTableError(error)) {
      return res.status(503).json({ message: "Usage tag options table is not initialized. Run migrations first." });
    }
    throw error;
  }
});
