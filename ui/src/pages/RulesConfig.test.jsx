import { it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import RulesConfig from "./RulesConfig";

it("does not show made-up pass rates or flagged counts without metrics", async () => {
  await renderPage(RulesConfig, "/rules");
  for (const fake of ["95.0%", "99.0%", "500 rows", "100 rows"]) expect(screen.queryAllByText(fake)).toHaveLength(0);
});

it("has no fake search box", async () => {
  await renderPage(RulesConfig, "/rules");
  expect(screen.queryByText("Search expectations...")).toBeNull();
});
