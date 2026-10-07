import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DashboardCanvas from "./DashboardCanvas";
import { drillValue } from "./ChartWidget";
import { SPEC, DATA } from "../../test/dashboardFixtures";

function draw(props = {}) {
  const onSelectionsChange = vi.fn();
  render(<DashboardCanvas spec={SPEC} data={DATA} selections={{}} onSelectionsChange={onSelectionsChange} {...props} />);
  return onSelectionsChange;
}

it("draws every widget with its title and the KPI in BI short form", () => {
  draw();
  for (const title of ["ภาพรวมยอดขาย", "ยอดขายรวม", "ยอดขายตามภูมิภาค", "รายการล่าสุด"]) {
    expect(screen.getByText(title)).toBeInTheDocument();
  }
  expect(screen.getByText("$1.77M")).toBeInTheDocument();
  expect(screen.getByText(/46\.2%/)).toHaveClass("is-bad");
  expect(screen.getByText("6 จาก 6 แถว")).toBeInTheDocument();
});

it("places widgets on the 12-column grid from their layout", () => {
  draw();
  const bar = screen.getByRole("article", { name: "ยอดขายตามภูมิภาค" });
  expect(bar.style.getPropertyValue("--x")).toBe("4");
  expect(bar.style.getPropertyValue("--w")).toBe("6");
  expect(bar.style.getPropertyValue("--h")).toBe("4");
});

it("sends a select filter as the viewer's selection", () => {
  const onChange = draw();
  fireEvent.change(screen.getByLabelText("ภูมิภาค"), { target: { value: "North" } });
  expect(onChange).toHaveBeenCalledWith({ region: { values: ["North"] } });
});

it("clears a select filter when the viewer picks all", () => {
  const onChange = draw({ selections: { region: { values: ["North"] } } });
  fireEvent.change(screen.getByLabelText("ภูมิภาค"), { target: { value: "" } });
  expect(onChange).toHaveBeenCalledWith({});
});

it("sends a date range filter", () => {
  const onChange = draw();
  fireEvent.change(screen.getByLabelText("วันที่สั่งซื้อ ตั้งแต่"), { target: { value: "2025-02-01" } });
  expect(onChange).toHaveBeenCalledWith({ order_date: { from: "2025-02-01" } });
});

it("shows a chip for a drill-down value and clears it", () => {
  const onChange = draw({ selections: { segment: { values: ["A"] } } });
  fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง segment" }));
  expect(onChange).toHaveBeenCalledWith({});
});

it("reads the clicked category from a recharts event and ignores the others bucket", () => {
  expect(drillValue({ payload: { x: "South" } })).toBe("South");
  expect(drillValue({ name: "Inbound" })).toBe("Inbound");
  expect(drillValue({ payload: { x: "อื่นๆ" } })).toBeNull();
  expect(drillValue(undefined)).toBeNull();
});

it("sorts a table widget by a clicked column", () => {
  draw();
  const table = within(screen.getByRole("article", { name: "รายการล่าสุด" }));
  const amounts = () => table.getAllByRole("row").slice(1).map((row) => row.lastChild.textContent);
  fireEvent.click(table.getByRole("button", { name: /amount/ }));
  expect(amounts()).toEqual(["80", "100", "200"]);
  fireEvent.click(table.getByRole("button", { name: /amount/ }));
  expect(amounts()).toEqual(["200", "100", "80"]);
  expect(table.getByText("แสดง 3 จาก 6 แถว")).toBeInTheDocument();
});

it("shows a widget's own error without hiding the others", () => {
  draw({ data: { ...DATA, widgets: { ...DATA.widgets, w2: { error: "คำนวณวิดเจ็ตนี้ไม่ได้: boom" } } } });
  expect(screen.getByText("คำนวณวิดเจ็ตนี้ไม่ได้: boom")).toBeInTheDocument();
  expect(screen.getByText("$1.77M")).toBeInTheDocument();
});

it("shows a drill chip for a value selection on a date range filter column and clears it", () => {
  const onChange = draw({ selections: { order_date: { values: ["2025-03-01"] } } });
  fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง order_date" }));
  expect(onChange).toHaveBeenCalledWith({});
});

it("shows a from/to selection on a date range filter in its inputs, not as a chip", () => {
  draw({ selections: { order_date: { from: "2025-02-01" } } });
  expect(screen.getByLabelText("วันที่สั่งซื้อ ตั้งแต่")).toHaveValue("2025-02-01");
  expect(screen.queryByRole("button", { name: "ล้างตัวกรอง order_date" })).not.toBeInTheDocument();
});

it("keeps an active select value visible even when it is not among the options", () => {
  const onChange = draw({ selections: { region: { values: ["West"] } } });
  const select = screen.getByLabelText("ภูมิภาค");
  expect(select).toHaveValue("West");
  expect(within(select).getByRole("option", { name: "West" })).toBeInTheDocument();
  fireEvent.change(select, { target: { value: "" } });
  expect(onChange).toHaveBeenCalledWith({});
});

it("colours a drop as good when lower is better", () => {
  const spec = { ...SPEC, widgets: SPEC.widgets.map((w) => (w.id === "w1" ? { ...w, higher_is_better: false } : w)) };
  draw({ spec });
  expect(screen.getByText(/46\.2%/)).toHaveClass("is-good");
});

it("labels table columns and drill chips with the names from the semantic layer", () => {
  draw({ data: { ...DATA, column_labels: { region: "ภูมิภาค", amount: "ยอดขาย", segment: "กลุ่มลูกค้า" } },
    selections: { segment: { values: ["A"] } } });
  const table = within(screen.getByRole("article", { name: "รายการล่าสุด" }));
  expect(table.getByRole("button", { name: "ยอดขาย" })).toBeInTheDocument();
  expect(table.queryByRole("button", { name: "amount" })).toBeNull();
  expect(screen.getByRole("button", { name: "ล้างตัวกรอง กลุ่มลูกค้า" })).toHaveTextContent("กลุ่มลูกค้า: A");
});

it("shows the export tools beside the row count", () => {
  draw({ tools: <button type="button">ส่งออก CSV</button> });
  const bar = screen.getByText("6 จาก 6 แถว").closest(".dbb-canvas-bar");
  expect(within(bar).getByRole("button", { name: "ส่งออก CSV" })).toBeInTheDocument();
});
