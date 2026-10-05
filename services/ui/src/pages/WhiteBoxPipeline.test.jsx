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
