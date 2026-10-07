import React, { useState } from "react";
import {
  AGG_LABELS, FORMAT_LABELS, MAX_METRICS, METRIC_AGGS, WHERE_OPS,
  columnsFor, describeMetric, emptyMetric, idProblem, metricValueText, opsForKind, toMetricBody, whereProblem
} from "./semanticModel";

// The first reason a metric part cannot be used: a column that is not offered (a stale pick after the
// calculation changed, or a hidden column) or a condition the server would reject.
function partProblem(title, part, { profile, columns, hidden }, simple) {
  if (part.agg !== "count" && !columnsFor(part.agg, profile, columns, hidden).includes(part.column)) return `${title}: เลือกคอลัมน์`;
  if (!part.where) return "";
  const offered = columnsFor("count", profile, columns, hidden).includes(part.where.column);
  const kind = offered ? profile.columns.find((c) => c.name === part.where.column)?.kind : undefined;
  const problem = whereProblem(part.where, kind);
  return problem && !simple ? `${title}: ${problem}` : problem;
}

function PartFields({ title, part, onChange, profile, columns, hidden }) {
  const options = columnsFor(part.agg, profile, columns, hidden);
  const whereColumns = columnsFor("count", profile, columns, hidden);
  const labelOf = (name) => columns[name]?.label || name;
  const kindOf = (name) => profile.columns.find((c) => c.name === name)?.kind;
  const where = part.where;
  const ops = where ? opsForKind(kindOf(where.column)) : [];
  const changeAgg = (agg) => {
    const keep = agg !== "count" && columnsFor(agg, profile, columns, hidden).includes(part.column);
    onChange({ ...part, agg, column: keep ? part.column : agg === "count" ? null : "" });
  };
  const changeWhereColumn = (column) => {
    const op = opsForKind(kindOf(column)).includes(where.op) ? where.op : "eq";
    onChange({ ...part, where: { ...where, column, op } });
  };
  return (
    <fieldset className="dbb-metric-part">
      <legend>{title}</legend>
      <select aria-label={`${title}: การคำนวณ`} value={part.agg} onChange={(e) => changeAgg(e.target.value)}>
        {METRIC_AGGS.map((agg) => <option key={agg} value={agg}>{AGG_LABELS[agg]}</option>)}
      </select>
      {part.agg !== "count" && (
        <select aria-label={`${title}: คอลัมน์`} value={part.column || ""} onChange={(e) => onChange({ ...part, column: e.target.value })}>
          <option value="">เลือกคอลัมน์</option>
          {options.map((name) => <option key={name} value={name}>{labelOf(name)}</option>)}
        </select>
      )}
      <label className="dbb-check">
        <input type="checkbox" aria-label={`${title}: มีเงื่อนไข`} checked={Boolean(where)}
          disabled={!where && whereColumns.length === 0}
          onChange={(e) => onChange({ ...part, where: e.target.checked ? { column: whereColumns[0] || "", op: "eq", value: "" } : null })} />
        มีเงื่อนไข
      </label>
      {where && (
        <>
          <select aria-label={`${title}: คอลัมน์เงื่อนไข`} value={whereColumns.includes(where.column) ? where.column : ""}
            onChange={(e) => changeWhereColumn(e.target.value)}>
            <option value="">เลือกคอลัมน์</option>
            {whereColumns.map((name) => <option key={name} value={name}>{labelOf(name)}</option>)}
          </select>
          <select aria-label={`${title}: ตัวเทียบ`} value={where.op} onChange={(e) => onChange({ ...part, where: { ...where, op: e.target.value } })}>
            {ops.map((op) => <option key={op} value={op}>{WHERE_OPS[op]}</option>)}
          </select>
          <input aria-label={`${title}: ค่า`} value={Array.isArray(where.value) ? where.value.join(", ") : String(where.value ?? "")}
            onChange={(e) => onChange({ ...part, where: { ...where, value: e.target.value } })} />
        </>
      )}
    </fieldset>
  );
}

// `metrics` and `index` (null for a new metric) let the form check the id against the other metrics.
export function MetricForm({ initial, profile, columns, hidden, metrics = [], index = null, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({ ...emptyMetric(), ...initial }));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const parts = { profile, columns, hidden };
  const simple = form.type === "simple";
  const problem =
    (form.label.trim() ? "" : "ใส่ชื่อ metric") ||
    (simple
      ? partProblem("ค่า", form.measure, parts, true)
      : partProblem("ตัวตั้ง", form.numerator, parts, false) || partProblem("ตัวหาร", form.denominator, parts, false)) ||
    idProblem(form.id, metrics, index) ||
    (index === null && metrics.length >= MAX_METRICS ? `มีได้สูงสุด ${MAX_METRICS} metric` : "");
  const ready = problem === "";
  const submit = (e) => {
    e.preventDefault();
    if (ready) onSave(toMetricBody(form, profile));
  };

  return (
    <form className="dbb-metric-form" onSubmit={submit}>
      <label htmlFor="dbb-metric-label">ชื่อ metric</label>
      <input id="dbb-metric-label" maxLength={60} value={form.label} onChange={(e) => set({ label: e.target.value })} />
      <label htmlFor="dbb-metric-id">รหัส</label>
      <input id="dbb-metric-id" maxLength={40} value={form.id} placeholder="เว้นว่างให้ระบบสร้างจากชื่อ"
        onChange={(e) => set({ id: e.target.value })} />
      <label htmlFor="dbb-metric-description">คำอธิบาย</label>
      <input id="dbb-metric-description" maxLength={300} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      <label htmlFor="dbb-metric-type">ชนิด</label>
      <select id="dbb-metric-type" value={form.type} onChange={(e) => set({ type: e.target.value })}>
        <option value="simple">ค่าเดี่ยว</option>
        <option value="ratio">อัตราส่วน</option>
      </select>
      {form.type === "simple" ? (
        <PartFields title="ค่า" part={form.measure} onChange={(measure) => set({ measure })} {...parts} />
      ) : (
        <>
          <PartFields title="ตัวตั้ง" part={form.numerator} onChange={(numerator) => set({ numerator })} {...parts} />
          <PartFields title="ตัวหาร" part={form.denominator} onChange={(denominator) => set({ denominator })} {...parts} />
        </>
      )}
      <label htmlFor="dbb-metric-format">รูปแบบ</label>
      <select id="dbb-metric-format" value={form.format} onChange={(e) => set({ format: e.target.value })}>
        {Object.entries(FORMAT_LABELS).map(([format, label]) => <option key={format} value={format}>{label}</option>)}
      </select>
      {form.format === "currency" && (
        <>
          <label htmlFor="dbb-metric-currency">สกุลเงิน</label>
          <input id="dbb-metric-currency" list="dbb-currencies" maxLength={3} value={form.currency || ""}
            onChange={(e) => set({ currency: e.target.value.trim().toUpperCase() || null })} />
        </>
      )}
      <label className="dbb-check">
        <input type="checkbox" checked={form.higher_is_better} onChange={(e) => set({ higher_is_better: e.target.checked })} />
        ยิ่งสูงยิ่งดี
      </label>
      {problem && <p className="dbb-error-inline">{problem}</p>}
      <div className="dbb-actions">
        <button type="button" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="dbb-btn-primary" disabled={!ready}>ใช้ metric นี้</button>
      </div>
    </form>
  );
}

export default function MetricPanel({ profile, columns, metrics, view, onChange }) {
  const [editing, setEditing] = useState(null); // index of the metric being edited, or "new"
  const hidden = view.hidden_columns;
  const labelOf = (name) => columns[name]?.label || name;
  // The list can be replaced under an open form (a draft reply); an index that no longer exists closes it.
  const active = editing === "new" || metrics[editing] ? editing : null;
  const save = (metric) => {
    onChange(active === "new" ? [...metrics, metric] : metrics.map((m, i) => (i === active ? metric : m)));
    setEditing(null);
  };

  return (
    <section className="dbb-metrics" aria-label="Metric">
      <div className="dbb-toolbar">
        <h3>Metric</h3>
        {metrics.length >= MAX_METRICS && <span className="dbb-muted">มีได้สูงสุด {MAX_METRICS} metric</span>}
        <button type="button" onClick={() => setEditing("new")} disabled={active !== null || metrics.length >= MAX_METRICS}>เพิ่ม metric</button>
      </div>
      <ul>
        {metrics.map((m, i) => (
          <li key={m.id || `new-${i}`}>
            <div>
              <strong>{m.label}</strong>{" "}
              <span className="dbb-muted">{describeMetric(m, labelOf)}</span>
            </div>
            <span className="dbb-metric-value">{metricValueText(m, view)}</span>
            <div className="dbb-actions">
              <button type="button" aria-label={`แก้ ${m.label}`} onClick={() => setEditing(i)} disabled={active !== null}>แก้</button>
              <button type="button" aria-label={`ลบ ${m.label}`} onClick={() => onChange(metrics.filter((_, j) => j !== i))}
                disabled={active !== null}>ลบ</button>
            </div>
          </li>
        ))}
        {view.invalid_metrics.map((m) => (
          <li key={`invalid-${m.id}`} className="is-invalid">ใช้ไม่ได้ {m.label || m.id}: {m.reason}</li>
        ))}
      </ul>
      {active !== null && (
        <MetricForm initial={active === "new" ? {} : metrics[active]} profile={profile} columns={columns} hidden={hidden}
          metrics={metrics} index={active === "new" ? null : active} onSave={save} onCancel={() => setEditing(null)} />
      )}
    </section>
  );
}
