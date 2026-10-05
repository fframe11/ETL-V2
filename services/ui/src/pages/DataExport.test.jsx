import { it, expect } from "vitest";
import { screen } from "@testing-library/react";
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
