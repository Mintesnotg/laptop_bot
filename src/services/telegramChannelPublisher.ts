import { randomUUID } from "node:crypto";
import type { ChannelPostKind, Product, ProductChannelPublication, ProductImage } from "@prisma/client";
import { bot } from "../bot/index";
import { sendTelegramRichPost } from "./telegramMediaDelivery";
import { buildTelegramListingHtml, validateTelegramListingContent } from "./telegramMessageFormatter";
import { getTelegramPostingConfig } from "./telegramPostingConfig";

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

  const domainMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/([^/?#\s]+)/i);
  if (domainMatch && domainMatch[1]) {
    return `@${domainMatch[1].replace(/^@+/, "")}`;
  }

  return `@${trimmed.replace(/^@+/, "")}`;
}

function sortedImageUrls(product: ProductWithImages) {
  return (product.images || [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.imageUrl)
    .filter(Boolean)
    .slice(0, 10);
}

function parseTelegramError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: undefined, description: undefined, message: undefined };
  }

  const candidate = error as TelegramErrorLike;
  const responseCode = typeof candidate.response?.error_code === "number" ? candidate.response.error_code : undefined;
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

  if (parsed.code === 404 || messageLower.includes("404") || descriptionLower === "not found") {
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

async function deleteChannelMessages(channelTarget: string, messageIds: string[]): Promise<ChannelPostResult> {
  const target = normalizeTelegramChannelTarget(channelTarget);
  if (!target) {
    return {
      attempted: false,
      success: false,
      message: "Channel target is not configured."
    };
  }

  const numericIds = messageIds.map((rawId) => Number(rawId)).filter((messageId) => Number.isFinite(messageId));

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

function mapPostKind(value: string): ChannelPostKind {
  if (value === "PHOTO" || value === "ALBUM") {
    return value;
  }
  return "TEXT";
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

  const postingConfig = await getTelegramPostingConfig();
  const imageUrls = sortedImageUrls(product);
  const content = {
    brand: product.brand,
    model: product.model,
    price: Number(product.price),
    ramGb: Number(product.ramGb),
    storageGb: Number(product.storageGb),
    storageType: product.storageType,
    cpu: product.cpu,
    gpu: product.gpu,
    usageTags: product.usageTags,
    description: product.description,
    featureLines: product.featureLines
  };

  const validationError = validateTelegramListingContent(content);
  if (validationError) {
    return {
      result: {
        attempted: false,
        success: false,
        message: validationError
      },
      payload: null
    };
  }

  const html = buildTelegramListingHtml(content, postingConfig);
  const sendResult = await sendTelegramRichPost({
    telegram: bot.telegram,
    chatId: target,
    html,
    imageUrls,
    fallbackImageUrl: postingConfig.fallbackImageUrl,
    skipRemoteImageValidation: true,
    context: {
      flow: "admin-channel-publish",
      requestId: randomUUID(),
      productId: product.id,
      chatId: target
    }
  });

  if (!sendResult.success) {
    return {
      result: {
        attempted: sendResult.attempted,
        success: false,
        message: sendResult.message ?? "Failed to publish product to Telegram channel."
      },
      payload: null
    };
  }

  return {
    result: { attempted: true, success: true },
    payload: {
      messageIds: sendResult.messageIds,
      postKind: mapPostKind(sendResult.postKind),
      imageUrlsSnapshot: imageUrls
    }
  };
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
