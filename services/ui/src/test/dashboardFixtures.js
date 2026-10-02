// A generated dashboard and its numbers, shared by the builder UI tests.
export const SPEC = {
  version: 1,
  title: "ภาพรวมยอดขาย",
  description: "ยอดขายรายเดือนและตามภูมิภาค",
  audience: "business",
  filters: [
    { id: "f1", column: "region", type: "select", label: "ภูมิภาค" },
    { id: "f2", column: "order_date", type: "date_range", label: "วันที่สั่งซื้อ" }
  ],
  widgets: [
    { id: "w1", type: "kpi", title: "ยอดขายรวม", metric: { agg: "sum", column: "amount" }, format: "currency", layout: { x: 0, y: 0, w: 3, h: 2 } },
    { id: "w2", type: "bar", title: "ยอดขายตามภูมิภาค", x: "region", metric: { agg: "sum", column: "amount" }, format: "number",
      group_by: null, stacked: false, sort: "desc", limit: 10, layout: { x: 3, y: 0, w: 6, h: 4 } },
    { id: "w3", type: "table", title: "รายการล่าสุด", columns: ["region", "amount"], limit: 50, layout: { x: 0, y: 4, w: 12, h: 5 } }
  ]
};

export const DATA = {
  rows_total: 6,
  rows_after_filter: 6,
  filter_options: { region: { values: ["East", "North", "South"] }, order_date: { min: "2025-01-05", max: "2025-03-11" } },
  widgets: {
    w1: { value: 1770000, current: 70, previous: 130, change_pct: -46.2, period: "2025-03-01" },
    w2: { rows: [{ x: "South", value: 240 }, { x: "North", value: 150 }], series: ["value"] },
    w3: { columns: ["region", "amount"], rows: [{ region: "South", amount: 200 }, { region: "North", amount: 100 }, { region: "East", amount: 80 }], total_rows: 6 }
  }
};
