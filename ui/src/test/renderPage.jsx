import React from "react";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

export function mockFetchEmpty() {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
    blob: async () => new Blob()
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Renders a page as a first-time visitor sees it when the API has no data yet.
export async function renderPage(Component, path = "/") {
  mockFetchEmpty();
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter initialEntries={[path]}>
        <Component />
      </MemoryRouter>
    );
  });
  // Lets fetch promises and the 300 ms debounced fetch in Pipeline settle.
  await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
  return utils;
}
