import { it, expect, vi } from "vitest";
import { requestFile, requestJson } from "./requestJson";
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

const CSV_FILE = { headers: { "Content-Disposition": 'attachment; filename="sales_20261008.csv"' } };

it("downloads a file under the name the server gives", async () => {
  const blob = new Blob(["﻿region\r\nNorth\r\n"], { type: "text/csv" });
  const fetchMock = mockFetchByUrl([["/x", { ...CSV_FILE, blob }]]);
  const file = await requestFile("/api/v1/x", { method: "POST", body: { a: 1 } }, "sales.csv");
  expect(file).toEqual({ blob, filename: "sales_20261008.csv" });
  const [, options] = fetchMock.mock.calls[0];
  expect(options.credentials).toBe("same-origin");
  expect(JSON.parse(options.body)).toEqual({ a: 1 });
});

it("names a downloaded file itself when the server does not", async () => {
  mockFetchByUrl([["/x", {}]]);
  expect((await requestFile("/api/v1/x", {}, "sales.csv")).filename).toBe("sales.csv");
});

it("turns a failed download into the server's message", async () => {
  const detail = "ข้อมูลหลังกรองมี 4 แถว เกินที่ส่งออกได้ 3 แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่";
  mockFetchByUrl([["/x", { status: 413, body: { detail } }]]);
  const error = await requestFile("/api/v1/x").catch((e) => e);
  expect(error.status).toBe(413);
  expect(error.message).toBe(detail);
});
