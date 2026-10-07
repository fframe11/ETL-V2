import { requestJson } from "./requestJson";

const url = (table, suffix = "") => `/api/v1/semantic/${encodeURIComponent(table)}${suffix}`;

// /api/v1/semantic: the column meaning and metric definitions of one dataset.
export const semanticApi = {
  get: (table) => requestJson(url(table)),
  draft: (table) => requestJson(url(table, "/draft"), { method: "POST" }),
  saveDraft: (table, body) => requestJson(url(table, "/draft"), { method: "PUT", body }),
  approve: (table, body) => requestJson(url(table, "/approve"), { method: "POST", body })
};
