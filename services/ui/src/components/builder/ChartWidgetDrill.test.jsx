import React from "react";
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DashboardCanvas from "./DashboardCanvas";
import { SPEC, DATA } from "../../test/dashboardFixtures";

// jsdom gives recharts no size, so no bar is drawn: each Bar becomes a button that reports a
// click the way recharts does ({ payload: row }).
vi.mock("recharts", () => {
  const Pass = ({ children }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Pass, BarChart: Pass, LineChart: Pass, AreaChart: Pass, PieChart: Pass,
    Bar: ({ onClick, dataKey }) => <button type="button" data-testid={`bar-${dataKey}`} onClick={() => onClick({ payload: { x: "2025-03-01" } })}>bar</button>,
    Pie: Nothing, Line: Nothing, Area: Nothing, Cell: Nothing, XAxis: Nothing, YAxis: Nothing,
    CartesianGrid: Nothing, Tooltip: Nothing, Legend: Nothing
  };
});

const BAR = { id: "w2", type: "bar", title: "ยอดขายตามเดือน", x: "order_date", metric: { agg: "sum", column: "amount" },
  format: "number", group_by: null, stacked: false, sort: "desc", limit: 10, layout: { x: 0, y: 0, w: 6, h: 4 } };
const MONTHS = { rows: [{ x: "2025-03-01", value: 70 }], series: ["value"] };

function draw(widget, selections = {}) {
  const onSelectionsChange = vi.fn();
  const spec = { ...SPEC, filters: [], widgets: [widget] };
  const data = { ...DATA, widgets: { w2: MONTHS } };
  render(<DashboardCanvas spec={spec} data={data} selections={selections} onSelectionsChange={onSelectionsChange} />);
  return onSelectionsChange;
}

it("drills a bucketed date bar with the widget's time grain", () => {
  const onChange = draw({ ...BAR, time_grain: "month" });
  fireEvent.click(screen.getByTestId("bar-value"));
  expect(onChange).toHaveBeenCalledWith({ order_date: { values: ["2025-03-01"], grain: "month" } });
});

it("keeps the old selection shape for a widget without a time grain", () => {
  const onChange = draw({ ...BAR, x: "region" });
  fireEvent.click(screen.getByTestId("bar-value"));
  expect(onChange).toHaveBeenCalledWith({ region: { values: ["2025-03-01"] } });
});

it("shows the chip of a bucketed drill as column and value", () => {
  draw({ ...BAR, time_grain: "month" }, { order_date: { values: ["2025-03-01"], grain: "month" } });
  expect(screen.getByRole("button", { name: "ล้างตัวกรอง order_date" })).toHaveTextContent("order_date: 2025-03-01");
});
