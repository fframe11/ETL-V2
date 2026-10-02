import { it, expect } from "vitest";
import { formatValue } from "./numberFormat";

it("shortens big numbers the way BI cards do", () => {
  expect(formatValue(1770000)).toBe("1.77M");
  expect(formatValue(12200)).toBe("12.2K");
  expect(formatValue(93)).toBe("93");
  expect(formatValue(1234.567)).toBe("1,234.57");
});

it("formats currency and percent", () => {
  expect(formatValue(21900, "currency")).toBe("฿21.9K");
  expect(formatValue(95.1, "percent")).toBe("95.1%");
});

it("shows a dash for missing values", () => {
  for (const v of [null, undefined, ""]) expect(formatValue(v)).toBe("—");
});
