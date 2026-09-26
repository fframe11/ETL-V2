# First-Use Clarity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the five things that mislead a first-time user of SDOQAP: ambiguous sidebar numbers, a false "API: OFFLINE" label, server file paths in error messages, a vague "+ New" button, and silent "no problems" for files the quality checks cannot analyse.

**Architecture:** Small, independent UI fixes plus one backend routing fix. Status and error wording move into two pure helpers in `ui/src/utils/` so they can be unit-tested; components only call them. The backend gets one helper that names the columns the rule engine actually reads.

**Tech Stack:** React 18 + Vite 5, Vitest 2 + Testing Library + jsdom, FastAPI + pandas (API runs in Docker as service `api`).

**Spec:** None as a separate file. The source is the first-use review done in this session; its findings are restated under "Source findings" so this plan stands alone.

## Global Constraints

- Work on branch `bell`. Commit after every task. Do NOT push.
- End every commit message with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- UI copy is Thai. Keep English only for existing page names from `ui/src/config/pages.js` and for column names.
- Never show invented numbers. When a value is unknown, show `—` or say why.
- Frontend tests: `cd ui && npx vitest run <path>` (whole suite: `npx vitest run`). Build: `cd ui && npm run build`.
- Backend tests: pytest is not installed on the host. Run them inside the API container:
  ```bash
  cd /c/ETL && docker compose build api && docker compose up -d api
  MSYS_NO_PATHCONV=1 docker compose cp tests/test_upload_table.py api:/tmp/test_upload_table.py
  MSYS_NO_PATHCONV=1 docker compose exec -T -w /app -e PYTHONPATH=/app api sh -c "pip install -q pytest && python -m pytest -q /tmp/test_upload_table.py"
  ```
- Deploy UI changes to the running stack: `cd /c/ETL && docker compose build ui && docker compose up -d ui` (app at http://localhost, local login admin/admin).
- The page text budget test (`ui/src/test/textBudget.test.jsx`) and the one-language-per-label test must keep passing.

## Source findings

1. Sidebar numbers mean two different things. Workflow pages show their step number (1–4); Expectations & Alerts and Catalog show a pending-approval count. When a count exists it *replaces* the step number (`NavBar.jsx` renders the step tag only when `!link.badge`), so "Expectations & Alerts 3" looks like step 3.
2. The sidebar footer says `API: OFFLINE` whenever any of the 11 services in `/api/v1/services/status` is offline. Today only Kafka is offline, yet the whole app appears down.
3. Ingestion's database/API/Stream tabs show the backend's raw `detail`, e.g. `Dirty dataset not found at /app/student_course_score_evaluation_dataset/dirty_dataset.csv`.
4. The red `+ New` button looks like a menu of things to create, but it is a single link to `/ingestion`.
5. The quality checks only understand files with `student_id`, `course`, `score`, `study_hours`. For any other file the Ingestion page still says "ไม่พบปัญหา" (no problems) and a green `0 / 3`. Worse, the backend sends a file that has `student_id/course/score` but no `study_hours` into the rule engine, which reads `df["study_hours"]` unconditionally and returns HTTP 500.

## Out of scope (decide separately)

- Making the rule engine work with any schema (large redesign).
- The hard-coded fallback narrative with `$18,544` in `Dashboard.jsx` (only visible when the API fails; waiting on the user's choice between removing it and rewording it).
- Mobile layout of the sidebar.
- Open questions for the owner: is SDOQAP a single-dataset demo or a general tool; who is the main user (engineer or executive); should the COPDQ dollar estimate stay.

## File map

| File | Change |
|---|---|
| `ui/src/test/renderPage.jsx` | Add `mockFetchByUrl(routes)`; `renderPage` accepts optional routes |
| `ui/src/components/NavBar.jsx` | Step tag always shown; labelled pending badge; health summary; rename `+ New` |
| `ui/src/components/NavBar.css` | Badge spacing; status dot levels |
| `ui/src/components/NavBar.test.jsx` | Tests for tasks 1, 2, 4 |
| `ui/src/utils/serviceHealth.js` (+ `.test.js`) | New: summarise service status |
| `ui/src/utils/apiError.js` (+ `.test.js`) | New: turn backend `detail` into user wording |
| `ui/src/pages/Ingestion.jsx` / `.css` / `.test.jsx` | Friendly errors; unsupported-schema notice |
| `api/app/api/whitebox.py` | `QUALITY_ENGINE_COLUMNS`, `_is_supported_schema`, upload routing |
| `tests/test_upload_table.py` | Backend test for `_is_supported_schema` |

---

### Task 1: Sidebar shows step number and pending count separately

**Files:**
- Modify: `ui/src/test/renderPage.jsx`
- Modify: `ui/src/components/NavBar.jsx:353-384`
- Modify: `ui/src/components/NavBar.css` (`.gs-nav-badge`)
- Test: `ui/src/components/NavBar.test.jsx`

**Interfaces:**
- Produces: `mockFetchByUrl(routes: Array<[urlSubstring: string, { status?: number, body?: any }]>) => vi.Mock` exported from `ui/src/test/renderPage.jsx`. The first route whose substring appears in the URL wins; unmatched URLs return HTTP 200 with `{}`. Tasks 2, 3 and 6 use it.

- [ ] **Step 1: Add the URL-aware fetch mock**

In `ui/src/test/renderPage.jsx`, add below `mockFetchEmpty`:

```js
// Like mockFetchEmpty, but lets a test answer specific endpoints.
// routes: [[urlSubstring, { status, body }], ...]; first match wins.
export function mockFetchByUrl(routes) {
  const fn = vi.fn(async (url) => {
    const hit = routes.find(([part]) => String(url).includes(part));
    const status = hit?.[1]?.status ?? 200;
    const body = hit?.[1]?.body ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      blob: async () => new Blob()
    };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
```

- [ ] **Step 2: Write the failing test**

Append to `ui/src/components/NavBar.test.jsx` (add `within` to the `@testing-library/react` import and `mockFetchByUrl` to the `../test/renderPage` import):

```jsx
async function renderNav() {
  await act(async () => {
    render(
      <MemoryRouter>
        <NavBar isOpen isSidebarOpen toggleSidebar={() => {}} />
      </MemoryRouter>
    );
  });
  // Auth check resolves, then the pending-count effect runs and fetches.
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}

it("shows the step number and the pending count side by side, labelled differently", async () => {
  mockFetchByUrl([
    ["/auth/me", { body: { username: "admin" } }],
    ["/rules/ai-proposals", { body: { count: 3 } }],
    ["/schema/proposals", { body: { proposals: [] } }]
  ]);
  await renderNav();
  const link = screen.getByRole("link", { name: /Expectations & Alerts/ });
  expect(within(link).getByTitle("ขั้นที่ 2")).toHaveTextContent("2");
  expect(within(link).getByLabelText("รออนุมัติ 3 รายการ")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd ui && npx vitest run src/components/NavBar.test.jsx`
Expected: FAIL — `Unable to find an element with the title: ขั้นที่ 2` (the step tag is hidden when a badge exists and has no title).

- [ ] **Step 4: Implement**

In `ui/src/components/NavBar.jsx`, change the step-tag condition and add a title:

```jsx
{navOpen && link.stepTag && (
  <span
    className="gs-nav-step-tag"
    title={`ขั้นที่ ${link.stepTag}`}
    style={{ /* keep the existing style object unchanged */ }}
  >
    {link.stepTag}
  </span>
)}
{navOpen && link.badge && (
  <span
    className="gs-nav-badge"
    aria-label={`รออนุมัติ ${link.badge} รายการ`}
    title={`รออนุมัติ ${link.badge} รายการ`}
  >
    {link.badge} รอ
  </span>
)}
```

Only two things change in the step tag: the condition loses `&& !link.badge`, and `title` is added. Leave its `style` object exactly as it is.

In `ui/src/components/NavBar.css`, add to the existing `.gs-nav-badge` rule:

```css
  margin-left: 4px;
  white-space: nowrap;
```

- [ ] **Step 5: Run the test and the full suite**

Run: `cd ui && npx vitest run src/components/NavBar.test.jsx` → PASS.
Run: `cd ui && npx vitest run` → all pass.

- [ ] **Step 6: Commit**

```bash
git add ui/src/test/renderPage.jsx ui/src/components/NavBar.jsx ui/src/components/NavBar.css ui/src/components/NavBar.test.jsx
git commit -m "fix(nav): show step number and pending count separately

A pending-approval count used to replace the step number, so
'Expectations & Alerts 3' read as step 3. Both now show; the count
says 'รอ' and has an accessible label.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sidebar footer summarises service health honestly

**Files:**
- Create: `ui/src/utils/serviceHealth.js`
- Test: `ui/src/utils/serviceHealth.test.js`
- Modify: `ui/src/components/NavBar.jsx:127` and `:420-427`
- Modify: `ui/src/components/NavBar.css:240-241`
- Test: `ui/src/components/NavBar.test.jsx`

**Interfaces:**
- Consumes: `mockFetchByUrl` from Task 1.
- Produces: `summarizeServiceHealth({ data, error, loading }) => { level: "ok" | "degraded" | "down" | "unknown", text: string, offline: string[] }`. `data` is the `/api/v1/services/status` body: `{ [serviceName]: { status: "online" | "offline", url } }`.

- [ ] **Step 1: Write the failing unit tests**

Create `ui/src/utils/serviceHealth.test.js`:

```js
import { it, expect } from "vitest";
import { summarizeServiceHealth } from "./serviceHealth";

const svc = (entries) => Object.fromEntries(entries.map(([n, s]) => [n, { status: s, url: null }]));

it("says the system is fine when every service is online", () => {
  const h = summarizeServiceHealth({ data: svc([["Kafka Broker", "online"], ["Postgres DB", "online"]]) });
  expect(h).toEqual({ level: "ok", text: "ระบบปกติ", offline: [] });
});

it("counts offline services instead of calling the whole API offline", () => {
  const h = summarizeServiceHealth({ data: svc([["Kafka Broker", "offline"], ["Postgres DB", "online"]]) });
  expect(h.level).toBe("degraded");
  expect(h.text).toBe("1 บริการออฟไลน์");
  expect(h.offline).toEqual(["Kafka Broker"]);
});

it("reports the API as unreachable only when the status request itself fails", () => {
  expect(summarizeServiceHealth({ error: "HTTP 502" }).level).toBe("down");
  expect(summarizeServiceHealth({ error: "HTTP 502" }).text).toBe("เชื่อมต่อ API ไม่ได้");
});

it("does not claim anything while the first check is still loading", () => {
  expect(summarizeServiceHealth({ loading: true }).level).toBe("unknown");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd ui && npx vitest run src/utils/serviceHealth.test.js`
Expected: FAIL — cannot resolve `./serviceHealth`.

- [ ] **Step 3: Implement the helper**

Create `ui/src/utils/serviceHealth.js`:

```js
// Turns /api/v1/services/status into one honest footer line. One offline
// service (e.g. Kafka) is a degraded platform, not an offline API.
export function summarizeServiceHealth({ data, error, loading } = {}) {
  if (loading && !data) return { level: "unknown", text: "กำลังตรวจสอบระบบ…", offline: [] };
  if (error || !data || typeof data !== "object") {
    return { level: "down", text: "เชื่อมต่อ API ไม่ได้", offline: [] };
  }
  const offline = Object.entries(data)
    .filter(([, s]) => s?.status !== "online")
    .map(([name]) => name);
  if (offline.length === 0) return { level: "ok", text: "ระบบปกติ", offline };
  return { level: "degraded", text: `${offline.length} บริการออฟไลน์`, offline };
}
```

Run: `cd ui && npx vitest run src/utils/serviceHealth.test.js` → PASS.

- [ ] **Step 4: Write the failing NavBar test**

Append to `ui/src/components/NavBar.test.jsx`:

```jsx
it("names offline services instead of saying the whole API is offline", async () => {
  mockFetchByUrl([
    ["/services/status", { body: {
      "Kafka Broker": { status: "offline", url: null },
      "Postgres DB": { status: "online", url: null }
    } }]
  ]);
  await renderNav();
  expect(screen.getByText("1 บริการออฟไลน์")).toBeInTheDocument();
  expect(screen.queryByText(/API: OFFLINE/)).toBeNull();
});
```

Run: `cd ui && npx vitest run src/components/NavBar.test.jsx` → FAIL (text is `API: OFFLINE`).

- [ ] **Step 5: Use the helper in NavBar**

In `ui/src/components/NavBar.jsx`:
- Add `import { summarizeServiceHealth } from "../utils/serviceHealth";` with the other imports.
- Replace line 127 (`const isHealthy = …`) with:

```js
  const health = summarizeServiceHealth(services);
```

- Replace the status block (`{navOpen && ( <div className="gs-nav-status"> … </div> )}`) with:

```jsx
{navOpen && (
  <div
    className="gs-nav-status"
    title={health.offline.length ? `ออฟไลน์: ${health.offline.join(", ")}` : undefined}
  >
    <span className={`gs-nav-status-dot ${health.level}`} />
    <span className="gs-nav-status-text">{health.text}</span>
  </div>
)}
```

Confirm nothing else uses `isHealthy`: `grep -n "isHealthy" ui/src/components/NavBar.jsx` → no output.

In `ui/src/components/NavBar.css`, replace the `.online` and `.offline` dot rules (lines 240-241) with:

```css
.gs-nav-status-dot.ok { background: var(--db-emerald); box-shadow: 0 0 6px var(--db-emerald); }
.gs-nav-status-dot.degraded { background: var(--db-amber); }
.gs-nav-status-dot.down { background: var(--db-red); }
.gs-nav-status-dot.unknown { background: #64748B; }
```

- [ ] **Step 6: Run tests**

Run: `cd ui && npx vitest run` → all pass.

- [ ] **Step 7: Commit**

```bash
git add ui/src/utils/serviceHealth.js ui/src/utils/serviceHealth.test.js ui/src/components/NavBar.jsx ui/src/components/NavBar.css ui/src/components/NavBar.test.jsx
git commit -m "fix(nav): footer said 'API: OFFLINE' when one service was down

Any one of 11 services offline (today: Kafka) flipped the footer to
'API: OFFLINE'. It now reads 'ระบบปกติ', 'N บริการออฟไลน์' (hover
lists them) or 'เชื่อมต่อ API ไม่ได้' only when the check itself fails.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ingestion errors in user wording, never server paths

**Files:**
- Create: `ui/src/utils/apiError.js`
- Test: `ui/src/utils/apiError.test.js`
- Modify: `ui/src/pages/Ingestion.jsx` (the two `setUploadError(detail?.detail || …)` calls, currently lines 174 and 227)
- Test: `ui/src/pages/Ingestion.test.jsx`

**Interfaces:**
- Consumes: `mockFetchByUrl` from Task 1.
- Produces: `friendlyApiError(detail: unknown, fallback: string) => string`.

- [ ] **Step 1: Write the failing unit tests**

Create `ui/src/utils/apiError.test.js`:

```js
import { it, expect } from "vitest";
import { friendlyApiError } from "./apiError";

const FALLBACK = "เชื่อมต่อแหล่งข้อมูลไม่สำเร็จ (HTTP 404)";

it("explains a missing dataset as a next step", () => {
  const msg = friendlyApiError("Dirty dataset not found at /app/student_course_score_evaluation_dataset/dirty_dataset.csv", FALLBACK);
  expect(msg).toBe('ยังไม่มีข้อมูลในระบบ กรุณานำเข้าไฟล์ในแท็บ "ไฟล์" ก่อน');
});

it("hides messages that expose server file paths", () => {
  expect(friendlyApiError("Failed reading /app/output/x_uploaded.csv", FALLBACK)).toBe(FALLBACK);
  expect(friendlyApiError("Failed reading C:\\data\\x.csv", FALLBACK)).toBe(FALLBACK);
});

it("keeps readable messages, including ones that contain a URL", () => {
  expect(friendlyApiError("ไม่สามารถอ่านไฟล์ CSV ได้: bad header", FALLBACK)).toBe("ไม่สามารถอ่านไฟล์ CSV ได้: bad header");
  expect(friendlyApiError("Host 'https://api.x/v1' is not in the allowlist.", FALLBACK)).toBe("Host 'https://api.x/v1' is not in the allowlist.");
});

it("falls back when detail is missing or not a string (FastAPI validation lists)", () => {
  expect(friendlyApiError(undefined, FALLBACK)).toBe(FALLBACK);
  expect(friendlyApiError([{ loc: ["body"], msg: "field required" }], FALLBACK)).toBe(FALLBACK);
});
```

Run: `cd ui && npx vitest run src/utils/apiError.test.js` → FAIL (module missing).

- [ ] **Step 2: Implement**

Create `ui/src/utils/apiError.js`:

```js
// Absolute server paths like /app/output/x.csv or C:\data\x.csv. A slash
// inside a URL ("https://api.x/v1") is not preceded by space/quote/start,
// so URLs are left alone.
const SERVER_PATH = /(^|[\s"'(])(\/[\w.-]+){2,}|[A-Za-z]:\\/;

// Turns a backend `detail` into something a user can act on.
export function friendlyApiError(detail, fallback) {
  if (typeof detail !== "string" || !detail.trim()) return fallback;
  if (/dataset not found/i.test(detail)) {
    return 'ยังไม่มีข้อมูลในระบบ กรุณานำเข้าไฟล์ในแท็บ "ไฟล์" ก่อน';
  }
  if (SERVER_PATH.test(detail)) return fallback;
  return detail;
}
```

Run: `cd ui && npx vitest run src/utils/apiError.test.js` → PASS.

- [ ] **Step 3: Write the failing page test**

Append to `ui/src/pages/Ingestion.test.jsx` (add `fireEvent, act` to the `@testing-library/react` import and `mockFetchByUrl` to the `../test/renderPage` import):

```jsx
it("explains a missing dataset instead of showing a server file path", async () => {
  await renderPage(Ingestion, "/ingestion");
  mockFetchByUrl([
    ["/ingest-source", { status: 404, body: { detail: "Dirty dataset not found at /app/student_course_score_evaluation_dataset/dirty_dataset.csv" } }]
  ]);
  fireEvent.click(screen.getByRole("tab", { name: /ฐานข้อมูล/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /ดึงข้อมูล RDBMS/ }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(screen.getByRole("alert")).toHaveTextContent("ยังไม่มีข้อมูลในระบบ");
  expect(screen.queryByText(/\/app\//)).toBeNull();
});
```

Run: `cd ui && npx vitest run src/pages/Ingestion.test.jsx` → FAIL (alert shows the raw path).

- [ ] **Step 4: Use the helper in Ingestion**

In `ui/src/pages/Ingestion.jsx` add `import { friendlyApiError } from "../utils/apiError";` and change the two calls:

```js
setUploadError(friendlyApiError(detail?.detail, `เชื่อมต่อแหล่งข้อมูลไม่สำเร็จ (HTTP ${res.status})`));
```

```js
setUploadError(friendlyApiError(detail?.detail, `นำเข้าไฟล์ไม่สำเร็จ (HTTP ${upRes.status})`));
```

Run: `cd ui && npx vitest run` → all pass.

- [ ] **Step 5: Commit**

```bash
git add ui/src/utils/apiError.js ui/src/utils/apiError.test.js ui/src/pages/Ingestion.jsx ui/src/pages/Ingestion.test.jsx
git commit -m "fix(ingestion): stop showing server file paths in error messages

The database/API/Stream tabs printed the backend detail verbatim, e.g.
'Dirty dataset not found at /app/...csv'. A missing dataset now says to
import a file first; any other message containing a server path falls
back to the generic HTTP message.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Name the primary sidebar button by what it does

**Files:**
- Modify: `ui/src/components/NavBar.jsx:263-300` (the `+ New` links, open and collapsed)
- Test: `ui/src/components/NavBar.test.jsx`

**Interfaces:**
- Consumes: `renderNav` helper from Task 1's test code, `mockFetchEmpty`.

- [ ] **Step 1: Write the failing test**

Append to `ui/src/components/NavBar.test.jsx`:

```jsx
it("labels the primary action by what it does", async () => {
  mockFetchEmpty();
  await renderNav();
  const link = screen.getByRole("link", { name: /^\+\s*นำเข้าข้อมูล$/ });
  expect(link.getAttribute("href")).toBe("/ingestion");
  expect(screen.queryByText("New")).toBeNull();
});
```

Run: `cd ui && npx vitest run src/components/NavBar.test.jsx` → FAIL (link text is `+New`).

- [ ] **Step 2: Implement**

In `ui/src/components/NavBar.jsx`:
- Change the comment `{/* Databricks "+ New" Primary Action Button */}` to `{/* Primary action: start a new import */}`.
- In the open-sidebar link, change `<span>New</span>` to `<span>นำเข้าข้อมูล</span>`.
- In the collapsed-sidebar link, change `title="+ New"` to `title="นำเข้าข้อมูล"` and add `aria-label="นำเข้าข้อมูล"`.

Run: `cd ui && npx vitest run` → all pass.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/NavBar.jsx ui/src/components/NavBar.test.jsx
git commit -m "fix(nav): rename '+ New' to '+ นำเข้าข้อมูล'

The button looked like a create-anything menu but only opens Data
Ingestion. The label now says so.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Backend only sends files the rule engine can read into it

**Files:**
- Modify: `api/app/api/whitebox.py` (next to `_read_uploaded_table`, and the `if {"student_id", "course", "score"}.issubset(...)` line in `upload_csv_dataset`)
- Test: `tests/test_upload_table.py`

**Interfaces:**
- Produces: `QUALITY_ENGINE_COLUMNS: tuple[str, ...] = ("student_id", "course", "score", "study_hours")` and `_is_supported_schema(columns) -> bool` in `api/app/api/whitebox.py`. Task 6 mirrors the same column list in the UI.

- [ ] **Step 1: Reproduce the 500**

With the stack running and a session cookie (`curl -c` on `POST /api/v1/auth/login` with `{"username":"admin","password":"admin"}`), upload a CSV with only three of the columns:

```bash
printf 'student_id,course,score\nS1,CS101,80\nS2,CS101,90\n' > /tmp/no_hours.csv
curl -s -b cookies.txt -F table_name=no_hours -F "file=@/tmp/no_hours.csv;type=text/csv" \
  http://localhost/api/v1/whitebox/upload-csv -w "\nHTTP:%{http_code}\n"
```

Expected: `HTTP:500` and `KeyError: 'study_hours'` in `docker compose logs --tail=30 api`.

- [ ] **Step 2: Write the failing test**

In `tests/test_upload_table.py`, change the import to `from app.api.whitebox import _read_uploaded_table, _is_supported_schema` and append:

```python
def test_supported_schema_needs_every_column_the_rule_engine_reads():
    assert _is_supported_schema(["student_id", "course", "semester", "score", "study_hours"])
    # _recompute_interactive_state reads df["study_hours"] unconditionally;
    # a file without it used to be routed into the engine and 500 with KeyError.
    assert not _is_supported_schema(["student_id", "course", "score"])
    assert not _is_supported_schema(["วันที่", "รายการสินค้า", "จำนวน"])
```

Run the backend test command from Global Constraints.
Expected: FAIL — `ImportError: cannot import name '_is_supported_schema'`.

- [ ] **Step 3: Implement**

In `api/app/api/whitebox.py`, directly after the `_read_uploaded_table` function, add:

```python
# Columns the quality-rule engine (_recompute_interactive_state) reads
# directly. A file missing any of them can be profiled, but must not be
# sent into the engine.
QUALITY_ENGINE_COLUMNS = ("student_id", "course", "score", "study_hours")


def _is_supported_schema(columns) -> bool:
    return set(QUALITY_ENGINE_COLUMNS).issubset(set(columns))
```

In `upload_csv_dataset`, replace

```python
    if {"student_id", "course", "score"}.issubset(set(df_up.columns)):
```

with

```python
    if _is_supported_schema(df_up.columns):
```

- [ ] **Step 4: Verify**

Run the backend test command again (it rebuilds the image) → all tests in `tests/test_upload_table.py` PASS.
Repeat the Step 1 curl → `HTTP:200` with a `profile` whose `total_columns` is 3.

- [ ] **Step 5: Commit**

```bash
git add api/app/api/whitebox.py tests/test_upload_table.py
git commit -m "fix(upload): files without study_hours crashed the rule engine

Upload routed any file with student_id/course/score into
_recompute_interactive_state, which reads study_hours unconditionally
and raised KeyError -> 500. Routing now requires every column the
engine reads; other files are profiled only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ingestion says when automatic checks cannot run

**Files:**
- Modify: `ui/src/test/renderPage.jsx` (`renderPage` accepts routes)
- Modify: `ui/src/pages/Ingestion.jsx:596-612` (derived values) and `:812-910` (results JSX)
- Modify: `ui/src/pages/Ingestion.css` (add `.ing-notice-info`)
- Test: `ui/src/pages/Ingestion.test.jsx`

**Interfaces:**
- Consumes: `mockFetchByUrl` (Task 1). The column list must equal `QUALITY_ENGINE_COLUMNS` from Task 5.
- Produces: `renderPage(Component, path = "/", routes?)`. With `routes`, fetch is mocked by `mockFetchByUrl(routes)`; without, by `mockFetchEmpty()` as today.

- [ ] **Step 1: Let renderPage take routes**

In `ui/src/test/renderPage.jsx`, change the signature and the first line of `renderPage`:

```js
export async function renderPage(Component, path = "/", routes) {
  if (routes) mockFetchByUrl(routes); else mockFetchEmpty();
```

(`mockFetchByUrl` is defined above it in the same file since Task 1.)

- [ ] **Step 2: Write the failing test**

Append to `ui/src/pages/Ingestion.test.jsx`:

```jsx
it("says the automatic checks need specific columns instead of reporting no problems", async () => {
  await renderPage(Ingestion, "/ingestion", [
    ["/whitebox/profile", { body: {
      total_rows: 562,
      total_columns: 5,
      columns_profile: { "วันที่": {}, "รายการสินค้า": {}, "จำนวน": {}, "ราคาต่อหน่วย": {}, "ยอดขายรวม": {} },
      duplicate_analysis: { tested_composite_key: [], duplicate_rows_detected: 0 }
    } }]
  ]);
  expect(screen.getByRole("status")).toHaveTextContent("study_hours");
  expect(screen.queryByText(/ไม่พบปัญหา/)).toBeNull();
  expect(screen.queryByText("ค่าว่างและช่วงค่า")).toBeNull();
});
```

Run: `cd ui && npx vitest run src/pages/Ingestion.test.jsx` → FAIL (no `status` element; header says "ไม่พบปัญหา").

- [ ] **Step 3: Implement the derived values**

In `ui/src/pages/Ingestion.jsx`, above `export default function Ingestion()`, add:

```js
// Must match QUALITY_ENGINE_COLUMNS in api/app/api/whitebox.py.
const QUALITY_CHECK_COLUMNS = ["student_id", "course", "score", "study_hours"];
```

Replace lines 596-612 (from `const colProfiles` through the `issueSummary` declaration) with:

```js
  // An empty object is not a profile; only a response with a row count is.
  const hasProfile = profilingData?.total_rows != null;
  const colProfiles = profilingData?.columns_profile || profilingData?.column_profiles || {};
  const missingCheckColumns = QUALITY_CHECK_COLUMNS.filter((c) => !(c in colProfiles));
  const checksSupported = missingCheckColumns.length === 0;
  const scoreProf = colProfiles.score || {};
  const hoursProf = colProfiles.study_hours || {};
  const totalIngestedRows = profilingData?.total_rows;
  const duplicateRows = profilingData?.duplicate_analysis?.duplicate_rows_detected;
  const duplicateKey = profilingData?.duplicate_analysis?.tested_composite_key || [];
  const distinctRows = totalIngestedRows != null && duplicateRows != null ? totalIngestedRows - duplicateRows : null;
  const fmtNum = (v) => (v == null ? "—" : Number(v).toLocaleString());
  const issueParts = [
    ["ค่าว่าง", scoreProf.null_count],
    ["ซ้ำ", duplicateRows],
    ["ผิดปกติ", hoursProf.outlier_count]
  ].filter(([, v]) => v > 0);
  const issueCount = issueParts.length;
  const issueSummary = !checksSupported
    ? "ตรวจอัตโนมัติไม่ได้ (คอลัมน์ไม่ครบ)"
    : issueCount
      ? `พบปัญหา ${issueCount} ด้าน: ${issueParts.map(([label, v]) => `${label} ${Number(v).toLocaleString()}`).join(" · ")}`
      : "ไม่พบปัญหา";
```

- [ ] **Step 4: Implement the JSX**

In the results section (`{/* Profiling results */}` onward):
- Replace every `profilingData ?` / `{profilingData && (` guard in that section with `hasProfile` (four places: the header `<p>`, the actions block, the summary strip, the findings wrapper). Keep `{profilingLoading && !profilingData && (` as is.
- Replace the fourth summary tile with:

```jsx
<div className={!checksSupported ? "" : issueCount ? "is-warn" : "is-ok"}>
  <span>ประเด็นที่ต้องดูแล</span>
  <strong>{checksSupported ? `${issueCount} / 3` : "—"}</strong>
</div>
```

- Replace the opening `<div className="ing-findings">` with:

```jsx
{!checksSupported && (
  <div className="ing-notice ing-notice-info" role="status">
    การตรวจคุณภาพอัตโนมัติรองรับเฉพาะข้อมูลที่มีคอลัมน์ {QUALITY_CHECK_COLUMNS.join(", ")} · ไฟล์นี้ไม่มี: {missingCheckColumns.join(", ")}
  </div>
)}
{checksSupported && (
<div className="ing-findings">
```

- Replace the `</div>` that closes `.ing-findings` (the line right before `<LearnMore summary="ค้นหาเรคคอร์ด">`) with:

```jsx
</div>
)}
```

In `ui/src/pages/Ingestion.css`, next to `.ing-notice-error`, add:

```css
.ing-notice-info { background: var(--db-blue-light); color: #0369A1; }
```

- [ ] **Step 5: Run tests and build**

Run: `cd ui && npx vitest run` → all pass (including the text-budget tests).
Run: `cd ui && npm run build` → built with no errors.

- [ ] **Step 6: Commit**

```bash
git add ui/src/test/renderPage.jsx ui/src/pages/Ingestion.jsx ui/src/pages/Ingestion.css ui/src/pages/Ingestion.test.jsx
git commit -m "fix(ingestion): say when automatic checks can't run, not 'no problems'

For files without student_id/course/score/study_hours the page showed
'ไม่พบปัญหา' and a green 0/3, because the checks look only at those
columns. It now shows which columns are missing and hides the cards.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Deploy and check in the running app

**Files:** none changed unless a check fails.

- [ ] **Step 1: Deploy**

```bash
cd /c/ETL && docker compose build api ui && docker compose up -d api ui
```

- [ ] **Step 2: Check each fix at http://localhost (login admin/admin)**

| Check | Expected |
|---|---|
| Sidebar, Expectations & Alerts | Grey `2` and, if proposals exist, an orange `N รอ` |
| Sidebar footer | `1 บริการออฟไลน์` while Kafka is down; hover lists `Kafka Broker` |
| Sidebar top button | `+ นำเข้าข้อมูล`, opens Data Ingestion |
| Ingestion → ฐานข้อมูล → submit, before any upload after an API restart | Red message `ยังไม่มีข้อมูลในระบบ…`, no `/app/` path |
| Ingestion → upload `C:\Users\THIN\Downloads\grocery_raw_sales_data.xlsx` | Blue notice listing missing columns; no finding cards; header does not say `ไม่พบปัญหา` |
| Ingestion → upload `C:\ETL\dirty_course_scores_demo.csv` | Three finding cards as before (12 / 13 / 12) |

- [ ] **Step 3: Full suite one last time**

Run: `cd ui && npx vitest run` → all pass. Report the count.

Note: the upload in the last row replaces the active dataset. Upload `dirty_course_scores_demo.csv` last so the demo data stays active.
