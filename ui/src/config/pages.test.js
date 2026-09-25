import { describe, it, expect } from "vitest";
import { PAGES, NAV_GROUPS, WORKFLOW_STEPS, getPage, nextStep } from "./pages";

describe("page registry", () => {
  it("has unique keys, paths and labels", () => {
    for (const field of ["key", "path", "label"]) {
      const values = PAGES.map((p) => p[field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("keeps every subtitle to one short line", () => {
    for (const p of PAGES) expect(p.subtitle.length).toBeLessThanOrEqual(70);
  });

  it("puts every page in a known nav group", () => {
    const groups = new Set(NAV_GROUPS.map((g) => g.key));
    for (const p of PAGES) expect(groups.has(p.group)).toBe(true);
  });

  it("numbers the workflow 1..4 in order", () => {
    expect(WORKFLOW_STEPS.map((p) => p.step)).toEqual([1, 2, 3, 4]);
    expect(WORKFLOW_STEPS.map((p) => p.key)).toEqual(["ingestion", "rules", "pipeline", "export"]);
  });

  it("covers every routed path in App.jsx", () => {
    const routed = ["/", "/dashboard", "/analytics", "/pipeline", "/schema", "/rules", "/guide", "/ingestion", "/export", "/whitebox"];
    const paths = new Set(PAGES.map((p) => p.path));
    for (const r of routed) expect(paths.has(r)).toBe(true);
  });

  it("getPage throws on an unknown key", () => {
    expect(() => getPage("nope")).toThrow(/Unknown page key: nope/);
  });

  it("nextStep walks the workflow and stops after export", () => {
    expect(nextStep("ingestion").key).toBe("rules");
    expect(nextStep("pipeline").key).toBe("export");
    expect(nextStep("export")).toBeNull();
    expect(nextStep("schema")).toBeNull();
  });
});
