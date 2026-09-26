import React from "react";
import { it, expect } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NavBar from "./NavBar";
import { PAGES, NAV_GROUPS } from "../config/pages";
import { mockFetchEmpty, mockFetchByUrl } from "../test/renderPage";

it("builds the menu from the page registry, grouped by workflow", async () => {
  mockFetchEmpty();
  await act(async () => {
    render(
      <MemoryRouter>
        <NavBar isOpen isSidebarOpen toggleSidebar={() => {}} />
      </MemoryRouter>
    );
  });
  for (const p of PAGES) expect(screen.getAllByText(p.label).length).toBeGreaterThan(0);
  for (const g of NAV_GROUPS.filter((g) => g.title)) expect(screen.getByText(g.title)).toBeInTheDocument();
  expect(screen.queryByText("Runs")).toBeNull();
});

async function renderNav() {
  await act(async () => {
    render(
      <MemoryRouter>
        <NavBar isOpen isSidebarOpen toggleSidebar={() => {}} />
      </MemoryRouter>
    );
  });
  // Auth check resolves, then the pending-count effect runs and fetches.
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}

it("shows the step number and the pending count side by side, labelled differently", async () => {
  mockFetchByUrl([
    ["/auth/me", { body: { username: "admin" } }],
    ["/rules/ai-proposals", { body: { count: 3 } }],
    ["/schema/proposals", { body: { proposals: [] } }]
  ]);
  await renderNav();
  const link = screen.getByRole("link", { name: /Expectations & Alerts/ });
  expect(within(link).getByTitle("ขั้นที่ 2")).toHaveTextContent("2");
  expect(within(link).getByLabelText("รออนุมัติ 3 รายการ")).toBeInTheDocument();
});
