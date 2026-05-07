import { buildApp } from "./api/app";
import { bot } from "./bot/index";
import { env } from "./env";
import { prisma } from "./prisma";

const app = buildApp();

if (env.BOT_MODE === "webhook") {
  app.post(env.BOT_WEBHOOK_PATH, async (req, res) => {
    const headerSecret = req.header("x-telegram-bot-api-secret-token");
    const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && headerSecret !== expectedSecret) {
      return res.status(401).json({ message: "Invalid webhook secret" });
    }

    try {
      await bot.handleUpdate(req.body, res);
      return;
    } catch (error) {
      console.error("Webhook handling failed", error);
      return res.status(500).json({ message: "Webhook handling failed" });
    }
  });
}

const server = app.listen(env.API_PORT, async () => {
  console.log(`API server running on http://localhost:${env.API_PORT}`);

  if (env.BOT_MODE === "polling") {
    await bot.launch();
    console.log("Telegram bot started in polling mode");
  }

  if (env.BOT_MODE === "webhook") {
    if (!env.PUBLIC_WEBHOOK_URL) {
      throw new Error("PUBLIC_WEBHOOK_URL is required when BOT_MODE=webhook");
    }

    const webhookUrl = `${env.PUBLIC_WEBHOOK_URL}${env.BOT_WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(webhookUrl, {
      secret_token: env.TELEGRAM_WEBHOOK_SECRET
    });
    console.log(`Telegram webhook configured: ${webhookUrl}`);
  }
});

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down...`);
  server.close();
  bot.stop(signal);
  await prisma.$disconnect();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
