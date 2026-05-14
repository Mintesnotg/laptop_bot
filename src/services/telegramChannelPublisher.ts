import fs from "node:fs";
import path from "node:path";
import type { ChannelPostKind, Product, ProductChannelPublication, ProductImage } from "@prisma/client";
import { Input } from "telegraf";
import { bot } from "../bot/index";
import { usageLabelFromKey } from "../shared/constants";

const MAX_CAPTION_LENGTH = 1024;
const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
const TELEGRAM_404_DIAGNOSTIC =
  "Telegram API returned 404. Check TELEGRAM_BOT_TOKEN, TELEGRAM_API_ROOT, and channel target configuration.";

export type ChannelPostResult = {
  attempted: boolean;
  success: boolean;
  message?: string;
};

export type ChannelPublicationPayload = {
  messageIds: string[];
  postKind: ChannelPostKind;
  imageUrlsSnapshot: string[];
};

type ProductWithImages = Product & {
  images: ProductImage[];
};

type TelegramErrorLike = {
  response?: {
    error_code?: number;
    description?: string;
  };
  code?: number | string;
  description?: string;
  message?: string;
};

export function normalizeTelegramChannelTarget(rawTarget: string) {
  const trimmed = rawTarget.trim();
  if (!trimmed) {
    return "";
  }

  if (/^-?\d+$/.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("@")) {
    return trimmed;
  }

  const domainMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/([^/?#\s]+)/i
  );
  if (domainMatch && domainMatch[1]) {
    return `@${domainMatch[1].replace(/^@+/, "")}`;
  }

  return `@${trimmed.replace(/^@+/, "")}`;
}

function trimToLimit(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

export function buildProductChannelCaption(product: ProductWithImages) {
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

function sortedImageUrls(product: ProductWithImages) {
  return (product.images || [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.imageUrl)
    .filter(Boolean)
    .slice(0, 10);
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

function parseTelegramError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: undefined, description: undefined, message: undefined };
  }

  const candidate = error as TelegramErrorLike;
  const responseCode =
    typeof candidate.response?.error_code === "number" ? candidate.response.error_code : undefined;
  const codeFromField =
    typeof candidate.code === "number"
      ? candidate.code
      : typeof candidate.code === "string" && Number.isFinite(Number(candidate.code))
        ? Number(candidate.code)
        : undefined;
  const code = responseCode ?? codeFromField;
  const description =
    typeof candidate.response?.description === "string"
      ? candidate.response.description
      : typeof candidate.description === "string"
        ? candidate.description
        : undefined;
  const message = typeof candidate.message === "string" ? candidate.message : undefined;

  return { code, description, message };
}

function mapTelegramErrorMessage(error: unknown, fallback: string) {
  const parsed = parseTelegramError(error);
  const messageLower = parsed.message?.toLowerCase() ?? "";
  const descriptionLower = parsed.description?.toLowerCase() ?? "";

  if (
    parsed.code === 404 ||
    messageLower.includes("404") ||
    descriptionLower === "not found"
  ) {
    return TELEGRAM_404_DIAGNOSTIC;
  }

  if (parsed.description && parsed.code) {
    return `Telegram API error (${parsed.code}): ${parsed.description}`;
  }

  if (parsed.description) {
    return parsed.description;
  }

  if (parsed.message) {
    return parsed.message;
  }

  return fallback;
}

function isIgnorableDeleteError(error: unknown) {
  const parsed = parseTelegramError(error);
  return (
    parsed.code === 400 &&
    typeof parsed.description === "string" &&
    parsed.description.toLowerCase().includes("message to delete not found")
  );
}

async function deleteChannelMessages(
  channelTarget: string,
  messageIds: string[]
): Promise<ChannelPostResult> {
  const target = normalizeTelegramChannelTarget(channelTarget);
  if (!target) {
    return {
      attempted: false,
      success: false,
      message: "Channel target is not configured."
    };
  }

  const numericIds = messageIds
    .map((rawId) => Number(rawId))
    .filter((messageId) => Number.isFinite(messageId));

  if (numericIds.length === 0) {
    return {
      attempted: false,
      success: true,
      message: "No stored channel messages to remove."
    };
  }

  for (const messageId of numericIds) {
    try {
      await bot.telegram.deleteMessage(target, messageId);
    } catch (error) {
      if (isIgnorableDeleteError(error)) {
        continue;
      }

      return {
        attempted: true,
        success: false,
        message: mapTelegramErrorMessage(error, "Failed to remove the existing Telegram listing.")
      };
    }
  }

  return {
    attempted: true,
    success: true
  };
}

export async function sendFreshProductChannelPost(
  channelTarget: string,
  product: ProductWithImages
): Promise<{ result: ChannelPostResult; payload: ChannelPublicationPayload | null }> {
  const target = normalizeTelegramChannelTarget(channelTarget);
  if (!target) {
    return {
      result: {
        attempted: false,
        success: false,
        message: "Channel target is not configured."
      },
      payload: null
    };
  }

  const caption = buildProductChannelCaption(product);
  const imageUrls = sortedImageUrls(product);
  const snapshot = [...imageUrls];

  try {
    if (imageUrls.length === 0) {
      const message = await bot.telegram.sendMessage(target, caption);
      return {
        result: { attempted: true, success: true },
        payload: {
          messageIds: [String(message.message_id)],
          postKind: "TEXT",
          imageUrlsSnapshot: snapshot
        }
      };
    }

    if (imageUrls.length === 1) {
      const message = await bot.telegram.sendPhoto(target, toTelegramPhotoInput(imageUrls[0]), { caption });
      return {
        result: { attempted: true, success: true },
        payload: {
          messageIds: [String(message.message_id)],
          postKind: "PHOTO",
          imageUrlsSnapshot: snapshot
        }
      };
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

    const messages = await bot.telegram.sendMediaGroup(target, mediaGroup as any);
    const messageIds = messages.map((m) => String(m.message_id));
    return {
      result: { attempted: true, success: true },
      payload: {
        messageIds,
        postKind: "ALBUM",
        imageUrlsSnapshot: snapshot
      }
    };
  } catch (error) {
    return {
      result: {
        attempted: true,
        success: false,
        message: mapTelegramErrorMessage(error, "Failed to publish product to Telegram channel.")
      },
      payload: null
    };
  }
}

export async function replacePublishedProductOnChannel(
  channelTarget: string,
  product: ProductWithImages,
  publication: Pick<ProductChannelPublication, "messageIds">
): Promise<{ result: ChannelPostResult; payload: ChannelPublicationPayload | null }> {
  const deleteResult = await deleteChannelMessages(channelTarget, publication.messageIds);
  if (!deleteResult.success) {
    return {
      result: deleteResult,
      payload: null
    };
  }

  return sendFreshProductChannelPost(channelTarget, product);
}

export async function removePublishedProductFromChannel(
  channelTarget: string,
  publication: Pick<ProductChannelPublication, "messageIds">
): Promise<{ result: ChannelPostResult }> {
  const deleteResult = await deleteChannelMessages(channelTarget, publication.messageIds);
  if (!deleteResult.success) {
    return { result: deleteResult };
  }

  return {
    result: {
      attempted: deleteResult.attempted,
      success: true,
      message: "Listing removed from Telegram channel."
    }
  };
}
