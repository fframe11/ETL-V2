import { it, expect } from "vitest";
import { usdToThb, formatUsd, formatThbApprox, formatUsdWithThb, USD_TO_THB_RATE } from "./currency";

it("converts using the documented fixed rate", () => {
  expect(usdToThb(100)).toBe(Math.round(100 * USD_TO_THB_RATE));
});

it("treats missing/null amounts as zero instead of throwing", () => {
  expect(usdToThb(null)).toBe(0);
  expect(usdToThb(undefined)).toBe(0);
  expect(formatUsd(null)).toBe("$0 USD");
  expect(formatThbApprox(undefined)).toBe("≈ ฿0");
});

it("keeps USD as the primary, unconverted figure", () => {
  expect(formatUsd(14277)).toBe("$14,277 USD");
});

it("marks the Baht figure as approximate", () => {
  expect(formatThbApprox(14277)).toMatch(/^≈ ฿/);
});

it("combines both in one line for tight spaces", () => {
  expect(formatUsdWithThb(14277)).toBe("$14,277 USD (≈ ฿521,111)");
});
