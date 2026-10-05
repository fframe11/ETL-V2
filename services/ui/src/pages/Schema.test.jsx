import { it, expect } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import Schema from "./Schema";

const TABLES = { pending_total: 2, tables: [
  { name: "olist_products_dataset", registered: true, primary_key: "product_id", date_column: null,
    columns: [{ name: "product_id", type: "StringType" }, { name: "product_weight_g", type: "IntegerType" }],
    column_count: 2, runs: 1, latest_score: 66.06, latest_at: "2026-10-05T18:05:14+00:00", pending_proposals: 0 },
  { name: "ijzp_q8t2_500k", registered: true, primary_key: "id", date_column: "date",
    columns: [{ name: "id", type: "IntegerType" }, { name: "arrest", type: "BooleanType" }],
    column_count: 2, runs: 3, latest_score: 99, latest_at: "2026-10-01T18:41:00+00:00", pending_proposals: 2 }
] };

const DRIFT = { arrest: { error: "type_mismatch", expected: "BooleanType", actual: "StringType", action: "coerced_to_string" } };
const PENDING = { total: 1, status_filter: "PENDING", proposals: [
  { id: "p2", table_name: "ijzp_q8t2_500k", run_id: "run_2", proposed_at: "2026-10-01T18:41:00+00:00",
    first_seen: "2026-10-01T18:24:00+00:00", last_seen: "2026-10-01T18:41:00+00:00", occurrences: 2, duplicate_ids: ["p1"],
    drift_details: DRIFT, proposed_schema: { id: "IntegerType", arrest: "StringType" } }
] };

const routes = (extra = []) => [
  ["/schema/tables", { body: TABLES }],
  ["/schema/proposals", { body: PENDING }],
  ...extra
];

it("opens on the table catalog with the newest table first, its columns and key", async () => {
  await renderPage(Schema, "/schema", routes());
  const rows = screen.getAllByTestId("catalog-row");
  expect(rows[0].textContent).toContain("olist_products_dataset");
  expect(rows[0].textContent).toContain("66.1%");
  const detail = screen.getByTestId("catalog-detail");
  expect(detail.textContent).toContain("product_weight_g");
  expect(detail.textContent).toContain("IntegerType");
  expect(within(detail).getByText("คีย์หลัก", { selector: "td" })).toBeTruthy(); // role of product_id
});

it("shows the pending count on the tab and per table, and jumps to that table's proposals", async () => {
  await renderPage(Schema, "/schema", routes());
  expect(screen.getByRole("button", { name: /รออนุมัติ \(2\)/ })).toBeTruthy();
  fireEvent.click(screen.getAllByTestId("catalog-row")[1]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /ดูข้อเสนอที่รออนุมัติ \(2\)/ })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByLabelText("ค้นหาตาราง").value).toBe("ijzp_q8t2_500k");
  expect(screen.getAllByTestId("proposal-row")[0].textContent).toContain("พบ 2 ครั้ง");
});

it("says what was expected, what was found and what the system already did", async () => {
  await renderPage(Schema, "/schema", routes());
  fireEvent.click(screen.getByRole("button", { name: /รออนุมัติ \(2\)/ }));
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByText(/คาด BooleanType พบ StringType · ระบบแปลงเป็นข้อความให้แล้ว/)).toBeTruthy();
  expect(screen.getByText(/ปิดการตรวจพบซ้ำทั้ง 2 ครั้งพร้อมกัน/)).toBeTruthy();
  expect(screen.queryByText(/TYPE MISMATCH|SEV/)).toBeNull();
});

it("does not promise to quarantine data when a proposal is rejected", async () => {
  await renderPage(Schema, "/schema", routes());
  fireEvent.click(screen.getByRole("button", { name: /รออนุมัติ \(2\)/ }));
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  fireEvent.click(document.querySelector(".gs-btn-reject"));
  expect(screen.getByText(/ไม่ถูกแก้ไขหรือกักกันย้อนหลัง/)).toBeTruthy();
  expect(screen.queryByText(/ข้อมูลที่เกี่ยวข้องจะถูกกักกัน/)).toBeNull();
});

it("defaults the key to what the table has registered and sends only a changed value on approve", async () => {
  await renderPage(Schema, "/schema", routes([["/approve", { body: { closed_duplicates: 1 } }]]));
  fireEvent.click(screen.getByRole("button", { name: /รออนุมัติ \(2\)/ }));
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByLabelText("คีย์หลัก").value).toBe("id");
  expect(screen.getByLabelText("คอลัมน์วันที่").value).toBe("date");
  fireEvent.click(document.querySelector(".gs-btn-approve"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm" })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  const approveCall = globalThis.fetch.mock.calls.map((c) => String(c[0])).find((u) => u.includes("/proposals/p2/approve"));
  expect(approveCall).toBeTruthy();
  expect(approveCall).not.toContain("primary_key=");   // unchanged: the registered key is kept
  expect(approveCall).not.toContain("date_column=");
});

it("hides the schema-change simulator unless ?test=1", async () => {
  await renderPage(Schema, "/schema", routes());
  expect(screen.queryByText(/เครื่องมือทดสอบ/)).toBeNull();
  expect(screen.queryByText(/student_course_scores/)).toBeNull();
});

it("says so when no table is registered", async () => {
  await renderPage(Schema, "/schema");
  expect(screen.getByText("ยังไม่มีตารางที่ลงทะเบียน")).toBeTruthy();
});
