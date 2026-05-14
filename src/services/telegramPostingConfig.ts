import { prisma } from "../prisma";

export const TELEGRAM_POSTING_CONFIG_KEY = "telegramPostingConfig";

export type TelegramPostingConfig = {
  sellerPhones: string[];
  telegramUsername: string;
  telegramProfileUrl: string;
  fullAddress: string;
  ctaText: string;
  fallbackImageUrl: string;
};

const DEFAULT_POSTING_CONFIG: TelegramPostingConfig = {
  sellerPhones: [],
  telegramUsername: "",
  telegramProfileUrl: "",
  fullAddress: "",
  ctaText: "📞 Contact now to reserve this laptop today.",
  fallbackImageUrl: ""
};

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidImageLocation(value: string) {
  if (!value) {
    return false;
  }

  if (value.startsWith("/uploads/")) {
    return true;
  }

  return isValidHttpUrl(value);
}

function normalizePhone(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeUsername(value: string) {
  const trimmed = value.trim().replace(/^@+/, "");
  if (!trimmed) {
    return "";
  }
  return `@${trimmed}`;
}

function defaultTelegramProfileFromUsername(username: string) {
  const trimmed = username.replace(/^@+/, "");
  if (!trimmed) {
    return "";
  }
  return `https://t.me/${trimmed}`;
}

export function normalizeTelegramPostingConfig(
  input: Partial<TelegramPostingConfig> | null | undefined
): TelegramPostingConfig {
  const sellerPhones = Array.from(
    new Set(
      (input?.sellerPhones ?? [])
        .map((entry) => normalizePhone(entry))
        .filter((entry) => entry.length > 0)
    )
  );
  const telegramUsername = normalizeUsername(input?.telegramUsername ?? "");
  const explicitProfile = (input?.telegramProfileUrl ?? "").trim();
  const telegramProfileUrl = isValidHttpUrl(explicitProfile)
    ? explicitProfile
    : defaultTelegramProfileFromUsername(telegramUsername);
  const fullAddress = (input?.fullAddress ?? "").trim();
  const ctaText = (input?.ctaText ?? "").trim() || DEFAULT_POSTING_CONFIG.ctaText;
  const fallbackImageUrlRaw = (input?.fallbackImageUrl ?? "").trim();
  const fallbackImageUrl = isValidImageLocation(fallbackImageUrlRaw) ? fallbackImageUrlRaw : "";

  return {
    sellerPhones,
    telegramUsername,
    telegramProfileUrl,
    fullAddress,
    ctaText,
    fallbackImageUrl
  };
}

export async function getTelegramPostingConfig() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: TELEGRAM_POSTING_CONFIG_KEY },
    select: { value: true }
  });

  if (!setting?.value) {
    return { ...DEFAULT_POSTING_CONFIG };
  }

  try {
    const parsed = JSON.parse(setting.value) as Partial<TelegramPostingConfig>;
    return normalizeTelegramPostingConfig({
      ...DEFAULT_POSTING_CONFIG,
      ...parsed
    });
  } catch {
    return { ...DEFAULT_POSTING_CONFIG };
  }
}

export async function upsertTelegramPostingConfig(input: Partial<TelegramPostingConfig>) {
  const normalized = normalizeTelegramPostingConfig(input);
  await prisma.appSetting.upsert({
    where: { key: TELEGRAM_POSTING_CONFIG_KEY },
    create: {
      key: TELEGRAM_POSTING_CONFIG_KEY,
      value: JSON.stringify(normalized)
    },
    update: {
      value: JSON.stringify(normalized)
    }
  });

  return normalized;
}
