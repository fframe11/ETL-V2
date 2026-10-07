import { it, expect } from "vitest";
import { roleOptions, updateColumn, differsFromApproved, statusText } from "./semanticModel";
import { SEMANTIC_VIEW } from "../../test/dashboardFixtures";

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
