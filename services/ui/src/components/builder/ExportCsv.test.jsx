import React from "react";
import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ExportCsv from "./ExportCsv";
import { mockFetchByUrl } from "../../test/renderPage";
import { SEMANTIC_VIEW } from "../../test/dashboardFixtures";

const FILE = { headers: { "Content-Disposition": 'attachment; filename="sales_20261008.csv"' } };
const NORTH = { region: { values: ["North"] } };
const PERSONAL = { ...SEMANTIC_VIEW, hidden_columns: ["Customer_Name"] };
const WARNING = "ไฟล์จะมีข้อมูลส่วนบุคคลจากคอลัมน์ Customer_Name เก็บไฟล์ให้ปลอดภัยและอย่าส่งต่อเกินจำเป็น ระบบบันทึกชื่อผู้ส่งออกไว้";

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

let saved; // the file names the page asked the browser to save
beforeEach(() => {
  saved = [];
  window.URL.createObjectURL = vi.fn(() => "blob:x");
  window.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function save() { saved.push(this.download); });
});

async function mount(routes, props = {}) {
  const fetchMock = mockFetchByUrl(routes);
  await act(async () => { render(<ExportCsv table="sales" selections={NORTH} {...props} />); });
  await settle();
  return fetchMock;
}

const exportCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => String(url).includes("/dashboards/export"));
const clickExport = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: "ส่งออก CSV" })); });

it("downloads the rows the filters select, without personal columns", async () => {
  const fetchMock = await mount([["/dashboards/export", FILE], ["/semantic/sales", { body: SEMANTIC_VIEW }]]);
  expect(screen.queryByLabelText("รวมข้อมูลส่วนบุคคล")).toBeNull(); // nothing is hidden in this dataset
  await clickExport();
  await settle();
  expect(JSON.parse(exportCalls(fetchMock)[0][1].body)).toEqual({ table_name: "sales", selections: NORTH, include_personal: false });
  expect(saved).toEqual(["sales_20261008.csv"]);
  expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
});

it("offers personal columns only when the saved meaning hides some, unticked and with a warning", async () => {
  const fetchMock = await mount([["/dashboards/export", FILE], ["/semantic/sales", { body: PERSONAL }]]);
  const box = screen.getByLabelText("รวมข้อมูลส่วนบุคคล");
  expect(box).not.toBeChecked();
  expect(screen.queryByText(WARNING)).toBeNull();
  fireEvent.click(box);
  expect(screen.getByText(WARNING)).toBeInTheDocument();
  await clickExport();
  await settle();
  expect(JSON.parse(exportCalls(fetchMock)[0][1].body).include_personal).toBe(true);
  // the next export starts without personal data again: each one is a new choice
  expect(screen.getByLabelText("รวมข้อมูลส่วนบุคคล")).not.toBeChecked();
});

it("keeps the box away when the column meaning cannot be read", async () => {
  const fetchMock = await mount([["/dashboards/export", FILE], ["/semantic/sales", { status: 503, body: { detail: "Elasticsearch service is offline" } }]]);
  expect(screen.queryByLabelText("รวมข้อมูลส่วนบุคคล")).toBeNull();
  await clickExport();
  await settle();
  expect(JSON.parse(exportCalls(fetchMock)[0][1].body).include_personal).toBe(false);
});

it("makes one file per click and shows that it is working", async () => {
  let finish;
  const answer = (body, headers = {}) => ({ ok: true, status: 200, headers: new Headers(headers),
    json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob() });
  const fetchMock = vi.fn((url) => (String(url).includes("/dashboards/export")
    ? new Promise((resolve) => { finish = () => resolve(answer({}, FILE.headers)); })
    : Promise.resolve(answer(SEMANTIC_VIEW))));
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => { render(<ExportCsv table="sales" selections={{}} />); });
  const button = screen.getByRole("button", { name: "ส่งออก CSV" });
  fireEvent.click(button);
  fireEvent.click(button);
  await settle();
  expect(button).toBeDisabled();
  expect(screen.getByText("กำลังเตรียมไฟล์…")).toBeInTheDocument();
  await act(async () => { finish(); });
  await settle();
  expect(exportCalls(fetchMock)).toHaveLength(1);
  expect(button).toBeEnabled();
  expect(screen.queryByText("กำลังเตรียมไฟล์…")).toBeNull();
  expect(saved).toEqual(["sales_20261008.csv"]);
});

it("says why the export failed and lets the user try again", async () => {
  const detail = "ข้อมูลหลังกรองมี 1,200,000 แถว เกินที่ส่งออกได้ 1,000,000 แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่";
  await mount([["/dashboards/export", { status: 413, body: { detail } }], ["/semantic/sales", { body: SEMANTIC_VIEW }]]);
  await clickExport();
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent(detail);
  expect(screen.getByRole("button", { name: "ส่งออก CSV" })).toBeEnabled();
  expect(saved).toEqual([]);
});

it("cannot export while the dashboard is being recomputed", async () => {
  await mount([["/semantic/sales", { body: SEMANTIC_VIEW }]], { disabled: true });
  expect(screen.getByRole("button", { name: "ส่งออก CSV" })).toBeDisabled();
});

// A download that is still running when the dataset changes or the page closes is dropped.
function slowExport() {
  let finish;
  const reply = (body, headers = {}) => ({ ok: true, status: 200, headers: new Headers(headers),
    json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob() });
  const fetchMock = vi.fn((url) => (String(url).includes("/dashboards/export")
    ? new Promise((resolve) => { finish = () => resolve(reply({}, FILE.headers)); })
    : Promise.resolve(reply(SEMANTIC_VIEW))));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, finish: () => finish() };
}

it("drops a file that finishes after the dataset changed", async () => {
  const { finish } = slowExport();
  let view;
  await act(async () => { view = render(<ExportCsv table="sales" selections={{}} />); });
  await clickExport();
  await settle();
  await act(async () => { view.rerender(<ExportCsv table="orders" selections={{}} />); });
  await settle();
  expect(screen.getByRole("button", { name: "ส่งออก CSV" })).toBeEnabled(); // the new dataset is not blocked
  await act(async () => { finish(); });
  await settle();
  expect(saved).toEqual([]);
  expect(window.URL.createObjectURL).not.toHaveBeenCalled();
});

it("saves nothing and sets no state when the page closes during the download", async () => {
  const { finish } = slowExport();
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  let view;
  await act(async () => { view = render(<ExportCsv table="sales" selections={{}} />); });
  await clickExport();
  await settle();
  view.unmount();
  await act(async () => { finish(); });
  await settle();
  expect(saved).toEqual([]);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});
