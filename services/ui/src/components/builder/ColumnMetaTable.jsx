import React from "react";
import { KIND_LABELS } from "./DatasetPicker";
import {
  AGG_LABELS, CURRENCIES, DEFAULT_AGGS, DURATION_UNITS, ROLE_LABELS, UNIT_LABELS,
  differsFromApproved, roleOptions, updateColumn
} from "./semanticModel";

function UnitDetail({ name, meta, set }) {
  if (meta.unit === "currency") {
    return (
      <>
        <input aria-label={`สกุลเงิน ${name}`} list="dbb-currencies" maxLength={3} value={meta.currency || ""}
          onChange={(e) => set({ currency: e.target.value })} />
        {!meta.currency && <div className="dbb-error-inline">ระบุสกุลเงิน</div>}
      </>
    );
  }
  if (meta.unit === "duration") {
    return (
      <select aria-label={`หน่วยเวลา ${name}`} value={meta.duration_unit} onChange={(e) => set({ duration_unit: e.target.value })}>
        {Object.entries(DURATION_UNITS).map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}
      </select>
    );
  }
  return null;
}

// One editable row per column of the preview profile; the missing and distinct counts stay read-only.
export default function ColumnMetaTable({ profile, view, columns, onChange }) {
  const fresh = new Set(view.drift.new_columns);
  return (
    <div className="dbb-scroll">
      <table className="dbb-table dbb-meta-table">
        <thead>
          <tr>
            <th>คอลัมน์</th><th>ชนิด</th><th>บทบาท</th><th>ชื่อที่แสดง</th><th>หน่วย</th><th>สกุลเงิน / เวลา</th>
            <th>รวมแบบ</th><th>ส่วนบุคคล</th><th>ค่าว่าง</th><th>ค่าไม่ซ้ำ</th>
          </tr>
        </thead>
        <tbody>
          {profile.columns.map((c) => {
            const meta = columns[c.name];
            if (!meta) return null;
            const set = (patch) => onChange(c.name, updateColumn(meta, patch));
            const measure = meta.role === "measure";
            return (
              <tr key={c.name} className={differsFromApproved(c.name, meta, view) ? "is-changed" : ""}>
                <td><code>{c.name}</code>{fresh.has(c.name) && <span className="dbb-badge">ใหม่</span>}</td>
                <td>{KIND_LABELS[c.kind]}</td>
                <td>
                  <select aria-label={`บทบาท ${c.name}`} value={meta.role} onChange={(e) => set({ role: e.target.value })}>
                    {roleOptions(c.kind).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </td>
                <td>
                  <input aria-label={`ชื่อที่แสดง ${c.name}`} value={meta.label} placeholder={c.name} maxLength={60}
                    onChange={(e) => set({ label: e.target.value })} />
                </td>
                <td>
                  {measure && (
                    <select aria-label={`หน่วย ${c.name}`} value={meta.unit} onChange={(e) => set({ unit: e.target.value })}>
                      {Object.entries(UNIT_LABELS).map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}
                    </select>
                  )}
                </td>
                <td>{measure && <UnitDetail name={c.name} meta={meta} set={set} />}</td>
                <td>
                  {measure && (
                    <select aria-label={`รวมแบบ ${c.name}`} value={meta.default_agg} onChange={(e) => set({ default_agg: e.target.value })}>
                      {DEFAULT_AGGS.map((agg) => <option key={agg} value={agg}>{AGG_LABELS[agg]}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  <input type="checkbox" aria-label={`ส่วนบุคคล ${c.name}`} checked={meta.pii}
                    onChange={(e) => set({ pii: e.target.checked })} />
                </td>
                <td>{c.missing} ({c.missing_pct}%)</td>
                <td>{c.distinct}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="dbb-currencies">{CURRENCIES.map((code) => <option key={code} value={code} />)}</datalist>
    </div>
  );
}
