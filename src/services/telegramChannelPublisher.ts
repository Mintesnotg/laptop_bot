import fs from "node:fs";
import path from "node:path";
import type { Product, ProductImage } from "@prisma/client";
import { Input } from "telegraf";
import { bot } from "../bot/index";
import { usageLabelFromKey } from "../shared/constants";

const MAX_CAPTION_LENGTH = 1024;
const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

export type ChannelPostResult = {
  attempted: boolean;
  success: boolean;
  message?: string;
};

type ProductWithImages = Product & {
  images: ProductImage[];
};

function trimToLimit(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function buildCaption(product: ProductWithImages) {
  const usage = (product.usageTags || []).map((tag) => usageLabelFromKey(tag)).join(", ") || "-";
  const lines = [
    `${product.brand} ${product.model}`,
    `Price: ${Number(product.price).toLocaleString()} ETB`,
    `Specs: ${product.ramGb}GB RAM / ${product.storageGb}GB ${product.storageType}, ${product.cpu}${
      product.gpu ? `, ${product.gpu}` : ""
    }`,
    `Usage: ${usage}`
  ];

  if (product.description) {
    lines.push(`Description: ${product.description}`);
  }

  return trimToLimit(lines.join("\n"), MAX_CAPTION_LENGTH);
}

function resolveUploadPath(imageUrl: string) {
  const cleaned = imageUrl.replace(/^\/+/, "");
  const absolutePath = path.resolve(process.cwd(), cleaned);

  if (!absolutePath.startsWith(UPLOADS_ROOT)) {
    return null;
  }

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return absolutePath;
}

function toTelegramPhotoInput(imageUrl: string): string | ReturnType<typeof Input.fromLocalFile> {
  if (!imageUrl.startsWith("/uploads/")) {
    return imageUrl;
  }

  const localPath = resolveUploadPath(imageUrl);
  if (!localPath) {
    return imageUrl;
  }

  return Input.fromLocalFile(localPath);
}

export async function postProductToTelegramChannel(
  channelTarget: string,
  product: ProductWithImages
): Promise<ChannelPostResult> {
  const target = channelTarget.trim();
  if (!target) {
    return {
      attempted: false,
      success: false,
      message: "Channel target is not configured."
    };
  }

  const caption = buildCaption(product);
  const imageUrls = (product.images || [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.imageUrl)
    .filter(Boolean)
    .slice(0, 10);

  try {
    if (imageUrls.length === 0) {
      await bot.telegram.sendMessage(target, caption);
      return { attempted: true, success: true };
    }

    if (imageUrls.length === 1) {
      await bot.telegram.sendPhoto(target, toTelegramPhotoInput(imageUrls[0]), { caption });
      return { attempted: true, success: true };
    }

    const mediaGroup = imageUrls.map((imageUrl, index) => {
      if (index === 0) {
        return {
          type: "photo" as const,
          media: toTelegramPhotoInput(imageUrl),
          caption
        };
      }

      return {
        type: "photo" as const,
        media: toTelegramPhotoInput(imageUrl)
      };
    });

    await bot.telegram.sendMediaGroup(target, mediaGroup as any);
    return { attempted: true, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish product to Telegram channel.";
    return {
      attempted: true,
      success: false,
      message
    };
  }
}
