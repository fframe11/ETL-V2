import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../src/test/text-budget.json", import.meta.url);
const key = process.argv[2];
const budgets = JSON.parse(readFileSync(file, "utf8"));
if (!budgets[key]) {
  console.error(`No budget entry for "${key}"`);
  process.exit(1);
}
const b = budgets[key];
if (b.baseline_chars == null) {
  console.error(`"${key}" has no baseline yet; run Task 1 Step 9 first`);
  process.exit(1);
}
b.max_chars = Math.floor(b.baseline_chars * b.ratio);
b.enforce_single_language = true;
writeFileSync(file, JSON.stringify(budgets, null, 2) + "\n");
console.log(`${key}: max_chars ${b.baseline_chars} -> ${b.max_chars}`);
