import fs from "node:fs";
import path from "node:path";
import type { ChannelPostKind, Product, ProductChannelPublication, ProductImage } from "@prisma/client";
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

export type ChannelPublicationPayload = {
  messageIds: string[];
  postKind: ChannelPostKind;
  imageUrlsSnapshot: string[];
};

type ProductWithImages = Product & {
  images: ProductImage[];
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

function buildSoldOutCaption(product: ProductWithImages) {
  return trimToLimit(`SOLD OUT\n\n${buildProductChannelCaption(product)}`, MAX_CAPTION_LENGTH);
}

function sortedImageUrls(product: ProductWithImages) {
  return (product.images || [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.imageUrl)
    .filter(Boolean)
    .slice(0, 10);
}

function snapshotsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function deleteChannelMessages(channelTarget: string, messageIds: string[]) {
  const target = normalizeTelegramChannelTarget(channelTarget);
  if (!target || messageIds.length === 0) {
    return;
  }

  for (const rawId of messageIds) {
    const messageId = Number(rawId);
    if (!Number.isFinite(messageId)) {
      continue;
    }

    try {
      await bot.telegram.deleteMessage(target, messageId);
    } catch {
      // Best-effort cleanup
    }
  }
}

async function editListingTextOrCaption(
  channelTarget: string,
  publication: Pick<ProductChannelPublication, "postKind" | "messageIds">,
  text: string
): Promise<ChannelPostResult> {
  const target = normalizeTelegramChannelTarget(channelTarget);
  const firstId = publication.messageIds[0];
  if (!target || !firstId) {
    return { attempted: false, success: false, message: "No channel messages to update." };
  }

  const messageId = Number(firstId);
  if (!Number.isFinite(messageId)) {
    return { attempted: false, success: false, message: "Invalid stored message id." };
  }

  try {
    if (publication.postKind === "TEXT") {
      await bot.telegram.editMessageText(target, messageId, undefined, text);
    } else {
      await bot.telegram.editMessageCaption(target, messageId, undefined, text);
    }

    return { attempted: true, success: true };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      message: errorMessage(error, "Failed to edit Telegram channel message.")
    };
  }
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
        message: errorMessage(error, "Failed to publish product to Telegram channel.")
      },
      payload: null
    };
  }
}

export async function syncPublishedProductOnChannel(
  channelTarget: string,
  product: ProductWithImages,
  publication: ProductChannelPublication
): Promise<{ result: ChannelPostResult; payload: ChannelPublicationPayload | null }> {
  const target = normalizeTelegramChannelTarget(channelTarget);
  if (!target) {
    return {
      result: { attempted: false, success: false, message: "Channel target is not configured." },
      payload: null
    };
  }

  const nextSnapshot = sortedImageUrls(product);
  const imagesUnchanged = snapshotsEqual(publication.imageUrlsSnapshot, nextSnapshot);

  if (imagesUnchanged && publication.messageIds.length > 0) {
    const caption = buildProductChannelCaption(product);
    const editResult = await editListingTextOrCaption(target, publication, caption);
    if (editResult.success) {
      return {
        result: editResult,
        payload: {
          messageIds: [...publication.messageIds],
          postKind: publication.postKind,
          imageUrlsSnapshot: nextSnapshot
        }
      };
    }
  }

  await deleteChannelMessages(target, publication.messageIds);
  return sendFreshProductChannelPost(channelTarget, product);
}

export async function markPublishedProductSoldOutOnChannel(
  channelTarget: string,
  product: ProductWithImages,
  publication: ProductChannelPublication
): Promise<{ result: ChannelPostResult; removedPublication: boolean }> {
  const target = normalizeTelegramChannelTarget(channelTarget);
  if (!target || publication.messageIds.length === 0) {
    return { result: { attempted: false, success: true }, removedPublication: false };
  }

  const caption = buildSoldOutCaption(product);
  const editResult = await editListingTextOrCaption(target, publication, caption);

  if (editResult.success) {
    return { result: editResult, removedPublication: false };
  }

  await deleteChannelMessages(target, publication.messageIds);
  return {
    result: {
      attempted: true,
      success: true,
      message: "Listing removed from channel (edit failed; messages deleted)."
    },
    removedPublication: true
  };
}

export async function restorePublishedProductCaptionOnChannel(
  channelTarget: string,
  product: ProductWithImages,
  publication: ProductChannelPublication
): Promise<ChannelPostResult> {
  const caption = buildProductChannelCaption(product);
  return editListingTextOrCaption(channelTarget, publication, caption);
}

export async function postProductToTelegramChannel(
  channelTarget: string,
  product: ProductWithImages
): Promise<ChannelPostResult> {
  const { result } = await sendFreshProductChannelPost(channelTarget, product);
  return result;
}
