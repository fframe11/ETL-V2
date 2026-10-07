import React from "react";
import { it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import DashboardBuilder from "./DashboardBuilder";
import { SPEC, DATA } from "../test/dashboardFixtures";

const DATASETS = { datasets: [
  { name: "sales", source: "File upload", records: 1200, columns: 6,
    kind_counts: { numeric: 2, categorical: 3, date: 1, text: 0 }, last_updated: "2026-10-01T03:00:00Z", error: null,
    quality: { score: 97.5, threshold: 90, passed: true, total_records: 1250, clean_records: 1200, quarantined_records: 50, timestamp: "2026-10-01T03:00:00Z" } },
  { name: "broken", source: null, records: null, columns: null, kind_counts: null, last_updated: null, quality: null,
    error: "Delta log not found at /data/active/broken/_delta_log" }
] };

// the table holds exactly the rows that passed in the latest run: 5000 - 1900
const LOW_QUALITY = { datasets: [{ ...DATASETS.datasets[0], records: 3100,
  quality: { score: 62, threshold: 90, passed: false, total_records: 5000, clean_records: 3100, quarantined_records: 1900, timestamp: "2026-10-01T03:00:00Z" } }] };

it("lists the datasets that passed the quality gate with their key facts", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: DATASETS }]]);
  expect(screen.getByText("sales")).toBeInTheDocument();
  expect(screen.getByText("File upload")).toBeInTheDocument();
  expect(screen.getByText("1,200")).toBeInTheDocument();
  expect(screen.getByText("ตัวเลข 2 · หมวดหมู่ 3 · วันที่ 1")).toBeInTheDocument();
  expect(screen.getByText("อ่านชุดข้อมูลนี้ไม่ได้")).toBeInTheDocument();
  expect(screen.queryByText(/\/data\/active/)).toBeNull();
});

it("shows how the latest quality run of each dataset compares with its threshold", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: DATASETS }]]);
  expect(screen.getByText("97.50% ผ่านเกณฑ์")).toBeInTheDocument();
  expect(screen.getByText("ยังไม่มีผลตรวจ")).toBeInTheDocument();
});

it("lists the most recently updated dataset first and the ones without a date last", async () => {
  const at = (name, last_updated) => ({ ...DATASETS.datasets[0], name, last_updated });
  const body = { datasets: [at("older", "2026-09-01T00:00:00Z"), at("undated", null), at("newest", "2026-10-05T00:00:00Z"), at("middle", "2026-09-20T00:00:00Z")] };
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body }]]);
  const order = screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"));
  expect(order).toEqual(["เลือก newest", "เลือก middle", "เลือก older", "เลือก undated"]);
});

it("marks a dataset whose latest run fell below its threshold", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: LOW_QUALITY }]]);
  expect(screen.getByText("62.00% ต่ำกว่าเกณฑ์ 90%")).toBeInTheDocument();
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
const EXAMPLE = "ผลรวม amount ตาม region";
const CHANGE = "เพิ่มแนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date";
const CHANGES = { suggestions: [
  { id: "G3:order_date", rule: "G3", text: CHANGE },
  { id: "G1:region", rule: "G1", text: "เพิ่มตัวกรอง region" }
] };
const SUGGESTIONS = { table_name: "sales", suggestions: [
  { id: "R2:region", rule: "R2", text: EXAMPLE },
  { id: "R1:amount:order_date", rule: "R1", text: "แนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date" }
] };

// extra routes go first so they override the defaults (mockFetchByUrl: first match wins).
function builderRoutes(extra = []) {
  return [
    ...extra,
    ["/dashboards/suggest-changes", { body: CHANGES }],
    ["/dashboards/datasets/sales/suggestions", { body: SUGGESTIONS }],
    ["/dashboards/datasets/sales/preview", { body: PREVIEW }],
    ["/dashboards/datasets", { body: DATASETS }],
    ["/dashboards/generate", { body: GENERATED }],
    ["/dashboards/render", { body: { spec: SPEC, data: { ...DATA, rows_after_filter: 2 } } }]
  ];
}

// a longer URL must precede "/dashboards/datasets", which also matches the preview URL.
const lowQualityRoutes = [["/dashboards/datasets/sales/suggestions", { body: SUGGESTIONS }], ["/dashboards/datasets/sales/preview", { body: PREVIEW }], ["/dashboards/datasets", { body: LOW_QUALITY }]];

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

const callTo = (part, method) =>
  fetch.mock.calls.find(([url, options]) => String(url).includes(part) && (!method || options?.method === method));

async function generateDashboard(extra = []) {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes(extra));
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  fireEvent.click(await screen.findByRole("button", { name: EXAMPLE })); // the suggestions load after the step opens
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

it("warns on the preview when the latest quality run is below its threshold", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes(lowQualityRoutes));
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  const notice = screen.getByRole("complementary", { name: "คุณภาพข้อมูล" });
  expect(notice).toHaveTextContent("62.00% ต่ำกว่าเกณฑ์ 90%");
  expect(notice).toHaveTextContent("นำเข้า 5,000 แถว ผ่าน 3,100 กักกัน 1,900");
  expect(notice).not.toHaveTextContent("สะสมข้อมูลหลายรอบ");
});

it("explains why the table holds more rows than the latest run passed", async () => {
  const accumulated = { datasets: [{ ...LOW_QUALITY.datasets[0], records: 4000 }] };
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes([
    ["/dashboards/datasets/sales/preview", { body: PREVIEW }], ["/dashboards/datasets", { body: accumulated }]]));
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(screen.getByRole("complementary", { name: "คุณภาพข้อมูล" }))
    .toHaveTextContent("ตารางนี้มี 4,000 แถว เพราะสะสมข้อมูลหลายรอบ");
});

it("shows no warning for a dataset that met its threshold", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(screen.queryByRole("complementary", { name: "คุณภาพข้อมูล" })).toBeNull();
});

it("keeps the quality warning next to the finished dashboard", async () => {
  await generateDashboard(lowQualityRoutes);
  expect(screen.getByRole("complementary", { name: "คุณภาพข้อมูล" })).toHaveTextContent("62.00% ต่ำกว่าเกณฑ์ 90%");
});

it("labels the dashboard as a draft computed from the real data", async () => {
  await generateDashboard();
  expect(screen.getByText("ฉบับร่าง ตรวจก่อนใช้งาน ตัวเลขทุกตัวคำนวณจากข้อมูลจริง ไม่ใช่ AI")).toBeInTheDocument();
});

it("describes the page as a draft builder for data that passed the quality check", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  expect(screen.getByText("สร้างแดชบอร์ดฉบับร่างจากข้อมูลที่ผ่านการตรวจคุณภาพ")).toBeInTheDocument();
});

async function openRequestStep(extra = []) {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes(extra));
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
}

const requestBox = () => screen.getByLabelText("อยากวิเคราะห์อะไรจาก sales");

it("suggests requests built from the dataset instead of fixed examples", async () => {
  await openRequestStep();
  const trend = screen.getByRole("button", { name: "แนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date" });
  expect(screen.queryByRole("button", { name: /ยอดขายรายเดือน/ })).toBeNull();
  expect(callTo("/dashboards/datasets/sales/suggestions")[0]).toContain("/dashboards/datasets/sales/suggestions?audience=business");
  fireEvent.click(screen.getByRole("button", { name: EXAMPLE }));
  fireEvent.click(trend);
  expect(requestBox().value).toBe(`${EXAMPLE}\nแนวโน้ม ผลรวม amount รายสัปดาห์ ตาม order_date`);
  expect(trend).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(trend);
  expect(requestBox().value).toBe(EXAMPLE);
  expect(trend).toHaveAttribute("aria-pressed", "false");
});

it("asks for new suggestions when the reader type changes", async () => {
  await openRequestStep();
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  await settle();
  const urls = fetch.mock.calls.map(([url]) => String(url)).filter((u) => u.includes("/suggestions"));
  expect(urls.at(-1)).toContain("audience=management");
});

it("keeps the current suggestions on screen while new ones load for another reader type", async () => {
  await openRequestStep();
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  expect(screen.getByRole("button", { name: EXAMPLE })).toBeInTheDocument();
});

it("offers the data steward as a reader type, asks for its suggestions and sends it with the request", async () => {
  await openRequestStep();
  fireEvent.click(screen.getByRole("radio", { name: "ดูแลคุณภาพข้อมูล" }));
  await settle();
  const urls = fetch.mock.calls.map(([url]) => String(url)).filter((u) => u.includes("/suggestions"));
  expect(urls.at(-1)).toContain("audience=steward");
  fireEvent.click(await screen.findByRole("button", { name: EXAMPLE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/generate")[1].body).audience).toBe("steward");
});

const RANKED_TEXT = "ดูแนวโน้มยอดขายรายสัปดาห์ ตาม order_date";
const RANKED = { engine: "groq", model: "openai/gpt-oss-120b", suggestions: [{ id: "R1:amount:order_date", rule: "R1", text: RANKED_TEXT }] };
const rankButton = () => screen.getByRole("button", { name: "เรียบเรียงด้วย AI" });
const rankCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes("/dashboards/rank-suggestions"));

it("lets the user ask the AI to reorder and reword the suggestions", async () => {
  await openRequestStep([["/dashboards/rank-suggestions", { body: RANKED }]]);
  fireEvent.click(rankButton());
  await settle();
  expect(JSON.parse(rankCalls()[0][1].body)).toEqual({ table_name: "sales", audience: "business" });
  expect(screen.getByRole("button", { name: RANKED_TEXT })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: EXAMPLE })).toBeNull();
  expect(screen.getByText("จัดลำดับและเรียบเรียงโดย AI (openai/gpt-oss-120b)")).toBeInTheDocument();
});

it("keeps the rule-made suggestions and says why when the AI cannot help", async () => {
  await openRequestStep([["/dashboards/rank-suggestions", { status: 503, body: { detail: "เรียบเรียงด้วย AI ไม่ได้ตอนนี้: ยังไม่ได้ตั้งค่า Groq API key" } }]]);
  fireEvent.click(rankButton());
  await settle();
  expect(screen.getByText(/ยังไม่ได้ตั้งค่า Groq API key/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: EXAMPLE })).toBeInTheDocument();
  expect(rankButton()).toBeEnabled();
});

it("goes back to the rule-made list when the reader type changes", async () => {
  await openRequestStep([["/dashboards/rank-suggestions", { body: RANKED }]]);
  fireEvent.click(rankButton());
  await settle();
  expect(screen.queryByRole("button", { name: EXAMPLE })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  await settle();
  expect(screen.queryByText(/จัดลำดับและเรียบเรียงโดย AI/)).toBeNull();
  expect(screen.getByRole("button", { name: EXAMPLE })).toBeInTheDocument();
});

it("drops an AI answer that arrives after the reader type was changed", async () => {
  await openRequestStep([["/dashboards/rank-suggestions", { body: RANKED }]]);
  const inner = fetch;
  const held = [];
  vi.stubGlobal("fetch", vi.fn((url, options) => {
    if (!String(url).includes("/dashboards/rank-suggestions")) return inner(url, options);
    return new Promise((resolve) => held.push(() => resolve({
      ok: true, status: 200, json: async () => RANKED, text: async () => JSON.stringify(RANKED), blob: async () => new Blob()
    })));
  }));
  fireEvent.click(rankButton());
  expect(screen.getByRole("button", { name: "AI กำลังเรียบเรียง…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  await settle();
  await act(async () => { held[0](); });
  await settle();
  expect(screen.queryByText(/จัดลำดับและเรียบเรียงโดย AI/)).toBeNull();
  expect(screen.queryByRole("button", { name: RANKED_TEXT })).toBeNull();
  expect(screen.getByRole("button", { name: EXAMPLE })).toBeInTheDocument();
  expect(rankButton()).toBeEnabled();
});

it("says so when the dataset has no suggestions or they cannot be loaded, and still lets the user type", async () => {
  await openRequestStep([["/dashboards/datasets/sales/suggestions", { status: 500, body: { detail: "boom" } }]]);
  expect(screen.getByText("ยังไม่มีคำแนะนำสำหรับชุดข้อมูลนี้ พิมพ์สิ่งที่อยากเห็นได้เลย")).toBeInTheDocument();
  fireEvent.change(requestBox(), { target: { value: "ดูยอดขายตามภูมิภาค" } });
  expect(screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" })).toBeEnabled();
});

it("walks from dataset to an AI-generated dashboard", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  const generate = screen.getByRole("button", { name: "สร้างแดชบอร์ดด้วย AI" });
  expect(generate).toBeDisabled();
  fireEvent.click(await screen.findByRole("button", { name: EXAMPLE })); // the suggestions load after the step opens
  fireEvent.click(screen.getByRole("radio", { name: "Management" }));
  await act(async () => { fireEvent.click(generate); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/generate")[1].body)).toEqual({ table_name: "sales", context: EXAMPLE, audience: "management" });
  expect(screen.getByText("ภาพรวมยอดขาย")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("openai/gpt-oss-120b");
});

it("recomputes the dashboard when the viewer filters it", async () => {
  await generateDashboard();
  const changeCallsBefore = changeCalls().length;
  fireEvent.change(screen.getByLabelText("ภูมิภาค"), { target: { value: "North" } });
  await settle();
  expect(changeCalls().length).toBe(changeCallsBefore); // a filter does not change the spec, so no new suggestions
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
    const body = u.includes("/suggest-changes") ? CHANGES : u.includes("/suggestions") ? SUGGESTIONS : u.includes("/preview") ? PREVIEW : TWO_DATASETS;
    return Promise.resolve(reply(200, body));
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
  fireEvent.click(await screen.findByRole("button", { name: EXAMPLE })); // the suggestions load after the step opens
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
  fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  const body = JSON.parse(callTo("/dashboards/refine")[1].body);
  expect(body).toEqual({ table_name: "sales", spec: SPEC, instruction: CHANGE });
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

const changeCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes("/dashboards/suggest-changes"));

it("suggests changes from what the dashboard lacks instead of fixed examples", async () => {
  await generateDashboard();
  expect(screen.queryByRole("button", { name: "เพิ่มกราฟยอดขายรายเดือน" })).toBeNull();
  expect(screen.getByRole("button", { name: "เพิ่มตัวกรอง region" })).toBeInTheDocument();
  expect(JSON.parse(changeCalls()[0][1].body)).toEqual({ table_name: "sales", spec: SPEC });
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มตัวกรอง region" }));
  expect(refineBox()).toHaveValue("เพิ่มตัวกรอง region");
});

it("asks again for changes after a refinement, because the spec is no longer the same", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }]]);
  const before = changeCalls().length;
  fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  expect(changeCalls().length).toBe(before + 1);
  expect(JSON.parse(changeCalls().at(-1)[1].body).spec).toEqual(REFINED_SPEC);
});

it("says so when no changes can be suggested, and the user can still type", async () => {
  await generateDashboard([["/dashboards/suggest-changes", { status: 500, body: { detail: "boom" } }]]);
  expect(screen.getByText("ยังไม่มีคำแนะนำปรับ พิมพ์สิ่งที่อยากปรับได้เลย")).toBeInTheDocument();
  fireEvent.change(refineBox(), { target: { value: "เน้น KPI" } });
  expect(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })).toBeEnabled();
});

it("goes back to the dashboard before the last refinement and forgets that instruction", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }]]);
  const undo = screen.getByRole("button", { name: "ย้อนกลับ" });
  expect(undo).toBeDisabled();
  fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  expect(screen.getByRole("article", { name: "ยอดขายรายเดือน" })).toBeInTheDocument();
  expect(undo).toBeEnabled();
  await act(async () => { fireEvent.click(undo); });
  await settle();
  const render = fetch.mock.calls.filter(([url]) => String(url).includes("/dashboards/render")).at(-1);
  expect(JSON.parse(render[1].body)).toEqual({ table_name: "sales", spec: SPEC, selections: {} });
  expect(screen.queryByRole("article", { name: "ยอดขายรายเดือน" })).toBeNull();
  expect(screen.queryByText("คำสั่งที่ใช้แล้ว 1 ครั้ง")).toBeNull();
  expect(screen.getByRole("button", { name: "ย้อนกลับ" })).toBeDisabled();
});

it("goes back one refinement at a time", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }]]);
  const refineTwice = async () => {
    fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
    await settle();
  };
  await refineTwice();
  await refineTwice();
  expect(screen.getByText("คำสั่งที่ใช้แล้ว 2 ครั้ง")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" })); });
  await settle();
  expect(screen.getByText("คำสั่งที่ใช้แล้ว 1 ครั้ง")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ย้อนกลับ" })).toBeEnabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" })); });
  await settle();
  expect(screen.queryByText(/คำสั่งที่ใช้แล้ว/)).toBeNull();
  expect(screen.getByRole("button", { name: "ย้อนกลับ" })).toBeDisabled();
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

// --- going back while other calls are in flight ----------------------------------------------------
// one refinement is committed, then the undo's render call is held until the test answers it.
async function startUndo() {
  const pending = await openDashboard();
  const refines = deferRefine();
  await startRefine(CHANGE);
  await answer(refines[0], REFINED);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" })); });
  expect(pending.render).toHaveLength(1);
  return pending;
}

it("does not let a refinement start while an undo is running", async () => {
  const pending = await startUndo();
  fireEvent.change(refineBox(), { target: { value: "เพิ่มตัวกรอง region" } });
  expect(screen.getByRole("button", { name: "กำลังย้อนกลับ…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })).toBeDisabled();
  await answer(pending.render[0], rendered(6));
  expect(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })).toBeEnabled();
});

it("ignores an undo that finishes after a newer dashboard was generated", async () => {
  const pending = await startUndo();
  await regenerate();
  await answer(pending.generate[1], REGENERATED);
  expect(screen.getByText("ภาพรวมใหม่")).toBeInTheDocument();
  await answer(pending.render[0], rendered(6));
  expect(screen.getByText("ภาพรวมใหม่")).toBeInTheDocument();
  expect(screen.queryByText("ภาพรวมยอดขาย")).toBeNull();
  expect(screen.queryByText(/คำสั่งที่ใช้แล้ว/)).toBeNull();
  expect(screen.getByRole("button", { name: "ย้อนกลับ" })).toBeDisabled();
});

it("keeps the refined dashboard and its history when going back fails", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }],
    ["/dashboards/render", { status: 503, body: { detail: "วาดแดชบอร์ดไม่ได้ตอนนี้" } }]]);
  fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" })); });
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("วาดแดชบอร์ดไม่ได้ตอนนี้");
  expect(screen.getByRole("article", { name: "ยอดขายรายเดือน" })).toBeInTheDocument();
  expect(screen.getByText("คำสั่งที่ใช้แล้ว 1 ครั้ง")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "ย้อนกลับ" })).toBeEnabled();
});

it("lets an undo win over a filter change made while it runs", async () => {
  const pending = await startUndo();
  filterRegion("North");
  expect(pending.render).toHaveLength(2);
  await answer(pending.render[0], rendered(6));
  await answer(pending.render[1], { spec: REFINED_SPEC, data: { ...DATA, rows_after_filter: 2 } });
  expect(screen.queryByRole("article", { name: "ยอดขายรายเดือน" })).toBeNull();
  expect(screen.queryByText(/คำสั่งที่ใช้แล้ว/)).toBeNull();
  expect(screen.getByLabelText("ภูมิภาค")).toHaveValue("");
});

it("shows the committed filter again when an undo that replaced a pending filter render fails", async () => {
  const pending = await openDashboard();
  const refines = deferRefine();
  await startRefine(CHANGE);
  await answer(refines[0], REFINED);
  filterRegion("North");
  expect(pending.render).toHaveLength(1);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" })); });
  expect(pending.render).toHaveLength(2);
  await answer(pending.render[1], { detail: "วาดแดชบอร์ดไม่ได้ตอนนี้" }, 503);
  expect(screen.getByRole("alert")).toHaveTextContent("วาดแดชบอร์ดไม่ได้ตอนนี้");
  expect(screen.getByLabelText("ภูมิภาค")).toHaveValue("");
  expect(screen.getByRole("article", { name: "ยอดขายรายเดือน" })).toBeInTheDocument();
});

it("drops the refine call's warnings when going back to the dashboard before it", async () => {
  const warned = { ...REFINED, warnings: ["ตัดวิดเจ็ต 'x': ไม่มีคอลัมน์ y"] };
  await generateDashboard([["/dashboards/refine", { body: warned }]]);
  fireEvent.click(await screen.findByRole("button", { name: CHANGE }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  expect(screen.getByText("หมายเหตุ 1 รายการ")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" })); });
  await settle();
  expect(screen.queryByText(/หมายเหตุ/)).toBeNull();
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

it("warns about low quality on a saved dashboard, using the list the picker already loaded", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [
    ["/dashboards/datasets", { body: LOW_QUALITY }], ...SAVED_ROUTES.filter(([part]) => part !== "/dashboards/datasets")
  ]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "เปิด ยอดขายผู้บริหาร" })); });
  await settle();
  expect(screen.getByRole("complementary", { name: "คุณภาพข้อมูล" })).toHaveTextContent("62.00% ต่ำกว่าเกณฑ์ 90%");
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/dashboards/datasets"))).toHaveLength(1);
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

// --- a failed save is reported inside the dialog -------------------------------------------------
const openSaveDialog = () => fireEvent.click(screen.getByRole("button", { name: "บันทึกแดชบอร์ด" }));

it("shows why a save failed inside the dialog and keeps the dialog and the name", async () => {
  await generateDashboard([["/dashboards/saved", { status: 503, body: { detail: "บันทึกไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง" } }]]);
  openSaveDialog();
  fireEvent.change(screen.getByLabelText("ชื่อแดชบอร์ด"), { target: { value: "ยอดขายผู้บริหาร" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึก" })); });
  await settle();
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("alert")).toHaveTextContent("บันทึกไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByLabelText("ชื่อแดชบอร์ด")).toHaveValue("ยอดขายผู้บริหาร");
  expect(screen.getByRole("button", { name: "บันทึก" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "ยกเลิก" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("shows an error that is not about saving on the page, not in a dialog", async () => {
  await generateDashboard([["/dashboards/refine", { status: 503, body: { detail: "ปรับด้วย AI ไม่ได้ตอนนี้" } }]]);
  fireEvent.change(screen.getByLabelText("ปรับแดชบอร์ดด้วย AI", { selector: "textarea" }), { target: { value: "เพิ่ม Filter จังหวัด" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  await settle();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("sends only the last 50 refinements, which the server accepts", async () => {
  await generateDashboard([["/dashboards/refine", { body: REFINED }], ["/dashboards/saved", { body: SAVED_DOC }]]);
  for (let i = 1; i <= 52; i += 1) {
    fireEvent.change(refineBox(), { target: { value: `คำสั่งที่ ${i}` } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ปรับแดชบอร์ด" })); });
  }
  await settle();
  openSaveDialog();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึก" })); });
  await settle();
  const { refinements } = JSON.parse(callTo("/dashboards/saved", "POST")[1].body);
  expect(refinements).toHaveLength(50);
  expect(refinements[0]).toBe("คำสั่งที่ 3");
  expect(refinements[49]).toBe("คำสั่งที่ 52");
});
