import { it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
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

const TABLES = { tables: [
  { name: "newer_tbl", runs: 3, latest_score: 91, latest_at: "2026-10-07T00:00:00+00:00" },
  { name: "olist_products_dataset", runs: 1, latest_score: 66.06, latest_at: "2026-10-05T18:05:14+00:00" }
] };
const RECS = { table_name: "olist_products_dataset",
  latest_run: { quality_score: 66.06, threshold: 90, total_records: 32951, quarantined_records: 11184 },
  recommendations: [
    { id: "REC-Q-001", scope: "table", table: "olist_products_dataset", title: "คะแนน 66.06% ต่ำกว่าเกณฑ์ 90%", description: "กักกัน 11,184 จาก 32,951 แถว", action_type: "SUMMARY", status: "CRITICAL" },
    { id: "REC-Q-002", scope: "table", table: "olist_products_dataset", title: "ผ่อนกฎค่าผิดปกติ: product_weight_g", description: "ลองเพิ่ม iqr_multiplier", action_type: "TUNE_OUTLIER_RULE", status: "RECOMMENDED", link: "/rules" },
    { id: "REC-DFT-001", scope: "other", table: "old_tbl", title: "โครงสร้างข้อมูลของ 'old_tbl' เปลี่ยน", description: "x", action_type: "NOTIFY_DEV", status: "PENDING" }
  ] };
const CLUSTERS = { table_name: "olist_products_dataset", correlation_analysis: "41.6% ของเหตุผลมาจากค่าผิดปกติ",
  clusters: [{ id: 1, source: "ค่าผิดปกติ (IQR)", column: "product_weight_g", label: "ค่าผิดปกติ (IQR) · product_weight_g", pattern: "outlier_product_weight_g", errors_count: 4648, percentage: 41.6 }] };
const PROJECTION_EMPTY = { table_name: "olist_products_dataset", runs_count: 1, projection_days: [], projected_scores: [], ci_high: [], ci_low: [], stability_index: "N/A", historical_trend: "No historical trend data available." };

async function renderAnalytics(extra = []) {
  const fn = await import("../test/renderPage");
  const routes = [
    ["/analytics/tables", { body: TABLES }],
    ["/whitebox/state", { body: { dataset_name: "olist_products_dataset" } }],
    ["/analytics/recommendations", { body: RECS }],
    ["/analytics/clustering", { body: CLUSTERS }],
    ["/analytics/projection", { body: PROJECTION_EMPTY }],
    ["/analytics/impact", { body: { kpi_connections: [], total_financial_impact_usd: 0 } }],
    ...extra
  ];
  await fn.renderPage(Analytics, "/analytics", routes);
  return routes;
}

it("starts on the dataset that is loaded now and asks every endpoint for that table", async () => {
  await renderAnalytics();
  expect(screen.getByLabelText("ตาราง").value).toBe("olist_products_dataset");
  const urls = globalThis.fetch.mock.calls.map((c) => String(c[0]));
  for (const ep of ["projection", "clustering", "recommendations"]) {
    expect(urls.some((u) => u.includes(`/analytics/${ep}?table_name=olist_products_dataset`))).toBe(true);
  }
});

it("shows what to do for the chosen table first and keeps other tables' alerts collapsed", async () => {
  await renderAnalytics();
  const cards = screen.getAllByTestId("rec-card");
  expect(cards[0].textContent).toContain("66.06%");
  expect(screen.getByText(/ผ่อนกฎค่าผิดปกติ: product_weight_g/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "ไปตั้งกฎ" }).getAttribute("href")).toBe("/rules");
  expect(screen.getByText(/แจ้งเตือนของตารางอื่น \(1\)/)).toBeTruthy();
  expect(screen.getByTestId("latest-run").textContent).toContain("11,184 จาก 32,951");
});

it("lists causes by category and column, with no Unknown source", async () => {
  await renderAnalytics();
  expect(screen.getAllByText(/ค่าผิดปกติ \(IQR\) · product_weight_g/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Unknown/)).toBeNull();
});

it("explains an empty forecast with the run count instead of showing N/A tiles", async () => {
  await renderAnalytics();
  expect(screen.getByText(/มีผลรัน 1 รอบ ต้องมีอย่างน้อย 2 รอบ/)).toBeTruthy();
  expect(screen.queryByText("N/A")).toBeNull();
  expect(screen.queryByText(/Historical Trend Summary/)).toBeNull();
});

it("does not invent forecast days or claim a recommendation was applied", async () => {
  await renderAnalytics();
  expect(screen.queryByRole("button", { name: /นำไปใช้/ })).toBeNull();
  expect(screen.queryByText(/14 วัน|30 วัน/)).toBeNull();
});

it("reloads the three table endpoints when another table is chosen", async () => {
  await renderAnalytics();
  fireEvent.change(screen.getByLabelText("ตาราง"), { target: { value: "newer_tbl" } });
  await new Promise((r) => setTimeout(r, 50));
  const urls = globalThis.fetch.mock.calls.map((c) => String(c[0]));
  expect(urls.some((u) => u.includes("/analytics/clustering?table_name=newer_tbl"))).toBe(true);
});

it("says so when there are no quality runs at all", async () => {
  await renderPage(Analytics, "/analytics");
  expect(screen.getByText(/ยังไม่มีผลรันตรวจคุณภาพ/)).toBeTruthy();
});
