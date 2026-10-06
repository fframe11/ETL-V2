import { friendlyApiError } from "./apiError";

const BASE = "/api/v1/dashboards";

async function request(path, { method = "GET", body } = {}) {
  const options = { method, credentials: "same-origin" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
  }
  if (res.status === 401 && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "";
    throw new Error(friendlyApiError(detail, `คำขอล้มเหลว (HTTP ${res.status})`));
  }
  return data;
}

export const dashboardsApi = {
  listDatasets: () => request("/datasets"),
  previewDataset: (table) => request(`/datasets/${encodeURIComponent(table)}/preview`),
  suggestions: (table, audience) =>
    request(`/datasets/${encodeURIComponent(table)}/suggestions?audience=${encodeURIComponent(audience)}`),
  generate: (table_name, context, audience) => request("/generate", { method: "POST", body: { table_name, context, audience } }),
  suggestChanges: (table_name, spec) => request("/suggest-changes", { method: "POST", body: { table_name, spec } }),
  refine: (table_name, spec, instruction) => request("/refine", { method: "POST", body: { table_name, spec, instruction } }),
  render: (table_name, spec, selections) => request("/render", { method: "POST", body: { table_name, spec, selections } }),
  listSaved: () => request("/saved"),
  getSaved: (id) => request(`/saved/${encodeURIComponent(id)}`),
  createSaved: (doc) => request("/saved", { method: "POST", body: doc }),
  updateSaved: (id, doc) => request(`/saved/${encodeURIComponent(id)}`, { method: "PUT", body: doc }),
  deleteSaved: (id) => request(`/saved/${encodeURIComponent(id)}`, { method: "DELETE" })
};
