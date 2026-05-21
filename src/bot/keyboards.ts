import { Markup } from "telegraf";
import type { BudgetOptionDto, RamOptionDto, StorageOptionDto, UsageTagOptionDto } from "./optionsClient";

export function budgetKeyboard(budgets: BudgetOptionDto[]) {
  return Markup.inlineKeyboard([
    ...budgets.map((range) => [Markup.button.callback(range.label, `budget:${range.key}`)])
  ]);
}

export function usageKeyboard(selected: string[], usageOptions: UsageTagOptionDto[]) {
  const selectedSet = new Set(selected);
  return Markup.inlineKeyboard([
    ...usageOptions.map((usage) => {
      const isSelected = selectedSet.has(usage.key);
      const label = isSelected ? `[x] ${usage.label}` : `[ ] ${usage.label}`;
      return [Markup.button.callback(label, `usage_toggle:${usage.key}`)];
    }),
    [Markup.button.callback("Done", "usage_done")],
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
