import { it, expect } from "vitest";
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
