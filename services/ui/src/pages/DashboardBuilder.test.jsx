import { it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import DashboardBuilder from "./DashboardBuilder";

const DATASETS = { datasets: [
  { name: "sales", source: "File upload", records: 1200, columns: 6,
    kind_counts: { numeric: 2, categorical: 3, date: 1, text: 0 }, last_updated: "2026-10-01T03:00:00Z", error: null },
  { name: "broken", source: null, records: null, columns: null, kind_counts: null, last_updated: null,
    error: "Delta log not found at /data/active/broken/_delta_log" }
] };

it("lists the datasets that passed the quality gate with their key facts", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", [["/dashboards/datasets", { body: DATASETS }]]);
  expect(screen.getByText("sales")).toBeInTheDocument();
  expect(screen.getByText("File upload")).toBeInTheDocument();
  expect(screen.getByText("1,200")).toBeInTheDocument();
  expect(screen.getByText("ตัวเลข 2 · หมวดหมู่ 3 · วันที่ 1")).toBeInTheDocument();
  expect(screen.getByText("อ่านชุดข้อมูลนี้ไม่ได้")).toBeInTheDocument();
  expect(screen.queryByText(/\/data\/active/)).toBeNull();
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
