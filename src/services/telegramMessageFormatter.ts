import { type StorageType } from "@prisma/client";
import { usageLabelFromKey } from "../shared/constants";
import type { TelegramPostingConfig } from "./telegramPostingConfig";

export type TelegramListingContent = {
  brand: string;
  model: string;
  price: number;
  ramGb: number;
  storageGb: number;
  storageType: StorageType | string;
  cpu: string;
  gpu?: string | null;
  usageTags: string[];
  description?: string | null;
  featureLines?: string[];
};

const MAX_FEATURE_LINES = 6;

const USAGE_EMOJI: Record<string, string> = {
  GAMING: "🎮",
  OFFICE: "💼",
  CODING: "💻",
  STUDENT: "📚",
  GRAPHICS_DESIGN: "🎨",
  UX_UI: "🧩",
  DAILY_BROWSING: "🌐",
  DESIGN: "🖌️",
  ARCHITECTURE: "🏗️"
};

function fallbackText(value: string, placeholder: string) {
  return value.trim() || placeholder;
}

export function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeLines(lines: string[]) {
  return Array.from(
    new Set(
      lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => (line.length > 120 ? `${line.slice(0, 117)}...` : line))
    )
  );
}

function deriveFeatureLines(content: TelegramListingContent) {
  const derived: string[] = [];
  const gpuText = (content.gpu ?? "").toLowerCase();
  const cpuText = content.cpu.toLowerCase();

  if (gpuText.includes("rtx") || gpuText.includes("gtx") || gpuText.includes("radeon")) {
    derived.push("Dedicated graphics support for demanding workloads");
  }

  if (cpuText.includes("i7") || cpuText.includes("i9") || cpuText.includes("ryzen 7") || cpuText.includes("ryzen 9")) {
    derived.push("High-performance processor for heavy multitasking");
  }

  if (content.ramGb >= 16) {
    derived.push(`${content.ramGb}GB RAM for smoother multitasking`);
  }

  if (content.storageType === "SSD" || content.storageType === "NVME") {
    derived.push(`${content.storageGb}GB ${content.storageType} for fast boot and load times`);
  }

  if (content.description) {
    const firstSentence = content.description.trim().split(/[.!?]/)[0]?.trim();
    if (firstSentence) {
      derived.push(firstSentence);
    }
  }

  if (derived.length === 0) {
    derived.push("Well-balanced performance for daily and professional use");
  }

  return sanitizeLines(derived).slice(0, MAX_FEATURE_LINES);
}

function mapUsageLabel(tag: string) {
  const emoji = USAGE_EMOJI[tag] ? `${USAGE_EMOJI[tag]} ` : "";
  return `${emoji}${usageLabelFromKey(tag)}`;
}

export function validateTelegramListingContent(content: TelegramListingContent) {
  if (!content.brand.trim() || !content.model.trim()) {
    return 'Missing laptop title. "brand" and "model" are required.';
  }
  if (!Number.isFinite(content.price) || content.price <= 0) {
    return "Missing or invalid price.";
  }
  if (!Number.isFinite(content.ramGb) || content.ramGb <= 0) {
    return "Missing or invalid RAM value.";
  }
  if (!Number.isFinite(content.storageGb) || content.storageGb <= 0) {
    return "Missing or invalid storage value.";
  }
  if (!content.cpu.trim()) {
    return "Missing CPU specification.";
  }
  return null;
}

export function buildTelegramListingHtml(content: TelegramListingContent, config: TelegramPostingConfig) {
  const usageLines = sanitizeLines(content.usageTags.map((tag) => mapUsageLabel(tag))).slice(0, 6);
  const customFeatureLines = sanitizeLines(content.featureLines ?? []).slice(0, MAX_FEATURE_LINES);
  const featureLines = customFeatureLines.length > 0 ? customFeatureLines : deriveFeatureLines(content);

  const contactPhones = sanitizeLines(config.sellerPhones).slice(0, 3);
  const phonesLine = contactPhones.length > 0 ? contactPhones.join(" | ") : "Not configured";
  const telegramUsername = fallbackText(config.telegramUsername, "Not configured");
  const telegramProfileUrl = fallbackText(config.telegramProfileUrl, "Not configured");
  const fullAddress = fallbackText(config.fullAddress, "Address not configured.");
  const ctaText = fallbackText(config.ctaText, "📞 Contact now to reserve this laptop today.");

  const lines = [
    `🔥 <b>${escapeTelegramHtml(`${content.brand} ${content.model}`)}</b>`,
    "",
    "💻 <b>Specifications:</b>",
    `• ${escapeTelegramHtml(`${content.ramGb} GB RAM`)}`,
    `• ${escapeTelegramHtml(`${content.storageGb}GB ${content.storageType}`)}`,
    `• ${escapeTelegramHtml(content.cpu)}`,
    `• ${escapeTelegramHtml(content.gpu?.trim() ? content.gpu : "Integrated Graphics")}`,
    "",
    "🎯 <b>Usage Recommendations:</b>",
    ...(usageLines.length > 0 ? usageLines.map((line) => `• ${escapeTelegramHtml(line)}`) : ["• General purpose use"]),
    "",
    "✨ <b>Features:</b>",
    ...featureLines.map((line) => `• ${escapeTelegramHtml(line)}`),
    "",
    `💵 <b>Price:</b> ${Number(content.price).toLocaleString()} ETB`,
    "",
    `🚀 <b>${escapeTelegramHtml(ctaText)}</b>`,
    "",
    "📞 <b>Call Now:</b>",
    `📱 ${escapeTelegramHtml(phonesLine)}`,
    "",
    `📩 <b>Telegram Username:</b> ${escapeTelegramHtml(telegramUsername)}`,
    // `🔗 <b>Telegram Link:</b> ${escapeTelegramHtml(telegramProfileUrl)}`
  ];

  lines.push("", "📍 <b>Address:</b>", escapeTelegramHtml(fullAddress));

  return lines.join("\n");
}
