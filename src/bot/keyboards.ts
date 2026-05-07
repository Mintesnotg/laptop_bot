import { Markup } from "telegraf";
import { BUDGET_RANGES, RAM_OPTIONS, STORAGE_OPTIONS, USAGE_OPTIONS } from "../shared/constants";

export function budgetKeyboard() {
  return Markup.inlineKeyboard([
    ...BUDGET_RANGES.map((range) => [Markup.button.callback(range.label, `budget:${range.key}`)])
  ]);
}

export function usageKeyboard() {
  return Markup.inlineKeyboard([
    ...USAGE_OPTIONS.map((usage) => [Markup.button.callback(usage.label, `usage:${usage.key}`)]),
    [Markup.button.callback("Back", "back:budget")]
  ]);
}

export function ramKeyboard() {
  return Markup.inlineKeyboard([
    ...RAM_OPTIONS.map((ram) => [Markup.button.callback(ram.label, `ram:${ram.gb}`)]),
    [Markup.button.callback("Back", "back:usage")]
  ]);
}

export function storageKeyboard() {
  return Markup.inlineKeyboard([
    ...STORAGE_OPTIONS.map((storage) => [Markup.button.callback(storage.label, `storage:${storage.gb}`)]),
    [Markup.button.callback("Back", "back:ram")]
  ]);
}

export function resultsKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback("Back to Home", "home")]]);
}
