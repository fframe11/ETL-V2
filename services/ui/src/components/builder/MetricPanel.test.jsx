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
