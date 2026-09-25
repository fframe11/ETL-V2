import { it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import Pipeline from "./Pipeline";

it("shows no invented row counts when the API has no metrics", async () => {
  await renderPage(Pipeline, "/pipeline");
  for (const fake of ["9,400", "10,100", "9,600", "9,500"]) expect(screen.queryAllByText(new RegExp(fake))).toHaveLength(0);
  expect(screen.getByText("ยังไม่มีผลการรันสำหรับชุดข้อมูลนี้")).toBeInTheDocument();
});

it("has one zone filter, not three", async () => {
  await renderPage(Pipeline, "/pipeline");
  expect(screen.queryByText("Filter pipeline tables...")).toBeNull();
  expect(screen.getAllByRole("button", { name: /^Quarantine/ }).length).toBeLessThanOrEqual(1);
});
