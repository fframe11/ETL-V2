import { it, expect } from "vitest";
import { formatValue } from "./numberFormat";

it("shortens big numbers the way BI cards do", () => {
  expect(formatValue(1770000)).toBe("1.77M");
  expect(formatValue(12200)).toBe("12.2K");
  expect(formatValue(93)).toBe("93");
  expect(formatValue(1234.567)).toBe("1,234.57");
});

it("shows the symbol of the currency code", () => {
  expect(formatValue(625.33, "currency", "USD")).toBe("$625.33");
  expect(formatValue(1770000, "currency", "USD")).toBe("$1.77M");
  expect(formatValue(21900, "currency", "THB")).toBe("฿21.9K");
});

it("shows no currency symbol when the code is missing or unknown", () => {
  expect(formatValue(21900, "currency")).toBe("21.9K");
  expect(formatValue(21900, "currency", "XX")).toBe("21.9K");
});

it("formats percent", () => {
  expect(formatValue(95.1, "percent")).toBe("95.1%");
});

it("shows a dash for missing values", () => {
  for (const v of [null, undefined, ""]) expect(formatValue(v)).toBe("—");
});
