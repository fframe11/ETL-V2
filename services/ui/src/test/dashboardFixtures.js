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
    { id: "w1", type: "kpi", title: "ยอดขายรวม", metric: { agg: "sum", column: "amount" }, format: "currency", currency: "USD",
      higher_is_better: true, layout: { x: 0, y: 0, w: 3, h: 2 } },
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

// The profile of the "sales" preview used by the builder tests.
export const PROFILE = {
  rows: 6, column_count: 3, missing_cells: 1, kind_counts: { numeric: 1, categorical: 1, date: 1, text: 0 },
  columns: [
    { name: "order_date", kind: "date", dtype: "datetime64[ns]", missing: 0, missing_pct: 0, distinct: 6 },
    { name: "region", kind: "categorical", dtype: "string", missing: 1, missing_pct: 16.67, distinct: 3 },
    { name: "amount", kind: "numeric", dtype: "Float64", missing: 0, missing_pct: 0, distinct: 6 }
  ]
};

const meta = (role, extra = {}) => ({ role, label: "", description: "", unit: null, currency: null,
  duration_unit: null, default_agg: null, pii: false, ...extra });

// GET /api/v1/semantic/sales for PROFILE: a draft waiting for approval.
export const SEMANTIC_VIEW = {
  table_name: "sales", status: "draft", pending_draft: false, version: 0,
  effective: {
    columns: {
      order_date: meta("time"),
      region: meta("dimension", { label: "ภูมิภาค" }),
      amount: meta("measure", { label: "ยอดขาย", unit: "currency", default_agg: "sum" })
    },
    metrics: [
      // Labelled "จำนวนรายการ", not "จำนวนแถว", so it never collides with the preview's row-count tile.
      { id: "row_count", label: "จำนวนรายการ", description: "", type: "simple",
        measure: { agg: "count", column: null, where: null }, format: "number", currency: null, higher_is_better: true },
      { id: "avg_amount", label: "ยอดขายเฉลี่ย", description: "", type: "simple",
        measure: { agg: "avg", column: "amount", where: null }, format: "number", currency: null, higher_is_better: true }
    ]
  },
  draft: null, approved: null, drift: { new_columns: [], missing_columns: [] },
  invalid_metrics: [{ id: "aov", label: "Average Order Value", reason: "ไม่มีคอลัมน์ Order_ID" }],
  hidden_columns: [], history: [], warnings: [], metric_values: { row_count: 6, avg_amount: 83.3333 }
};
