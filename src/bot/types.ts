import { Context } from "telegraf";
import { Update } from "telegraf/typings/core/types/typegram";
import { UsageKey } from "../shared/constants";

export type BotStep = "idle" | "budget" | "usage" | "ram" | "storage" | "results";

export type BotSession = {
  step: BotStep;
  budgetKey?: string;
  usageSelections: UsageKey[];
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
