import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const stringBool = z.stringbool().default(false);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_API_ROOT: z.string().url().default("https://api.telegram.org"),
  TELEGRAM_CA_CERT_PATH: z.string().optional(),
  TELEGRAM_TLS_INSECURE: stringBool,
  BOT_API_BASE_URL: z.string().url().default("http://localhost:3000"),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  BOT_WEBHOOK_PATH: z.string().default("/telegram/webhook"),
  PUBLIC_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_API_KEY: z.string().default("change-me"),
  ADMIN_JWT_SECRET: z.string().min(16).default("change-this-very-long-admin-jwt-secret"),
  ADMIN_JWT_EXPIRES_IN: z.string().default("12h"),
  ADMIN_UPLOAD_DIR: z.string().default("uploads"),
  ADMIN_UPLOAD_MAX_FILE_MB: z.coerce.number().min(1).max(20).default(5)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables", parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
