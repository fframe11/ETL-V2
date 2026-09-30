import { it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { mockFetchByUrl } from "../test/renderPage";
import RunStatusLine from "./RunStatusLine";

afterEach(() => vi.useRealTimers());

it("renders nothing without an ingest id", () => {
  const { container } = render(<RunStatusLine ingestId={null} />);
  expect(container.textContent).toBe("");
});

it("shows the run state in Thai and stops polling at a final state", async () => {
  const fetchFn = mockFetchByUrl([["/pipeline/runs/i1", { body: { state: "SUCCEEDED" } }]]);
  await act(async () => { render(<RunStatusLine ingestId="i1" intervalMs={10} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  expect(screen.getByRole("status")).toHaveTextContent("ตรวจเสร็จแล้ว");
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

it("keeps polling while the run is queued", async () => {
  const fetchFn = mockFetchByUrl([["/pipeline/runs/i2", { body: { state: "QUEUED" } }]]);
  await act(async () => { render(<RunStatusLine ingestId="i2" intervalMs={10} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  expect(screen.getByRole("status")).toHaveTextContent("รอคิวตรวจ");
  expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
});
