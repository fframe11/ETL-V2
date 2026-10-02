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

// ── AI proposals: real vs example, engine labels, on-demand generate ──────────
const SAMPLE_PROPOSALS = {
  proposals: [{ _id: "prop_ai_score_bounds", table_name: "student_course_scores", status: "PROPOSED",
    timestamp: "2026-09-23T08:30:00Z", confidence: 0.98, reasoning: "Detected 200 out-of-range scores", suggested_rules: {} }],
  count: 1, is_example: true
};

const real = (id, metadata, confidence = 0.9) => ({
  _id: id, table_name: "t1", status: "PROPOSED", timestamp: "2026-10-02T08:00:00Z",
  analysis_result: { confidence, root_cause: "score empty upstream", explanation: "e", suggested_rules: [], analysis_metadata: metadata }
});

async function openProposals(proposalsBody, extraRoutes = []) {
  await renderPage(RulesConfig, "/rules?tab=proposals", [
    ...extraRoutes, ["/rules/ai-proposals", { body: proposalsBody }], CATALOG
  ]);
}

it("example proposals show their own confidence instead of 0%", async () => {
  await openProposals(SAMPLE_PROPOSALS);
  expect(screen.getByText("98% Conf")).toBeTruthy();
  expect(screen.queryByText("0% Conf")).toBeNull();
});

it("tells apart a Groq answer, a local model and the fixed-rule advisor", async () => {
  await openProposals({ is_example: false, count: 3, proposals: [
    real("a", { method: "groq_llm", model: "openai/gpt-oss-120b" }),
    real("b", { method: "ollama_llm", model: "qwen2.5:3b" }),
    real("c", { method: "local_heuristic_v2" })
  ] });
  expect(screen.getByText("LLM · openai/gpt-oss-120b")).toBeTruthy();
  expect(screen.getByText("LLM (local) · qwen2.5:3b")).toBeTruthy();
  expect(screen.getByText("กฎคงที่ (ไม่ใช่ LLM)")).toBeTruthy();
});

it("the generate button asks the server to analyse the chosen table and reports the engine used", async () => {
  const fetchMock = (await (async () => {
    await openProposals({ is_example: true, count: 0, proposals: [] }, [
      ["/rules/ai-proposals/generate", { body: { status: "PROPOSED", table: "t1", method: "groq_llm", model: "m1", confidence: 0.9, is_example: false } }]
    ]);
    return globalThis.fetch;
  })());
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /วิเคราะห์ด้วย AI/ })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/rules/ai-proposals/generate"));
  expect(call).toBeTruthy();
  expect(String(call[0])).toContain("table=t1");
  expect(call[1].method).toBe("POST");
  expect(screen.getByText(/LLM · m1/)).toBeTruthy();
});

it("the generate button shows the server's reason when there is nothing to analyse", async () => {
  await openProposals({ is_example: true, count: 0, proposals: [] }, [
    ["/rules/ai-proposals/generate", { status: 404, body: { detail: "No quarantined rows found for table 't1'; nothing to analyse." } }]
  ]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /วิเคราะห์ด้วย AI/ })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  expect(screen.getByText(/nothing to analyse/)).toBeTruthy();
});

it("approving an example proposal does not claim the rules were updated", async () => {
  await openProposals(SAMPLE_PROPOSALS, [
    ["/rules/ai-proposals/prop_ai_score_bounds/approve", { body: { status: "approved", is_example: true, message: "built-in example: no rule was changed." } }]
  ]);
  await act(async () => { fireEvent.click(screen.getByText("98% Conf")); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Approve/ })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm" })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
  expect(screen.queryByText(/Config updated/)).toBeNull();
  expect(screen.getByText(/no rule was changed/)).toBeTruthy();
});
