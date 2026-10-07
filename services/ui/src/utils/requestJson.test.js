import { it, expect, vi } from "vitest";
import { requestJson } from "./requestJson";
import { mockFetchByUrl } from "../test/renderPage";

it("keeps the HTTP status on the error", async () => {
  mockFetchByUrl([["/x", { status: 409, body: { detail: "มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่" } }]]);
  const error = await requestJson("/api/v1/x").catch((e) => e);
  expect(error.status).toBe(409);
  expect(error.message).toBe("มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่");
});

it("sends a JSON body with the method", async () => {
  const fetchMock = mockFetchByUrl([["/x", { body: { ok: true } }]]);
  expect(await requestJson("/api/v1/x", { method: "PUT", body: { a: 1 } })).toEqual({ ok: true });
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/x");
  expect(options.method).toBe("PUT");
  expect(JSON.parse(options.body)).toEqual({ a: 1 });
});

it("explains a network failure in Thai", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const error = await requestJson("/api/v1/x").catch((e) => e);
  expect(error.message).toBe("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
  expect(error.status).toBe(0);
});
