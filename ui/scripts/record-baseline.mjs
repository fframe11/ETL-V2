import { readFileSync, writeFileSync } from "node:fs";

const budgetFile = new URL("../src/test/text-budget.json", import.meta.url);
const reportFile = new URL("../src/test/text-report.json", import.meta.url);
const budgets = JSON.parse(readFileSync(budgetFile, "utf8"));
const report = JSON.parse(readFileSync(reportFile, "utf8"));

for (const [key, chars] of Object.entries(report)) {
  if (!budgets[key]) throw new Error(`No budget entry for "${key}"`);
  budgets[key].baseline_chars = chars;
  budgets[key].max_chars = chars; // freeze today's level; Tasks 4-13 tighten it
}
writeFileSync(budgetFile, JSON.stringify(budgets, null, 2) + "\n");
console.log(report);
