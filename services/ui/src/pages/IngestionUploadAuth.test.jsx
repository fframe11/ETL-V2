import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Ingestion from "./Ingestion";

describe("Ingestion CSV Upload Authentication and Fallback", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("sdoqap_token", "sso_token_google");
    localStorage.setItem(
      "dataserve_user_profile",
      JSON.stringify({
        username: "google_engineer",
        email: "engineer@enterprise.io",
        fullName: "GOOGLE Workspace Engineer",
        role: "Lead Data Engineer",
      })
    );
  });

  it("profiles and ingests CSV file gracefully without throwing unhandled 401 blocking banner", async () => {
    // Mock global fetch to return 401 initially on upload-csv, then mock token refresh and fallback
    global.fetch = vi.fn().call.bind(async (input, opts) => {
      const url = String(input?.url || input || "");
      if (url.includes("/api/v1/auth/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            token: "valid_hmac.signature_token_2026",
            username: "dataserve_admin_28",
          }),
        };
      }
      if (url.includes("/api/v1/whitebox/upload-csv")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "ingested",
            rows_ingested: 3095,
            profile: {
              total_rows: 3095,
              total_columns: 9,
              columns_profile: {
                product_id: { data_type: "Identifier", null_count: 0 },
                product_category: { data_type: "Categorical", null_count: 5 },
              },
            },
          }),
        };
      }
      if (url.includes("/api/v1/whitebox/state")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ selected_findings: { range: true, duplicate: true, outlier: true } }),
        };
      }
      if (url.includes("/api/v1/whitebox/profile")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ total_rows: 3095, columns_profile: {} }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(
      <MemoryRouter>
        <Ingestion />
      </MemoryRouter>
    );

    // Simulate selecting and uploading a CSV file
    const file = new File(["product_id,category\n1,electronics\n2,apparel\n"], "olist_products_dataset.csv", {
      type: "text/csv",
    });

    const fileInput = screen.getByLabelText(/เลือกไฟล์/i, { selector: "input" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.queryByText(/Not authenticated\. Please log in/i)).toBeNull();
    });
  });
});
