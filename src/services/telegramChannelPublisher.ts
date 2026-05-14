import type { ChannelPostKind, Product, ProductChannelPublication, ProductImage } from "@prisma/client";
import { bot } from "../bot/index";
import { buildTelegramListingHtml, validateTelegramListingContent } from "./telegramMessageFormatter";
import { mapTelegramFailureMessage, sendTelegramRichPost } from "./telegramMediaDelivery";
import { getTelegramPostingConfig } from "./telegramPostingConfig";

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

type ChannelSendContext = {
  requestId?: string;
};

function logPostingConfigWarning(field: "fullAddress" | "fallbackImageUrl", productId: string, context?: ChannelSendContext) {
  console.warn(
    `[telegram][config-warning] flow=channel-publish requestId=${context?.requestId ?? "-"} productId=${productId} field=${field}`
  );
}

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

function sortedImageUrls(product: ProductWithImages) {
  return (product.images || [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.imageUrl)
    .filter(Boolean)
    .slice(0, 10);
}

async function deleteChannelMessages(channelTarget: string, messageIds: string[], context?: ChannelSendContext) {
  const target = normalizeTelegramChannelTarget(channelTarget);
  if (!target) {
    return {
      attempted: false,
      success: false,
      message: "Channel target is not configured."
    } as ChannelPostResult;
  }

  const numericIds = messageIds
    .map((rawId) => Number(rawId))
    .filter((messageId) => Number.isFinite(messageId));

  if (numericIds.length === 0) {
    return {
      attempted: false,
      success: true,
      message: "No stored channel messages to remove."
    } as ChannelPostResult;
  }

  for (const messageId of numericIds) {
    try {
      await bot.telegram.deleteMessage(target, messageId);
    } catch (error) {
      console.error(
        `[telegram][delete-failed] flow=channel-delete requestId=${context?.requestId ?? "-"} messageId=${messageId} message=${mapTelegramFailureMessage(
          error,
          "Failed to remove Telegram message."
        )}`
      );
      return {
        attempted: true,
        success: false,
        message: mapTelegramFailureMessage(error, "Failed to remove the existing Telegram listing.")
      } as ChannelPostResult;
    }
  }

  return {
    attempted: true,
    success: true
  } as ChannelPostResult;
}

export async function sendFreshProductChannelPost(
  channelTarget: string,
  product: ProductWithImages,
  context?: ChannelSendContext
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

  const validationError = validateTelegramListingContent({
    brand: product.brand,
    model: product.model,
    price: product.price,
    ramGb: product.ramGb,
    storageGb: product.storageGb,
    storageType: product.storageType,
    cpu: product.cpu,
    gpu: product.gpu,
    usageTags: product.usageTags,
    description: product.description,
    featureLines: product.featureLines
  });
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

  const postingConfig = await getTelegramPostingConfig();
  if (!postingConfig.fullAddress.trim()) {
    logPostingConfigWarning("fullAddress", product.id, context);
  }
  if (!postingConfig.fallbackImageUrl.trim()) {
    logPostingConfigWarning("fallbackImageUrl", product.id, context);
  }

  const html = buildTelegramListingHtml(
    {
      brand: product.brand,
      model: product.model,
      price: product.price,
      ramGb: product.ramGb,
      storageGb: product.storageGb,
      storageType: product.storageType,
      cpu: product.cpu,
      gpu: product.gpu,
      usageTags: product.usageTags,
      description: product.description,
      featureLines: product.featureLines
    },
    postingConfig
  );

  const imageUrls = sortedImageUrls(product);
  const sendResult = await sendTelegramRichPost({
    telegram: bot.telegram,
    chatId: target,
    html,
    imageUrls,
    fallbackImageUrl: postingConfig.fallbackImageUrl,
    context: {
      flow: "channel-publish",
      requestId: context?.requestId,
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
      postKind: sendResult.postKind,
      imageUrlsSnapshot: sendResult.validUrls
    }
  };
}

export async function replacePublishedProductOnChannel(
  channelTarget: string,
  product: ProductWithImages,
  publication: Pick<ProductChannelPublication, "messageIds">,
  context?: ChannelSendContext
): Promise<{ result: ChannelPostResult; payload: ChannelPublicationPayload | null }> {
  const deleteResult = await deleteChannelMessages(channelTarget, publication.messageIds, context);
  if (!deleteResult.success) {
    return {
      result: deleteResult,
      payload: null
    };
  }

  return sendFreshProductChannelPost(channelTarget, product, context);
}

export async function removePublishedProductFromChannel(
  channelTarget: string,
  publication: Pick<ProductChannelPublication, "messageIds">,
  context?: ChannelSendContext
): Promise<{ result: ChannelPostResult }> {
  const deleteResult = await deleteChannelMessages(channelTarget, publication.messageIds, context);
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
