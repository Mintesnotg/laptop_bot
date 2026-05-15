import fs from "node:fs";
import path from "node:path";
import type { ChannelPostKind } from "@prisma/client";
import { Input, type Telegram } from "telegraf";

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
const URL_VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const URL_VALIDATION_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;

const urlValidationCache = new Map<string, { ok: boolean; expiresAt: number }>();

type TelegramErrorLike = {
  response?: {
    error_code?: number;
    description?: string;
    parameters?: {
      retry_after?: number;
    };
  };
  code?: number | string;
  message?: string;
  description?: string;
};

type TelegramMediaGroupInput = Parameters<Telegram["sendMediaGroup"]>[1];
type TelegramSendMessageExtra = Parameters<Telegram["sendMessage"]>[2];
type TelegramSendPhotoInput = Parameters<Telegram["sendPhoto"]>[1];
type TelegramSendPhotoExtra = Parameters<Telegram["sendPhoto"]>[2];

export type TelegramTransport = Pick<Telegram, "sendMessage" | "sendPhoto" | "sendMediaGroup">;

type ValidatedMedia = {
  sourceUrl: string;
  input: TelegramSendPhotoInput;
};

export type TelegramSendContext = {
  flow: string;
  productId?: string;
  requestId?: string;
  chatId: string | number;
};

export type TelegramRichPostResult = {
  attempted: boolean;
  success: boolean;
  message?: string;
  postKind: ChannelPostKind;
  messageIds: string[];
  validUrls: string[];
  invalidUrls: string[];
  usedFallback: boolean;
};

function formatLogFields(fields: Record<string, string | number | boolean | null | undefined>) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

function logTelegram(level: "warn" | "error", stage: string, context: TelegramSendContext, extra: Record<string, string | number | boolean | null | undefined> = {}) {
  const line = formatLogFields({
    stage,
    flow: context.flow,
    requestId: context.requestId ?? "-",
    productId: context.productId ?? "-",
    chatId: context.chatId,
    ...extra
  });

  if (level === "warn") {
    console.warn(`[telegram] ${line}`);
    return;
  }
  console.error(`[telegram] ${line}`);
}

function parseTelegramError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: undefined, description: undefined, message: undefined, retryAfterSec: undefined };
  }

  const candidate = error as TelegramErrorLike;
  const code =
    typeof candidate.response?.error_code === "number"
      ? candidate.response.error_code
      : typeof candidate.code === "number"
        ? candidate.code
        : typeof candidate.code === "string" && Number.isFinite(Number(candidate.code))
          ? Number(candidate.code)
          : undefined;
  const description =
    typeof candidate.response?.description === "string"
      ? candidate.response.description
      : typeof candidate.description === "string"
        ? candidate.description
        : undefined;
  const message = typeof candidate.message === "string" ? candidate.message : undefined;
  const retryAfterSec =
    typeof candidate.response?.parameters?.retry_after === "number"
      ? candidate.response.parameters.retry_after
      : undefined;

  return { code, description, message, retryAfterSec };
}

function mapTelegramErrorMessage(error: unknown, fallback: string) {
  const parsed = parseTelegramError(error);
  const normalizedDescription = parsed.description?.toLowerCase() ?? "";
  const normalizedMessage = parsed.message?.toLowerCase() ?? "";

  if (parsed.code === 404 || normalizedDescription.includes("not found") || normalizedMessage.includes("404")) {
    return "Telegram API returned 404. Check bot token, API root, and Telegram target configuration.";
  }

  if (parsed.code && parsed.description) {
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

function isRetryableTelegramError(error: unknown) {
  const parsed = parseTelegramError(error);
  if (parsed.code === 429) {
    return true;
  }
  if (parsed.code && parsed.code >= 500) {
    return true;
  }

  const nodeCode =
    error && typeof error === "object" && "code" in error && typeof (error as { code?: string }).code === "string"
      ? (error as { code: string }).code
      : "";
  return ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(nodeCode);
}

function isMediaError(error: unknown) {
  const parsed = parseTelegramError(error);
  const description = parsed.description?.toLowerCase() ?? "";
  return description.includes("webpage_curl_failed") || description.includes("wrong file identifier");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>, context: TelegramSendContext): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableTelegramError(error) || attempt >= MAX_RETRY_ATTEMPTS) {
        break;
      }

      const retryAfter = parseTelegramError(error).retryAfterSec;
      const waitMs = retryAfter ? retryAfter * 1000 : 300 * 2 ** attempt;
      const parsed = parseTelegramError(error);
      logTelegram("warn", "retry", context, {
        label,
        attempt,
        waitMs,
        errorCode: parsed.code,
        errorDescription: parsed.description
      });
      await delay(waitMs);
    }
  }

  throw lastError;
}

function normalizeImageUrls(imageUrls: string[]) {
  return Array.from(
    new Set(
      imageUrls
        .map((url) => url.trim())
        .filter((url) => url.length > 0)
    )
  ).slice(0, 10);
}

function resolveLocalUploadPath(imageUrl: string) {
  if (!imageUrl.startsWith("/uploads/")) {
    return null;
  }

  const cleaned = imageUrl.replace(/^\/+/, "");
  const absolutePath = path.resolve(process.cwd(), cleaned);
  if (!absolutePath.startsWith(UPLOADS_ROOT)) {
    return null;
  }
  return absolutePath;
}

function isValidHttpImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, method: "HEAD" | "GET") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_VALIDATION_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function validateRemoteImageUrl(url: string) {
  const cached = urlValidationCache.get(url);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.ok;
  }

  let ok = false;
  try {
    const head = await fetchWithTimeout(url, "HEAD");
    const contentType = head.headers.get("content-type")?.toLowerCase() ?? "";
    ok = head.ok && contentType.startsWith("image/");
    if (!ok) {
      const get = await fetchWithTimeout(url, "GET");
      const getType = get.headers.get("content-type")?.toLowerCase() ?? "";
      ok = get.ok && getType.startsWith("image/");
      if (get.body) {
        await get.body.cancel().catch(() => undefined);
      }
    }
  } catch {
    ok = false;
  }

  urlValidationCache.set(url, {
    ok,
    expiresAt: now + URL_VALIDATION_CACHE_TTL_MS
  });
  return ok;
}

async function validateImageUrl(imageUrl: string, skipRemoteValidation = false) {
  const localPath = resolveLocalUploadPath(imageUrl);
  if (localPath) {
    return fs.existsSync(localPath);
  }

  if (!isValidHttpImageUrl(imageUrl)) {
    return false;
  }

  if (skipRemoteValidation) {
    return true;
  }

  return validateRemoteImageUrl(imageUrl);
}

async function resolveValidatedMedia(
  imageUrls: string[],
  fallbackImageUrl: string,
  skipRemoteImageValidation = false
) {
  const validMedia: ValidatedMedia[] = [];
  const invalidUrls: string[] = [];
  const normalizedUrls = normalizeImageUrls(imageUrls);

  for (const imageUrl of normalizedUrls) {
    const isValid = await validateImageUrl(imageUrl, skipRemoteImageValidation);
    if (!isValid) {
      invalidUrls.push(imageUrl);
      continue;
    }

    const localPath = resolveLocalUploadPath(imageUrl);
    validMedia.push({
      sourceUrl: imageUrl,
      input: localPath ? Input.fromLocalFile(localPath) : imageUrl
    });
  }

  let usedFallback = false;
  let fallbackRejected = false;
  if (validMedia.length === 0 && fallbackImageUrl) {
    const fallbackValid = await validateImageUrl(fallbackImageUrl, skipRemoteImageValidation);
    if (fallbackValid) {
      const localPath = resolveLocalUploadPath(fallbackImageUrl);
      validMedia.push({
        sourceUrl: fallbackImageUrl,
        input: localPath ? Input.fromLocalFile(localPath) : fallbackImageUrl
      });
      usedFallback = true;
    } else {
      invalidUrls.push(fallbackImageUrl);
      fallbackRejected = true;
    }
  }

  return { validMedia, invalidUrls, usedFallback, fallbackRejected };
}

function mapMessageIds(messages: Array<{ message_id: number }>) {
  return messages.map((entry) => String(entry.message_id));
}

export async function sendTelegramRichPost(params: {
  telegram: TelegramTransport;
  chatId: string | number;
  html: string;
  imageUrls: string[];
  fallbackImageUrl: string;
  skipRemoteImageValidation?: boolean;
  context: TelegramSendContext;
}): Promise<TelegramRichPostResult> {
  const { telegram, chatId, html, imageUrls, fallbackImageUrl, skipRemoteImageValidation = false, context } = params;
  const { validMedia, invalidUrls, usedFallback, fallbackRejected } = await resolveValidatedMedia(
    imageUrls,
    fallbackImageUrl,
    skipRemoteImageValidation
  );
  const messageIds: string[] = [];

  const sendTextOnly = async () => {
    const textExtra: TelegramSendMessageExtra = {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true }
    };
    const textMessage = await withRetry(
      "sendMessage",
      () => telegram.sendMessage(chatId, html, textExtra),
      context
    );
    messageIds.push(String(textMessage.message_id));
    return {
      attempted: true,
      success: true,
      postKind: "TEXT" as ChannelPostKind
    };
  };

  const trySendSinglePhoto = async (candidates: ValidatedMedia[], label: string, canUseCaption: boolean) => {
    for (const candidate of candidates) {
      const extra: TelegramSendPhotoExtra | undefined = canUseCaption
        ? ({
            caption: html,
            parse_mode: "HTML"
          } as TelegramSendPhotoExtra)
        : undefined;

      try {
        const sent = await withRetry(
          label,
          () => telegram.sendPhoto(chatId, candidate.input, extra),
          context
        );
        messageIds.push(String(sent.message_id));
        return { sent: true as const, sourceUrl: candidate.sourceUrl };
      } catch (error) {
        const message = mapTelegramErrorMessage(error, "sendPhoto failed.");
        logTelegram("warn", "send-photo-failed", context, {
          label,
          mediaUrl: candidate.sourceUrl,
          error: message
        });
        if (!isMediaError(error)) {
          throw error;
        }
      }
    }

    return { sent: false as const };
  };

  if (invalidUrls.length > 0) {
    logTelegram("warn", "media-invalid-filtered", context, {
      count: invalidUrls.length,
      firstInvalidUrl: invalidUrls[0]
    });
  }

  if (fallbackRejected) {
    logTelegram("warn", "fallback-image-invalid", context, { fallbackImageUrl });
  }

  try {
    if (validMedia.length === 0) {
      const sent = await sendTextOnly();
      return {
        ...sent,
        messageIds,
        validUrls: [],
        invalidUrls,
        usedFallback
      };
    }

    if (validMedia.length === 1) {
      const single = validMedia[0];
      const canUseCaption = html.length <= 1024;
      const singleResult = await trySendSinglePhoto([single], "sendPhoto", canUseCaption);
      if (!singleResult.sent) {
        const sent = await sendTextOnly();
        return {
          ...sent,
          messageIds,
          validUrls: [single.sourceUrl],
          invalidUrls,
          usedFallback
        };
      }

      if (!canUseCaption) {
        await sendTextOnly();
      }

      return {
        attempted: true,
        success: true,
        postKind: "PHOTO",
        messageIds,
        validUrls: [single.sourceUrl],
        invalidUrls,
        usedFallback
      };
    }

    const canUseCaption = html.length <= 1024;
    const mediaGroup = validMedia.slice(0, 10).map((entry, index) => {
      if (index === 0 && canUseCaption) {
        return {
          type: "photo",
          media: entry.input,
          caption: html,
          parse_mode: "HTML"
        };
      }
      return {
        type: "photo",
        media: entry.input
      };
    }) as TelegramMediaGroupInput;

    try {
      const albumMessages = await withRetry(
        "sendMediaGroup",
        () => telegram.sendMediaGroup(chatId, mediaGroup),
        context
      );
      messageIds.push(...mapMessageIds(albumMessages));
    } catch (error) {
      const errorMessage = mapTelegramErrorMessage(error, "sendMediaGroup failed.");
      logTelegram("error", "media-group-failed", context, {
        error: errorMessage,
        firstMediaUrl: validMedia[0]?.sourceUrl
      });

      if (!isMediaError(error)) {
        throw error;
      }

      const fallbackSingleResult = await trySendSinglePhoto(
        validMedia,
        "sendPhoto(fallback-after-album-failure)",
        canUseCaption
      );
      if (!fallbackSingleResult.sent) {
        await sendTextOnly();
        return {
          attempted: true,
          success: true,
          postKind: "TEXT",
          messageIds,
          validUrls: validMedia.map((entry) => entry.sourceUrl),
          invalidUrls,
          usedFallback
        };
      }

      if (!canUseCaption) {
        await sendTextOnly();
      }

      return {
        attempted: true,
        success: true,
        postKind: "PHOTO",
        messageIds,
        validUrls: validMedia.map((entry) => entry.sourceUrl),
        invalidUrls,
        usedFallback
      };
    }

    if (!canUseCaption) {
      await sendTextOnly();
    }

    return {
      attempted: true,
      success: true,
      postKind: "ALBUM",
      messageIds,
      validUrls: validMedia.map((entry) => entry.sourceUrl),
      invalidUrls,
      usedFallback
    };
  } catch (error) {
    const message = mapTelegramErrorMessage(error, "Failed to send Telegram message.");
    const parsed = parseTelegramError(error);
    logTelegram("error", "send-failed", context, {
      error: message,
      errorCode: parsed.code,
      errorDescription: parsed.description
    });
    return {
      attempted: true,
      success: false,
      message,
      postKind: "TEXT",
      messageIds: [],
      validUrls: validMedia.map((entry) => entry.sourceUrl),
      invalidUrls,
      usedFallback
    };
  }
}

export function mapTelegramFailureMessage(error: unknown, fallback: string) {
  return mapTelegramErrorMessage(error, fallback);
}
