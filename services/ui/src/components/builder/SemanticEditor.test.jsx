import React, { useState } from "react";
import { it, expect } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import SemanticEditor from "./SemanticEditor";
import { mockFetchByUrl } from "../../test/renderPage";
import { PROFILE, SEMANTIC_VIEW } from "../../test/dashboardFixtures";

const APPROVED_VIEW = { ...SEMANTIC_VIEW, status: "approved", version: 1,
  approved: { columns: SEMANTIC_VIEW.effective.columns, metrics: SEMANTIC_VIEW.effective.metrics, version: 1 } };

function Harness() {
  const [value, setValue] = useState(null);
  return <SemanticEditor table="sales" profile={PROFILE} value={value} onChange={setValue} />;
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const callTo = (part, method) =>
  fetch.mock.calls.find(([url, options]) => String(url).includes(part) && (options?.method || "GET") === method);
const gets = () => fetch.mock.calls.filter(([url, o]) => String(url).endsWith("/semantic/sales") && (o?.method || "GET") === "GET").length;

// routes: the longer "/semantic/sales/..." URLs come first (mockFetchByUrl: the first match wins).
async function show(routes = []) {
  mockFetchByUrl([...routes, ["/semantic/sales", { body: SEMANTIC_VIEW }]]);
  render(<Harness />);
  await settle();
}

it("loads the column meaning and shows its status", async () => {
  await show();
  expect(screen.getByRole("status")).toHaveTextContent("ร่างแล้ว รออนุมัติ");
  expect(screen.getByText("ยังไม่ได้อนุมัติความหมายคอลัมน์ ตัวเลขอาจแสดงหน่วยไม่ถูก")).toBeInTheDocument();
  expect(screen.getByLabelText("ชื่อที่แสดง amount")).toHaveValue("ยอดขาย");
  expect(screen.getByText("ระบุสกุลเงิน")).toBeInTheDocument();
  expect(screen.getByText("1 (16.67%)")).toBeInTheDocument();
});

it("offers roles by column kind", async () => {
  await show();
  expect(within(screen.getByLabelText("บทบาท region")).queryByRole("option", { name: "ตัววัด" })).toBeNull();
  expect(within(screen.getByLabelText("บทบาท amount")).getByRole("option", { name: "ตัววัด" })).toBeInTheDocument();
});

it("saves edits as a draft", async () => {
  await show([["/semantic/sales/draft", { body: SEMANTIC_VIEW }]]);
  const save = screen.getByRole("button", { name: "บันทึกร่าง" });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("สกุลเงิน amount"), { target: { value: "usd" } });
  expect(screen.getByText("มีการแก้ไขที่ยังไม่บันทึก")).toBeInTheDocument();
  await act(async () => { fireEvent.click(save); });
  await settle();
  const body = JSON.parse(callTo("/semantic/sales/draft", "PUT")[1].body);
  expect(body.columns.amount.currency).toBe("USD");
  expect(body.metrics.map((m) => m.id)).toEqual(["row_count", "avg_amount"]);
  expect(screen.queryByText("มีการแก้ไขที่ยังไม่บันทึก")).toBeNull();
});

it("clears measure fields when a column stops being a measure", async () => {
  await show();
  fireEvent.change(screen.getByLabelText("บทบาท amount"), { target: { value: "dimension" } });
  expect(screen.queryByLabelText("หน่วย amount")).toBeNull();
  expect(screen.queryByLabelText("รวมแบบ amount")).toBeNull();
});

it("marks a column as personal data", async () => {
  await show([["/semantic/sales/draft", { body: SEMANTIC_VIEW }]]);
  fireEvent.click(screen.getByLabelText("ส่วนบุคคล region"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึกร่าง" })); });
  await settle();
  expect(JSON.parse(callTo("/semantic/sales/draft", "PUT")[1].body).columns.region.pii).toBe(true);
});

it("approves with the version the user started from", async () => {
  await show([["/semantic/sales/approve", { body: APPROVED_VIEW }]]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "อนุมัติ" })); });
  await settle();
  expect(JSON.parse(callTo("/semantic/sales/approve", "POST")[1].body).base_version).toBe(0);
  expect(screen.getByRole("status")).toHaveTextContent("อนุมัติแล้ว v1");
  expect(screen.queryByText(/ตัวเลขอาจแสดงหน่วยไม่ถูก/)).toBeNull();
});

it("asks to reload when someone approved a newer version, and keeps the edits until then", async () => {
  await show([["/semantic/sales/approve", { status: 409, body: { detail: "มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่" } }]]);
  fireEvent.change(screen.getByLabelText("ชื่อที่แสดง region"), { target: { value: "ภาค" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "อนุมัติ" })); });
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("กรุณาโหลดใหม่");
  expect(screen.getByLabelText("ชื่อที่แสดง region")).toHaveValue("ภาค");
  const before = gets();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "โหลดใหม่" })); });
  await settle();
  expect(gets()).toBe(before + 1);
  expect(screen.getByLabelText("ชื่อที่แสดง region")).toHaveValue("ภูมิภาค");
});

it("asks the AI for a draft only when the button is pressed", async () => {
  await show([["/semantic/sales/draft", { body: { ...SEMANTIC_VIEW, engine: "groq" } }]]);
  expect(callTo("/semantic/sales/draft", "POST")).toBeUndefined();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ให้ AI ร่าง" })); });
  await settle();
  expect(callTo("/semantic/sales/draft", "POST")).toBeTruthy();
});

it("disables changes when the semantic store is unavailable", async () => {
  mockFetchByUrl([["/semantic/sales", { body: { ...SEMANTIC_VIEW, status: "unavailable" } }]]);
  render(<Harness />);
  await settle();
  for (const name of ["ให้ AI ร่าง", "บันทึกร่าง", "อนุมัติ"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
});

it("shows the load error when the view cannot be read", async () => {
  mockFetchByUrl([["/semantic/sales", { status: 404, body: { detail: "ไม่พบชุดข้อมูล" } }]]);
  render(<Harness />);
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("ไม่พบชุดข้อมูล");
});
