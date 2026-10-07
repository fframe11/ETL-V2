import React, { useEffect, useRef, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";

export const AUDIENCES = [
  { value: "business", label: "Business User" },
  { value: "analyst", label: "Data Analyst" },
  { value: "management", label: "Management" },
  { value: "steward", label: "ดูแลคุณภาพข้อมูล" }
];

// Each suggestion is one line of the request: picking it adds the line, picking it again removes it.
export function toggleLine(context, line) {
  const lines = context.split("\n").filter((l) => l.trim());
  return (lines.includes(line) ? lines.filter((l) => l !== line) : [...lines, line]).join("\n");
}

export default function ContextForm({ table, tableName, value, onChange, onGenerate, busy }) {
  const [suggestions, setSuggestions] = useState(null); // null while loading
  const [ai, setAi] = useState({ status: "idle" }); // idle | loading | done | error: the optional AI layer over the list
  const aiRun = useRef(0); // each AI request gets a number; an answer for an earlier list or reader type is dropped
  const ready = value.context.trim().length >= 3 && !busy;
  const lines = value.context.split("\n");

  // The suggestions depend on the dataset's columns and on who reads the dashboard.
  useEffect(() => {
    let alive = true;
    aiRun.current += 1; // a new list starts from the rules again
    setAi({ status: "idle" });
    dashboardsApi.suggestions(tableName, value.audience)
      .then((res) => { if (alive) setSuggestions(res.suggestions || []); })
      .catch(() => { if (alive) setSuggestions([]); });
    return () => { alive = false; };
  }, [tableName, value.audience]);

  useEffect(() => () => { aiRun.current += 1; }, []);

  // The AI only reorders and rewords what the rules already offer; if it cannot, the list stays as it is.
  const rank = async () => {
    const mine = aiRun.current + 1;
    aiRun.current = mine;
    setAi({ status: "loading" });
    try {
      const res = await dashboardsApi.rankSuggestions(tableName, value.audience);
      if (mine !== aiRun.current) return;
      if (!res.suggestions?.length) {
        setAi({ status: "error", message: "AI ไม่ได้เลือกคำแนะนำ ใช้คำแนะนำจากกฎต่อไป" });
        return;
      }
      setSuggestions(res.suggestions);
      setAi({ status: "done", model: res.model });
    } catch (e) {
      if (mine === aiRun.current) setAi({ status: "error", message: e.message });
    }
  };

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
      <div className="dbb-ai-row">
        <button type="button" onClick={rank} disabled={!suggestions?.length || ai.status === "loading"}>
          {ai.status === "loading" ? "AI กำลังเรียบเรียง…" : "เรียบเรียงด้วย AI"}
        </button>
        {/* always mounted, so a screen reader announces the text that appears in it */}
        <span className={ai.status === "error" ? "dbb-error-inline" : "dbb-muted"} aria-live="polite">
          {ai.status === "done" ? `จัดลำดับและเรียบเรียงโดย AI (${ai.model})` : ai.status === "error" ? ai.message : null}
        </span>
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
