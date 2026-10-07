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

const nameOf = async (disposition, fallback = "fallback.csv") => {
  mockFetchByUrl([["/x", { headers: { "Content-Disposition": disposition } }]]);
  return (await requestFile("/api/v1/x", {}, fallback)).filename;
};

it("reads an encoded filename* as the Thai name", async () => {
  expect(await nameOf("attachment; filename*=UTF-8''%E0%B8%82.csv")).toBe("ข.csv");
});

it("prefers filename* when both forms are present", async () => {
  expect(await nameOf("attachment; filename=\"plain.csv\"; filename*=UTF-8''%E0%B8%82.csv")).toBe("ข.csv");
});

it("does not throw on a malformed filename* and uses the plain name or the fallback", async () => {
  expect(await nameOf("attachment; filename*=UTF-8''%E0%B8%; filename=\"plain.csv\"")).toBe("plain.csv");
  expect(await nameOf("attachment; filename*=UTF-8''%E0%B8%")).toBe("fallback.csv");
});

it("keeps a quoted filename that contains a semicolon", async () => {
  expect(await nameOf('attachment; filename="a;b.csv"')).toBe("a;b.csv");
});

it("trims whitespace around an unquoted filename", async () => {
  expect(await nameOf("attachment; filename=plain.csv  ")).toBe("plain.csv");
});

it("replaces path separators in a filename", async () => {
  expect(await nameOf("attachment; filename=..\\..\\x.csv")).toBe(".._.._x.csv");
  expect(await nameOf('attachment; filename="..\\\\..\\\\x.csv"')).toBe(".._.._x.csv");
  expect(await nameOf('attachment; filename="a/b.csv"')).toBe("a_b.csv");
});

it("gives a readable message with the status when the error body is not JSON", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false,
    status: 502,
    headers: new Headers(),
    json: async () => { throw new SyntaxError("Unexpected token <"); }
  })));
  const error = await requestFile("/api/v1/x").catch((e) => e);
  expect(error.message).toBe("คำขอล้มเหลว (HTTP 502)");
  expect(error.status).toBe(502);
});

it("explains a network failure of a download in Thai with status 0", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const error = await requestFile("/api/v1/x").catch((e) => e);
  expect(error.message).toBe("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
  expect(error.status).toBe(0);
});
