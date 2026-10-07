// Choices and pure helpers for editing a dataset's semantic layer (column meaning + metrics).
// The server checks everything again (semantic_layer.validate_semantic); these only keep the form tidy.
export const ROLE_LABELS = { measure: "ตัววัด", dimension: "มิติ", time: "เวลา", identifier: "รหัส", text: "ข้อความ" };
export const UNIT_LABELS = { currency: "เงิน", percent: "เปอร์เซ็นต์", count: "จำนวนนับ", duration: "ระยะเวลา", number: "ตัวเลข" };
export const AGG_LABELS = { count: "นับแถว", count_distinct: "นับไม่ซ้ำ", sum: "ผลรวม", avg: "ค่าเฉลี่ย", min: "ต่ำสุด", max: "สูงสุด" };
export const DEFAULT_AGGS = ["sum", "avg", "min", "max", "count_distinct"];
export const DURATION_UNITS = { seconds: "วินาที", minutes: "นาที", hours: "ชั่วโมง", days: "วัน" };
export const CURRENCIES = ["THB", "USD", "EUR", "JPY", "CNY", "GBP", "SGD"];
const META_FIELDS = ["role", "label", "unit", "currency", "duration_unit", "default_agg", "pii"];

// measure needs a numeric column and time a date column (the same rule as the server).
export function roleOptions(kind) {
  return Object.keys(ROLE_LABELS).filter((role) => (role !== "measure" || kind === "numeric") && (role !== "time" || kind === "date"));
}

// Applies an edit and keeps the measure-only fields consistent with the role and the unit.
export function updateColumn(meta, patch) {
  const next = { ...meta, ...patch };
  if (next.role !== "measure") {
    return { ...next, unit: null, currency: null, duration_unit: null, default_agg: null };
  }
  next.unit = next.unit || "number";
  next.default_agg = next.default_agg || "sum";
  next.currency = next.unit === "currency" && typeof next.currency === "string" ? next.currency.trim().toUpperCase() || null : null;
  next.duration_unit = next.unit === "duration" ? next.duration_unit || "seconds" : null;
  return next;
}

// The editor state for a view from GET/PUT/POST /api/v1/semantic/{table}.
export function fromView(table, view) {
  if (!view?.effective) throw new Error("โหลดความหมายคอลัมน์ไม่ได้");
  return { table, view, columns: view.effective.columns, metrics: view.effective.metrics,
    dirty: false, conflict: false, warnings: view.warnings || [] };
}

export function differsFromApproved(name, meta, view) {
  const approved = view.approved?.columns?.[name];
  if (!approved) return false;
  return META_FIELDS.some((field) => (approved[field] ?? null) !== (meta[field] ?? null));
}

export function statusText(view) {
  const text = {
    none: "ยังไม่มีความหมายคอลัมน์ ระบบเดาให้จากชื่อคอลัมน์",
    draft: "ร่างแล้ว รออนุมัติ",
    approved: `อนุมัติแล้ว v${view.version}`,
    approved_outdated: `อนุมัติแล้ว v${view.version} แต่โครงสร้างเปลี่ยน: คอลัมน์ใหม่ ${view.drift.new_columns.length} · คอลัมน์ที่หายไป ${view.drift.missing_columns.length}`,
    unavailable: "เชื่อมต่อที่เก็บความหมายคอลัมน์ไม่ได้ ใช้ค่าที่เดาจากชื่อคอลัมน์"
  }[view.status];
  return view.pending_draft ? `${text} · มีร่างที่ยังไม่อนุมัติ` : text;
}
