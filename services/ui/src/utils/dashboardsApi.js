import { requestJson } from "./requestJson";

const BASE = "/api/v1/dashboards";

const request = (path, options) => requestJson(`${BASE}${path}`, options);

export const dashboardsApi = {
  listDatasets: () => request("/datasets"),
  previewDataset: (table) => request(`/datasets/${encodeURIComponent(table)}/preview`),
  suggestions: (table, audience) =>
    request(`/datasets/${encodeURIComponent(table)}/suggestions?audience=${encodeURIComponent(audience)}`),
  generate: (table_name, context, audience) => request("/generate", { method: "POST", body: { table_name, context, audience } }),
  rankSuggestions: (table_name, audience) => request("/rank-suggestions", { method: "POST", body: { table_name, audience } }),
  suggestChanges: (table_name, spec) => request("/suggest-changes", { method: "POST", body: { table_name, spec } }),
  refine: (table_name, spec, instruction) => request("/refine", { method: "POST", body: { table_name, spec, instruction } }),
  render: (table_name, spec, selections) => request("/render", { method: "POST", body: { table_name, spec, selections } }),
  listSaved: () => request("/saved"),
  getSaved: (id) => request(`/saved/${encodeURIComponent(id)}`),
  createSaved: (doc) => request("/saved", { method: "POST", body: doc }),
  updateSaved: (id, doc) => request(`/saved/${encodeURIComponent(id)}`, { method: "PUT", body: doc }),
  deleteSaved: (id) => request(`/saved/${encodeURIComponent(id)}`, { method: "DELETE" })
};
