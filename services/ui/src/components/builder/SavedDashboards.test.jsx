import React from "react";
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { mockFetchByUrl } from "../../test/renderPage";
import SavedDashboards from "./SavedDashboards";
import { formatDate } from "./DatasetPicker";

const ID = "a".repeat(32);
const SUMMARY = { id: ID, name: "ยอดขายผู้บริหาร", description: "", table_name: "sales", widget_count: 3,
  updated_at: "2026-10-02T03:00:00Z" };

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

async function mount(routes, onDeleted) {
  mockFetchByUrl([...routes, ["/dashboards/saved", { body: { dashboards: [SUMMARY] } }]]);
  await act(async () => { render(<SavedDashboards onOpen={() => {}} onDeleted={onDeleted} />); });
  await settle();
}

async function confirmDelete() {
  fireEvent.click(screen.getByRole("button", { name: "ลบ ยอดขายผู้บริหาร" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ ยอดขายผู้บริหาร" })); });
  await settle();
}

it("reports the id of a dashboard once it was deleted", async () => {
  const onDeleted = vi.fn();
  await mount([[`/dashboards/saved/${ID}`, { body: {} }]], onDeleted);
  await confirmDelete();
  expect(onDeleted).toHaveBeenCalledTimes(1);
  expect(onDeleted).toHaveBeenCalledWith(ID);
});

it("does not report a deletion that failed", async () => {
  const onDeleted = vi.fn();
  await mount([[`/dashboards/saved/${ID}`, { status: 500, body: { detail: "ลบไม่สำเร็จ" } }]], onDeleted);
  await confirmDelete();
  expect(onDeleted).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

it("shows each dashboard's dataset under a readable name with single spaces around the separators", async () => {
  const quality = { ...SUMMARY, id: "b".repeat(32), name: "ติดตามคุณภาพ", table_name: "_quality_runs", widget_count: 6 };
  const sales = { ...SUMMARY, widget_count: 6 };
  mockFetchByUrl([["/dashboards/saved", { body: { dashboards: [sales, quality] } }]]);
  let container;
  await act(async () => { ({ container } = render(<SavedDashboards onOpen={() => {}} />)); });
  await settle();
  const spans = container.querySelectorAll("li span.dbb-muted");
  expect(spans).toHaveLength(2);
  expect(spans[0].textContent).toBe(` · sales · 6 วิดเจ็ต · ${formatDate(SUMMARY.updated_at)}`);
  expect(spans[1].textContent).toBe(` · ผลตรวจคุณภาพข้อมูล (ทุกตาราง) · 6 วิดเจ็ต · ${formatDate(SUMMARY.updated_at)}`);
  expect(container.textContent).not.toContain("_quality_runs");
});

it("still deletes when no onDeleted is given", async () => {
  await mount([[`/dashboards/saved/${ID}`, { body: {} }]]);
  await confirmDelete();
  expect(fetch.mock.calls.some(([url, o]) => String(url).includes(`/saved/${ID}`) && o?.method === "DELETE")).toBe(true);
});
