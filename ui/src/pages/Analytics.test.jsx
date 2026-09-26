import { it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import Analytics from "./Analytics";

it("never shows a dollar figure without its Baht reference alongside it", async () => {
  await renderPage(Analytics, "/analytics");
  const dollarNodes = screen.getAllByText(/\$[\d,]+ USD/);
  expect(dollarNodes.length).toBeGreaterThan(0);
  for (const node of dollarNodes) {
    const container = node.closest("div")?.parentElement || document.body;
    expect(container.textContent).toMatch(/฿/);
  }
});
