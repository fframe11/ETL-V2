import { it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import DataExport from "./DataExport";

it("has no dead toolbar controls", async () => {
  await renderPage(DataExport, "/export");
  for (const dead of ["Type ▾", "Owner ▾", "Last modified ▾", "Share"]) {
    expect(screen.queryByRole("button", { name: dead })).toBeNull();
  }
});

it("lists each export zone once", async () => {
  await renderPage(DataExport, "/export");
  expect(screen.getAllByText(/certified_gold_clean\.csv/).length).toBe(1);
  expect(screen.queryByText(/Certified Gold Dataset/)).toBeNull();
});

it("shows no invented counts without metrics", async () => {
  await renderPage(DataExport, "/export");
  for (const fake of ["10,100", "Null 300", "Range 200"]) expect(screen.queryAllByText(new RegExp(fake))).toHaveLength(0);
});

it("names downloads after the loaded dataset instead of a sample name", async () => {
  await renderPage(DataExport, "/export", [
    ["/whitebox/state", { body: { dataset_name: "olist_products_dataset", metrics: { clean_rows: 3, review_rows: 0, quarantine_rows: 1 } } }]
  ]);
  const input = await screen.findByPlaceholderText("olist_products_dataset");
  expect(input.value).toBe("");
  expect(screen.queryByPlaceholderText("student_course_scores")).toBeNull();
});

const TABLES = ["/export/tables", { body: { tables: [{ name: "newest_import", layers: ["active"] }, { name: "orders_b", layers: ["active"] }], reddit_available: false } }];

it("preselects the dataset that is loaded now and shows its name and counts", async () => {
  await renderPage(DataExport, "/export", [
    TABLES,
    ["/whitebox/state", { body: { dataset_name: "orders_b", metrics: { total_rows: 4, clean_rows: 3, review_rows: 0, quarantine_rows: 1 } } }]
  ]);
  expect(await screen.findByDisplayValue("orders_b")).toBeTruthy();
  expect(screen.getByText(/ผ่านการคัดกรอง 3 จาก 4 แถว/)).toBeTruthy(); // passed rows, not the total
  const heading = screen.getByTestId("export-dataset"); // dataset name shown above the files
  expect(heading.textContent).toContain("orders_b");
});

it("falls back to the newest table when the loaded dataset has no stored copy", async () => {
  await renderPage(DataExport, "/export", [
    TABLES,
    ["/whitebox/state", { body: { dataset_name: "only_in_memory", metrics: { total_rows: 1, clean_rows: 1 } } }]
  ]);
  expect(await screen.findByDisplayValue("newest_import")).toBeTruthy();
});

it("downloads a file named after the loaded dataset, and a typed name still wins", async () => {
  window.URL.createObjectURL = vi.fn(() => "blob:x");
  window.URL.revokeObjectURL = vi.fn();
  await renderPage(DataExport, "/export", [
    ["/whitebox/state", { body: { dataset_name: "olist_products_dataset", metrics: { total_rows: 4, clean_rows: 3, review_rows: 0, quarantine_rows: 1 } } }]
  ]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ดาวน์โหลด Clean CSV" })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByText(/olist_products_dataset_clean_3rows\.csv/)).toBeTruthy();
  expect(screen.queryByText(/student_course_scores/)).toBeNull();

  fireEvent.change(screen.getByPlaceholderText("olist_products_dataset"), { target: { value: "my_export" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ดาวน์โหลด Clean CSV" })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByText(/my_export_clean_3rows\.csv/)).toBeTruthy();
});

it("shows no dataset heading when nothing is loaded", async () => {
  await renderPage(DataExport, "/export");
  expect(screen.queryByTestId("export-dataset")).toBeNull();
});

const NOT_LOGGED_IN = { status: 401, body: { detail: "Not authenticated. Please log in." } };

it("tells the user in Thai that the session ended when the preview answers 401", async () => {
  await renderPage(DataExport, "/export", [
    ["/export/preview/", NOT_LOGGED_IN],
    TABLES
  ]);
  expect(await screen.findByText("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่")).toBeTruthy();
  expect(screen.queryByText(/Not authenticated/)).toBeNull(); // the raw English detail is not shown
});

it("tells the user in Thai that the session ended when the download answers 401", async () => {
  await renderPage(DataExport, "/export", [
    ["/export/active/", NOT_LOGGED_IN],
    ["/export/preview/", { body: { columns: ["a"], rows: [{ a: 1 }] } }],
    TABLES
  ]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Export CSV File" })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByText("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่")).toBeTruthy();
  expect(screen.queryByText(/Not authenticated/)).toBeNull();
});
