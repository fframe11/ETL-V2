import React from "react";
import { it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NavBar from "./NavBar";
import { PAGES, NAV_GROUPS } from "../config/pages";
import { mockFetchEmpty } from "../test/renderPage";

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
