import { it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import Dashboard from "./Dashboard";

it("never shows a dollar figure without its Baht reference nearby", async () => {
  await renderPage(Dashboard, "/dashboard");
  const dollarNodes = screen.getAllByText(/\$[\d,]+/);
  expect(dollarNodes.length).toBeGreaterThan(0);
  for (const node of dollarNodes) {
    // The Baht reference is a sibling or nested element within the same
    // small card/row, not always the immediate parent — walk up a couple of
    // levels the way a reader's eye would scan the same card.
    let scope = node;
    for (let i = 0; i < 3 && scope.parentElement; i++) scope = scope.parentElement;
    expect(scope.textContent).toMatch(/฿/);
  }
});
