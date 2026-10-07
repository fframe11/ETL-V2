import { it, expect, vi } from "vitest";
import { dashboardsApi } from "./dashboardsApi";
import { mockFetchByUrl } from "../test/renderPage";

it("sends JSON and returns the body", async () => {
  const fetchMock = mockFetchByUrl([["/dashboards/generate", { body: { engine: "groq" } }]]);
  const result = await dashboardsApi.generate("sales", "ยอดขาย", "business");
  expect(result.engine).toBe("groq");
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/dashboards/generate");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({ table_name: "sales", context: "ยอดขาย", audience: "business" });
});

it("turns the API detail into the error message", async () => {
  mockFetchByUrl([["/dashboards/refine", { status: 503, body: { detail: "ปรับด้วย AI ไม่ได้ตอนนี้: ยังไม่ได้ตั้งค่า Groq API key" } }]]);
  await expect(dashboardsApi.refine("sales", {}, "เพิ่มกราฟ")).rejects.toThrow("ยังไม่ได้ตั้งค่า Groq API key");
});

it("does not show server paths from an error", async () => {
  mockFetchByUrl([["/dashboards/datasets", { status: 404, body: { detail: "Delta log not found at /data/active/sales/_delta_log" } }]]);
  await expect(dashboardsApi.listDatasets()).rejects.toThrow("คำขอล้มเหลว (HTTP 404)");
});

it("explains a network failure in Thai instead of the browser's English message", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  await expect(dashboardsApi.listDatasets()).rejects.toThrow("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
});

it("keeps the HTTP error message when the server did answer", async () => {
  mockFetchByUrl([["/dashboards/saved", { status: 503, body: { detail: "บันทึกไม่ได้ในตอนนี้" } }]]);
  await expect(dashboardsApi.createSaved({})).rejects.toThrow("บันทึกไม่ได้ในตอนนี้");
});

it("asks for the CSV of the rows the filters select", async () => {
  const fetchMock = mockFetchByUrl([["/dashboards/export",
    { headers: { "Content-Disposition": 'attachment; filename="sales_20261008.csv"' } }]]);
  const file = await dashboardsApi.exportCsv("sales", { region: { values: ["North"] } }, false);
  expect(file.filename).toBe("sales_20261008.csv");
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/dashboards/export");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({ table_name: "sales", selections: { region: { values: ["North"] } }, include_personal: false });
});
