import { it, expect } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import WhiteBoxPipeline from "./WhiteBoxPipeline";

const PROFILE = {
  total_rows: 600, total_columns: 3,
  columns_profile: {
    dirty_row_id: { data_type: "Integer", null_count: 0, null_rate_pct: 0 },
    product_id: { data_type: "Identifier", null_count: 0, null_rate_pct: 0, distinct_count: 600 },
    weight_g: { data_type: "Integer", null_count: 12, null_rate_pct: 2, min: 20, max: 40000, outlier_count: 30 }
  },
  duplicate_analysis: { tested_composite_key: ["product_id"], duplicate_rows_detected: 0 }
};
const TABLES = { tables: [
  { name: "orders", rows: 6, columns: 3, is_loaded: true },
  { name: "customers", rows: 4, columns: 3, is_loaded: false }
] };
const PREVIEW = {
  table_a: { name: "customers", total_rows: 4, columns: ["customer_id", "name"], sample_rows: [] },
  table_b: { name: "orders", total_rows: 6, columns: ["order_id", "customerId"], sample_rows: [] }
};
const ANALYSIS = {
  status: "ANALYSIS_COMPLETE", schema_differences: [], date_format_differences: [],
  candidate_relationship: {
    left_table: "customers", right_table: "orders", candidate_key_a: "customer_id", candidate_key_b: "customerId",
    unique_keys_a: 4, unique_keys_b: 4, overlapping_keys: 3, match_rate_pct: 75,
    suggested_cardinality: "1 ต่อหลายแถว (1:N)", base_table: "orders", lookup_table: "customers",
    rationale: ["ค่าคีย์ของ 'orders' พบใน 'customers' 75%"]
  }
};
const JOIN = { status: "JOIN_COMPLETED", unified_table_name: "orders_customers_joined", total_rows: 6, total_columns: 5, matched_rows: 5, unmatched_rows: 1 };

// First match wins in the fetch mock, so a test's own routes go first.
const baseRoutes = (extra = []) => [
  ...extra,
  ["/whitebox/state", { body: { dataset_name: "orders" } }],
  ["/whitebox/profile", { body: PROFILE }],
  ["/multi-table/tables", { body: TABLES }],
  ["/multi-table/preview", { body: PREVIEW }],
  ["/multi-table/analyze", { body: ANALYSIS }],
  ["/multi-table/join", { body: JOIN }]
];

const calls = () => globalThis.fetch.mock.calls.map((c) => ({ url: String(c[0]), method: c[1]?.method || "GET", body: c[1]?.body }));
const wait = (ms = 50) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
// The step bar (not the "next"/"back" buttons at the bottom of a step, which repeat the titles).
const openStep = async (title) => {
  const button = [...document.querySelectorAll(".wb-step-btn")].find((b) => b.textContent.includes(title));
  await act(async () => { fireEvent.click(button); });
  await wait();
};

it("opening the page only reads: it does not run the pipeline, analyze or join anything", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes());
  const writes = calls().filter((c) => c.method !== "GET");
  expect(writes).toEqual([]);                                             // no run-all, analyze, join
  expect(calls().some((c) => c.url.includes("/run-all"))).toBe(false);
  expect(screen.getByText("orders", { selector: "code" })).toBeTruthy();   // says which dataset is being inspected
});

it("starts on the profile of the loaded dataset, with no student-specific cards", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes());
  expect(screen.getByText("แถวที่นำเข้า")).toBeTruthy();
  expect(screen.getByText("ค่าว่างทั้งหมด")).toBeTruthy();
  expect(screen.queryByText(/Null Rate \(score\)/)).toBeNull();
  expect(screen.queryByText(/student_id \+ course/)).toBeNull();
  expect(screen.getByText("ค่าผิดปกติ 30")).toBeTruthy();   // anomalies come from the profile, not from column names
});

it("explains that joining needs two tables when only one is loaded", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([["/multi-table/tables", { body: { tables: [TABLES.tables[0]] } }]]));
  await openStep("เชื่อมตาราง");
  expect(screen.getByTestId("join-needs-two").textContent).toContain("ต้องมีอย่างน้อย 2 ตาราง");
  expect(screen.queryByText(/Student Demographics|Student Course Scores/)).toBeNull();
});

it("analyzes the two chosen tables on request and shows their real names and key", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes());
  await openStep("เชื่อมตาราง");
  expect(screen.getByLabelText("ตาราง B").value).toBe("orders");        // the loaded dataset
  expect(screen.getByLabelText("ตาราง A").value).toBe("customers");
  expect(calls().some((c) => c.url.includes("/multi-table/analyze"))).toBe(false);   // not before the click
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "วิเคราะห์ความสัมพันธ์" })); });
  await wait();
  const analyze = calls().find((c) => c.url.includes("/multi-table/analyze"));
  expect(JSON.parse(analyze.body)).toEqual({ table_a_name: "customers", table_b_name: "orders" });
  expect(screen.getByTestId("join-table_a").textContent).toContain("customers");
  expect(screen.getByTestId("join-candidate").textContent).toContain("customers.customer_id");
  expect(screen.getByTestId("join-candidate").textContent).toContain("orders.customerId");
  expect(screen.getByTestId("join-candidate").textContent).toContain("75%");
});

it("treats no shared key as a normal answer, not an error", async () => {
  const none = { status: "NO_CANDIDATE_KEY", message: "ไม่พบคอลัมน์ที่ใช้เชื่อมระหว่าง 'customers' กับ 'orders'", schema_differences: [], date_format_differences: [], candidate_relationship: null };
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([["/multi-table/analyze", { body: none }]]));
  await openStep("เชื่อมตาราง");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "วิเคราะห์ความสัมพันธ์" })); });
  await wait();
  expect(screen.getByTestId("join-no-key").textContent).toContain("ไม่พบคอลัมน์ที่ใช้เชื่อมระหว่าง");
  expect(screen.queryByText(/Failed to analyze/)).toBeNull();
  expect(screen.queryByRole("button", { name: "ยืนยันและเชื่อมตาราง" })).toBeNull();
});

it("joins only after confirmation, with the keys the analysis found", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes());
  await openStep("เชื่อมตาราง");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "วิเคราะห์ความสัมพันธ์" })); });
  await wait();
  expect(calls().some((c) => c.url.includes("/multi-table/join"))).toBe(false);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ยืนยันและเชื่อมตาราง" })); });
  await wait();
  const join = JSON.parse(calls().find((c) => c.url.includes("/multi-table/join")).body);
  expect(join).toMatchObject({ table_a_name: "customers", table_b_name: "orders", join_key_a: "customer_id", join_key_b: "customerId" });
  expect(screen.getByTestId("join-result").textContent).toContain("orders_customers_joined");
  expect(screen.getByTestId("join-result").textContent).toContain("ไม่พบคู่ 1 แถว");
});

it("lets the user set a business context for any column and sends it for the loaded dataset", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([["/recommend-rules", { body: { recommendations: [] } }]]));
  await openStep("บริบทธุรกิจ");
  const rows = screen.getAllByTestId("context-row");
  expect(rows.map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("product_id"), expect.stringContaining("weight_g")]));
  expect(screen.queryByText(/Field: score|study_hours/)).toBeNull();
  fireEvent.click(screen.getByLabelText("weight_g ทราบช่วงค่า"));
  fireEvent.change(screen.getByLabelText("weight_g ค่าสูงสุด"), { target: { value: "50000" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Stage 3/ })); });
  await wait();
  const req = JSON.parse(calls().find((c) => c.url.includes("/recommend-rules")).body);
  expect(req.dataset_name).toBe("orders");                       // the loaded dataset, not a fixed name
  expect(req.field_contexts.weight_g).toMatchObject({ known_domain: true, min_domain: 20, max_domain: 50000, required: true });
  expect(req.field_contexts.product_id.required).toBe(true);
  expect(req.field_contexts).not.toHaveProperty("dirty_row_id");
});

const RULE = {
  field: "weight_g", rule_type: "null_check", recommended_rule: "Strict Required (weight_g): 0% Null Tolerance", action: "quarantine",
  parameters: {}, rationale: ["พบค่าว่าง 12 แถว"], sources: ["Data Profiling"], accepted: true
};

it("tells the user the rules are not generated yet when stage 3 is opened directly, and generates them on request", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([["/recommend-rules", { body: { recommendations: [RULE] } }]]));
  await openStep("กฎที่ระบบเสนอ");
  expect(screen.getByTestId("rules-not-generated").textContent).toContain("ยังไม่ได้สร้างกฎ");
  expect(calls().some((c) => c.url.includes("/recommend-rules"))).toBe(false);   // opening the step does not run anything
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างกฎ" })); });
  await wait();
  expect(calls().filter((c) => c.url.includes("/recommend-rules")).length).toBe(1);
  expect(screen.queryByTestId("rules-not-generated")).toBeNull();
  expect(screen.getByText("Strict Required (weight_g): 0% Null Tolerance")).toBeTruthy();
});

it("says no rules are needed when the analysis ran and found nothing to flag", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([["/recommend-rules", { body: { recommendations: [] } }]]));
  await openStep("กฎที่ระบบเสนอ");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างกฎ" })); });
  await wait();
  expect(screen.getByTestId("rules-none").textContent).toContain("ไม่พบความผิดปกติ");
  expect(screen.queryByTestId("rules-not-generated")).toBeNull();
});

const EXECUTION = { clean_rows: 580, review_rows: 12, quarantine_rows: 8, total_rows_ingested: 600, execution_time_ms: 5, raw_quality_score_pct: 96, post_clean_quality_score_pct: 100, error_distribution: {} };

it("does not claim the pipeline is executing when stage 4 is opened before anything ran", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([["/execute", { body: EXECUTION }]]));
  await openStep("คัดแยก 3 ทาง");
  expect(screen.queryByText(/Executing pipeline/)).toBeNull();
  expect(screen.getByTestId("execution-not-run").textContent).toContain("ยังไม่ได้คัดแยก");
  expect(screen.getByTestId("execution-not-run").textContent).toContain("Stage 3");        // says what is missing
  expect(screen.getByRole("button", { name: "คัดแยกข้อมูล" }).disabled).toBe(true);         // no rules yet, so nothing to apply
  expect(calls().some((c) => c.url.includes("/execute"))).toBe(false);
});

it("segregates on request once the rules exist, and shows the three zones", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([["/recommend-rules", { body: { recommendations: [RULE] } }], ["/execute", { body: EXECUTION }]]));
  await openStep("กฎที่ระบบเสนอ");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างกฎ" })); });
  await wait();
  await openStep("คัดแยก 3 ทาง");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "คัดแยกข้อมูล" })); });
  await wait();
  const run = JSON.parse(calls().find((c) => c.url.includes("/execute")).body);
  expect(run.dataset_name).toBe("orders");
  expect(run.rules).toHaveLength(1);
  expect(screen.queryByTestId("execution-not-run")).toBeNull();
  expect(screen.getByText("580 rows")).toBeTruthy();
});

const runSegregation = async (extraRoutes = []) => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([
    ...extraRoutes,                                    // first match wins, so a test's own routes go first
    ["/recommend-rules", { body: { recommendations: [RULE] } }],
    ["/execute", { body: { ...EXECUTION, dataset_name: "orders", executed_at: "2026-10-06T04:30:00+00:00" } }]
  ]));
  await openStep("กฎที่ระบบเสนอ");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างกฎ" })); });
  await wait();
  await openStep("คัดแยก 3 ทาง");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "คัดแยกข้อมูล" })); });
  await wait();
};

it("shows when the segregation ran, on which dataset and with how many rules", async () => {
  await runSegregation();
  const meta = screen.getByTestId("execution-meta").textContent;
  expect(meta).toContain("รันเมื่อ");
  expect(meta).toContain("orders");
  expect(meta).toContain("1 กฎ");
  expect(screen.queryByTestId("execution-stale")).toBeNull();     // nothing changed since the run
});

it("marks the result as old when a rule is changed after the run, and clears it on re-run", async () => {
  await runSegregation();
  await openStep("กฎที่ระบบเสนอ");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Rule Accepted/ })); });   // turn the rule off
  await openStep("คัดแยก 3 ทาง");
  expect(screen.getByTestId("execution-stale").textContent).toContain("กฎถูกแก้หลังรัน");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Re-Run Transformation" })); });
  await wait();
  expect(screen.queryByTestId("execution-stale")).toBeNull();
  expect(screen.getByTestId("execution-meta").textContent).toContain("0 กฎ");
});

it("describes the zones from the real rules, not from the student sample text", async () => {
  await runSegregation();
  expect(screen.queryByText(/Study Hours|grades \(-10|100% Validated/)).toBeNull();
  expect(screen.getByTestId("zone-quarantine").textContent).toContain("weight_g");   // the column whose rule sends rows here
  expect(screen.getByTestId("zone-clean").textContent).toContain("96.67%");          // 580 of 600, computed
});

const VERIFIED = {
  ...EXECUTION, dataset_name: "orders", executed_at: "2026-10-06T04:30:00+00:00",
  reconciliation: { total_rows: 600, clean_rows: 580, review_rows: 12, quarantine_rows: 8, unaccounted_rows: 0 },
  rule_impact: [
    { rule_type: "auto_iqr", field: "weight_g", action: "review", rule: "Statistical Auto IQR (Tukey 3.0×) on weight_g", rows_affected: 12, enforced: true },
    { rule_type: "null_check", field: "weight_g", action: "quarantine", rule: "Strict Required (weight_g): 0% Null Tolerance", rows_affected: 8, enforced: true },
    { rule_type: "freshness", field: "created_at", action: "warning", rule: "Temporal Freshness SLA Check on created_at", rows_affected: 0, enforced: false }
  ],
  column_impact: [
    { column: "weight_g", nulls_before: 12, nulls_after: 0, mean_before: 2100.5, mean_after: 700.25, outliers_before: 30, outliers_after: 0, fence_basis: "rule" },
    { column: "length_cm", nulls_before: 0, nulls_after: 0, mean_before: 30, mean_after: 29, outliers_before: 10, outliers_after: 4, fence_basis: "tukey_1.5" },
    { column: "product_id", nulls_before: 0, nulls_after: 0, mean_before: null, mean_after: null, outliers_before: null, outliers_after: null, fence_basis: null }
  ]
};
const NOT_APPLICABLE = ["/benchmark", { body: { status: "NOT_APPLICABLE", message: "x" } }];

const openVerification = async (execution = VERIFIED) => {
  await runSegregation([["/execute", { body: execution }], NOT_APPLICABLE]);
  await openStep("ตรวจผลและใช้งาน");
  await wait();
};

it("verifies the segregation on a dataset without a ground truth: every row counted once", async () => {
  await openVerification();
  const recon = screen.getByTestId("verify-reconciliation").textContent;
  expect(recon).toContain("ครบทุกแถว");
  expect(recon).toContain("580");
  expect(recon).toContain("600");
  expect(screen.getByTestId("benchmark-na").textContent).toContain("ไม่มีเฉลย");   // the benchmark is still explained, but it is not the only content
});

it("says how many rows each rule moved and which rules are not enforced", async () => {
  await openVerification();
  const rules = screen.getByTestId("verify-rules").textContent;
  expect(rules).toContain("Strict Required (weight_g)");
  expect(within(screen.getByTestId("verify-rule-null_check-weight_g")).getByText("8")).toBeTruthy();
  expect(screen.getByTestId("verify-rule-freshness-created_at").textContent).toContain("ยังไม่บังคับใช้");
});

it("shows the clean zone before and after, and flags problems that remain", async () => {
  await openVerification();
  const weight = screen.getByTestId("verify-column-weight_g").textContent;
  expect(weight).toContain("12");                       // nulls before
  expect(weight).toContain("2,100.5");                  // mean before
  expect(weight).toContain("700.25");                   // mean after
  expect(screen.getByTestId("verify-column-weight_g").textContent).not.toContain("เหลือ");
  expect(screen.getByTestId("verify-column-length_cm").textContent).toContain("เหลือ 4");
  expect(screen.queryByTestId("verify-column-product_id")).toBeNull();     // no problem found, so not listed
  expect(screen.getByTestId("verify-columns").textContent).toContain("1 คอลัมน์ไม่พบปัญหา");
});

it("warns when rows are missing from the three zones", async () => {
  await openVerification({ ...VERIFIED, reconciliation: { ...VERIFIED.reconciliation, clean_rows: 577, unaccounted_rows: 3 } });
  expect(screen.getByTestId("verify-reconciliation").textContent).toContain("ขาด 3 แถว");
});

it("asks for the segregation first when stage 5 is opened before it ran", async () => {
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([NOT_APPLICABLE]));
  await openStep("ตรวจผลและใช้งาน");
  await wait();
  expect(screen.getByTestId("verify-not-run").textContent).toContain("Stage 4");
  expect(screen.queryByTestId("verify-reconciliation")).toBeNull();
});

it("runs every stage only on request and reports a stage that does not apply", async () => {
  const runAll = { status: "ALL_STAGES_READY", dataset_name: "orders", profile_data: PROFILE, recommendations: [], execution_result: { clean_rows: 590, review_rows: 10, quarantine_rows: 0 },
    benchmark_result: null, downstream_analytics: null, stages: { benchmark: { status: "NOT_APPLICABLE" }, analytics: { status: "NOT_APPLICABLE" } } };
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([["/run-all", { body: runAll }], ["/benchmark", { body: { status: "NOT_APPLICABLE", message: "x" } }]]));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "รันทุกขั้นอัตโนมัติ" })); });
  await wait();
  expect(calls().filter((c) => c.url.includes("/run-all")).length).toBe(1);
  expect(screen.queryByText(/ทำงานไม่สำเร็จ/)).toBeNull();
  await openStep("ตรวจผลและใช้งาน");
  await wait();
  expect(screen.getByTestId("benchmark-na").textContent).toContain("ไม่มีเฉลย");
  expect(screen.queryByText(/SLA COMPLIANCE VERIFIED|undefined%/)).toBeNull();
  expect(calls().some((c) => c.url.includes("/downstream-analytics"))).toBe(false);   // student-only analytics are not requested
});

it("shows which stages failed instead of a raw English error", async () => {
  const runAll = { status: "PARTIAL", dataset_name: "orders", profile_data: PROFILE, recommendations: [], stages: { execution: { status: "FAILED", detail: "boom" } } };
  await renderPage(WhiteBoxPipeline, "/whitebox", baseRoutes([["/run-all", { body: runAll }]]));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "รันทุกขั้นอัตโนมัติ" })); });
  await wait();
  expect(screen.getByText(/บางขั้นทำงานไม่สำเร็จ: execution/)).toBeTruthy();
});
