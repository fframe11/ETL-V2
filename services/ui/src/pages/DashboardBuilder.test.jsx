import React from "react";
import { it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
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

// --- late and out-of-order responses ---------------------------------------------------------
// fetch stub where /generate and /render stay pending until the test answers them.
const TWO_DATASETS = { datasets: [
  DATASETS.datasets[0],
  { ...DATASETS.datasets[0], name: "orders", source: "Database" }
] };

function controlledFetch() {
  const pending = { generate: [], render: [] };
  const reply = (status, body) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob()
  });
  const fn = vi.fn((url) => {
    const u = String(url);
    for (const kind of Object.keys(pending)) {
      if (u.includes(`/dashboards/${kind}`)) {
        return new Promise((resolve) => pending[kind].push((body, status = 200) => resolve(reply(status, body))));
      }
    }
    return Promise.resolve(reply(200, u.includes("/preview") ? PREVIEW : TWO_DATASETS));
  });
  vi.stubGlobal("fetch", fn);
  return pending;
}

const answer = (respond, ...args) => act(async () => { respond(...args); });
const rendered = (rowsAfterFilter) => ({ spec: SPEC, data: { ...DATA, rows_after_filter: rowsAfterFilter } });
const stepButtons = () => within(screen.getByRole("list", { name: "ขั้นตอนสร้างแดชบอร์ด" })).getAllByRole("button");

async function mountBuilder() {
  const pending = controlledFetch();
  await act(async () => { render(<MemoryRouter><DashboardBuilder /></MemoryRouter>); });
  await settle();
  return pending;
}

async function startGenerate() {
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  fireEvent.click(screen.getByRole("button", { name: EXAMPLE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })); });
}

async function openDashboard() {
  const pending = await mountBuilder();
  await startGenerate();
  await answer(pending.generate[0], GENERATED);
  return pending;
}

const filterRegion = (value) => fireEvent.change(screen.getByLabelText("ภูมิภาค"), { target: { value } });

it("does not bring back a dashboard when a render finishes after the dataset was changed", async () => {
  const pending = await openDashboard();
  filterRegion("North");
  fireEvent.click(stepButtons()[0]);
  await settle();
  fireEvent.click(screen.getByRole("radio", { name: "เลือก orders" }));
  await answer(pending.render[0], rendered(2));
  expect(stepButtons()[3]).toBeDisabled();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("ภาพรวมยอดขาย")).toBeNull();
});

it("ignores a generate response that arrives after the dataset was changed", async () => {
  const pending = await mountBuilder();
  await startGenerate();
  fireEvent.click(stepButtons()[0]);
  await settle();
  fireEvent.click(screen.getByRole("radio", { name: "เลือก orders" }));
  await answer(pending.generate[0], GENERATED);
  expect(screen.getByRole("radio", { name: "เลือก orders" })).toBeChecked();
  expect(screen.queryByText("ภาพรวมยอดขาย")).toBeNull();
  expect(stepButtons()[3]).toBeDisabled();
});

it("keeps the newest filter result when render responses arrive out of order", async () => {
  const pending = await openDashboard();
  filterRegion("North");
  filterRegion("South");
  await answer(pending.render[1], rendered(3));
  await answer(pending.render[0], rendered(2));
  expect(screen.getByText("3 จาก 6 แถว")).toBeInTheDocument();
  expect(screen.queryByText("2 จาก 6 แถว")).toBeNull();
  expect(screen.getByLabelText("ภูมิภาค")).toHaveValue("South");
  expect(document.querySelector(".dbb-canvas")).toHaveAttribute("aria-busy", "false");
});

it("stays busy until the newest render settles", async () => {
  const pending = await openDashboard();
  filterRegion("North");
  filterRegion("South");
  await answer(pending.render[0], rendered(2));
  expect(document.querySelector(".dbb-canvas")).toHaveAttribute("aria-busy", "true");
  await answer(pending.render[1], rendered(3));
  expect(document.querySelector(".dbb-canvas")).toHaveAttribute("aria-busy", "false");
});

it("puts the filter back and shows the error when the newest render fails", async () => {
  const pending = await openDashboard();
  filterRegion("North");
  await answer(pending.render[0], { detail: "ไม่พบชุดข้อมูล sales" }, 404);
  expect(screen.getByRole("alert")).toHaveTextContent("ไม่พบชุดข้อมูล sales");
  expect(screen.getByLabelText("ภูมิภาค")).toHaveValue("");
  expect(screen.getByText("6 จาก 6 แถว")).toBeInTheDocument();
});

it("clears the error banner when another dataset is chosen", async () => {
  const pending = await openDashboard();
  filterRegion("North");
  fireEvent.click(stepButtons()[0]);
  await settle();
  await answer(pending.render[0], { detail: "ไม่พบชุดข้อมูล sales" }, 404);
  expect(screen.getByRole("alert")).toHaveTextContent("ไม่พบชุดข้อมูล sales");
  fireEvent.click(screen.getByRole("radio", { name: "เลือก orders" }));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("clears the error banner when the user moves to another step", async () => {
  const pending = await openDashboard();
  filterRegion("North");
  await answer(pending.render[0], { detail: "ไม่พบชุดข้อมูล sales" }, 404);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "แก้ความต้องการ" }));
  expect(screen.queryByRole("alert")).toBeNull();
});

const REFINED_SPEC = { ...SPEC, widgets: [...SPEC.widgets,
  { id: "w4", type: "line", title: "ยอดขายรายเดือน", x: "order_date", time_grain: "month", metric: { agg: "sum", column: "amount" },
    format: "number", group_by: null, stacked: false, layout: { x: 0, y: 9, w: 6, h: 4 } }] };
const REFINED = { engine: "groq", model: "openai/gpt-oss-120b", warnings: [], spec: REFINED_SPEC, data: DATA,
  changes: { added: ["ยอดขายรายเดือน"], removed: [], changed: [], layout_changed: true, filters_added: [], filters_removed: [] } };

it("refines the dashboard with an instruction and lists what changed", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }]]);
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มกราฟยอดขายรายเดือน" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  const body = JSON.parse(callTo("/dashboards/refine")[1].body);
  expect(body).toEqual({ table_name: "sales", spec: SPEC, instruction: "เพิ่มกราฟยอดขายรายเดือน" });
  expect(screen.getByText("เพิ่ม: ยอดขายรายเดือน")).toBeInTheDocument();
  expect(screen.getByText("จัดตำแหน่งใหม่")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "ยอดขายรายเดือน" })).toBeInTheDocument();
  expect(screen.getByText("คำสั่งที่ใช้แล้ว 1 ครั้ง")).toBeInTheDocument();
  expect(screen.getByLabelText("ปรับแดชบอร์ดด้วย AI", { selector: "textarea" })).toHaveValue("");
});

it("keeps the dashboard and explains when AI refinement is unavailable", async () => {
  await generateDashboard([["/dashboards/refine", { status: 503, body: { detail: "ปรับด้วย AI ไม่ได้ตอนนี้: ยังไม่ได้ตั้งค่า Groq API key" } }]]);
  fireEvent.change(screen.getByLabelText("ปรับแดชบอร์ดด้วย AI", { selector: "textarea" }), { target: { value: "เพิ่ม Filter จังหวัด" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("ยังไม่ได้ตั้งค่า Groq API key");
  expect(screen.getByText("ภาพรวมยอดขาย")).toBeInTheDocument();
  expect(screen.getByLabelText("ปรับแดชบอร์ดด้วย AI", { selector: "textarea" })).toHaveValue("เพิ่ม Filter จังหวัด");
});

// --- refine responses that arrive late ---------------------------------------------------------
// the refine call stays pending until the test answers it; every other call goes to controlledFetch.
function deferRefine() {
  const inner = fetch;
  const resolvers = [];
  vi.stubGlobal("fetch", vi.fn((url, options) => {
    if (!String(url).includes("/dashboards/refine")) return inner(url, options);
    return new Promise((resolve) => resolvers.push((body) => resolve({
      ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob()
    })));
  }));
  return resolvers;
}

it("ignores a refine response that arrives after the dataset was changed", async () => {
  await openDashboard();
  const refines = deferRefine();
  fireEvent.change(screen.getByLabelText("ปรับแดชบอร์ดด้วย AI", { selector: "textarea" }), { target: { value: "เพิ่มกราฟยอดขายรายเดือน" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  expect(refines).toHaveLength(1);
  fireEvent.click(stepButtons()[0]);
  await settle();
  fireEvent.click(screen.getByRole("radio", { name: "เลือก orders" }));
  await answer(refines[0], REFINED);
  expect(screen.getByRole("radio", { name: "เลือก orders" })).toBeChecked();
  expect(stepButtons()[3]).toBeDisabled();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("ยอดขายรายเดือน")).toBeNull();
  expect(screen.queryByText("ภาพรวมยอดขาย")).toBeNull();
});

// --- refine / render / generate invalidate each other --------------------------------------------
const REGENERATED = { ...GENERATED, spec: { ...SPEC, title: "ภาพรวมใหม่" } };
const refineBox = () => screen.getByLabelText("ปรับแดชบอร์ดด้วย AI", { selector: "textarea" });

async function startRefine(instruction = "เพิ่มกราฟยอดขายรายเดือน") {
  fireEvent.change(refineBox(), { target: { value: instruction } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
}

async function regenerate() {
  fireEvent.click(screen.getByRole("button", { name: "แก้ความต้องการ" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })); });
}

it("keeps the refined dashboard when a filter render for the old draft finishes afterwards", async () => {
  const pending = await openDashboard();
  const refines = deferRefine();
  filterRegion("North");
  await startRefine();
  await answer(refines[0], REFINED);
  await answer(pending.render[0], rendered(2));
  expect(screen.getByRole("article", { name: "ยอดขายรายเดือน" })).toBeInTheDocument();
  expect(screen.getByLabelText("ภูมิภาค")).toHaveValue("");
  expect(screen.queryByText("2 จาก 6 แถว")).toBeNull();
});

it("ignores a refine response that arrives after a newer dashboard was generated", async () => {
  const pending = await openDashboard();
  const refines = deferRefine();
  await startRefine();
  await regenerate();
  await answer(pending.generate[1], REGENERATED);
  expect(screen.getByText("ภาพรวมใหม่")).toBeInTheDocument();
  await answer(refines[0], REFINED);
  expect(screen.getByText("ภาพรวมใหม่")).toBeInTheDocument();
  expect(screen.queryByText("ภาพรวมยอดขาย")).toBeNull();
  expect(screen.queryByRole("article", { name: "ยอดขายรายเดือน" })).toBeNull();
  expect(screen.queryByText(/คำสั่งที่ใช้แล้ว/)).toBeNull();
  expect(screen.queryByText("เพิ่ม: ยอดขายรายเดือน")).toBeNull();
});

it("ignores a filter render that arrives after a newer dashboard was generated", async () => {
  const pending = await openDashboard();
  filterRegion("North");
  await regenerate();
  await answer(pending.generate[1], REGENERATED);
  await answer(pending.render[0], rendered(2));
  expect(screen.getByText("ภาพรวมใหม่")).toBeInTheDocument();
  expect(screen.queryByText("ภาพรวมยอดขาย")).toBeNull();
  expect(screen.getByText("6 จาก 6 แถว")).toBeInTheDocument();
  expect(screen.queryByText("2 จาก 6 แถว")).toBeNull();
  expect(screen.getByLabelText("ภูมิภาค")).toHaveValue("");
});

// --- save, reopen and delete ------------------------------------------------------------------
const ID = "a".repeat(32);
const SAVED_DOC = { id: ID, name: "ยอดขายผู้บริหาร", description: "รายเดือน", table_name: "sales", context: EXAMPLE,
  audience: "management", spec: SPEC, refinements: ["เพิ่ม Filter จังหวัด"], created_at: "2026-10-02T03:00:00Z",
  updated_at: "2026-10-02T03:00:00Z" };
const SUMMARY = { id: ID, name: "ยอดขายผู้บริหาร", description: "รายเดือน", table_name: "sales", widget_count: 3,
  updated_at: "2026-10-02T03:00:00Z" };

it("saves the dashboard with its dataset, request and refinements, then updates the same one", async () => {
  await generateDashboard([[`/dashboards/saved/${ID}`, { body: SAVED_DOC }], ["/dashboards/saved", { body: SAVED_DOC }]]);
  fireEvent.click(screen.getByRole("button", { name: "บันทึกแดชบอร์ด" }));
  fireEvent.change(screen.getByLabelText("ชื่อแดชบอร์ด"), { target: { value: "ยอดขายผู้บริหาร" } });
  fireEvent.change(screen.getByLabelText("คำอธิบาย"), { target: { value: "รายเดือน" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึก" })); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/saved", "POST")[1].body)).toEqual({
    name: "ยอดขายผู้บริหาร", description: "รายเดือน", table_name: "sales", context: EXAMPLE,
    audience: "business", spec: SPEC, refinements: [] });
  expect(screen.getByText('บันทึก "ยอดขายผู้บริหาร" แล้ว')).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  expect(screen.getByLabelText("ชื่อแดชบอร์ด")).toHaveValue("ยอดขายผู้บริหาร");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึก" })); });
  await settle();
  expect(callTo(`/dashboards/saved/${ID}`, "PUT")).toBeTruthy();
});

it("suggests the dashboard title as the name and does not save a blank one", async () => {
  await generateDashboard();
  fireEvent.click(screen.getByRole("button", { name: "บันทึกแดชบอร์ด" }));
  expect(screen.getByLabelText("ชื่อแดชบอร์ด")).toHaveValue("ภาพรวมยอดขาย");
  fireEvent.change(screen.getByLabelText("ชื่อแดชบอร์ด"), { target: { value: "   " } });
  expect(screen.getByRole("button", { name: "บันทึก" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

const SAVED_ROUTES = [
  [`/dashboards/saved/${ID}`, { body: SAVED_DOC }],
  ["/dashboards/saved", { body: { dashboards: [SUMMARY] } }],
  ["/dashboards/datasets", { body: DATASETS }],
  ["/dashboards/render", { body: { spec: SPEC, data: DATA } }]
];

it("opens a saved dashboard from the list", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", SAVED_ROUTES);
  expect(screen.getByText("ยอดขายผู้บริหาร")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "เปิด ยอดขายผู้บริหาร" })); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/render")[1].body)).toEqual({ table_name: "sales", spec: SPEC, selections: {} });
  expect(screen.getByText("ภาพรวมยอดขาย")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("แดชบอร์ดที่บันทึกไว้: ยอดขายผู้บริหาร");
  expect(screen.getByRole("button", { name: "บันทึกการแก้ไข" })).toBeInTheDocument();
  expect(screen.getByText("คำสั่งที่ใช้แล้ว 1 ครั้ง")).toBeInTheDocument();
});

it("asks before deleting a saved dashboard", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", SAVED_ROUTES);
  fireEvent.click(screen.getByRole("button", { name: "ลบ ยอดขายผู้บริหาร" }));
  expect(callTo("/dashboards/saved", "DELETE")).toBeUndefined();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ ยอดขายผู้บริหาร" })); });
  await settle();
  expect(callTo(`/dashboards/saved/${ID}`, "DELETE")).toBeTruthy();
});

// --- deleting the saved dashboard that is open ---------------------------------------------------
const OTHER_ID = "b".repeat(32);
const OTHER_SUMMARY = { ...SUMMARY, id: OTHER_ID, name: "รายงานอื่น" };
const TWO_SAVED_ROUTES = [
  [`/dashboards/saved/${ID}`, { body: SAVED_DOC }],
  ["/dashboards/saved", { body: { dashboards: [SUMMARY, OTHER_SUMMARY] } }],
  ["/dashboards/datasets", { body: DATASETS }],
  ["/dashboards/render", { body: { spec: SPEC, data: DATA } }]
];

async function openThenReturnToList() {
  await renderPage(DashboardBuilder, "/dashboard-builder", TWO_SAVED_ROUTES);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "เปิด ยอดขายผู้บริหาร" })); });
  await settle();
  fireEvent.click(stepButtons()[0]);
  await settle(); // the saved list is loaded again when the first step is shown
}

const deleteSavedDashboard = async (name) => {
  fireEvent.click(screen.getByRole("button", { name: `ลบ ${name}` }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: `ยืนยันลบ ${name}` })); });
  await settle();
};

it("saves the working dashboard as a new one after the open saved dashboard was deleted", async () => {
  await openThenReturnToList();
  await deleteSavedDashboard("ยอดขายผู้บริหาร");
  expect(callTo(`/dashboards/saved/${ID}`, "DELETE")).toBeTruthy();
  fireEvent.click(stepButtons()[3]);
  expect(screen.queryByRole("button", { name: "บันทึกการแก้ไข" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "บันทึกแดชบอร์ด" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึก" })); });
  await settle();
  expect(callTo("/dashboards/saved", "POST")).toBeTruthy();
  expect(callTo(`/dashboards/saved/${ID}`, "PUT")).toBeUndefined();
});

it("keeps saving over the open dashboard when a different saved dashboard is deleted", async () => {
  await openThenReturnToList();
  await deleteSavedDashboard("รายงานอื่น");
  expect(callTo(`/dashboards/saved/${OTHER_ID}`, "DELETE")).toBeTruthy();
  fireEvent.click(stepButtons()[3]);
  expect(screen.getByRole("button", { name: "บันทึกการแก้ไข" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "บันทึกแดชบอร์ด" })).toBeNull();
});

// --- opening a saved dashboard while other calls are in flight ----------------------------------
// the saved list is answered at once; fetching one saved dashboard stays pending until the test answers it.
function withSavedList() {
  const inner = fetch;
  const opens = [];
  const reply = (body) => ({
    ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob()
  });
  vi.stubGlobal("fetch", vi.fn((url, options) => {
    const u = String(url);
    if (u.endsWith("/dashboards/saved")) return Promise.resolve(reply({ dashboards: [SUMMARY] }));
    if (u.endsWith(`/dashboards/saved/${ID}`) && options?.method === "GET") {
      return new Promise((resolve) => opens.push((body) => resolve(reply(body))));
    }
    return inner(url, options);
  }));
  return opens;
}

async function mountWithSavedList() {
  const pending = controlledFetch();
  const opens = withSavedList();
  await act(async () => { render(<MemoryRouter><DashboardBuilder /></MemoryRouter>); });
  await settle();
  return { pending, opens };
}

const openSavedButton = () => screen.getByRole("button", { name: "เปิด ยอดขายผู้บริหาร" });

it("ignores a saved dashboard that finishes opening after the dataset was changed", async () => {
  const { pending, opens } = await mountWithSavedList();
  await act(async () => { fireEvent.click(openSavedButton()); });
  expect(opens).toHaveLength(1);
  fireEvent.click(screen.getByRole("radio", { name: "เลือก orders" }));
  await answer(opens[0], SAVED_DOC);
  await settle();
  expect(pending.render).toHaveLength(1);
  await answer(pending.render[0], rendered(6));
  expect(screen.getByRole("radio", { name: "เลือก orders" })).toBeChecked();
  expect(stepButtons()[3]).toBeDisabled();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("ภาพรวมยอดขาย")).toBeNull();
});

it("keeps an opened saved dashboard when a filter render for the previous dashboard finishes afterwards", async () => {
  const { pending, opens } = await mountWithSavedList();
  await startGenerate();
  await answer(pending.generate[0], GENERATED);
  filterRegion("North");
  expect(pending.render).toHaveLength(1);
  fireEvent.click(stepButtons()[0]);
  await settle(); // the saved list is loaded again when the first step is shown
  await act(async () => { fireEvent.click(openSavedButton()); });
  await answer(opens[0], SAVED_DOC);
  await settle();
  expect(pending.render).toHaveLength(2);
  await answer(pending.render[1], rendered(6));
  expect(screen.getByRole("status")).toHaveTextContent("แดชบอร์ดที่บันทึกไว้: ยอดขายผู้บริหาร");
  expect(screen.getByText("6 จาก 6 แถว")).toBeInTheDocument();
  await answer(pending.render[0], rendered(2));
  expect(screen.getByRole("status")).toHaveTextContent("แดชบอร์ดที่บันทึกไว้: ยอดขายผู้บริหาร");
  expect(screen.getByText("6 จาก 6 แถว")).toBeInTheDocument();
  expect(screen.queryByText("2 จาก 6 แถว")).toBeNull();
  expect(screen.getByLabelText("ภูมิภาค")).toHaveValue("");
});

// --- the quality-run history as a dataset ------------------------------------------------------
const WITH_QUALITY = { datasets: [
  { name: "_quality_runs", source: "Quality Gate (Elasticsearch)", records: 42, columns: 14,
    kind_counts: { numeric: 9, categorical: 4, date: 1, text: 0 }, last_updated: "2026-10-02T01:00:00Z", error: null },
  ...DATASETS.datasets
] };

it("offers the quality-run history as a dataset under a readable name", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [
    ["/dashboards/datasets/_quality_runs/preview", { body: PREVIEW }],
    ["/dashboards/datasets", { body: WITH_QUALITY }]
  ]);
  expect(screen.getByText("ผลตรวจคุณภาพข้อมูล (ทุกตาราง)")).toBeInTheDocument();
  expect(screen.getByText("Quality Gate (Elasticsearch)")).toBeInTheDocument();
  expect(screen.queryByText("_quality_runs")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "เลือก ผลตรวจคุณภาพข้อมูล (ทุกตาราง)" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(callTo("/dashboards/datasets/_quality_runs/preview")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  expect(screen.getByLabelText("อยากวิเคราะห์อะไรจาก ผลตรวจคุณภาพข้อมูล (ทุกตาราง)")).toBeInTheDocument();
});
