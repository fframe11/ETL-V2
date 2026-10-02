import { it, expect } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import DashboardBuilder from "./DashboardBuilder";
import { SPEC, DATA } from "../test/dashboardFixtures";

const DATASETS = { datasets: [
  { name: "sales", source: "File upload", records: 1200, columns: 6,
    kind_counts: { numeric: 2, categorical: 3, date: 1, text: 0 }, last_updated: "2026-10-01T03:00:00Z", error: null },
  { name: "broken", source: null, records: null, columns: null, kind_counts: null, last_updated: null,
    error: "Delta log not found at /data/active/broken/_delta_log" }
] };

it("lists the datasets that passed the quality gate with their key facts", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: DATASETS }]]);
  expect(screen.getByText("sales")).toBeInTheDocument();
  expect(screen.getByText("File upload")).toBeInTheDocument();
  expect(screen.getByText("1,200")).toBeInTheDocument();
  expect(screen.getByText("ตัวเลข 2 · หมวดหมู่ 3 · วันที่ 1")).toBeInTheDocument();
  expect(screen.getByText("อ่านชุดข้อมูลนี้ไม่ได้")).toBeInTheDocument();
  expect(screen.queryByText(/\/data\/active/)).toBeNull();
});

it("enables the next step only after a readable dataset is chosen", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: DATASETS }]]);
  const next = screen.getByRole("button", { name: "ถัดไป" });
  expect(next).toBeDisabled();
  expect(screen.getByRole("radio", { name: "เลือก broken" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  expect(next).toBeEnabled();
});

it("points to ingestion when no dataset has passed the gate yet", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: { datasets: [] } }]]);
  expect(screen.getByText("ยังไม่มีชุดข้อมูลที่ผ่าน Quality Gate")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "นำเข้าข้อมูล" })).toHaveAttribute("href", "/ingestion");
});

const PREVIEW = {
  table_name: "sales",
  profile: {
    rows: 6, column_count: 3, missing_cells: 1, kind_counts: { numeric: 1, categorical: 1, date: 1, text: 0 },
    columns: [
      { name: "order_date", kind: "date", dtype: "datetime64[ns]", missing: 0, missing_pct: 0, distinct: 6 },
      { name: "region", kind: "categorical", dtype: "string", missing: 1, missing_pct: 16.67, distinct: 3 },
      { name: "amount", kind: "numeric", dtype: "Float64", missing: 0, missing_pct: 0, distinct: 6 }
    ]
  },
  sample: [
    { order_date: "2025-01-05T00:00:00.000", region: "North", amount: 100 },
    { order_date: "2025-01-20T00:00:00.000", region: null, amount: 200 }
  ]
};
const GENERATED = { engine: "groq", model: "openai/gpt-oss-120b", warnings: [], spec: SPEC, data: DATA };
const EXAMPLE = "สร้าง Dashboard สำหรับวิเคราะห์ยอดขายรายเดือน";

// extra routes go first so they override the defaults (mockFetchByUrl: first match wins).
function builderRoutes(extra = []) {
  return [
    ...extra,
    ["/dashboards/datasets/sales/preview", { body: PREVIEW }],
    ["/dashboards/datasets", { body: DATASETS }],
    ["/dashboards/generate", { body: GENERATED }],
    ["/dashboards/render", { body: { spec: SPEC, data: { ...DATA, rows_after_filter: 2 } } }]
  ];
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

const callTo = (part, method) =>
  fetch.mock.calls.find(([url, options]) => String(url).includes(part) && (!method || options?.method === method));

async function generateDashboard(extra = []) {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes(extra));
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  fireEvent.click(screen.getByRole("button", { name: EXAMPLE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })); });
  await settle();
}

it("previews the chosen dataset before asking what to analyse", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(screen.getByText("จำนวนแถว")).toBeInTheDocument();
  expect(screen.getByText("คอลัมน์วันที่")).toBeInTheDocument();
  expect(screen.getByText("1 (16.67%)")).toBeInTheDocument();
  expect(screen.getAllByText("null")).toHaveLength(1);
  expect(screen.getByText("ตัวอย่าง 2 แถวแรก")).toBeInTheDocument();
});

it("walks from dataset to an AI-generated dashboard", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  const generate = screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" });
  expect(generate).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: EXAMPLE }));
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  await act(async () => { fireEvent.click(generate); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/generate")[1].body)).toEqual({ table_name: "sales", context: EXAMPLE, audience: "management" });
  expect(screen.getByText("ภาพรวมยอดขาย")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("openai/gpt-oss-120b");
});

it("recomputes the dashboard when the viewer filters it", async () => {
  await generateDashboard();
  fireEvent.change(screen.getByLabelText("ภูมิภาค"), { target: { value: "North" } });
  await settle();
  const body = JSON.parse(callTo("/dashboards/render")[1].body);
  expect(body.table_name).toBe("sales");
  expect(body.selections).toEqual({ region: { values: ["North"] } });
  expect(screen.getByText("2 จาก 6 แถว")).toBeInTheDocument();
});

it("says when the dashboard came from rules because the AI is unavailable", async () => {
  const rules = { ...GENERATED, engine: "rules", model: null, warnings: ["ใช้แดชบอร์ดอัตโนมัติแบบกฎแทน AI: ยังไม่ได้ตั้งค่า Groq API key"] };
  await generateDashboard([["/dashboards/generate", { body: rules }]]);
  expect(screen.getByRole("status")).toHaveTextContent("สร้างแบบกฎอัตโนมัติ");
  expect(screen.getByText(/ยังไม่ได้ตั้งค่า Groq API key/)).toBeInTheDocument();
});

it("shows the API error when generation fails", async () => {
  await generateDashboard([["/dashboards/generate", { status: 404, body: { detail: "ไม่พบชุดข้อมูล sales" } }]]);
  expect(screen.getByRole("alert")).toHaveTextContent("ไม่พบชุดข้อมูล sales");
  expect(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })).toBeEnabled();
});
