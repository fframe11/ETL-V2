import React, { useEffect, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";

export const AUDIENCES = [
  { value: "business", label: "Business User" },
  { value: "analyst", label: "Data Analyst" },
  { value: "management", label: "Management" }
];

// Each suggestion is one line of the request: picking it adds the line, picking it again removes it.
export function toggleLine(context, line) {
  const lines = context.split("\n").filter((l) => l.trim());
  return (lines.includes(line) ? lines.filter((l) => l !== line) : [...lines, line]).join("\n");
}

export default function ContextForm({ table, tableName, value, onChange, onGenerate, busy }) {
  const [suggestions, setSuggestions] = useState(null); // null while loading
  const ready = value.context.trim().length >= 3 && !busy;
  const lines = value.context.split("\n");

  // The suggestions depend on the dataset's columns and on who reads the dashboard.
  useEffect(() => {
    let alive = true;
    dashboardsApi.suggestions(tableName, value.audience)
      .then((res) => { if (alive) setSuggestions(res.suggestions || []); })
      .catch(() => { if (alive) setSuggestions([]); });
    return () => { alive = false; };
  }, [tableName, value.audience]);

  const submit = (e) => {
    e.preventDefault();
    if (ready) onGenerate();
  };

  return (
    <form className="dbb-context" onSubmit={submit}>
      <label htmlFor="dbb-context-input">อยากวิเคราะห์อะไรจาก {table}</label>
      <div className="dbb-chips" role="group" aria-label="คำแนะนำจากข้อมูล" aria-busy={suggestions === null}>
        {suggestions === null && <p className="dbb-muted">กำลังอ่านข้อมูลเพื่อแนะนำ…</p>}
        {suggestions?.length === 0 && <p className="dbb-muted">ยังไม่มีคำแนะนำสำหรับชุดข้อมูลนี้ พิมพ์สิ่งที่อยากเห็นได้เลย</p>}
        {suggestions?.map((s) => (
          <button type="button" key={s.id} className={`dbb-chip${lines.includes(s.text) ? " is-active" : ""}`}
            aria-pressed={lines.includes(s.text)} onClick={() => onChange({ ...value, context: toggleLine(value.context, s.text) })}>
            {s.text}
          </button>
        ))}
      </div>
      <textarea id="dbb-context-input" rows={4} maxLength={2000} value={value.context}
        placeholder="เลือกคำแนะนำด้านบน หรือพิมพ์สิ่งที่อยากเห็น"
        onChange={(e) => onChange({ ...value, context: e.target.value })} />
      <fieldset className="dbb-audience">
        <legend>ผู้ใช้แดชบอร์ด</legend>
        {AUDIENCES.map((a) => (
          <label key={a.value}>
            <input type="radio" name="dbb-audience" value={a.value} checked={value.audience === a.value}
              onChange={() => onChange({ ...value, audience: a.value })} />
            {a.label}
          </label>
        ))}
      </fieldset>
      <div className="dbb-actions">
        <button type="submit" className="dbb-btn-primary" disabled={!ready}>
          {busy ? "AI กำลังออกแบบแดชบอร์ด…" : "สร้างแดชบอร์ดด้วย AI"}
        </button>
      </div>
    </form>
  );
}
