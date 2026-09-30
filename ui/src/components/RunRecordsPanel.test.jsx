import React from "react";
import { it, expect } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { mockFetchByUrl } from "../test/renderPage";
import RunRecordsPanel from "./RunRecordsPanel";

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 400)); });

const recordsBody = {
  columns: ["Order_ID", "reject_reason", "run_id"],
  rows: [{ Order_ID: 7, reject_reason: "null Sales", run_id: "run_A" }],
  total_rows: 28,
  matched_rows: 1,
  run_filter_applied: true,
  run_ids: ["run_A", "run_B"]
};

it("loads the chosen run's quarantined rows and shows the match count", async () => {
  const fetchMock = mockFetchByUrl([["/export/records/", { body: recordsBody }]]);
  await act(async () => { render(<RunRecordsPanel tableName="grocery_sales" runId="run_A" initialLayer="quarantine" onClose={() => {}} />); });
  await settle();

  const url = String(fetchMock.mock.calls.at(-1)[0]);
  expect(url).toContain("/api/v1/export/records/quarantine/grocery_sales");
  expect(url).toContain("run_id=run_A");
  expect(screen.getByText("null Sales")).toBeInTheDocument();
  expect(screen.getByText("พบ 1 แถว จากทั้งหมด 28 แถว")).toBeInTheDocument();
});

it("sends the search text and can drop the run filter", async () => {
  const fetchMock = mockFetchByUrl([["/export/records/", { body: recordsBody }]]);
  await act(async () => { render(<RunRecordsPanel tableName="grocery_sales" runId="run_A" onClose={() => {}} />); });
  await settle();

  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("ค้นหาข้อมูลในตาราง"), { target: { value: "milk" } });
  await settle();

  const url = String(fetchMock.mock.calls.at(-1)[0]);
  expect(url).toContain("/records/active/grocery_sales");
  expect(url).toContain("search=milk");
  expect(url).not.toContain("run_id=");
});

it("says so when the table does not store run ids", async () => {
  mockFetchByUrl([["/export/records/", { body: { ...recordsBody, run_ids: [], run_filter_applied: false } }]]);
  await act(async () => { render(<RunRecordsPanel tableName="products" runId="run_A" onClose={() => {}} />); });
  await settle();

  expect(screen.getByText("ตารางนี้ไม่ได้เก็บรหัสรอบไว้ในแถว จึงแสดงทุกแถวของตาราง")).toBeInTheDocument();
  expect(screen.getByRole("checkbox")).toBeDisabled();
});
