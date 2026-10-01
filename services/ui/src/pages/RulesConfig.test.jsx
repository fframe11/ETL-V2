import { it, expect } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import RulesConfig from "./RulesConfig";

it("does not show made-up pass rates or flagged counts without metrics", async () => {
  await renderPage(RulesConfig, "/rules");
  for (const fake of ["95.0%", "99.0%", "500 rows", "100 rows"]) expect(screen.queryAllByText(fake)).toHaveLength(0);
});

it("has no fake search box", async () => {
  await renderPage(RulesConfig, "/rules");
  expect(screen.queryByText("Search expectations...")).toBeNull();
});

it("has no AI explain button that renders nothing", async () => {
  await renderPage(RulesConfig, "/rules");
  expect(screen.queryByRole("button", { name: "อธิบายด้วย AI" })).toBeNull();
});

const CATALOG = ["/export/tables", { body: { tables: [{ name: "t1", layers: ["active"] }], reddit_available: false } }];
const RULES = ["/rules/t1", { body: { effective_rules: {} } }];

async function openColumnProfiler(profileBody) {
  await renderPage(RulesConfig, "/rules", [["/rules/profiles/t1", { body: profileBody }], RULES, CATALOG]);
  const advanced = screen.queryByText(/ตั้งค่าขั้นสูง/);
  if (advanced) fireEvent.click(advanced);
  await screen.findAllByText("t1");  // the first table is selected automatically
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Column Profiler" })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
}

it("column profiler explains when a table has no profile yet instead of an empty table", async () => {
  await openColumnProfiler({ table: "t1", profiles: [], source: "empty", message: "none" });
  expect(screen.getByText(/No profiled logs active/)).toBeTruthy();
  expect(screen.queryByText(/Null Rates Profile/)).toBeNull();
});

it("column profiler shows null rates and IQR bounds from the latest run", async () => {
  await openColumnProfiler({
    table: "t1", run_id: "run_1", timestamp: "2026-10-01T10:00:00Z", source: "sdoqap_quality_runs",
    null_profile: { score: { null_rate: 0.0302, tolerance: 0.05, is_required: false } },
    value_ranges: { score: { q1: 63.3, q3: 80.8, lower_bound: 37.05, upper_bound: 107.05 } }
  });
  expect(screen.getByText(/Null Rates Profile/)).toBeTruthy();
  expect(screen.getByText("3.02%")).toBeTruthy();
  expect(screen.getByText(/Numeric IQR Outliers/)).toBeTruthy();
});
