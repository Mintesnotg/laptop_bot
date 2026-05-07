import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { Markup, Telegraf, session } from "telegraf";
import { env } from "../env";
import { findBudgetRange, normalizeUsageKey } from "../shared/constants";
import { budgetKeyboard, ramKeyboard, resultsKeyboard, storageKeyboard, usageKeyboard } from "./keyboards";
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
  await sendOrEdit(
    ctx,
    "Welcome. What is your budget?",
    budgetKeyboard()
  );
}

async function askUsage(ctx: BotContext) {
  ctx.session.step = "usage";
  await sendOrEdit(ctx, "What will you use it for?", usageKeyboard());
}

async function askRam(ctx: BotContext) {
  ctx.session.step = "ram";
  await sendOrEdit(ctx, "Select minimum RAM.", ramKeyboard());
}

async function askStorage(ctx: BotContext) {
  ctx.session.step = "storage";
  await sendOrEdit(ctx, "Select minimum SSD/Storage.", storageKeyboard());
}

async function savePreference(ctx: BotContext) {
  const budget = findBudgetRange(ctx.session.budgetKey ?? "");

  if (!budget || !ctx.from || !ctx.session.usage || !ctx.session.ramGb || !ctx.session.storageGb) {
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
      usageTag: ctx.session.usage,
      ramGb: ctx.session.ramGb,
      storageGb: ctx.session.storageGb
    })
  });
}

async function showRecommendations(ctx: BotContext) {
  if (!ctx.session.budgetKey || !ctx.session.usage || !ctx.session.ramGb || !ctx.session.storageGb) {
    await askBudget(ctx);
    return;
  }

  await sendOrEdit(ctx, "Checking top laptops for your criteria...", Markup.removeKeyboard());

  try {
    await savePreference(ctx);

    const result = await fetchRecommendations({
      telegramUserId: ctx.from ? BigInt(ctx.from.id) : undefined,
      budgetKey: ctx.session.budgetKey,
      usage: ctx.session.usage,
      ramGb: ctx.session.ramGb,
      storageGb: ctx.session.storageGb,
      limit: 5
    });

    if (!result.items || result.items.length === 0) {
      await ctx.reply(
        "No exact match found for this filter set. Try lowering RAM/storage or choosing another usage.",
        resultsKeyboard()
      );
      return;
    }

    ctx.session.step = "results";

    const lines = [
      "Top laptop suggestions:",
      `Budget: ${result.filters.budget}`,
      `Purpose: ${result.filters.usage}`,
      ""
    ];

    result.items.forEach((item: any, index: number) => {
      lines.push(
        `${index + 1}. ${item.brand} ${item.model}`,
        `Specs: ${item.ramGb}GB RAM / ${item.storageGb}GB ${item.storageType}, ${item.cpu}${item.gpu ? `, ${item.gpu}` : ""}`,
        `Price: ${Number(item.price).toLocaleString()} ETB`,
        "CTA: Buy / Contact",
        ""
      );
    });

    await ctx.reply(lines.join("\n"), resultsKeyboard());
  } catch (error) {
    console.error(error);
    await ctx.reply("Something went wrong while fetching recommendations. Please try again.", resultsKeyboard());
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
  delete typedCtx.session.usage;
  delete typedCtx.session.ramGb;
  delete typedCtx.session.storageGb;
  await ctx.answerCbQuery();
  await askUsage(typedCtx);
});

bot.action(/^usage:(.+)$/i, async (ctx) => {
  const typedCtx = ctx as unknown as BotContext;
  const normalizedUsage = normalizeUsageKey(ctx.match[1]);
  if (!normalizedUsage) {
    await ctx.answerCbQuery("Invalid usage value");
    return;
  }

  typedCtx.session.usage = normalizedUsage;
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
    delete typedCtx.session.usage;
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
