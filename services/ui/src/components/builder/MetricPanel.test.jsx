import React from "react";
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import MetricPanel from "./MetricPanel";
import { PROFILE, SEMANTIC_VIEW } from "../../test/dashboardFixtures";

function draw(props = {}) {
  const onChange = vi.fn();
  render(<MetricPanel profile={PROFILE} columns={SEMANTIC_VIEW.effective.columns} metrics={SEMANTIC_VIEW.effective.metrics}
    view={SEMANTIC_VIEW} onChange={onChange} {...props} />);
  return onChange;
}

it("lists metrics with their formula and current value, and the ones that broke", () => {
  draw();
  expect(screen.getByText("จำนวนรายการ")).toBeInTheDocument();
  expect(screen.getByText("count(*)")).toBeInTheDocument();
  expect(screen.getByText("ค่าปัจจุบัน 6")).toBeInTheDocument();
  expect(screen.getByText("avg(ยอดขาย)")).toBeInTheDocument();
  expect(screen.getByText(/Average Order Value: ไม่มีคอลัมน์ Order_ID/)).toBeInTheDocument();
});

it("adds a ratio metric", () => {
  const onChange = draw();
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม metric" }));
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "ยอดต่อแถว" } });
  fireEvent.change(screen.getByLabelText("ชนิด"), { target: { value: "ratio" } });
  fireEvent.change(screen.getByLabelText("ตัวตั้ง: คอลัมน์"), { target: { value: "amount" } });
  fireEvent.change(screen.getByLabelText("ตัวหาร: การคำนวณ"), { target: { value: "count" } });
  fireEvent.change(screen.getByLabelText("รูปแบบ"), { target: { value: "currency" } });
  fireEvent.change(screen.getByLabelText("สกุลเงิน"), { target: { value: "usd" } });
  fireEvent.click(screen.getByRole("button", { name: "ใช้ metric นี้" }));
  const added = onChange.mock.calls[0][0].at(-1);
  expect(added).toEqual({ label: "ยอดต่อแถว", description: "", type: "ratio", format: "currency", currency: "USD",
    higher_is_better: true, numerator: { agg: "sum", column: "amount", where: null },
    denominator: { agg: "count", column: null, where: null } });
});

it("adds a metric with a condition and its own id", () => {
  const onChange = draw();
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม metric" }));
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "ยอดภาคเหนือ" } });
  fireEvent.change(screen.getByLabelText("รหัส"), { target: { value: "north_sales" } });
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์"), { target: { value: "amount" } });
  fireEvent.click(screen.getByLabelText("ค่า: มีเงื่อนไข"));
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์เงื่อนไข"), { target: { value: "region" } });
  fireEvent.change(screen.getByLabelText("ค่า: ค่า"), { target: { value: "North" } });
  fireEvent.click(screen.getByLabelText("ยิ่งสูงยิ่งดี"));
  fireEvent.click(screen.getByRole("button", { name: "ใช้ metric นี้" }));
  expect(onChange.mock.calls[0][0].at(-1)).toMatchObject({ id: "north_sales", higher_is_better: false,
    measure: { agg: "sum", column: "amount", where: { column: "region", op: "eq", value: "North" } } });
});

it("needs a name and a column before a metric can be used", () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม metric" }));
  const use = screen.getByRole("button", { name: "ใช้ metric นี้" });
  expect(use).toBeDisabled();
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "รวม" } });
  expect(use).toBeDisabled();
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์"), { target: { value: "amount" } });
  expect(use).toBeEnabled();
  expect(within(screen.getByLabelText("ค่า: คอลัมน์")).getAllByRole("option").map((o) => o.value)).toEqual(["", "amount"]);
});

it("never offers a hidden personal column", () => {
  draw({ view: { ...SEMANTIC_VIEW, hidden_columns: ["region"] } });
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม metric" }));
  fireEvent.change(screen.getByLabelText("ค่า: การคำนวณ"), { target: { value: "count_distinct" } });
  const options = within(screen.getByLabelText("ค่า: คอลัมน์")).getAllByRole("option").map((o) => o.value);
  expect(options).toEqual(["", "order_date", "amount"]);
});

it("edits and deletes metrics", () => {
  const onChange = draw();
  fireEvent.click(screen.getByRole("button", { name: "แก้ ยอดขายเฉลี่ย" }));
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "ยอดเฉลี่ย" } });
  fireEvent.click(screen.getByRole("button", { name: "ใช้ metric นี้" }));
  expect(onChange.mock.calls[0][0][1]).toMatchObject({ id: "avg_amount", label: "ยอดเฉลี่ย" });
  fireEvent.click(screen.getByRole("button", { name: "ลบ จำนวนรายการ" }));
  expect(onChange.mock.calls[1][0].map((m) => m.id)).toEqual(["avg_amount"]);
});

it("cannot delete a metric while another one is being edited", () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "แก้ ยอดขายเฉลี่ย" }));
  expect(screen.getByRole("button", { name: "ลบ จำนวนรายการ" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(screen.getByRole("button", { name: "ลบ จำนวนรายการ" })).toBeEnabled();
});

const addMetric = () => fireEvent.click(screen.getByRole("button", { name: "เพิ่ม metric" }));
const use = () => screen.getByRole("button", { name: "ใช้ metric นี้" });
const opsOf = (label) => within(screen.getByLabelText(label)).getAllByRole("option").map((o) => o.value);
const ID_RULE = "รหัสใช้ได้เฉพาะ a ถึง z ตัวเล็ก ตัวเลข และ _ ไม่เกิน 40 ตัว";

it("drops a column the new calculation cannot use", () => {
  draw();
  addMetric();
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "นับวัน" } });
  fireEvent.change(screen.getByLabelText("ค่า: การคำนวณ"), { target: { value: "count_distinct" } });
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์"), { target: { value: "order_date" } });
  expect(use()).toBeEnabled();
  fireEvent.change(screen.getByLabelText("ค่า: การคำนวณ"), { target: { value: "sum" } });
  expect(screen.getByLabelText("ค่า: คอลัมน์")).toHaveValue("");
  expect(use()).toBeDisabled();
  expect(screen.getByText("ค่า: เลือกคอลัมน์")).toBeInTheDocument();
});

it("blocks a metric whose column is hidden", () => {
  draw({ view: { ...SEMANTIC_VIEW, hidden_columns: ["amount"] } });
  fireEvent.click(screen.getByRole("button", { name: "แก้ ยอดขายเฉลี่ย" }));
  expect(use()).toBeDisabled();
  expect(screen.getByText("ค่า: เลือกคอลัมน์")).toBeInTheDocument();
});

it("stops at 20 metrics and says so", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ ...SEMANTIC_VIEW.effective.metrics[0], id: `m${i}`, label: `เมตริก ${i}` }));
  draw({ metrics: many });
  expect(screen.getByRole("button", { name: "เพิ่ม metric" })).toBeDisabled();
  expect(screen.getByText("มีได้สูงสุด 20 metric")).toBeInTheDocument();
});

it("does not show the limit note below 20 metrics", () => {
  draw();
  expect(screen.getByRole("button", { name: "เพิ่ม metric" })).toBeEnabled();
  expect(screen.queryByText("มีได้สูงสุด 20 metric")).toBeNull();
});

it("blocks an id the server would change, and a duplicate", () => {
  draw();
  addMetric();
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "รวม" } });
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์"), { target: { value: "amount" } });
  expect(use()).toBeEnabled();
  fireEvent.change(screen.getByLabelText("รหัส"), { target: { value: "North Sales" } });
  expect(use()).toBeDisabled();
  expect(screen.getByText(ID_RULE)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("รหัส"), { target: { value: "avg_amount" } });
  expect(use()).toBeDisabled();
  expect(screen.getByText("รหัสนี้ซ้ำกับ metric อื่น")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("รหัส"), { target: { value: "total_amount" } });
  expect(use()).toBeEnabled();
});

it("keeps the id of the metric being edited", () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "แก้ ยอดขายเฉลี่ย" }));
  expect(screen.getByLabelText("รหัส")).toHaveValue("avg_amount");
  expect(use()).toBeEnabled();
});

it("offers only equality for a text column and every comparison for a number", () => {
  draw();
  addMetric();
  fireEvent.click(screen.getByLabelText("ค่า: มีเงื่อนไข"));
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์เงื่อนไข"), { target: { value: "region" } });
  expect(opsOf("ค่า: ตัวเทียบ")).toEqual(["eq", "ne", "in"]);
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์เงื่อนไข"), { target: { value: "amount" } });
  expect(opsOf("ค่า: ตัวเทียบ")).toEqual(["eq", "ne", "in", "gt", "gte", "lt", "lte"]);
  fireEvent.change(screen.getByLabelText("ค่า: ตัวเทียบ"), { target: { value: "gt" } });
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์เงื่อนไข"), { target: { value: "region" } });
  expect(screen.getByLabelText("ค่า: ตัวเทียบ")).toHaveValue("eq");
});

it("blocks a number condition that is not a plain number", () => {
  draw();
  addMetric();
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "ยอดสูง" } });
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์"), { target: { value: "amount" } });
  fireEvent.click(screen.getByLabelText("ค่า: มีเงื่อนไข"));
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์เงื่อนไข"), { target: { value: "amount" } });
  fireEvent.change(screen.getByLabelText("ค่า: ตัวเทียบ"), { target: { value: "gt" } });
  for (const bad of ["abc", "0x10", "1e3", "Infinity"]) {
    fireEvent.change(screen.getByLabelText("ค่า: ค่า"), { target: { value: bad } });
    expect(use()).toBeDisabled();
    expect(screen.getByText("ค่าเงื่อนไขต้องเป็นตัวเลข")).toBeInTheDocument();
  }
  fireEvent.change(screen.getByLabelText("ค่า: ค่า"), { target: { value: "50" } });
  expect(use()).toBeEnabled();
});

it("cannot start a condition when every column is hidden", () => {
  draw({ view: { ...SEMANTIC_VIEW, hidden_columns: ["order_date", "region", "amount"] } });
  addMetric();
  expect(screen.getByLabelText("ค่า: มีเงื่อนไข")).toBeDisabled();
});

it("says why the metric cannot be used yet", () => {
  draw();
  addMetric();
  expect(screen.getByText("ใส่ชื่อ metric")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "รวม" } });
  expect(screen.queryByText("ใส่ชื่อ metric")).toBeNull();
  expect(screen.getByText("ค่า: เลือกคอลัมน์")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์"), { target: { value: "amount" } });
  expect(screen.queryByText("ค่า: เลือกคอลัมน์")).toBeNull();
  fireEvent.change(screen.getByLabelText("รหัส"), { target: { value: "Bad Id" } });
  expect(screen.getByText(ID_RULE)).toBeInTheDocument();
});
