import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useApi, postApi, setStaticDemoMode, isStaticDemoMode } from "./useApi";
import { setApiBaseUrl } from "../utils/apiConfig";

describe("useApi Hook & postApi Mutations", () => {
  beforeEach(() => {
    localStorage.clear();
    setApiBaseUrl(null);
    setStaticDemoMode(false);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setApiBaseUrl(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends credentials: 'include' on live API fetch requests", async () => {
    setApiBaseUrl("https://dataserve-api.onrender.com");
    setStaticDemoMode(false);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ status: "ok", total_rows: 100 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useApi("/whitebox/state"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ status: "ok", total_rows: 100 });
    expect(result.current.isPrecomputed).toBe(false);

    const liveCall = mockFetch.mock.calls.find(([url]) => String(url).includes("/api/v1/whitebox/state"));
    expect(liveCall).toBeTruthy();
    expect(liveCall[0]).toBe("https://dataserve-api.onrender.com/api/v1/whitebox/state");
    expect(liveCall[1].credentials).toBe("include");
  });

  it("handles live API errors without silently entering demo mode when API URL is configured", async () => {
    setApiBaseUrl("https://dataserve-api.onrender.com");
    setStaticDemoMode(false);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail: "Database pool exhausted" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useApi("/kpi/stats"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("HTTP 503");
    expect(result.current.isPrecomputed).toBe(false);
    expect(isStaticDemoMode()).toBe(false);
  });

  it("postApi executes live POST with credentials: 'include' when not in demo mode", async () => {
    setApiBaseUrl("https://dataserve-api.onrender.com");
    setStaticDemoMode(false);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await postApi("/whitebox/execute", { rules: [] });
    expect(res).toEqual({ success: true });

    const [calledUrl, options] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe("https://dataserve-api.onrender.com/api/v1/whitebox/execute");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
  });

  it("postApi blocks mutation requests when explicit demo mode is active", async () => {
    setStaticDemoMode(true);
    await expect(postApi("/whitebox/execute", { rules: [] })).rejects.toThrow("โหมดทดลองใช้งานออฟไลน์");
  });
});
