import { Context } from "telegraf";
import { Update } from "telegraf/typings/core/types/typegram";

export type BotStep = "idle" | "budget" | "usage" | "ram" | "storage" | "results";

export type BotSession = {
  step: BotStep;
  budgetKey?: string;
  usageSelections: string[];
  ramGb?: number;
  storageGb?: number;
};

export type BotContext = Context<Update> & {
  session: BotSession;
};

export const defaultSession: BotSession = {
  step: "idle",
  usageSelections: []
};
