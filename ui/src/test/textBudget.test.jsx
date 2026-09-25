import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import budgets from "./text-budget.json";
import { renderPage } from "./renderPage";
import { visibleText, doubledLabels } from "./visibleText";
import Home from "../pages/Home";
import ConfigGuide from "../pages/ConfigGuide";
import Ingestion from "../pages/Ingestion";
import RulesConfig from "../pages/RulesConfig";
import Pipeline from "../pages/Pipeline";
import DataExport from "../pages/DataExport";
import Schema from "../pages/Schema";
import WhiteBoxPipeline from "../pages/WhiteBoxPipeline";
import Analytics from "../pages/Analytics";
import Dashboard from "../pages/Dashboard";

const PAGES_UNDER_TEST = {
  home: [Home, "/"],
  guide: [ConfigGuide, "/guide"],
  ingestion: [Ingestion, "/ingestion"],
  rules: [RulesConfig, "/rules"],
  pipeline: [Pipeline, "/pipeline"],
  export: [DataExport, "/export"],
  schema: [Schema, "/schema"],
  whitebox: [WhiteBoxPipeline, "/whitebox"],
  analytics: [Analytics, "/analytics"],
  dashboard: [Dashboard, "/dashboard"]
};

const report = {};

afterAll(() => {
  if (process.env.TEXT_REPORT) {
    // Vitest's SSR module transform does not always give import.meta.url a
    // file:// scheme, so resolve relative to the npm script's cwd (ui/) instead.
    writeFileSync(resolve(process.cwd(), "src/test/text-report.json"), JSON.stringify(report, null, 2) + "\n");
  }
});

it("has a budget entry for every page under test", () => {
  expect(Object.keys(budgets).sort()).toEqual(Object.keys(PAGES_UNDER_TEST).sort());
});

describe.each(Object.entries(PAGES_UNDER_TEST))("%s", (key, [Component, path]) => {
  it("stays within its visible-text budget", async () => {
    const { container } = await renderPage(Component, path);
    const text = visibleText(container);
    report[key] = text.length;
    const max = budgets[key].max_chars;
    if (max == null) return; // not measured yet (Task 1 baseline run)
    expect(text.length).toBeLessThanOrEqual(max);
  });

  it("uses one language per label once simplified", async () => {
    if (!budgets[key].enforce_single_language) return;
    const { container } = await renderPage(Component, path);
    expect(doubledLabels(visibleText(container))).toEqual([]);
  });
});
