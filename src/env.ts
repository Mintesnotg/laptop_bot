import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  BOT_API_BASE_URL: z.string().url().default("http://localhost:3000"),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  BOT_WEBHOOK_PATH: z.string().default("/telegram/webhook"),
  PUBLIC_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_API_KEY: z.string().default("change-me")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables", parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
