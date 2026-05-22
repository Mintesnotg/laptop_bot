import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { Markup, Telegraf, session } from "telegraf";
import { env } from "../env";
import { buildTelegramListingHtml, validateTelegramListingContent } from "../services/telegramMessageFormatter";
import { sendTelegramRichPost } from "../services/telegramMediaDelivery";
import { normalizeUsageKey, usageLabelFromKey } from "../shared/constants";
import { budgetKeyboard, ramKeyboard, resultsKeyboard, storageKeyboard, usageKeyboard } from "./keyboards";
import { getOptionsSnapshot, getTelegramPostingConfigSnapshot } from "./optionsClient";
import { fetchRecommendations } from "./recommendationClient";
import { BotContext, defaultSession } from "./types";

function buildTelegramAgent() {
  const options: ConstructorParameters<typeof https.Agent>[0] = {
    keepAlive: true,
    keepAliveMsecs: 10000
  };

  if (env.TELEGRAM_CA_CERT_PATH) {
    const certPath = path.resolve(env.TELEGRAM_CA_CERT_PATH);
    if (!fs.existsSync(certPath)) {
      throw new Error(`TELEGRAM_CA_CERT_PATH not found: ${certPath}`);
    }
    options.ca = fs.readFileSync(certPath);
    console.log(`Loaded Telegram CA certificate: ${certPath}`);
  }

  if (env.TELEGRAM_TLS_INSECURE) {
    options.rejectUnauthorized = false;
    console.warn("TELEGRAM_TLS_INSECURE=true enabled. Use only as a temporary local workaround.");
  }

  return new https.Agent(options);
}

const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN, {
  handlerTimeout: 180_000,
  telegram: {
    apiRoot: env.TELEGRAM_API_ROOT,
    agent: buildTelegramAgent()
  }
});

bot.use(session());

bot.use(async (ctx, next) => {
  const typedCtx = ctx as BotContext;
  if (!typedCtx.session) {
    typedCtx.session = { ...defaultSession };
  }
  await next();
});

async function sendOrEdit(ctx: BotContext, text: string, extra?: any) {
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, extra as any);
      return;
    } catch (_error) {
      // Fall back to sending a fresh message.
    }
  }

  await ctx.reply(text, extra);
}

async function askBudget(ctx: BotContext) {
  ctx.session.step = "budget";
  try {
    const options = await getOptionsSnapshot();
    if (!options.budgets.length) {
      await sendOrEdit(
        ctx,
        "Budget options are not configured yet. Please ask the admin to add active budget ranges in Admin Options."
      );
      return;
    }

    await sendOrEdit(
      ctx,
      "Welcome. What is your budget?",
      budgetKeyboard(options.budgets)
    );
  } catch (error) {
    console.error("[bot][budget-options-error]", error);
    await sendOrEdit(
      ctx,
      "Budget options are not configured yet. Please ask the admin to add active budget ranges in Admin Options."
    );
  }
}

async function askUsage(ctx: BotContext) {
  ctx.session.step = "usage";
  const options = await getOptionsSnapshot();
  const selectedLabels = ctx.session.usageSelections.map((key) => usageLabelFromKey(key));
  const selectedText = selectedLabels.length > 0 ? `\nSelected: ${selectedLabels.join(", ")}` : "\nSelected: none yet";
  await sendOrEdit(
    ctx,
    `What will you use it for? (select one or more, then tap Done)${selectedText}`,
    usageKeyboard(ctx.session.usageSelections, options.usageTags)
  );
}

async function askRam(ctx: BotContext) {
  ctx.session.step = "ram";
  const options = await getOptionsSnapshot();
  await sendOrEdit(ctx, "Select minimum RAM.", ramKeyboard(options.ram));
}

async function askStorage(ctx: BotContext) {
  ctx.session.step = "storage";
  const options = await getOptionsSnapshot();
  await sendOrEdit(ctx, "Select minimum SSD/Storage.", storageKeyboard(options.storage));
}

async function savePreference(
  ctx: BotContext,
  budget: { min: number; max: number }
) {
  const primaryUsage = normalizeUsageKey(ctx.session.usageSelections[0] ?? "DAILY_BROWSING") ?? "DAILY_BROWSING";

  if (!ctx.from || !primaryUsage || !ctx.session.ramGb || !ctx.session.storageGb) {
    return;
  }

  await fetch(`${env.BOT_API_BASE_URL}/api/user-preferences`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      telegramUserId: ctx.from.id.toString(),
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      languageCode: ctx.from.language_code,
      budgetMin: budget.min,
      budgetMax: budget.max,
      usageTag: primaryUsage,
      ramGb: ctx.session.ramGb,
      storageGb: ctx.session.storageGb
    })
  });
}

async function showRecommendations(ctx: BotContext) {
  if (
    !ctx.session.budgetKey ||
    ctx.session.usageSelections.length === 0 ||
    !ctx.session.ramGb ||
    !ctx.session.storageGb
  ) {
    await askBudget(ctx);
    return;
  }

  await sendOrEdit(ctx, "Checking top laptops for your criteria...", Markup.removeKeyboard());

  try {
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const [result, postingConfig] = await Promise.all([
      fetchRecommendations({
        telegramUserId: ctx.from ? BigInt(ctx.from.id) : undefined,
        budgetKey: ctx.session.budgetKey,
        usage: ctx.session.usageSelections,
        ramGb: ctx.session.ramGb,
        storageGb: ctx.session.storageGb,
        limit: 5
      }),
      getTelegramPostingConfigSnapshot()
    ]);

    await savePreference(ctx, {
      min: result.filters.budgetMin,
      max: result.filters.budgetMax
    }).catch((error) => {
      console.warn("[bot][preference-save-failed]", error);
    });
    if (!postingConfig.fullAddress.trim()) {
      console.warn(`[telegram][config-warning] flow=bot-recommendation requestId=${requestId} field=fullAddress`);
    }
    if (!postingConfig.fallbackImageUrl.trim()) {
      console.warn(`[telegram][config-warning] flow=bot-recommendation requestId=${requestId} field=fallbackImageUrl`);
    }

    if (!result.items || result.items.length === 0) {
      await ctx.reply(
        result.hintMessage || "No close matches found. Try lowering RAM/storage or choosing a different usage.",
        resultsKeyboard()
      );
      return;
    }

    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (!chatId) {
      await ctx.reply("Unable to determine the chat target for recommendations.", resultsKeyboard());
      return;
    }

    ctx.session.step = "results";

    await ctx.reply(
      [
        "Top laptop suggestions:",
        `Budget: ${result.filters.budget}`,
        `Purpose: ${Array.isArray(result.filters.usage) ? result.filters.usage.join(", ") : result.filters.usage}`,
        `Match mode: ${result.matchMode || "strict"}`
      ].join("\n"),
      Markup.removeKeyboard()
    );

    let sentCount = 0;
    let skippedCount = 0;

    for (const item of result.items as any[]) {
      const validationError = validateTelegramListingContent({
        brand: item.brand ?? "",
        model: item.model ?? "",
        price: Number(item.price ?? 0),
        ramGb: Number(item.ramGb ?? 0),
        storageGb: Number(item.storageGb ?? 0),
        storageType: item.storageType ?? "SSD",
        cpu: item.cpu ?? "",
        gpu: item.gpu ?? null,
        usageTags:
          Array.isArray(item.usageTags) && item.usageTags.length > 0
            ? item.usageTags
            : Array.isArray(ctx.session.usageSelections)
              ? ctx.session.usageSelections
              : [],
        description: item.description ?? null,
        featureLines: Array.isArray(item.featureLines) ? item.featureLines : []
      });

      if (validationError) {
        skippedCount += 1;
        console.warn(
          `[bot][recommendation-skip] requestId=${requestId} productId=${item.id ?? "-"} reason=${validationError}`
        );
        continue;
      }

      const html = buildTelegramListingHtml(
        {
          brand: item.brand,
          model: item.model,
          price: Number(item.price),
          ramGb: Number(item.ramGb),
          storageGb: Number(item.storageGb),
          storageType: item.storageType,
          cpu: item.cpu,
          gpu: item.gpu,
          usageTags:
            Array.isArray(item.usageTags) && item.usageTags.length > 0
              ? item.usageTags
              : ctx.session.usageSelections,
          description: item.description,
          featureLines: Array.isArray(item.featureLines) ? item.featureLines : []
        },
        postingConfig
      );

      const imageUrls: string[] = Array.isArray(item.imageUrls)
        ? item.imageUrls.filter(Boolean)
        : item.imageUrl
          ? [item.imageUrl]
          : [];

      const sendResult = await sendTelegramRichPost({
        telegram: ctx.telegram,
        chatId,
        html,
        imageUrls,
        fallbackImageUrl: postingConfig.fallbackImageUrl,
        skipRemoteImageValidation: true,
        context: {
          flow: "bot-recommendation",
          requestId,
          productId: item.id,
          chatId
        }
      });

      if (!sendResult.success) {
        skippedCount += 1;
        console.warn(
          `[bot][recommendation-send-failed] requestId=${requestId} productId=${item.id ?? "-"} message=${sendResult.message ?? "unknown"}`
        );
        continue;
      }

      sentCount += 1;
    }

    if (sentCount === 0) {
      await ctx.reply(
        result.hintMessage ||
          "We found possible laptops, but could not deliver them with media right now. Please try again in a moment.",
        resultsKeyboard()
      );
      return;
    }

    const summarySuffix = skippedCount > 0 ? ` (${skippedCount} skipped due to validation/media issues)` : "";
    await ctx.reply(`Delivered ${sentCount} recommendation(s)${summarySuffix}.`, resultsKeyboard());
  } catch (error) {
    console.error("[bot][recommendations-error]", error);
    await ctx.reply(
      "We could not fetch recommendations right now. Please try again, or adjust budget/RAM/storage filters.",
      resultsKeyboard()
    );
  }
}

bot.start(async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  typedCtx.session = { ...defaultSession };
  await askBudget(typedCtx);
});

bot.command("home", async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  typedCtx.session = { ...defaultSession };
  await askBudget(typedCtx);
});

bot.command("help", async (ctx) => {
  await ctx.reply("Use /start to begin laptop recommendations. You can use Back and Back to Home anytime.");
});

bot.action(/^budget:(.+)$/i, async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  typedCtx.session.budgetKey = ctx.match[1];
  typedCtx.session.usageSelections = [];
  delete typedCtx.session.ramGb;
  delete typedCtx.session.storageGb;
  await ctx.answerCbQuery();
  await askUsage(typedCtx);
});

bot.action(/^usage_toggle:(.+)$/i, async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  const normalizedUsage = normalizeUsageKey(ctx.match[1]);
  if (!normalizedUsage) {
    await ctx.answerCbQuery("Invalid usage value");
    return;
  }

  const currentSelections = typedCtx.session.usageSelections || [];
  const alreadySelected = currentSelections.includes(normalizedUsage);
  typedCtx.session.usageSelections = alreadySelected
    ? currentSelections.filter((entry) => entry !== normalizedUsage)
    : [...currentSelections, normalizedUsage];
  delete typedCtx.session.ramGb;
  delete typedCtx.session.storageGb;
  await ctx.answerCbQuery(alreadySelected ? "Removed" : "Added");
  await askUsage(typedCtx);
});

bot.action("usage_done", async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  if (!typedCtx.session.usageSelections || typedCtx.session.usageSelections.length === 0) {
    await ctx.answerCbQuery("Select at least one usage type.");
    await askUsage(typedCtx);
    return;
  }

  delete typedCtx.session.ramGb;
  delete typedCtx.session.storageGb;
  await ctx.answerCbQuery();
  await askRam(typedCtx);
});

bot.action(/^ram:(\d+)$/i, async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  typedCtx.session.ramGb = Number(ctx.match[1]);
  delete typedCtx.session.storageGb;
  await ctx.answerCbQuery();
  await askStorage(typedCtx);
});

bot.action(/^storage:(\d+)$/i, async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  typedCtx.session.storageGb = Number(ctx.match[1]);
  await ctx.answerCbQuery();
  await showRecommendations(typedCtx);
});

bot.action(/^back:(budget|usage|ram)$/i, async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  const step = ctx.match[1];
  await ctx.answerCbQuery();

  if (step === "budget") {
    typedCtx.session = { ...defaultSession };
    await askBudget(typedCtx);
    return;
  }

  if (step === "usage") {
    typedCtx.session.usageSelections = [];
    delete typedCtx.session.ramGb;
    delete typedCtx.session.storageGb;
    await askUsage(typedCtx);
    return;
  }

  delete typedCtx.session.ramGb;
  delete typedCtx.session.storageGb;
  await askRam(typedCtx);
});

bot.action("home", async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  typedCtx.session = { ...defaultSession };
  await ctx.answerCbQuery();
  await askBudget(typedCtx);
});

bot.catch((error) => {
  console.error("Bot error", error);
});

export { bot };
