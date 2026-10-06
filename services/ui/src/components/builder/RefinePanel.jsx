import React, { useEffect, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";

export function describeChanges(changes) {
  if (!changes) return [];
  const lines = [];
  if (changes.added?.length) lines.push(`เพิ่ม: ${changes.added.join(", ")}`);
  if (changes.changed?.length) lines.push(`แก้ไข: ${changes.changed.join(", ")}`);
  if (changes.removed?.length) lines.push(`ลบ: ${changes.removed.join(", ")}`);
  if (changes.filters_added?.length) lines.push(`เพิ่มตัวกรอง: ${changes.filters_added.join(", ")}`);
  if (changes.filters_removed?.length) lines.push(`ลบตัวกรอง: ${changes.filters_removed.join(", ")}`);
  if (changes.layout_changed) lines.push("จัดตำแหน่งใหม่");
  return lines.length ? lines : ["AI ไม่ได้เปลี่ยนอะไร"];
}

export default function RefinePanel({ tableName, spec, onRefine, busy, changes, history = [] }) {
  const [text, setText] = useState("");
  const [ideas, setIdeas] = useState(null); // null while the first list loads
  const ready = text.trim().length >= 2 && !busy;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    if (await onRefine(text.trim())) setText("");
  };

  // What the dashboard still lacks depends on its spec, so a refinement or an undo asks again.
  // The previous list stays on screen while the new one loads, so the panel does not jump.
  const specKey = JSON.stringify(spec);
  useEffect(() => {
    let alive = true;
    dashboardsApi.suggestChanges(tableName, spec)
      .then((res) => { if (alive) setIdeas(res.suggestions || []); })
      .catch(() => { if (alive) setIdeas([]); });
    return () => { alive = false; };
  }, [tableName, specKey]);

  return (
    <form className="dbb-refine" onSubmit={submit} aria-label="ปรับด้วย AI">
      <label htmlFor="dbb-refine-input">ปรับแดชบอร์ดด้วย AI</label>
      <div className="dbb-chips" role="group" aria-label="คำแนะนำปรับแดชบอร์ด" aria-busy={ideas === null}>
        {ideas === null && <p className="dbb-muted">กำลังอ่านแดชบอร์ดเพื่อแนะนำ…</p>}
        {ideas?.length === 0 && <p className="dbb-muted">ยังไม่มีคำแนะนำปรับ พิมพ์สิ่งที่อยากปรับได้เลย</p>}
        {ideas?.map((idea) => (
          <button type="button" key={idea.id} className="dbb-chip" onClick={() => setText(idea.text)}>{idea.text}</button>
        ))}
      </div>
      <textarea id="dbb-refine-input" rows={3} maxLength={1000} value={text} placeholder="เลือกคำแนะนำ หรือพิมพ์สิ่งที่อยากปรับ"
        onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="dbb-btn-primary" disabled={!ready}>{busy ? "AI กำลังปรับ…" : "ปรับแดชบอร์ด"}</button>
      {changes && (
        <ul className="dbb-changes" aria-label="สิ่งที่เปลี่ยน">
          {describeChanges(changes).map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {history.length > 0 && (
        <details>
          <summary>คำสั่งที่ใช้แล้ว {history.length} ครั้ง</summary>
          <ol>{history.map((h, i) => <li key={i}>{h}</li>)}</ol>
        </details>
      )}
    </form>
  );
}
