import { it, expect } from "vitest";
import { toggleLine } from "./ContextForm";

it("adds a suggestion as a new line and removes it when picked again", () => {
  expect(toggleLine("", "A")).toBe("A");
  expect(toggleLine("A", "B")).toBe("A\nB");
  expect(toggleLine("A\nB", "A")).toBe("B");
  expect(toggleLine("A", "A")).toBe("");
});

it("keeps what the user typed and ignores blank lines", () => {
  expect(toggleLine("ดูยอดขาย\n\n", "A")).toBe("ดูยอดขาย\nA");
});
