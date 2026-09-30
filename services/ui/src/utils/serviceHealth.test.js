import { it, expect } from "vitest";
import { summarizeServiceHealth } from "./serviceHealth";

const svc = (entries) => Object.fromEntries(entries.map(([n, s]) => [n, { status: s, url: null }]));

it("says the system is fine when every service is online", () => {
  const h = summarizeServiceHealth({ data: svc([["Kafka Broker", "online"], ["Postgres DB", "online"]]) });
  expect(h).toEqual({ level: "ok", text: "ระบบปกติ", offline: [] });
});

it("counts offline services instead of calling the whole API offline", () => {
  const h = summarizeServiceHealth({ data: svc([["Kafka Broker", "offline"], ["Postgres DB", "online"]]) });
  expect(h.level).toBe("degraded");
  expect(h.text).toBe("1 บริการออฟไลน์");
  expect(h.offline).toEqual(["Kafka Broker"]);
});

it("reports the API as unreachable only when the status request itself fails", () => {
  expect(summarizeServiceHealth({ error: "HTTP 502" }).level).toBe("down");
  expect(summarizeServiceHealth({ error: "HTTP 502" }).text).toBe("เชื่อมต่อ API ไม่ได้");
});

it("does not claim anything while the first check is still loading", () => {
  expect(summarizeServiceHealth({ loading: true }).level).toBe("unknown");
});
