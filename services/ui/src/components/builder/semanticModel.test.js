import { it, expect } from "vitest";
import {
  fromView, roleOptions, updateColumn, differsFromApproved, statusText,
  describeMetric, toMetricBody, columnsFor, metricValueText, emptyMetric, whereProblem, idProblem, MAX_METRICS
} from "./semanticModel";
import { PROFILE, SEMANTIC_VIEW } from "../../test/dashboardFixtures";

it("offers only the roles a column kind allows", () => {
  expect(roleOptions("numeric")).toEqual(["measure", "dimension", "identifier", "text"]);
  expect(roleOptions("date")).toEqual(["dimension", "time", "identifier", "text"]);
  expect(roleOptions("text")).toEqual(["dimension", "identifier", "text"]);
});

it("keeps measure fields consistent when a column changes", () => {
  const amount = SEMANTIC_VIEW.effective.columns.amount;
  expect(updateColumn(amount, { role: "dimension" })).toMatchObject({ role: "dimension", unit: null, default_agg: null, currency: null });
  expect(updateColumn(amount, { currency: " usd " }).currency).toBe("USD");
  expect(updateColumn(amount, { unit: "duration" })).toMatchObject({ unit: "duration", duration_unit: "seconds", currency: null });
  expect(updateColumn(SEMANTIC_VIEW.effective.columns.region, { role: "measure" })).toMatchObject({ unit: "number", default_agg: "sum" });
});

it("spots columns that differ from the approved version", () => {
  const view = { ...SEMANTIC_VIEW, approved: { columns: { amount: { ...SEMANTIC_VIEW.effective.columns.amount, currency: "USD" } } } };
  expect(differsFromApproved("amount", SEMANTIC_VIEW.effective.columns.amount, view)).toBe(true);
  expect(differsFromApproved("region", SEMANTIC_VIEW.effective.columns.region, view)).toBe(false);
});

it("describes every status", () => {
  expect(statusText(SEMANTIC_VIEW)).toBe("ร่างแล้ว รออนุมัติ");
  expect(statusText({ ...SEMANTIC_VIEW, status: "approved", version: 3, pending_draft: true })).toBe("อนุมัติแล้ว v3 · มีร่างที่ยังไม่อนุมัติ");
  expect(statusText({ ...SEMANTIC_VIEW, status: "approved_outdated", version: 3,
    drift: { new_columns: ["a", "b"], missing_columns: ["c"] } })).toBe("อนุมัติแล้ว v3 แต่โครงสร้างเปลี่ยน: คอลัมน์ใหม่ 2 · คอลัมน์ที่หายไป 1");
  expect(statusText({ ...SEMANTIC_VIEW, status: "none" })).toBe("ยังไม่มีความหมายคอลัมน์ ระบบเดาให้จากชื่อคอลัมน์");
  expect(statusText({ ...SEMANTIC_VIEW, status: "unavailable" })).toBe("เชื่อมต่อที่เก็บความหมายคอลัมน์ไม่ได้ ใช้ค่าที่เดาจากชื่อคอลัมน์");
});

const labelOf = (name) => ({ amount: "ยอดขาย", region: "ภูมิภาค" }[name] || name);

it("reads a metric formula in plain words", () => {
  const margin = { type: "ratio", numerator: { agg: "sum", column: "amount", where: { column: "region", op: "in", value: ["N", "S"] } },
    denominator: { agg: "count", column: null, where: null } };
  expect(describeMetric(margin, labelOf)).toBe("sum(ยอดขาย) เมื่อ ภูมิภาค อยู่ใน N, S ÷ count(*)");
});

it("turns the form into the body the API validates", () => {
  const form = { ...emptyMetric(), label: " ยอดเหนือ ", type: "simple",
    measure: { agg: "count", column: "amount", where: { column: "amount", op: "gt", value: "50" } } };
  expect(toMetricBody(form, PROFILE)).toEqual({ label: "ยอดเหนือ", description: "", type: "simple", format: "number",
    currency: null, higher_is_better: true, measure: { agg: "count", column: null, where: { column: "amount", op: "gt", value: 50 } } });
  const listed = { ...form, measure: { agg: "count", column: null, where: { column: "region", op: "in", value: "N, S ," } } };
  expect(toMetricBody(listed, PROFILE).measure.where.value).toEqual(["N", "S"]);
  expect(toMetricBody({ ...form, id: " sales_north " }, PROFILE).id).toBe("sales_north");
});

it("offers numeric non-identifier visible columns for sums", () => {
  const columns = { amount: { role: "measure" }, region: { role: "dimension" }, order_date: { role: "time" } };
  expect(columnsFor("sum", PROFILE, columns, [])).toEqual(["amount"]);
  expect(columnsFor("sum", PROFILE, { ...columns, amount: { role: "identifier" } }, [])).toEqual([]);
  expect(columnsFor("count_distinct", PROFILE, columns, ["region"])).toEqual(["order_date", "amount"]);
});

it("shows a current value only for metrics unchanged since the server computed them", () => {
  const [, avg] = SEMANTIC_VIEW.effective.metrics;
  expect(metricValueText(avg, SEMANTIC_VIEW)).toBe("ค่าปัจจุบัน 83.33");
  expect(metricValueText({ ...avg, label: "ใหม่" }, SEMANTIC_VIEW)).toBe("บันทึกร่างเพื่อดูค่า");
  expect(metricValueText(avg, { ...SEMANTIC_VIEW, metric_values: { avg_amount: null } })).toBe("ยังไม่มีค่า");
});

it("explains why a where condition cannot be used", () => {
  expect(whereProblem({ column: "", op: "eq", value: "x" }, undefined)).toBe("เลือกคอลัมน์เงื่อนไข");
  expect(whereProblem({ column: "region", op: "eq", value: "North" }, "categorical")).toBe("");
  expect(whereProblem({ column: "region", op: "gt", value: "N" }, "categorical")).toBe("ตัวเทียบนี้ใช้กับคอลัมน์ข้อความไม่ได้");
  expect(whereProblem({ column: "region", op: "eq", value: "  " }, "categorical")).toBe("ใส่ค่าเงื่อนไข");
  expect(whereProblem({ column: "amount", op: "gt", value: "50" }, "numeric")).toBe("");
  expect(whereProblem({ column: "amount", op: "lte", value: "-1.5" }, "numeric")).toBe("");
  for (const bad of ["abc", "0x10", "1e3", "Infinity", "1.", ".5"]) {
    expect(whereProblem({ column: "amount", op: "gt", value: bad }, "numeric")).toBe("ค่าเงื่อนไขต้องเป็นตัวเลข");
  }
  expect(whereProblem({ column: "order_date", op: "gte", value: "2025-01-31" }, "date")).toBe("");
  expect(whereProblem({ column: "order_date", op: "gte", value: "2025-01-31 10:30:00" }, "date")).toBe("");
  expect(whereProblem({ column: "order_date", op: "gte", value: "31/01/2025" }, "date")).toBe("ค่าเงื่อนไขต้องเป็นวันที่แบบ ปปปป-ดด-วว");
  expect(whereProblem({ column: "region", op: "in", value: "N, S" }, "categorical")).toBe("");
  expect(whereProblem({ column: "region", op: "in", value: " , " }, "categorical")).toBe("ใส่ค่าเงื่อนไข");
  const many = Array.from({ length: 51 }, (_, i) => `v${i}`).join(",");
  expect(whereProblem({ column: "region", op: "in", value: many }, "categorical")).toBe("ใส่ค่าได้ 1 ถึง 50 ค่า");
  expect(whereProblem({ column: "amount", op: "in", value: [1, 2] }, "numeric")).toBe("");
});

it("checks an id against the server rule and the other metrics", () => {
  const metrics = SEMANTIC_VIEW.effective.metrics;
  expect(idProblem("", metrics, null)).toBe("");
  expect(idProblem("north_sales", metrics, null)).toBe("");
  expect(idProblem(" north_sales ", metrics, null)).toBe("");
  expect(idProblem("North", metrics, null)).toBe("รหัสใช้ได้เฉพาะ a ถึง z ตัวเล็ก ตัวเลข และ _ ไม่เกิน 40 ตัว");
  expect(idProblem("a b", metrics, null)).not.toBe("");
  expect(idProblem("a".repeat(41), metrics, null)).not.toBe("");
  expect(idProblem("avg_amount", metrics, null)).toBe("รหัสนี้ซ้ำกับ metric อื่น");
  expect(idProblem("avg_amount", metrics, 1)).toBe("");
  expect(idProblem("avg_amount", metrics, 0)).toBe("รหัสนี้ซ้ำกับ metric อื่น");
  expect(MAX_METRICS).toBe(20);
});

const DRAFT_AMOUNT = { ...SEMANTIC_VIEW.effective.columns.amount, currency: "USD" };
const DRAFT_METRIC = { ...SEMANTIC_VIEW.effective.metrics[1], label: "ยอดขายเฉลี่ยใหม่" };
const PENDING_VIEW = {
  ...SEMANTIC_VIEW, status: "approved", version: 2, pending_draft: true,
  approved: { version: 2, columns: SEMANTIC_VIEW.effective.columns, metrics: SEMANTIC_VIEW.effective.metrics },
  editing: { columns: { ...SEMANTIC_VIEW.effective.columns, amount: DRAFT_AMOUNT }, metrics: [DRAFT_METRIC],
    metric_values: { avg_amount: 90.5 } }
};

it("starts the editor from the saved draft when one waits over an approved version", () => {
  const state = fromView("sales", PENDING_VIEW);
  expect(state.columns.amount.currency).toBe("USD");
  expect(state.metrics).toEqual([DRAFT_METRIC]);
  expect(state.dirty).toBe(false);
  // the approved version is still what a column is compared with
  expect(differsFromApproved("amount", state.columns.amount, PENDING_VIEW)).toBe(true);
  expect(differsFromApproved("region", state.columns.region, PENDING_VIEW)).toBe(false);
});

it("falls back to the effective meaning when the view has no editing block", () => {
  const state = fromView("sales", SEMANTIC_VIEW);
  expect(state.columns).toBe(SEMANTIC_VIEW.effective.columns);
  expect(state.metrics).toBe(SEMANTIC_VIEW.effective.metrics);
});

it("shows the value of the metric being edited, not the approved one with the same id", () => {
  const view = { ...PENDING_VIEW, metric_values: { ...PENDING_VIEW.metric_values, avg_amount: 83.3333 } };
  expect(metricValueText(DRAFT_METRIC, view)).toBe("ค่าปัจจุบัน 90.5");
  expect(metricValueText(SEMANTIC_VIEW.effective.metrics[1], view)).toBe("บันทึกร่างเพื่อดูค่า");
});

it("sends a plain value when an in condition is switched to eq without retyping", () => {
  const where = { column: "region", op: "eq", value: ["N", "S"] };
  const form = { ...emptyMetric(), label: "ภาคเหนือ", measure: { agg: "count", column: null, where } };
  expect(toMetricBody(form, PROFILE).measure.where).toEqual({ column: "region", op: "eq", value: "N, S" });
  expect(toMetricBody({ ...form, measure: { ...form.measure, where: { ...where, op: "ne", value: ["N"] } } }, PROFILE).measure.where.value).toBe("N");
  expect(toMetricBody({ ...form, measure: { ...form.measure, where: { ...where, op: "in" } } }, PROFILE).measure.where.value).toEqual(["N", "S"]);
});
