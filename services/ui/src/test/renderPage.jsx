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

// Like mockFetchEmpty, but lets a test answer specific endpoints.
// routes: [[urlSubstring, { status, body, headers, blob }], ...]; first match wins.
export function mockFetchByUrl(routes) {
  const fn = vi.fn(async (url) => {
    const hit = routes.find(([part]) => String(url).includes(part));
    const status = hit?.[1]?.status ?? 200;
    const body = hit?.[1]?.body ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(hit?.[1]?.headers ?? {}),
      json: async () => body,
      text: async () => JSON.stringify(body),
      blob: async () => hit?.[1]?.blob ?? new Blob()
    };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Renders a page as a first-time visitor sees it when the API has no data yet.
export async function renderPage(Component, path = "/", routes) {
  if (routes) mockFetchByUrl(routes); else mockFetchEmpty();
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
