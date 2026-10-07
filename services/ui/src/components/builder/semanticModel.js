import { formatValue } from "../../utils/numberFormat";

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

export const METRIC_AGGS = ["count", "count_distinct", "sum", "avg", "min", "max"];
export const NUMERIC_AGGS = ["sum", "avg", "min", "max"];
export const WHERE_OPS = { eq: "=", ne: "≠", in: "อยู่ใน", gt: ">", gte: "≥", lt: "<", lte: "≤" };
export const FORMAT_LABELS = { number: "ตัวเลข", currency: "เงิน", percent: "เปอร์เซ็นต์" };

function describePart(part, labelOf) {
  const base = part.agg === "count" ? "count(*)" : `${part.agg}(${labelOf(part.column)})`;
  if (!part.where) return base;
  const value = Array.isArray(part.where.value) ? part.where.value.join(", ") : String(part.where.value);
  return `${base} เมื่อ ${labelOf(part.where.column)} ${WHERE_OPS[part.where.op]} ${value}`;
}

// The formula in plain words, with the columns' display names.
export function describeMetric(metric, labelOf = (name) => name) {
  return metric.type === "ratio"
    ? `${describePart(metric.numerator, labelOf)} ÷ ${describePart(metric.denominator, labelOf)}`
    : describePart(metric.measure, labelOf);
}

export function emptyMetric() {
  const part = () => ({ agg: "sum", column: "", where: null });
  return { id: "", label: "", description: "", type: "simple", measure: part(), numerator: part(), denominator: part(),
    format: "number", currency: null, higher_is_better: true };
}

function parseValue(where, kind) {
  const number = (v) => (kind === "numeric" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v);
  if (where.op === "in") return String(where.value).split(",").map((v) => v.trim()).filter(Boolean).map(number);
  return typeof where.value === "string" ? number(where.value.trim()) : where.value;
}

// The metric as the API expects it (semantic_layer.clean_metric). Without an id the server makes one from the label.
export function toMetricBody(form, profile) {
  const kindOf = (name) => profile.columns.find((c) => c.name === name)?.kind;
  const part = (p) => ({
    agg: p.agg,
    column: p.agg === "count" ? null : p.column,
    where: p.where ? { column: p.where.column, op: p.where.op, value: parseValue(p.where, kindOf(p.where.column)) } : null
  });
  const body = { label: form.label.trim(), description: (form.description || "").trim(), type: form.type, format: form.format,
    currency: form.format === "currency" ? form.currency || null : null, higher_is_better: form.higher_is_better };
  if (form.id && form.id.trim()) body.id = form.id.trim();
  if (form.type === "simple") body.measure = part(form.measure);
  else {
    body.numerator = part(form.numerator);
    body.denominator = part(form.denominator);
  }
  return body;
}

// Columns a metric part may use: never a hidden (personal) column; sum/avg/min/max need a numeric non-identifier.
export function columnsFor(agg, profile, columns, hidden) {
  return profile.columns
    .filter((c) => !hidden.includes(c.name))
    .filter((c) => !NUMERIC_AGGS.includes(agg) || (c.kind === "numeric" && columns[c.name]?.role !== "identifier"))
    .map((c) => c.name);
}

// The value the server computed, shown only while the metric is unchanged since then.
export function metricValueText(metric, view) {
  const original = view.effective.metrics.find((m) => m.id === metric.id);
  if (!original || JSON.stringify(original) !== JSON.stringify(metric)) return "บันทึกร่างเพื่อดูค่า";
  const value = view.metric_values?.[metric.id];
  if (value === null || value === undefined) return "ยังไม่มีค่า";
  return `ค่าปัจจุบัน ${formatValue(value, metric.format, metric.currency)}`;
}
