# UI Simplification (All Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every SDOQAP page easier to use and far less wordy: one naming system, one short header per page, explanations on demand instead of in the main flow, no fake controls, no fabricated numbers.

**Architecture:** A single page registry (`ui/src/config/pages.js`) becomes the only source of page names, subtitles and workflow order; the NavBar, a new shared `PageHeader`, and "next step" links all read from it. A small shared UI kit (`PageHeader`, `InfoHint`, `LearnMore`, `NextStepLink`) replaces the copy-pasted header block and the hover-only tooltip. A Vitest text-budget test renders each page with empty API responses and measures the text a user sees on first load, so "less text" is a checked number, not a feeling. Pages are then simplified one task at a time against that test.

**Tech Stack:** React 18, Vite 5, react-router-dom 6; new dev deps Vitest 2 + Testing Library + jsdom. Docker Compose for the live check.

**Spec:** No separate spec file. Requirements come from the UX reviews in the 2026-09-24/25 session (Schema and Pipeline screenshot critiques, persona review) and from the user's request: "ปรับหน้า UI ทุกหน้าให้เหมาะสมกับใช้งาน อยากได้สไตล์ที่ใช้งานง่าย ตัวอักษรไม่เยอะเหมือนตอนนี้". The **Design rules** below are that spec.

## Design rules (the spec)

1. **One name per page.** The page `<h1>` is exactly the NavBar label. Both come from `pages.js`.
2. **Header = title + one line.** Subtitle ≤ 70 characters, Thai. No orange "eyebrow" tag above the title, no second intro paragraph, no second "console" heading inside the page.
3. **Explanations on demand.** Paragraph-length explanations go into `InfoHint` (short, next to the thing it explains) or `LearnMore` (collapsed `<details>`). Nothing is deleted just for being long unless it is marketing copy, duplicated, or fabricated.
4. **One language per label.** No "ไทย (English)" doubled labels. Buttons, tabs, form labels and table headers are Thai. Standard technical nouns stay English as single words: Pipeline, Schema, Clean, Review, Quarantine, CSV, API, AI, SLA, Row ID. Code identifiers such as `quality_score_threshold` may stay in parentheses.
5. **No fake controls.** Remove every element that looks like a search box, filter or dropdown but does nothing, and every button whose label does not match what it does.
6. **No fabricated numbers.** When the API has no metrics, show `—` plus one short notice. Never show hard-coded fallback counts (9,400 / 100 / 600 / 10,100 …) or hard-coded pass rates.
7. **One control per job.** If three controls set the same state (tabs + tiles + toolbar), keep the one closest to the data and drop the rest.
8. **Text budget.** On first load (empty API responses), each page's visible text is at most `baseline × ratio` (ratios in Task 1).

## Global Constraints

- Do not change backend code or API contracts. UI-only.
- Keep every working feature reachable. Moving text into `InfoHint`/`LearnMore` is fine; removing a working button is not (except duplicates under rule 7).
- New and edited CSS uses the tokens in `ui/src/App.css` (`--text-main`, `--text-muted`, `--border-color`, `--accent-blue`, `--db-emerald`, …). No new hex colors in touched JSX.
- Commit each task to local `main`. **Do not push.** The user has asked to keep work local until they say otherwise.
- Never type passwords in a browser. For the live visual check, ask the user to log in in the Browser pane if the session has expired.
- After any live API testing, run `git status` and `git restore spark/rules_config.json spark/schema_registry.json` if they changed (known test-pollution side effect).
- Dashboard (`/dashboard`) was just redesigned by a teammate (branch `mari`). Task 13 is deliberately light-touch: header and doubled labels only.

## Decisions locked in (change here before executing if you disagree)

- **Nav labels stay English** (the team's Databricks-style names: Catalog, Jobs & Pipelines, …) to avoid renaming the product. The Thai goes in the one-line subtitle. Exception: `/whitebox` is renamed from "Runs" to **"Audit Trail"** because "Runs" does not describe that page.
- **NavBar is regrouped by workflow:** "ขั้นตอนการทำงาน" (1 Data Ingestion → 2 Expectations & Alerts → 3 Jobs & Pipelines → 4 Workspace Exports) and "ติดตามและตรวจสอบ" (Dashboards, Query & Metrics, Catalog, Audit Trail). Home and Learn stay on top.
- **Text-budget ratios:** home 0.45, guide 0.40, ingestion 0.55, rules 0.50, pipeline 0.60, export 0.50, schema 0.70, whitebox 0.45, analytics 0.60, dashboard 0.90.

## File structure

| File | Responsibility |
|---|---|
| `ui/src/config/pages.js` (new) | Page registry: key, path, label, subtitle, nav group, workflow step. `getPage`, `nextStep`, `WORKFLOW_STEPS`, `NAV_GROUPS`. |
| `ui/src/config/pages.test.js` (new) | Registry invariants. |
| `ui/src/components/ui/PageHeader.jsx` (new) | Title (= nav label), subtitle, step chip, right-side actions. |
| `ui/src/components/ui/InfoHint.jsx` (new) | Accessible `?` hint: hover, focus, tap; Esc closes. Replaces `components/Tooltip.jsx`. |
| `ui/src/components/ui/LearnMore.jsx` (new) | Collapsed `<details>` for long explanations. |
| `ui/src/components/ui/NextStepLink.jsx` (new) | "ถัดไป: {next page} →" from the registry. |
| `ui/src/components/ui/TileCard.jsx` (moved) | `DatabricksTileCard` moved unchanged out of `WorkflowJourneyBar.jsx`, exported as `TileCard`. |
| `ui/src/components/ui/index.js`, `ui.css` (new) | Barrel export + styles (tokens only). |
| `ui/src/components/ui/ui.test.jsx` (new) | Component tests. |
| `ui/src/test/setup.js`, `visibleText.js`, `renderPage.jsx`, `textBudget.test.jsx`, `text-budget.json` (new) | Test harness and the text budget. |
| `ui/scripts/record-baseline.mjs`, `ui/scripts/apply-budget.mjs` (new) | Record baseline counts, then tighten one page's budget. |
| `ui/src/components/NavBar.jsx` (modify) | Menu derived from the registry; search also matches Thai subtitles. |
| `ui/src/pages/*.jsx` (modify) | Per-page simplification, Tasks 4–13. |
| Delete | `components/WorkflowJourneyBar.jsx`, `components/Tooltip.jsx`, `pages/Grafana.jsx`, `pages/Hdfs.jsx`, `pages/Kibana.jsx`, `pages/Metadata.jsx` (unrouted, never imported). |

---

### Task 1: Test harness and text-budget baseline

**Files:**
- Modify: `ui/package.json`, `ui/vite.config.js`, `.gitignore`
- Create: `ui/src/test/setup.js`, `ui/src/test/visibleText.js`, `ui/src/test/renderPage.jsx`, `ui/src/test/textBudget.test.jsx`, `ui/src/test/text-budget.json`, `ui/scripts/record-baseline.mjs`, `ui/scripts/apply-budget.mjs`

**Interfaces:**
- Produces: `visibleText(root: Element): string`, `doubledLabels(text: string): string[]`, `renderPage(Component, path): Promise<RenderResult>`, npm script `test`, `text-budget.json` entries `{ baseline_chars, ratio, max_chars, enforce_single_language }`, `node ui/scripts/apply-budget.mjs <key>`.

- [ ] **Step 1: Install test dependencies and add the script**

```bash
npm --prefix ui install -D vitest@2.1.9 @testing-library/react@16.1.0 @testing-library/dom@10.4.0 @testing-library/jest-dom@6.6.3 jsdom@25.0.1
```

In `ui/package.json` add to `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 2: Configure Vitest**

In `ui/vite.config.js` add a `test` key inside `defineConfig({...})`, after `build`:

```js
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false
  }
```

- [ ] **Step 3: Create `ui/src/test/setup.js`**

```js
import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserverStub;
window.matchMedia = window.matchMedia || (() => ({
  matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}
}));
window.scrollTo = () => {};
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

// Canvas charts cannot render in jsdom; they carry no user-facing copy we are budgeting.
vi.mock("echarts-for-react", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
```

- [ ] **Step 4: Create `ui/src/test/visibleText.js`**

```js
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "INPUT", "TEXTAREA"]);

// Text a user sees on first load: skips closed <details> bodies, hidden nodes,
// unselected <option>s and form field values.
export function visibleText(root) {
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      const t = node.textContent.replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return;
    if (node.hidden || node.getAttribute("aria-hidden") === "true") return;
    if (node.style && node.style.display === "none") return;
    if (tag === "OPTION" && !node.selected) return;
    if (tag === "DETAILS" && !node.open) {
      const summary = Array.from(node.children).find((c) => c.tagName === "SUMMARY");
      if (summary) walk(summary);
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return parts.join(" ");
}

// "ชื่อตาราง (Target Table)" style doubled labels. Code identifiers with "_" do not match.
export const THAI_EN_DOUBLE_LABEL = /[฀-๿][^\n()]{0,40}\(\s*[A-Za-z][A-Za-z0-9 &/.\-]{1,40}\)/g;

export function doubledLabels(text) {
  return text.match(THAI_EN_DOUBLE_LABEL) || [];
}
```

- [ ] **Step 5: Create `ui/src/test/renderPage.jsx`**

```jsx
import React from "react";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

export function mockFetchEmpty() {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
    blob: async () => new Blob()
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Renders a page as a first-time visitor sees it when the API has no data yet.
export async function renderPage(Component, path = "/") {
  mockFetchEmpty();
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter initialEntries={[path]}>
        <Component />
      </MemoryRouter>
    );
  });
  // Lets fetch promises and the 300 ms debounced fetch in Pipeline settle.
  await act(async () => { await new Promise((r) => setTimeout(r, 500)); });
  return utils;
}
```

- [ ] **Step 6: Create `ui/src/test/text-budget.json`**

```json
{
  "home":      { "baseline_chars": null, "ratio": 0.45, "max_chars": null, "enforce_single_language": false },
  "guide":     { "baseline_chars": null, "ratio": 0.40, "max_chars": null, "enforce_single_language": false },
  "ingestion": { "baseline_chars": null, "ratio": 0.55, "max_chars": null, "enforce_single_language": false },
  "rules":     { "baseline_chars": null, "ratio": 0.50, "max_chars": null, "enforce_single_language": false },
  "pipeline":  { "baseline_chars": null, "ratio": 0.60, "max_chars": null, "enforce_single_language": false },
  "export":    { "baseline_chars": null, "ratio": 0.50, "max_chars": null, "enforce_single_language": false },
  "schema":    { "baseline_chars": null, "ratio": 0.70, "max_chars": null, "enforce_single_language": false },
  "whitebox":  { "baseline_chars": null, "ratio": 0.45, "max_chars": null, "enforce_single_language": false },
  "analytics": { "baseline_chars": null, "ratio": 0.60, "max_chars": null, "enforce_single_language": false },
  "dashboard": { "baseline_chars": null, "ratio": 0.90, "max_chars": null, "enforce_single_language": false }
}
```

- [ ] **Step 7: Create `ui/src/test/textBudget.test.jsx`**

```jsx
import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
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
    writeFileSync(new URL("./text-report.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
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
```

- [ ] **Step 8: Run the suite and make every page render**

Run: `npm --prefix ui test`
Expected: all tests PASS (budgets are still `null`). If a page throws while rendering with `{}` API responses, that is a real null-safety bug: fix only the failing expression with optional chaining or a `?? []` / `?? null` default, re-run, and repeat until green.

- [ ] **Step 9: Create `ui/scripts/record-baseline.mjs` and record the baseline**

```js
import { readFileSync, writeFileSync } from "node:fs";

const budgetFile = new URL("../src/test/text-budget.json", import.meta.url);
const reportFile = new URL("../src/test/text-report.json", import.meta.url);
const budgets = JSON.parse(readFileSync(budgetFile, "utf8"));
const report = JSON.parse(readFileSync(reportFile, "utf8"));

for (const [key, chars] of Object.entries(report)) {
  if (!budgets[key]) throw new Error(`No budget entry for "${key}"`);
  budgets[key].baseline_chars = chars;
  budgets[key].max_chars = chars; // freeze today's level; Tasks 4-13 tighten it
}
writeFileSync(budgetFile, JSON.stringify(budgets, null, 2) + "\n");
console.log(report);
```

Run (Git Bash): `TEXT_REPORT=1 npm --prefix ui test && node ui/scripts/record-baseline.mjs`
(PowerShell: `$env:TEXT_REPORT=1; npm --prefix ui test; node ui/scripts/record-baseline.mjs; Remove-Item Env:TEXT_REPORT`)
Expected: prints one character count per page; `text-budget.json` now has numbers in `baseline_chars` and `max_chars`.

- [ ] **Step 10: Create `ui/scripts/apply-budget.mjs`**

```js
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../src/test/text-budget.json", import.meta.url);
const key = process.argv[2];
const budgets = JSON.parse(readFileSync(file, "utf8"));
if (!budgets[key]) {
  console.error(`No budget entry for "${key}"`);
  process.exit(1);
}
const b = budgets[key];
if (b.baseline_chars == null) {
  console.error(`"${key}" has no baseline yet; run Task 1 Step 9 first`);
  process.exit(1);
}
b.max_chars = Math.floor(b.baseline_chars * b.ratio);
b.enforce_single_language = true;
writeFileSync(file, JSON.stringify(budgets, null, 2) + "\n");
console.log(`${key}: max_chars ${b.baseline_chars} -> ${b.max_chars}`);
```

- [ ] **Step 11: Ignore the report file, re-run, commit**

Append to `.gitignore`: `ui/src/test/text-report.json`

Run: `npm --prefix ui test`
Expected: PASS (every page is at exactly its frozen baseline or below).

```bash
git add ui/package.json ui/package-lock.json ui/vite.config.js .gitignore ui/src/test ui/scripts
git commit -m "test(ui): add Vitest harness and per-page visible-text budget"
```

---

### Task 2: One page registry for names, subtitles and workflow order

**Files:**
- Create: `ui/src/config/pages.js`, `ui/src/config/pages.test.js`, `ui/src/components/NavBar.test.jsx`
- Modify: `ui/src/components/NavBar.jsx` (the `menuGroups` literal around lines 128-161, and the `filteredLinks` filter just below it)
- Create: `ui/src/components/ui/TileCard.jsx` (moved code)
- Modify imports in: `ui/src/pages/{Analytics,ConfigGuide,Dashboard,DataExport,Home,Ingestion,Pipeline,RulesConfig,Schema,WhiteBoxPipeline}.jsx`
- Delete: `ui/src/components/WorkflowJourneyBar.jsx`, `ui/src/pages/Grafana.jsx`, `ui/src/pages/Hdfs.jsx`, `ui/src/pages/Kibana.jsx`, `ui/src/pages/Metadata.jsx`

**Interfaces:**
- Produces: `PAGES: Array<{ key, path, label, subtitle, group, step? }>`, `NAV_GROUPS: Array<{ key, title }>`, `WORKFLOW_STEPS`, `getPage(key) -> page` (throws `Unknown page key: <key>`), `nextStep(key) -> page | null`, `TileCard` (same props as the old `DatabricksTileCard`).

- [ ] **Step 1: Write the failing registry test `ui/src/config/pages.test.js`**

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix ui test -- src/config/pages.test.js`
Expected: FAIL, cannot resolve `./pages`.

- [ ] **Step 3: Create `ui/src/config/pages.js`**

```js
export const NAV_GROUPS = [
  { key: "start", title: "" },
  { key: "workflow", title: "ขั้นตอนการทำงาน" },
  { key: "monitor", title: "ติดตามและตรวจสอบ" }
];

export const PAGES = [
  { key: "home", path: "/", label: "Home", subtitle: "", group: "start" },
  { key: "guide", path: "/guide", label: "Learn & Architecture", subtitle: "คู่มือการใช้งานและความหมายของพารามิเตอร์", group: "start" },
  { key: "ingestion", path: "/ingestion", label: "Data Ingestion", subtitle: "นำเข้าข้อมูลจากไฟล์ ฐานข้อมูล API หรือ Stream", group: "workflow", step: 1 },
  { key: "rules", path: "/rules", label: "Expectations & Alerts", subtitle: "กำหนดกฎคุณภาพข้อมูลก่อนรัน Pipeline", group: "workflow", step: 2 },
  { key: "pipeline", path: "/pipeline", label: "Jobs & Pipelines", subtitle: "คัดแยกข้อมูลเป็น Clean, Review และ Quarantine", group: "workflow", step: 3 },
  { key: "export", path: "/export", label: "Workspace Exports", subtitle: "ดาวน์โหลดข้อมูลที่ผ่านการคัดกรองแล้ว", group: "workflow", step: 4 },
  { key: "dashboard", path: "/dashboard", label: "Dashboards", subtitle: "ภาพรวมคุณภาพข้อมูลและผลกระทบทางธุรกิจ", group: "monitor" },
  { key: "analytics", path: "/analytics", label: "Query & Metrics", subtitle: "แนวโน้มคุณภาพข้อมูลและคำแนะนำ", group: "monitor" },
  { key: "schema", path: "/schema", label: "Catalog", subtitle: "อนุมัติหรือปฏิเสธการเปลี่ยนโครงสร้างตาราง", group: "monitor" },
  { key: "whitebox", path: "/whitebox", label: "Audit Trail", subtitle: "ดูเหตุผลของระบบทีละขั้น ตั้งแต่สำรวจข้อมูลถึงผลลัพธ์", group: "monitor" }
];

export const WORKFLOW_STEPS = PAGES.filter((p) => p.step).sort((a, b) => a.step - b.step);

export function getPage(key) {
  const page = PAGES.find((p) => p.key === key);
  if (!page) throw new Error(`Unknown page key: ${key}`);
  return page;
}

export function nextStep(key) {
  const page = getPage(key);
  if (!page.step) return null;
  return WORKFLOW_STEPS.find((p) => p.step === page.step + 1) || null;
}
```

- [ ] **Step 4: Run the registry test**

Run: `npm --prefix ui test -- src/config/pages.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing NavBar test `ui/src/components/NavBar.test.jsx`**

```jsx
import React from "react";
import { it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NavBar from "./NavBar";
import { PAGES, NAV_GROUPS } from "../config/pages";
import { mockFetchEmpty } from "../test/renderPage";

it("builds the menu from the page registry, grouped by workflow", async () => {
  mockFetchEmpty();
  await act(async () => {
    render(
      <MemoryRouter>
        <NavBar isOpen isSidebarOpen toggleSidebar={() => {}} />
      </MemoryRouter>
    );
  });
  for (const p of PAGES) expect(screen.getAllByText(p.label).length).toBeGreaterThan(0);
  for (const g of NAV_GROUPS.filter((g) => g.title)) expect(screen.getByText(g.title)).toBeInTheDocument();
  expect(screen.queryByText("Runs")).toBeNull();
});
```

Run: `npm --prefix ui test -- src/components/NavBar.test.jsx`
Expected: FAIL (no "Audit Trail", no "ขั้นตอนการทำงาน").

- [ ] **Step 6: Derive the NavBar menu from the registry**

In `ui/src/components/NavBar.jsx`, add `import { PAGES, NAV_GROUPS } from "../config/pages";` after the existing imports. Replace the whole `const menuGroups = [ ... ];` literal (the three hard-coded groups "", "SQL", "Data Engineering") with:

```js
  const NAV_ICONS = {
    home: <HomeIcon />, guide: <GuideIcon />, schema: <SchemaIcon />, pipeline: <PipelineIcon />,
    dashboard: <DashboardIcon />, rules: <RulesIcon />, export: <ExportIcon />,
    analytics: <AnalyticsIcon />, whitebox: <RunsIcon />, ingestion: <IngestionIcon />
  };
  const NAV_BADGES = {
    schema: schemaCount > 0 ? schemaCount : null,
    rules: aiRulesCount > 0 ? aiRulesCount : null
  };
  const menuGroups = NAV_GROUPS.map((g) => ({
    title: g.title,
    key: g.key,
    links: PAGES.filter((p) => p.group === g.key).map((p) => ({
      to: p.key === "rules" && aiRulesCount > 0 ? "/rules?tab=proposals" : p.path,
      label: p.label,
      subtitle: p.subtitle,
      stepTag: p.step ? String(p.step) : undefined,
      icon: NAV_ICONS[p.key],
      badge: NAV_BADGES[p.key] ?? null
    }))
  }));
```

Replace the `filteredLinks` filter body so Thai subtitles are searchable too:

```js
  const q = searchQuery.toLowerCase();
  const filteredLinks = allLinks.filter((link) =>
    link.label.toLowerCase().includes(q) ||
    link.category.toLowerCase().includes(q) ||
    (link.subtitle || "").toLowerCase().includes(q)
  );
```

Run: `npm --prefix ui test -- src/components/NavBar.test.jsx`
Expected: PASS.

- [ ] **Step 7: Move `DatabricksTileCard` to `ui/src/components/ui/TileCard.jsx`**

Create the file with `import React from "react";` and `import { Icon } from "../UiIcons";`, then cut the whole `export function DatabricksTileCard({...}) {...}` function out of `WorkflowJourneyBar.jsx` (from its doc comment down to the function's closing brace, before `export default function WorkflowJourneyBar`), paste it unchanged, and rename the declaration to `export default function TileCard(`. If the moved function uses any other helper from `WorkflowJourneyBar.jsx`, move that helper too.

- [ ] **Step 8: Remove the unused journey bar and dead pages, fix imports**

`WorkflowJourneyBar` (default export) is imported by 10 pages but rendered by none; `JOURNEY_STEPS` duplicates page names with conflicting labels. In each page:
- `import WorkflowJourneyBar from '...WorkflowJourneyBar';` → delete the line.
- `import WorkflowJourneyBar, { DatabricksTileCard } from "...WorkflowJourneyBar";` → `import TileCard from "../components/ui/TileCard";`
- In `DataExport.jsx`, `Ingestion.jsx`, `Pipeline.jsx`, `RulesConfig.jsx`: rename every `<DatabricksTileCard` to `<TileCard`.

Then delete `ui/src/components/WorkflowJourneyBar.jsx` and the four unrouted pages:

```bash
git rm ui/src/components/WorkflowJourneyBar.jsx ui/src/pages/Grafana.jsx ui/src/pages/Hdfs.jsx ui/src/pages/Kibana.jsx ui/src/pages/Metadata.jsx
```

Verify nothing still references them: search `ui/src` for `WorkflowJourneyBar|DatabricksTileCard|pages/Grafana|pages/Hdfs|pages/Kibana|pages/Metadata`. Expected: no matches.

- [ ] **Step 9: Full test run and commit**

Run: `npm --prefix ui test`
Expected: PASS (text budgets may drop slightly because nothing visible was removed; they must not rise).

```bash
git add -A ui/src
git commit -m "refactor(ui): single page registry drives nav labels, groups and workflow order"
```

---

### Task 3: Shared UI kit (PageHeader, InfoHint, LearnMore, NextStepLink)

**Files:**
- Create: `ui/src/components/ui/PageHeader.jsx`, `InfoHint.jsx`, `LearnMore.jsx`, `NextStepLink.jsx`, `index.js`, `ui.css`, `ui.test.jsx`

**Interfaces:**
- Consumes: `getPage`, `nextStep`, `WORKFLOW_STEPS` (Task 2).
- Produces: `import { PageHeader, InfoHint, LearnMore, NextStepLink, TileCard } from "../components/ui";` and button classes `ui-btn ui-btn-primary`, `ui-btn ui-btn-secondary`, `ui-btn-link` (the pages have no shared secondary/link button class today).
  - `<PageHeader pageKey="pipeline" actions={<button/>} />`
  - `<InfoHint text="..." label="คำอธิบาย" />`
  - `<LearnMore summary="เรียนรู้เพิ่มเติม">...</LearnMore>`
  - `<NextStepLink from="pipeline" />`

- [ ] **Step 1: Write the failing tests `ui/src/components/ui/ui.test.jsx`**

```jsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PageHeader, InfoHint, LearnMore, NextStepLink } from "./index";
import { getPage } from "../../config/pages";
import { visibleText } from "../../test/visibleText";

describe("PageHeader", () => {
  it("uses the nav label as the title and shows the step and subtitle", () => {
    render(<PageHeader pageKey="pipeline" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Jobs & Pipelines");
    expect(screen.getByText(getPage("pipeline").subtitle)).toBeInTheDocument();
    expect(screen.getByText("ขั้นที่ 3/4")).toBeInTheDocument();
  });

  it("renders actions and no step chip for non-workflow pages", () => {
    render(<PageHeader pageKey="schema" actions={<button>ทำ</button>} />);
    expect(screen.getByRole("button", { name: "ทำ" })).toBeInTheDocument();
    expect(screen.queryByText(/ขั้นที่/)).toBeNull();
  });

  it("throws for an unknown page key", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PageHeader pageKey="nope" />)).toThrow(/Unknown page key/);
  });
});

describe("InfoHint", () => {
  it("keeps the explanation hidden until hovered", () => {
    render(<InfoHint text="คำอธิบายยาว" />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "คำอธิบาย" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("คำอธิบายยาว");
  });

  it("opens on keyboard focus and closes on Escape", () => {
    render(<InfoHint text="x" />);
    const btn = screen.getByRole("button", { name: "คำอธิบาย" });
    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("toggles on tap for touch screens", () => {
    render(<InfoHint text="x" />);
    fireEvent.click(screen.getByRole("button", { name: "คำอธิบาย" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

describe("LearnMore", () => {
  it("shows only its summary until opened", () => {
    const { container } = render(<LearnMore summary="ทำไม">รายละเอียดยาวมาก</LearnMore>);
    expect(visibleText(container)).toBe("ทำไม");
  });
});

describe("NextStepLink", () => {
  it("links to the next workflow page", () => {
    render(<MemoryRouter><NextStepLink from="pipeline" /></MemoryRouter>);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("ถัดไป: Workspace Exports");
    expect(link).toHaveAttribute("href", "/export");
  });

  it("renders nothing after the last step", () => {
    const { container } = render(<MemoryRouter><NextStepLink from="export" /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix ui test -- src/components/ui/ui.test.jsx`
Expected: FAIL, cannot resolve `./index`.

- [ ] **Step 3: Implement the components**

`ui/src/components/ui/PageHeader.jsx`:

```jsx
import React from "react";
import { getPage, WORKFLOW_STEPS } from "../../config/pages";

export default function PageHeader({ pageKey, actions = null }) {
  const page = getPage(pageKey);
  return (
    <header className="ui-page-header">
      <div>
        {page.step && <span className="ui-page-step">ขั้นที่ {page.step}/{WORKFLOW_STEPS.length}</span>}
        <h1 className="ui-page-title">{page.label}</h1>
        {page.subtitle && <p className="ui-page-subtitle">{page.subtitle}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}
```

`ui/src/components/ui/InfoHint.jsx`:

```jsx
import React, { useId, useState } from "react";

export default function InfoHint({ text, label = "คำอธิบาย" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="ui-infohint">
      <button
        type="button"
        className="ui-infohint-btn"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >
        ?
      </button>
      {open && <span role="tooltip" id={id} className="ui-infohint-pop">{text}</span>}
    </span>
  );
}
```

`ui/src/components/ui/LearnMore.jsx`:

```jsx
import React from "react";

export default function LearnMore({ summary = "เรียนรู้เพิ่มเติม", children }) {
  return (
    <details className="ui-learn-more">
      <summary>{summary}</summary>
      <div className="ui-learn-more-body">{children}</div>
    </details>
  );
}
```

`ui/src/components/ui/NextStepLink.jsx`:

```jsx
import React from "react";
import { Link } from "react-router-dom";
import { nextStep } from "../../config/pages";

export default function NextStepLink({ from }) {
  const next = nextStep(from);
  if (!next) return null;
  return (
    <Link className="ui-next-step" to={next.path}>
      ถัดไป: {next.label} →
    </Link>
  );
}
```

`ui/src/components/ui/index.js`:

```js
import "./ui.css";
export { default as PageHeader } from "./PageHeader";
export { default as InfoHint } from "./InfoHint";
export { default as LearnMore } from "./LearnMore";
export { default as NextStepLink } from "./NextStepLink";
export { default as TileCard } from "./TileCard";
```

`ui/src/components/ui/ui.css`:

```css
.ui-page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; padding-bottom: 16px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); }
.ui-page-step { display: inline-block; margin-bottom: 4px; font-size: 11px; font-weight: 600; color: var(--text-muted); }
.ui-page-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--text-main); }
.ui-page-subtitle { margin: 4px 0 0; font-size: 13px; color: var(--text-muted); }
.ui-page-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.ui-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid transparent; border-radius: 6px; font-size: 12px; font-weight: 700; text-decoration: none; cursor: pointer; }
.ui-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.ui-btn-primary { background: var(--db-navy); color: var(--bg-secondary); }
.ui-btn-primary:hover:not(:disabled) { background: var(--db-navy-hover); }
.ui-btn-secondary { background: var(--bg-secondary); color: var(--text-main); border-color: var(--border-dark); }
.ui-btn-secondary:hover:not(:disabled) { border-color: var(--accent-blue); }
.ui-btn-link { padding: 0; border: none; background: none; color: var(--accent-blue); font-size: 11px; font-weight: 600; cursor: pointer; }
.ui-btn:focus-visible, .ui-btn-link:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 2px; }

.ui-infohint { position: relative; display: inline-flex; margin-left: 6px; vertical-align: middle; }
.ui-infohint-btn { width: 16px; height: 16px; padding: 0; border-radius: 50%; border: 1px solid var(--border-dark); background: var(--bg-secondary); color: var(--text-muted); font-size: 10px; font-weight: 700; line-height: 1; cursor: help; }
.ui-infohint-btn:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 2px; }
.ui-infohint-pop { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); width: 240px; padding: 8px 10px; border-radius: 8px; background: var(--text-main); color: var(--bg-secondary); font-size: 12px; font-weight: 400; line-height: 1.5; box-shadow: var(--shadow-lg); z-index: 1000; }

.ui-learn-more { margin-top: 12px; }
.ui-learn-more > summary { cursor: pointer; font-size: 12px; font-weight: 600; color: var(--accent-blue); }
.ui-learn-more-body { margin-top: 8px; font-size: 13px; line-height: 1.6; color: var(--text-secondary); }

.ui-next-step { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 6px; background: var(--db-emerald); color: var(--bg-secondary); font-size: 13px; font-weight: 700; text-decoration: none; }

@media (max-width: 640px) {
  .ui-page-header { align-items: flex-start; }
  .ui-infohint-pop { left: auto; right: 0; transform: none; }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix ui test -- src/components/ui/ui.test.jsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/ui
git commit -m "feat(ui): shared PageHeader, InfoHint, LearnMore, NextStepLink"
```

---

### Task 4: Jobs & Pipelines (`/pipeline`)

**Files:**
- Modify: `ui/src/pages/Pipeline.jsx`, `ui/src/pages/Pipeline.css`, `ui/src/test/text-budget.json`
- Create: `ui/src/pages/Pipeline.test.jsx`

**Interfaces:**
- Consumes: `PageHeader`, `InfoHint`, `NextStepLink`, `TileCard`, `renderPage`, `apply-budget.mjs`.

- [ ] **Step 1: Tighten the budget and add the honesty test (both fail)**

Run: `node ui/scripts/apply-budget.mjs pipeline`

Create `ui/src/pages/Pipeline.test.jsx`:

```jsx
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
```

Run: `npm --prefix ui test -- src/pages/Pipeline.test.jsx src/test/textBudget.test.jsx`
Expected: FAIL on the pipeline budget, the doubled-label check, and both new tests.

- [ ] **Step 2: Replace fabricated fallback counts**

Replace the block that starts `const m = wbState?.metrics || {};` and ends with `const invalidRangeCount = m.invalid_range_count ?? 200;` with:

```js
  const m = wbState?.metrics ?? null;
  const totalRows = m?.total_rows ?? null;
  const initialOutlierCount = m?.initial_outlier_count ?? null;
  const cleanRowsCount = m?.clean_rows ?? null;
  const reviewRowsCount = m?.review_rows ?? null;
  const quarantineRowsCount = m?.quarantine_rows ?? null;
  const gate1Quarantined = m?.gate1_quarantined ?? null;
  const gate2Quarantined = m?.gate2_quarantined ?? null;
  const missingScoreCount = m?.missing_score_count ?? null;
  const invalidRangeCount = m?.invalid_range_count ?? null;
  const fmt = (n) => (typeof n === "number" ? n.toLocaleString() : "—");
  const pct = (n) => (typeof n === "number" && totalRows ? Math.round((n / totalRows) * 100) : 0);
```

Then in the file: every `X.toLocaleString()` on these variables becomes `fmt(X)`; every `(wbState?.metrics?.total_rows ?? 10100)` becomes `totalRows`; every `Math.round((X / 10100) * 100)` becomes `pct(X)`; remove any remaining uses of `gate1Passed` and `gate2Passed`. Disable the review-queue approve/quarantine buttons when `!initialOutlierCount`.

- [ ] **Step 3: Header**

Add `import { PageHeader, InfoHint, NextStepLink } from "../components/ui";`. Replace the whole `{/* Header & Gold Layer Rebuild Panel */}` block (the `gs-page-header` div including the "Gold Layer Aggregation" card) with:

```jsx
      <PageHeader
        pageKey="pipeline"
        actions={
          <>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => triggerConfirm(
              "สร้าง Gold Layer ใหม่?",
              "ระบบจะรวมข้อมูล Clean ล่าสุดเป็นตารางสำหรับ Dashboard อาจใช้เวลาสักครู่",
              handleGoldRebuild
            )} disabled={goldRebuilding}>
              {goldRebuilding ? "กำลังสร้าง..." : "สร้าง Gold ใหม่"}
            </button>
            <button type="button" className="ui-btn ui-btn-primary" onClick={handleRunPipelineRules} disabled={executingRules}>
              {executingRules ? "กำลังรัน..." : "รัน Pipeline"}
            </button>
          </>
        }
      />
```

Inside the `{/* Interactive Pipeline Rule Execution & 3-Way Routing Workspace */}` card, delete the top row: the three badge spans ("SILVER PIPELINE · QUALITY GATES", "Target Dataset …", "Validated (…)"), the `<h3>` "Silver Quality Gates & Dataset Routing Console", its description `<p>`, and the old "Execute Silver Pipeline" button (now in the header). Put this in their place:

```jsx
          <div className="pl-dataset-line">
            ชุดข้อมูล <code>{wbState?.dataset_name || "—"}</code> · {fmt(totalRows)} แถว
          </div>
          {!m && <div className="pl-notice">ยังไม่มีผลการรันสำหรับชุดข้อมูลนี้</div>}
```

- [ ] **Step 4: One compact funnel instead of the 4-box gate grid**

Replace the whole `{/* Live Step-by-Step Rule Execution Funnel */}` block (including the helper line "คลิกที่ด่านหรือการ์ดด้านล่าง…") with:

```jsx
          <div className="pl-funnel">
            {[
              { label: "นำเข้า", value: totalRows, zone: "ALL" },
              { label: "Gate 1 กักกัน", value: gate1Quarantined, zone: "QUARANTINE", tone: "red" },
              { label: "Gate 2 กักกัน", value: gate2Quarantined, zone: "QUARANTINE", tone: "red" },
              { label: "Review", value: reviewRowsCount, zone: "REVIEW", tone: "amber" },
              { label: "Clean", value: cleanRowsCount, zone: "CLEAN", tone: "green" }
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                className={`pl-funnel-step ${s.tone || ""} ${selectedZone === s.zone ? "active" : ""}`}
                onClick={() => setSelectedZone(s.zone)}
              >
                <span className="pl-funnel-value">{fmt(s.value)}</span>
                <span className="pl-funnel-label">{s.label}</span>
              </button>
            ))}
          </div>
```

Add to `ui/src/pages/Pipeline.css`:

```css
.pl-dataset-line { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.pl-notice { padding: 8px 12px; margin-bottom: 12px; border-radius: 6px; background: var(--db-amber-light); color: var(--db-amber); font-size: 12px; font-weight: 600; }
.pl-funnel { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
.pl-funnel-step { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--border-color); border-left: 3px solid var(--db-navy); border-radius: 6px; background: var(--bg-secondary); text-align: left; cursor: pointer; }
.pl-funnel-step.red { border-left-color: var(--db-red); }
.pl-funnel-step.amber { border-left-color: var(--db-amber); }
.pl-funnel-step.green { border-left-color: var(--db-emerald); }
.pl-funnel-step.active { outline: 2px solid var(--accent-blue); }
.pl-funnel-value { font-size: 18px; font-weight: 700; color: var(--text-main); }
.pl-funnel-label { font-size: 11px; color: var(--text-muted); }
@media (max-width: 720px) { .pl-funnel { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
```

- [ ] **Step 5: Drop the duplicate toolbar**

Delete the whole `{/* Databricks Filter & Segmented Toolbar (Matches Learn & Workspace UI) */}` block: the fake "Filter pipeline tables..." span, the four segmented zone buttons, and the "Dispatch Upstream Ticket" button (the Quarantine tile keeps the working "แจ้งแก้ต้นทาง" button that calls the same handler).

- [ ] **Step 6: Shorter tiles**

In the three `<TileCard>` elements set:

| Tile | `category` | `title` | `subtitle` | add after the title |
|---|---|---|---|---|
| Clean | `"Clean"` | `` `${fmt(cleanRowsCount)} แถว` `` | `` `score ${wbState?.min_score ?? 0}–${wbState?.max_score ?? 100} · ไม่มีค่าว่าง` `` | — |
| Review | `"Review"` | `` `${fmt(reviewRowsCount)} แถว` `` | `"study_hours สูงผิดปกติ"` | `<InfoHint text={\`แถวที่ study_hours เกิน Q3 + ${wbState?.tukey_multiplier || "3.0"}×IQR ถูกส่งให้คนตรวจแทนการลบทิ้ง\`} />` inside `footerSlot`, before the buttons |
| Quarantine | `"Quarantine"` | `` `${fmt(quarantineRowsCount)} แถว` `` | `` `ค่าว่าง ${fmt(missingScoreCount)} · นอกช่วง ${fmt(invalidRangeCount)} · ซ้ำ ${fmt(gate2Quarantined)}` `` | — |

Clean tile footer: replace `Target: gold_analytics_table` + "กรองดูในตาราง" with a single button "ดูในตาราง" (same `onClick`). Review buttons: `อนุมัติเข้า Clean (+N)` → `อนุมัติ`, `อนุมัติแล้ว (+N)` → `อนุมัติแล้ว`, `กักกัน` stays, `คืนค่า` stays. Quarantine: `ดูรายการที่กักกัน (N)` → `ดูในตาราง`. Confirmation messages for these buttons: `ย้าย ${fmt(initialOutlierCount)} แถวจาก Review ไป Clean? กด "คืนค่า" เพื่อย้อนกลับได้` and `ย้าย ${fmt(initialOutlierCount)} แถวจาก Review ไป Quarantine? กด "คืนค่า" เพื่อย้อนกลับได้`, titles `อนุมัติ Review ทั้งหมด?` / `กักกัน Review ทั้งหมด?`.

- [ ] **Step 7: Record table and footer copy**

| Find | Replace with |
|---|---|
| `ตารางตรวจสอบ แก้ไขค่า และตัดสินใจระดับเรคคอร์ด (Record-Level Inspection &amp; Inline Fix)` | `ตรวจสอบรายแถว` |
| placeholder `ค้นหา Row ID (#48, #73, #105), รหัสนักศึกษา, วิชา...` | `ค้นหา Row ID, รหัสนักศึกษา, วิชา` |
| zone tab labels `` `ทั้งหมด (${...})` `` etc. | `` `ทั้งหมด ${fmt(totalRows)}` ``, `` `Quarantine ${fmt(quarantineRowsCount)}` ``, `` `Review ${fmt(reviewRowsCount)}` ``, `` `Clean ${fmt(cleanRowsCount)}` `` |
| `ZONE_ROW_COLUMNS` labels `คะแนน (Score)`, `ชม.เรียน (Study Hours)`, `หลักฐานการคัดแยก (Rule Evidence)` | `คะแนน`, `ชม.เรียน`, `เหตุผล` |
| `การจัดการ (Action)` header | `จัดการ` |
| footer `แสดง … — ข้อมูลจริงจาก /api/v1/whitebox/preview-zone` | `` `แสดง ${zoneData.rows?.length || 0} จาก ${fmt(zoneData.matched_rows ?? zoneData.total_zone_rows ?? 0)} แถว` `` |
| the whole `{/* Single Primary Action Button */}` Link | `<div className="pl-next"><NextStepLink from="pipeline" /></div>` (add `.pl-next { margin-top: 20px; display: flex; justify-content: flex-end; }` to the CSS) |
| `<details>` summary `บันทึกประวัติการประมวลผลคลัสเตอร์ย้อนหลัง &amp; Gold Rebuild (Cluster Execution Runs &amp; Audit Logs) ▼` | `ประวัติการรัน` |

Delete the `executionStep` badge text (`Evaluating Gate ${executionStep}/3...`); the header button already shows "กำลังรัน...". Leave `executionStep` state in place only if something else still reads it; otherwise delete the state and its setters.

- [ ] **Step 8: Run tests**

Run: `npm --prefix ui test -- src/pages/Pipeline.test.jsx src/test/textBudget.test.jsx`
Expected: PASS for pipeline. If the budget is still exceeded by under 10% after every listed change, stop and report the measured number instead of cutting unlisted content.

- [ ] **Step 9: Live check**

```bash
docker compose build ui && docker compose up -d ui
```

Open `http://localhost/pipeline` in the Browser pane (ask the user to log in if needed), take screenshots at desktop width and with `resize_window` preset `mobile`, then reset to `desktop`. Check: title "Jobs & Pipelines", 5-step funnel fits on one row at desktop and two columns on mobile, one zone filter, confirm modals still appear.

- [ ] **Step 10: Commit**

```bash
git add ui/src/pages/Pipeline.jsx ui/src/pages/Pipeline.css ui/src/pages/Pipeline.test.jsx ui/src/test/text-budget.json
git commit -m "feat(ui): simplify Jobs & Pipelines — one header, one filter, no invented counts"
```

---

### Task 5: Catalog (`/schema`)

**Files:** Modify `ui/src/pages/Schema.jsx`, `ui/src/test/text-budget.json`

- [ ] **Step 1: Tighten the budget (fails)**

Run: `node ui/scripts/apply-budget.mjs schema && npm --prefix ui test -- src/test/textBudget.test.jsx`
Expected: FAIL for `schema`.

- [ ] **Step 2: Header**

Add `import { PageHeader, LearnMore } from "../components/ui";`. Replace the `{/* 1. Page Header */}` block (the orange "UNITY CATALOG · …" tag, the `<h1>` and the `gs-page-desc` paragraph) with `<PageHeader pageKey="schema" />`.

- [ ] **Step 3: Copy changes**

| Find | Replace with |
|---|---|
| summary `+ จำลองการเปลี่ยนแปลงโครงสร้างตาราง (Register Schema Change — Simulation Tool)` | `จำลองการเปลี่ยน Schema (สำหรับทดสอบ)` |
| `1. ชื่อตาราง (Target Table):` | `ตาราง` |
| `2. คอลัมน์ที่เปลี่ยน/เพิ่มใหม่ (Column Name):` | `คอลัมน์` |
| `3. ชนิดข้อมูล (Data Type):` | `ชนิดข้อมูล` |
| `4. ประเภทความเปลี่ยนแปลง (Drift Type):` | `ประเภท` |
| option `NEW COLUMN (เพิ่มคอลัมน์ใหม่)` / `TYPE MISMATCH (ชนิดข้อมูลเปลี่ยน)` | `เพิ่มคอลัมน์` / `ชนิดข้อมูลเปลี่ยน` |
| submit `+ บันทึกการเปลี่ยนแปลงโครงสร้างตาราง (Register Schema Change)` | `บันทึก` |
| status tab text `{tab}` (PENDING / APPROVED / REJECTED) | `{STATUS_LABELS[tab]}` with `const STATUS_LABELS = { PENDING: "รออนุมัติ", APPROVED: "อนุมัติแล้ว", REJECTED: "ปฏิเสธ" };` at module top (keep `tab` as the filter value) |
| search placeholder `ค้นหาชื่อตาราง เช่น products, orders, users...` | `ค้นหาตาราง` |
| `<h3>{statusFilter} Proposals ({filteredProposals.length})</h3>` | `<h3>{filteredProposals.length} รายการ</h3>` |
| `Approve All` / `Reject All` | `อนุมัติทั้งหมด` / `ปฏิเสธทั้งหมด` |
| `formatProposedTime` return `` `Detected ${day}/${month} at ${hours}:${minutes}` `` | `` `${day}/${month} ${hours}:${minutes}` `` |
| `<h2>Table Evolution Workspace: {selectedProposal.table_name}</h2>` | `<h2>{selectedProposal.table_name}</h2>` |
| `Run UUID: {selectedProposal.run_id}` | `Run {selectedProposal.run_id}` |
| `Approve Evolution` / `Reject & Quarantine` / `Rejecting...` | `อนุมัติ` / `ปฏิเสธ` / `กำลังปฏิเสธ...` |
| `Detected Drift Mutations` | `สิ่งที่เปลี่ยน` |
| `Approval Override Parameters` heading + `gs-sub-desc` paragraph | heading `ตั้งค่าก่อนอนุมัติ`; delete the paragraph |
| `Primary Key Column` / `Partition Date Column` labels | `Primary Key` / `Partition Date` |
| placeholder text `Select a schema proposal from the left pane to analyze structural drift mutations and configure overrides.` | `เลือกรายการทางซ้ายเพื่อดูรายละเอียด` |
| `Loading proposals...` / `Failed to load proposals` / `No {statusFilter.toLowerCase()} proposals found` | `กำลังโหลด...` / `โหลดรายการไม่สำเร็จ` / `ไม่มีรายการ` |

Confirmation modals (titles / messages):
- approve-all: `อนุมัติทั้งหมด?` / `` `อนุมัติ ${filteredProposals.length} รายการและอัปเดต Schema ทันที ย้อนกลับไม่ได้` ``
- reject-all: `ปฏิเสธทั้งหมด?` / `` `ปฏิเสธ ${filteredProposals.length} รายการ ย้อนกลับไม่ได้` ``
- approve: `อนุมัติการเปลี่ยน Schema?` / `` `ตาราง ${selectedProposal.table_name} จะถูกอัปเดตทันที ย้อนกลับไม่ได้` ``
- reject: `ปฏิเสธการเปลี่ยน Schema?` / `` `ตาราง ${selectedProposal.table_name} ข้อมูลที่เกี่ยวข้องจะถูกกักกัน ย้อนกลับไม่ได้` ``

- [ ] **Step 4: Collapse the JSON viewer**

Wrap the whole "Proposed Delta Schema JSON" block (its `<h4>` and the line-numbered viewer) in `<LearnMore summary="ดู Schema ที่เสนอ (JSON)"> … </LearnMore>` and delete the `<h4>`.

- [ ] **Step 5: Test, live check, commit**

Run: `npm --prefix ui test`
Expected: PASS.
Rebuild the `ui` container and screenshot `/schema` at desktop and mobile (as in Task 4 Step 9). Check the confirm modals still open and the JSON opens from "ดู Schema ที่เสนอ".

```bash
git add ui/src/pages/Schema.jsx ui/src/test/text-budget.json
git commit -m "feat(ui): simplify Catalog — Thai single-language labels, JSON on demand"
```

---

### Task 6: Expectations & Alerts (`/rules`)

**Files:** Modify `ui/src/pages/RulesConfig.jsx`, `ui/src/test/text-budget.json`; Create `ui/src/pages/RulesConfig.test.jsx`; Delete `ui/src/components/Tooltip.jsx`

- [ ] **Step 1: Tighten the budget and add tests (fail)**

Run: `node ui/scripts/apply-budget.mjs rules`

Create `ui/src/pages/RulesConfig.test.jsx`:

```jsx
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
```

Run: `npm --prefix ui test -- src/pages/RulesConfig.test.jsx src/test/textBudget.test.jsx`
Expected: FAIL.

- [ ] **Step 2: Header with the page's two main actions**

Add `import { PageHeader, InfoHint, NextStepLink, LearnMore } from "../components/ui";`. Replace the `{/* 1. Page Header */}` block with:

```jsx
      <PageHeader
        pageKey="rules"
        actions={
          <>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => fetchWbAiContext(true)} disabled={wbAiLoading}>
              {wbAiLoading ? "กำลังอธิบาย..." : "อธิบายด้วย AI"}
            </button>
            <button type="button" className="ui-btn ui-btn-primary" onClick={handleConfirmWhiteBoxRules} disabled={wbConfirming}>
              {wbConfirming ? "กำลังบันทึก..." : wbConfirmedAt ? `บันทึกแล้ว ${wbConfirmedAt} · บันทึกอีกครั้ง` : "บันทึกกฎ"}
            </button>
          </>
        }
      />
```

In the `{/* Interactive Rule Formulation & Confirmation Workspace */}` card delete: the chip row ("DELTA EXPECTATIONS · SPECIFICATIONS", "Target Table", row count, "AI Contextual Reasoning (model)"), the `<h3>` "Delta Expectations & Business Constraint Rules", its one-line description, and the two old buttons (moved to the header). Put in their place:

```jsx
          <div className="gs-rules-dataset-line">
            ชุดข้อมูล <code>{wbDatasetName}</code> · {typeof wbTotalRows === "number" ? wbTotalRows.toLocaleString() : "—"} แถว
          </div>
```

and add `.gs-rules-dataset-line { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; }` to `RulesConfig.css`.

- [ ] **Step 3: Remove the fake toolbar**

Delete the entire `{/* Databricks Filter & Segmented Toolbar (Matches Learn & Workspace UI) */}` block (the "Search expectations..." span, the four span "tabs", the repeated "Active dataset" line). None of them had handlers.

- [ ] **Step 4: Tiles**

| Tile | `category` | `title` | keep `subtitle` | extra |
|---|---|---|---|---|
| 1 | `"กฎที่ 1"` | `"ช่วงคะแนนและค่าว่าง"` | yes (the SQL-like expression) | — |
| 2 | `"กฎที่ 2"` | `"ห้ามคีย์ซ้ำ"` | yes | — |
| 3 | `"กฎที่ 3"` | `"ค่าผิดปกติ (IQR)"` | yes | `<InfoHint text="ใช้ Tukey fence: ค่าที่เกิน Q3 + k×IQR ถูกส่งไป Review k=3.0 เข้มน้อยกว่า k=1.5" />` next to the "Tukey Multiplier" label |

In all three tiles change the toggle text `ปรับแต่งเกณฑ์พารามิเตอร์ (Configure) ⚙️` to `ปรับค่า`. Labels `Min score` / `Max score` / `Natural Key` / `Tukey Multiplier` → `คะแนนต่ำสุด` / `คะแนนสูงสุด` / `คีย์หลัก` / `ตัวคูณ k`.

- [ ] **Step 5: Real pass rates in the summary table**

Above the `return (` add:

```js
  const liveTotal = typeof wbLiveMetrics?.total_rows === "number" ? wbLiveMetrics.total_rows : null;
  const flaggedText = (n) => (typeof n === "number" ? `${n.toLocaleString()} แถว` : "—");
  const passRateText = (n) =>
    typeof n === "number" && liveTotal ? `${(((liveTotal - n) / liveTotal) * 100).toFixed(1)}%` : "—";
```

In the `{/* Databricks Borderless Table Summary … */}` table: headers `Expectation Name ↑`, `Target Column`, `On Violation`, `Flagged Rows`, `Pass Rate` → `กฎ`, `คอลัมน์`, `เมื่อไม่ผ่าน`, `แถวที่ติด`, `ผ่าน`. Row values: `QUARANTINE` → `กักกัน`, `QUARANTINE_DUPLICATES` → `กักกันแถวซ้ำ`, `HOLD_FOR_REVIEW` → `ส่ง Review`. Flagged cells: `flaggedText(wbLiveMetrics?.gate1_quarantined)`, `flaggedText(wbLiveMetrics?.gate2_quarantined)`, `flaggedText(wbLiveMetrics?.initial_outlier_count)`. Pass-rate cells: `passRateText(...)` with the same three values (replacing the literal `95.0%`, `99.0%`, `99.0%`).

Anywhere else in the file, replace `?? 9400`, `?? 500`, `?? 100` fallbacks on `wbLiveMetrics`/`m` counts with `?? null` and render through `flaggedText` or `"—"`.

- [ ] **Step 6: Next step, advanced section, Tooltip**

- Replace the `{/* Single Primary Action Button */}` Link with `<div className="gs-rules-next"><NextStepLink from="rules" /></div>` and add `.gs-rules-next { margin-top: 20px; display: flex; justify-content: flex-end; }` to `RulesConfig.css`.
- `<details>` summary `จัดการกฎสารบัญตารางอื่น &amp; AI Proposals (Multi-Table Registry / YAML) ▼` → `ตั้งค่าขั้นสูง: ตารางอื่น, AI, Governance`.
- Tab buttons `Table Rules`, `AI Proposals`, `AI Settings`, `Upstream Governance`, `Standardization Review` → `กฎรายตาราง`, `ข้อเสนอจาก AI`, `ตั้งค่า AI`, `แจ้งแก้ต้นทาง`, `มาตรฐานข้อมูล` (keep badges).
- Replace `import Tooltip from "../components/Tooltip";` with nothing (InfoHint is already imported) and each `<Tooltip text={...} />` with `<InfoHint text={...} />`. Then `git rm ui/src/components/Tooltip.jsx` and confirm no file under `ui/src` still imports it.

- [ ] **Step 7: Test, live check, commit**

Run: `npm --prefix ui test`
Expected: PASS.
Rebuild `ui`, screenshot `/rules` at desktop and mobile. Check "บันทึกกฎ" still opens its confirmation and the advanced section still opens every tab.

```bash
git add -A ui/src
git commit -m "feat(ui): simplify Expectations & Alerts — actions in header, real pass rates, no fake toolbar"
```

---

### Task 7: Data Ingestion (`/ingestion`)

**Files:** Modify `ui/src/pages/Ingestion.jsx`, `ui/src/test/text-budget.json`

- [ ] **Step 1: Tighten the budget (fails)**

Run: `node ui/scripts/apply-budget.mjs ingestion && npm --prefix ui test -- src/test/textBudget.test.jsx`
Expected: FAIL for `ingestion`.

- [ ] **Step 2: Header and source picker**

Add `import { PageHeader, LearnMore, NextStepLink } from "../components/ui";`.
- Replace `{/* 1. Page Header (Databricks Single-Title Header) */}` block ("Add Data" + "Create or ingest tables into …") with `<PageHeader pageKey="ingestion" />`.
- In `{/* Databricks Single-Row Search & Segmented Filter Toolbar */}` delete the fake "Search data sources..." box and the `Active: {activeSourceSummary}` text; keep the four source buttons with labels `ไฟล์`, `ฐานข้อมูล`, `API`, `Stream`.
- In `{/* PART 1: UNIFIED SOURCE CONNECTOR FORM */}` delete the second picker (the `[{ id: "csv", icon: "folder", title: "File Upload", sub: "CSV, Excel, Parquet" }].map(...)` buttons). It duplicates the buttons above and has only one option.

- [ ] **Step 3: Profiling section**

| Find | Replace with |
|---|---|
| `<Icon name="search" /> Automated Schema &amp; Quality Profile` | `ผลสำรวจข้อมูล` |
| `, 8 columns` inside the meta line | delete (hard-coded) |
| `Generate AI Summary` / `Analyzing...` | `สรุปด้วย AI` / `กำลังสรุป...` |
| `Re-scan Profile` / `Scanning...` | `สแกนใหม่` / `กำลังสแกน...` |
| the "Configure Delta Expectations (n/3 Selected)" `<Link to="/rules">` | `<NextStepLink from="ingestion" />` |
| `Record Explorer · ค้นหาและตรวจสอบเรคคอร์ดในตาราง ({primaryDatasetName}):` | `ค้นหาเรคคอร์ด` |
| eyebrows `PROFILE METRIC 01 · COLUMN: score`, `PROFILE METRIC 02 · COMPOSITE KEY`, `PROFILE METRIC 03 · COLUMN: study_hours` | `score`, `คีย์รวม`, `study_hours` |
| `1. ขอบเขตค่าและอัตราค่าว่าง (Range & Completeness)` | `ค่าว่างและช่วงค่า` |
| `2. ความไม่ซ้ำของคีย์หลัก (Primary Key Uniqueness)` | `คีย์ซ้ำ` |
| `3. การกระจายตัวและค่าผิดปกติ (Distribution & IQR)` | `ค่าผิดปกติ` |

Wrap the `{/* Databricks-style AI Contextual Summary Banner */}` block in `<LearnMore summary="สรุปจาก AI"> … </LearnMore>` and delete its "AI ASSISTANT · DATA PROFILE SUMMARY" and "Model: …" header row. In the fallback message template replace `(d.rows_ingested || 10100)` with `(d.rows_ingested ?? 0)`.

- [ ] **Step 4: Test, live check, commit**

Run: `npm --prefix ui test` → PASS. Rebuild `ui`, screenshot `/ingestion` desktop and mobile; upload a small CSV from `dummy_data/sample.csv` to confirm the form still works.

```bash
git add ui/src/pages/Ingestion.jsx ui/src/test/text-budget.json
git commit -m "feat(ui): simplify Data Ingestion — one source picker, AI summary on demand"
```

---

### Task 8: Workspace Exports (`/export`)

**Files:** Modify `ui/src/pages/DataExport.jsx`, `ui/src/test/text-budget.json`; Create `ui/src/pages/DataExport.test.jsx`

- [ ] **Step 1: Tighten the budget and add tests (fail)**

Run: `node ui/scripts/apply-budget.mjs export`

Create `ui/src/pages/DataExport.test.jsx`:

```jsx
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
```

Run: `npm --prefix ui test -- src/pages/DataExport.test.jsx src/test/textBudget.test.jsx` → FAIL.

- [ ] **Step 2: Header and console top**

Add `import { PageHeader } from "../components/ui";`. Replace `{/* 1. Page Header */}` with:

```jsx
      <PageHeader pageKey="export" actions={<Link to="/dashboard" className="ui-btn ui-btn-secondary">ดู Dashboard</Link>} />
```

In `{/* Interactive 3-Zone Export & Quality Deliverables Console */}` delete the eyebrow "GOLD CERTIFIED · LAKEHOUSE DELIVERABLES", the `<h3>` "ส่งออกชุดข้อมูลและรายงานการคัดแยก (Lakehouse Export & Deliverables Console)", the three legend chips, and the old "ดูภาพรวมความน่าเชื่อถือที่ Trust Dashboard" Link (now in the header). Keep the passed-rows chip, rewritten as `` `ผ่านการคัดกรองแล้ว ${typeof wbState?.metrics?.total_rows === "number" ? wbState.metrics.total_rows.toLocaleString() : "—"} แถว` ``.

- [ ] **Step 3: Remove the fake toolbar**

In `{/* Databricks Workspace Filter Toolbar … */}` delete the "Search" span and the `Type ▾`, `Owner ▾`, `Last modified ▾` and `Share` buttons. Keep one button, relabelled `ดาวน์โหลด Clean CSV` (it already calls `handleZoneCSVDownload("CLEAN")`).

Trust-check text: `` `Trust-Checked · Quality ${...}% (threshold ${...}%)` `` → `` `ผ่านเกณฑ์คุณภาพ ${trustCheck.quality_score?.toFixed(1) ?? "—"}% (เกณฑ์ ${trustCheck.quality_threshold}%)` ``; `` `Not Trust-Checked: ${...}` `` → `` `ยังไม่ผ่านการตรวจคุณภาพ: ${trustCheck.reason || "ไม่พบผลการรันที่ตรวจแล้ว"}` ``.

- [ ] **Step 4: One list of zones, not two**

Keep the zone table and delete the whole `{/* 3 Databricks Tile Cards … */}` block (the three `<TileCard>` zone tiles duplicate the table rows). Move the tiles' only unique feature, "show preview", into the table: in each row's Actions cell add, before "Copy API URL",

```jsx
<button type="button" className="ui-btn-link" onClick={() => loadZonePreview("CLEAN")}>ดูตัวอย่าง</button>
```

using `"REVIEW"` / `"QUARANTINE"` in the other two rows. (`loadZonePreview` is the function the deleted tiles called; it sets `selectedExportZone` and fetches the preview.) Table headers `Name ↑`, `Type`, `Rows`, `Actions` → `ไฟล์`, `ประเภท`, `แถว`, `จัดการ`; type cells `Gold Certified Table`, `Steward Review Queue`, `Quarantine Audit Log` → `Clean`, `Review`, `Quarantine`; `Copy API URL` / `Copied!` → `คัดลอก API URL` / `คัดลอกแล้ว`; `Download CSV` / `Downloaded` → `ดาวน์โหลด` / `ดาวน์โหลดแล้ว`. Replace `wbMetrics.* ?? 300/200/…` and `?? 10100` fallbacks with `?? null` rendered as `"—"`.

- [ ] **Step 5: Filter bar and extra tables**

| Find | Replace with |
|---|---|
| `จำนวนแถวที่แสดง:` | `แสดง` |
| `ชื่อไฟล์ CSV:` | `ชื่อไฟล์` |
| `ตารางตัวอย่างข้อมูลปลายทาง: <code>…</code>` | `ตัวอย่าง {selectedExportZone}` |
| `ไฟล์ปลายทาง: <code>…</code>` line | delete (the filename input already shows it) |
| `<details>` summary `ส่งออกตารางเพิ่มเติมจากคลัสเตอร์ (Cluster Tables &amp; Gold BI Reports) ▼` | `ส่งออกตารางอื่น` |
| `Pipeline Datasets (HDFS)` / `Gold BI Reports (Elasticsearch)` | `ตาราง Pipeline` / `รายงาน Gold` |

- [ ] **Step 6: Test, live check, commit**

Run: `npm --prefix ui test` → PASS. Rebuild `ui`, screenshot `/export` desktop and mobile, click "ดูตัวอย่าง" on each row and one "ดาวน์โหลด".

```bash
git add ui/src/pages/DataExport.jsx ui/src/pages/DataExport.test.jsx ui/src/test/text-budget.json
git commit -m "feat(ui): simplify Workspace Exports — one zone list, no dead controls"
```

---

### Task 9: Query & Metrics (`/analytics`)

**Files:** Modify `ui/src/pages/Analytics.jsx`, `ui/src/test/text-budget.json`

- [ ] **Step 1: Tighten the budget (fails)**

Run: `node ui/scripts/apply-budget.mjs analytics && npm --prefix ui test -- src/test/textBudget.test.jsx` → FAIL for `analytics`.

- [ ] **Step 2: Edits**

Add `import { PageHeader, InfoHint } from "../components/ui";`. Replace the `{/* 1. Page Header & Interactive Analytics Control Bar */}` title block (tag, `<h1>`, `gs-page-desc`) with `<PageHeader pageKey="analytics" actions={<button type="button" className="ui-btn ui-btn-secondary" onClick={handleRefreshAll}>คำนวณใหม่</button>} />` and delete the old refresh button.

| Find | Replace with |
|---|---|
| `1. เกณฑ์เป้าหมาย SLA ขั้นต่ำ (% Target SLA):` | `เป้า SLA (%)` |
| `2. ช่วงเวลาพยากรณ์ล่วงหน้า (Forecast Horizon):` | `พยากรณ์ล่วงหน้า` |
| options `พยากรณ์ล่วงหน้า 7 วัน (7-Day Model)` etc. | `7 วัน`, `14 วัน`, `30 วัน` |
| `3. ค้นหาแหล่งที่มาของความผิดปกติ (Filter Anomaly Source):` | `ค้นหาความผิดปกติ` |
| placeholder `พิมพ์ชื่อตารางหรือรูปแบบความผิดปกติ เช่น users, orders, null...` | `ชื่อตารางหรือรูปแบบ เช่น null` |
| `<h3>Error Pattern Clustering</h3>` + its `<p>` | `<h3>รูปแบบข้อผิดพลาด</h3>` (delete `<p>`; if `clusterSearch` is set, append ` · "{clusterSearch}"` to the h3) |
| `<h3>Business KPI Impact Assessment</h3>` + `<p>` | `<h3>ผลกระทบทางธุรกิจ <InfoHint text="ประมาณการว่าตัวชี้วัดปลายทางจะคลาดเคลื่อนเท่าไรจากข้อมูลที่ไม่ผ่านเกณฑ์" /></h3>` |
| `Estimated Cumulative Business Losses:` | `ความเสียหายโดยประมาณ` |
| `<h3>AI-Driven Actionable Recommendations</h3>` + `<p>` | `<h3>คำแนะนำจาก AI</h3>` |
| `ไปที่หน้า Rule Hub (Step 2) &rarr;` | `ไปที่ Expectations & Alerts →` |
| `นำไปใช้แล้ว (APPLIED ✓)` / `นำไปใช้ทันที (Apply Action)` | `นำไปใช้แล้ว ✓` / `นำไปใช้` |
| loading/error strings `Aggregating pattern anomalies...`, `Failed to load error patterns`, `Assessing downstream SLA degradations...`, `Failed to load business impacts`, `Synthesizing action recommendations...`, `Failed to generate AI proposals` | `กำลังโหลด...`, `โหลดไม่สำเร็จ`, `กำลังโหลด...`, `โหลดไม่สำเร็จ`, `กำลังโหลด...`, `โหลดไม่สำเร็จ` |
| chart title `{horizonDays}-Day Quality Forecast Model (Target SLA: {slaTarget}%)` | `พยากรณ์ {horizonDays} วัน · เป้า {slaTarget}%` |

- [ ] **Step 3: Test, live check, commit**

Run: `npm --prefix ui test` → PASS. Rebuild `ui`, screenshot `/analytics` desktop and mobile.

```bash
git add ui/src/pages/Analytics.jsx ui/src/test/text-budget.json
git commit -m "feat(ui): simplify Query & Metrics — short Thai labels, explanations as hints"
```

---

### Task 10: Audit Trail (`/whitebox`)

**Files:** Modify `ui/src/pages/WhiteBoxPipeline.jsx`, `ui/src/test/text-budget.json`

- [ ] **Step 1: Tighten the budget (fails)**

Run: `node ui/scripts/apply-budget.mjs whitebox && npm --prefix ui test -- src/test/textBudget.test.jsx` → FAIL for `whitebox`.

- [ ] **Step 2: Header, onboarding, toolbar**

Add `import { PageHeader, InfoHint, LearnMore } from "../components/ui";`.
- Replace `{/* Page Header */}` (`wb-header` div) with:

```jsx
      <PageHeader
        pageKey="whitebox"
        actions={
          <button type="button" className="ui-btn ui-btn-primary" onClick={runFullPipeline} disabled={autoRunning}>
            {autoRunning ? "กำลังรัน..." : "รันทุกขั้นอัตโนมัติ"}
          </button>
        }
      />
```

- Replace the whole `{/* Executive Onboarding Hero */}` block with:

```jsx
      <LearnMore summary="หน้านี้ทำอะไร">
        <ol>
          <li>ระบบสำรวจข้อมูลและเสนอกฎพร้อมเหตุผล</li>
          <li>คุณตรวจเหตุผลและยืนยันกฎ</li>
          <li>ระบบคัดแยกเป็น Clean, Review, Quarantine โดยไม่ลบข้อมูลทิ้ง</li>
        </ol>
      </LearnMore>
```

- In `{/* Action Toolbar */}` delete the old run button (moved to the header). Change the architecture toggle text to `showArchitectureMatrix ? "ซ่อน" : "ใครทำอะไร: ผู้ใช้ กับ ระบบ"`. Inside the matrix, delete the hard-coded figures `(99.8%)`, `Clean (9,400) / Review (100) / Quarantine (600)` and `Recall (100%),` from the list items (keep the sentences), and change the heading `System Architecture: User Responsibility vs. System Automation` to `ผู้ใช้ทำอะไร ระบบทำอะไร`; delete the `TRANSPARENT DECISION ARCHITECTURE` badge.
- In the onboarding stats badge text (if kept anywhere), replace `(summary?.total_rows ?? 10100)` with `summary?.total_rows ?? "—"`.

- [ ] **Step 3: Stepper and stage titles**

Stepper: delete the six `wb-step-btn-sub` spans (English duplicates: "Multi-Table Join", "Data Profiling", "Business Context", "Explainable Rules", "3-Way Segregation", "SLA Audit & Insights"). Rename `ตรวจสอบมาตรฐาน SLA` → `ตรวจผลและใช้งาน`.

For each stage `<h2>`, replace the title and move the `<p>` directly under it into an `InfoHint` beside the title (keep any buttons that were inside that `<p>`, such as the Stage 1 refresh button, as siblings of the `<h2>`):

| Old `<h2>` | New `<h2>` | InfoHint text |
|---|---|---|
| `Stage 0: Multi-Table Relationship & Schema Reconciliation` | `0 · เชื่อมโยงตาราง` | `ตรวจความสัมพันธ์ของตารางและรูปแบบคีย์ก่อนรวมข้อมูล` |
| `Stage 1: Ingestion Data Profiling` | `1 · สถิติข้อมูลดิบ` | `สิ่งที่ระบบพบในข้อมูลดิบก่อนใช้กฎใดๆ` |
| `Stage 2: User Business Context` | `2 · บริบทธุรกิจ` | `ระบบไม่รู้ความหมายทางธุรกิจเอง ข้อมูลส่วนนี้ช่วยให้กฎที่เสนออธิบายได้` |
| `Stage 3: Explainable Rule Recommendations` | `3 · กฎที่ระบบเสนอ` | `ทุกกฎแสดงเหตุผลและหลักฐานทางสถิติ` |
| `Stage 4: Transformation & 3-Way Data Segregation` | `4 · คัดแยก 3 ทาง` | `ข้อมูลดีไป Clean ค่าผิดปกติไป Review ข้อมูลเสียไป Quarantine` |
| `Stage 5: Data Quality SLA Verification & Downstream Analytics` | `5 · ตรวจผลและใช้งาน` | `ตรวจว่าทุกแถวถูกนับครบทั้ง 3 โซน และนำข้อมูล Clean ไปวิเคราะห์ต่อ` |

Also delete the `{/* Stage 4 Purpose Callout */}` block (its message is now the Stage 4 hint) and the `{/* Entity vs Attribute Distinction (Defense Note) */}` block's body goes inside `<LearnMore summary="ทำไมไม่รวมทุกคอลัมน์">…</LearnMore>`.

- [ ] **Step 4: Test, live check, commit**

Run: `npm --prefix ui test` → PASS. Rebuild `ui`, screenshot `/whitebox` desktop and mobile, click through stages 0–5.

```bash
git add ui/src/pages/WhiteBoxPipeline.jsx ui/src/test/text-budget.json
git commit -m "feat(ui): simplify Audit Trail — onboarding on demand, short stage titles"
```

---

### Task 11: Learn & Architecture (`/guide`)

**Files:** Modify `ui/src/pages/ConfigGuide.jsx`, `ui/src/test/text-budget.json`

- [ ] **Step 1: Tighten the budget (fails)**

Run: `node ui/scripts/apply-budget.mjs guide && npm --prefix ui test -- src/test/textBudget.test.jsx` → FAIL for `guide`.

- [ ] **Step 2: Header and quick launcher from the registry**

Add `import { PageHeader, LearnMore } from "../components/ui";` and `import { PAGES, WORKFLOW_STEPS } from "../config/pages";`.
- Replace `{/* === ENTERPRISE HEADER === */}` (dark card with "LAKEHOUSE RUNBOOK …", h1, the Medallion arrow line and the "หลักการวิศวกรรมข้อมูล" callout) with:

```jsx
      <PageHeader pageKey="guide" />
      <LearnMore summary="หลักการ: แก้ปัญหาที่ต้นน้ำ">
        ระบบสแกนสถิติข้อมูลให้ก่อน แสดงหลักฐานความผิดปกติ แล้วให้คุณเป็นผู้ยืนยันกฎ ข้อมูลเสียถูกแจ้งกลับไปแก้ที่ระบบต้นทาง
      </LearnMore>
```

- Replace the hand-written 4-item array in `{/* === MEDALLION PIPELINE QUICK LAUNCHER === */}` (the `step`/`title`/`desc` objects) and its heading/button row with:

```jsx
      <div className="gs-guide-steps">
        {WORKFLOW_STEPS.map((p) => (
          <Link key={p.key} to={p.path} className="gs-guide-step">
            <span className="gs-guide-step-num">ขั้นที่ {p.step}</span>
            <strong>{p.label}</strong>
            <span>{p.subtitle}</span>
          </Link>
        ))}
      </div>
```

Add to the page's CSS (create `ui/src/pages/ConfigGuide.css` and import it if the page has no stylesheet):

```css
.gs-guide-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 16px 0; }
.gs-guide-step { display: flex; flex-direction: column; gap: 4px; padding: 14px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-main); text-decoration: none; }
.gs-guide-step:hover { border-color: var(--accent-blue); }
.gs-guide-step-num { font-size: 11px; font-weight: 600; color: var(--text-muted); }
.gs-guide-step span:last-child { font-size: 12px; color: var(--text-muted); }
```

- [ ] **Step 3: Tabs**

Tab labels: `Parameter Tuning Guide (การปรับพารามิเตอร์)` → `พารามิเตอร์`; `Platform Modules Guide (คู่มือการใช้งานหน้าต่างๆ)` → `แต่ละหน้า`; `End-to-End Architecture (วงจรข้อมูลต้นน้ำ-ปลายน้ำ)` → `สถาปัตยกรรม`; `Reference Case Study (กรณีศึกษามาตรฐาน)` → `กรณีศึกษา`.

**Tab "พารามิเตอร์":** delete the intro `<p>` under "Data Quality Rule Parameters Specification" and change that heading to `พารามิเตอร์ของกฎ`. For each of the 5 rule cards (RULE 01–05), keep the `<h3>` and the "วัตถุประสงค์" sentence visible (render it as a `<p>` under the h3), and move the rest of the card (the "พารามิเตอร์ย่อย" and "การวิเคราะห์อัตโนมัติ" rows and the "เกณฑ์แนะนำตามการใช้งาน" box) inside `<LearnMore summary="รายละเอียดและค่าแนะนำ">…</LearnMore>`.

**Tab "แต่ละหน้า":** replace the 8 hand-written module sections (they use outdated names such as "Schema Drift Hub" and "Pipeline Orchestration") with a list generated from the registry:

```jsx
          <ul className="gs-guide-pages">
            {PAGES.filter((p) => p.key !== "home").map((p) => (
              <li key={p.key}>
                <Link to={p.path}><strong>{p.label}</strong></Link>
                <span>{p.subtitle}</span>
              </li>
            ))}
          </ul>
```

with CSS `.gs-guide-pages { list-style: none; padding: 0; display: grid; gap: 8px; } .gs-guide-pages li { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 6px; } .gs-guide-pages span { font-size: 12px; color: var(--text-muted); }`.

**Tabs "สถาปัตยกรรม" and "กรณีศึกษา":** keep phase/section titles; move every paragraph longer than one line into `<LearnMore summary="อ่านต่อ">…</LearnMore>` under its title.

- [ ] **Step 4: Test, live check, commit**

Run: `npm --prefix ui test` → PASS. Rebuild `ui`, screenshot `/guide` desktop and mobile, open each tab.

```bash
git add ui/src/pages/ConfigGuide.jsx ui/src/pages/ConfigGuide.css ui/src/test/text-budget.json
git commit -m "feat(ui): simplify Learn & Architecture — registry-driven page list, details on demand"
```

---

### Task 12: Home (`/`)

**Files:** Modify `ui/src/pages/Home.jsx`, `ui/src/pages/Home.css`, `ui/src/App.jsx`, `ui/src/test/text-budget.json`

- [ ] **Step 1: Tighten the budget (fails)**

Run: `node ui/scripts/apply-budget.mjs home && npm --prefix ui test -- src/test/textBudget.test.jsx` → FAIL for `home`.

- [ ] **Step 2: Hero**

Add `import { WORKFLOW_STEPS, getPage } from "../config/pages";`.
- Hero description paragraph → `ตรวจ คัดแยก และติดตามคุณภาพข้อมูลในที่เดียว`.
- Hero actions: keep two links — `<Link to="/ingestion" className="gs-btn-primary gs-btn-lg">เริ่มนำเข้าข้อมูล</Link>` and `<Link to="/guide" className="gs-btn-ghost">อ่านคู่มือ</Link>`; delete the Dashboard link (it is in the nav).
- Keep the live channels panel and the three KPIs unchanged (they are real data).

- [ ] **Step 3: Replace marketing sections with two useful blocks**

Delete: `{/* Trusted Partners Bar (Real System Stack) */}`, `{/* SDOQAP Capabilities split showcase */}` (and the `renderVisualPreviewCard` function, the `activeCategory`/`activeSubItem` state and handlers, and the hard-coded demo proposal text it renders), `{/* Architecture features grid */}` (and the `architectureFeatures` array), `{/* Stakeholders grid */}` (and the `stakeholders` array), `{/* Bottom CTA */}`. Keep `{/* Live Service Status */}`.

Insert after the hero:

```jsx
      <section className="home-block">
        <h2 className="home-block-title">4 ขั้นตอน</h2>
        <div className="home-steps">
          {WORKFLOW_STEPS.map((p) => (
            <Link key={p.key} to={p.path} className="home-step">
              <span className="home-step-num">{p.step}</span>
              <strong>{p.label}</strong>
              <span>{p.subtitle}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-block">
        <h2 className="home-block-title">เริ่มจากบทบาทของคุณ</h2>
        <div className="home-roles">
          {[
            { role: "Data Engineer", page: "ingestion" },
            { role: "Data Steward / Compliance", page: "schema" },
            { role: "ผู้บริหาร", page: "dashboard" },
            { role: "Analyst / ML", page: "export" }
          ].map(({ role, page }) => {
            const p = getPage(page);
            return (
              <Link key={role} to={p.path} className="home-role">
                <strong>{role}</strong>
                <span>ไปที่ {p.label} →</span>
              </Link>
            );
          })}
        </div>
      </section>
```

Add to `Home.css`:

```css
.home-block { max-width: 1100px; margin: 32px auto; padding: 0 16px; }
.home-block-title { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0 0 12px; }
.home-steps, .home-roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.home-step, .home-role { display: flex; flex-direction: column; gap: 4px; padding: 14px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-secondary); color: var(--text-main); text-decoration: none; }
.home-step:hover, .home-role:hover { border-color: var(--accent-blue); }
.home-step-num { width: 24px; height: 24px; border-radius: 50%; background: var(--db-navy); color: var(--bg-secondary); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.home-step span:last-child, .home-role span { font-size: 12px; color: var(--text-muted); }
```

Remove now-unused CSS rules for the deleted sections from `Home.css` (`.gs-features`, `.showcase-*`, `.gs-features-grid`, `.gs-feature-card`, `.gs-stakeholders`, `.gs-stakeholder-*`, `.gs-cta`, partner bar classes) after confirming with a search that no JSX still uses them.

- [ ] **Step 4: Remove the "v2.0 is now live" banner**

In `ui/src/App.jsx` delete the `{isHome && ( <div className="top-banner"> … </div> )}` block and change the layout class expression `${isHome ? "layout-with-banner" : "layout-full-height"}` to `layout-full-height`. Delete the `.top-banner`, `.banner-badge` and `.layout-with-banner` rules from `App.css` if nothing else uses them.

- [ ] **Step 5: Test, live check, commit**

Run: `npm --prefix ui test` → PASS. Rebuild `ui`, screenshot `/` logged out and logged in, desktop and mobile.

```bash
git add ui/src/pages/Home.jsx ui/src/pages/Home.css ui/src/App.jsx ui/src/App.css ui/src/test/text-budget.json
git commit -m "feat(ui): simplify Home — workflow steps and role shortcuts instead of marketing copy"
```

---

### Task 13: Dashboards (`/dashboard`) — light touch

**Files:** Modify `ui/src/pages/Dashboard.jsx`, `ui/src/test/text-budget.json`

This page was redesigned by a teammate on branch `mari` (merged in `e51e49a`). Change only the header and doubled labels; do not restructure zones, charts or data.

- [ ] **Step 1: Tighten the budget (fails)**

Run: `node ui/scripts/apply-budget.mjs dashboard && npm --prefix ui test -- src/test/textBudget.test.jsx` → FAIL for `dashboard` (at least on the doubled-label check).

- [ ] **Step 2: Edits**

- In `{/* ── TOP HEADER ── */}` replace the `<h1 className="gs-title">…</h1>` content with `{getPage("dashboard").label}` and the `gs-subtitle` paragraph content with `{getPage("dashboard").subtitle}` (add `import { getPage } from "../config/pages";`). Keep the `gs-topbar` layout and the view-mode tabs as they are.
- Run the suite, read the `doubledLabels` failure output, and fix each listed label by keeping one language according to Design rule 4 (for view tabs keep the existing English names: Executive Overview, Business Impact, Data Quality, Technical Cockpit).

- [ ] **Step 3: Test, live check, commit**

Run: `npm --prefix ui test` → PASS. Rebuild `ui`, screenshot `/dashboard` desktop and mobile, switch through the four view modes.

```bash
git add ui/src/pages/Dashboard.jsx ui/src/test/text-budget.json
git commit -m "feat(ui): align Dashboards header with page registry, single-language labels"
```

---

### Task 14: Final verification

- [ ] **Step 1: Full suite and build**

Run: `npm --prefix ui test` → all PASS.
Run: `docker compose build ui && docker compose up -d ui` → build succeeds, container healthy.

- [ ] **Step 2: Before/after numbers**

Run (Git Bash): `TEXT_REPORT=1 npm --prefix ui test` and compare `ui/src/test/text-report.json` with `baseline_chars` in `text-budget.json`. Write the per-page before → after character counts into the final report to the user.

- [ ] **Step 3: Visual sweep**

In the Browser pane (user logged in), for every route in `PAGES`: screenshot at desktop and at `resize_window` preset `mobile`; reset to `desktop` at the end. Check for: no horizontal scroll on mobile, title equals nav label, no leftover eyebrow tags, no English-in-parentheses labels, confirm modals still open on destructive buttons. Check the browser console with `read_console_messages` (`onlyErrors: true`) for new errors.

- [ ] **Step 4: Clean tree**

Run `git status`. If `spark/rules_config.json` or `spark/schema_registry.json` changed from live testing, `git restore` them. Confirm `ui/src/test/text-report.json` is ignored.

- [ ] **Step 5: Report, do not push**

Summarize to the user: commits made, before/after text counts per page, anything left over budget with the reason. Ask before any `git push`.
