import { it, expect } from "vitest";
import {
  roleOptions, updateColumn, differsFromApproved, statusText,
  describeMetric, toMetricBody, columnsFor, metricValueText, emptyMetric
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
