import { Markup } from "telegraf";
import { USAGE_OPTIONS } from "../shared/constants";
import type { BudgetOptionDto, RamOptionDto, StorageOptionDto } from "./optionsClient";

export function budgetKeyboard(budgets: BudgetOptionDto[]) {
  return Markup.inlineKeyboard([
    ...budgets.map((range) => [Markup.button.callback(range.label, `budget:${range.key}`)])
  ]);
}

export function usageKeyboard() {
  return Markup.inlineKeyboard([
    ...USAGE_OPTIONS.map((usage) => [Markup.button.callback(usage.label, `usage:${usage.key}`)]),
    [Markup.button.callback("Back", "back:budget")]
  ]);
}

export function ramKeyboard(ramOptions: RamOptionDto[]) {
  return Markup.inlineKeyboard([
    ...ramOptions.map((ram) => [Markup.button.callback(ram.label, `ram:${ram.gb}`)]),
    [Markup.button.callback("Back", "back:usage")]
  ]);
}

export function storageKeyboard(storageOptions: StorageOptionDto[]) {
  return Markup.inlineKeyboard([
    ...storageOptions.map((storage) => [Markup.button.callback(storage.label, `storage:${storage.gb}`)]),
    [Markup.button.callback("Back", "back:ram")]
  ]);
}

export function resultsKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback("Back to Home", "home")]]);
}
