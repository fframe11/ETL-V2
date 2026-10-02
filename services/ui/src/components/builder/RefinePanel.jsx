import React, { useState } from "react";

export const REFINE_EXAMPLES = [
  "เพิ่มกราฟยอดขายรายเดือน",
  "เปลี่ยนกราฟนี้เป็น Bar Chart",
  "เพิ่ม Filter จังหวัด",
  "เน้น KPI ที่สำคัญ",
  "ปรับ Layout ให้เหมาะกับผู้บริหาร"
];

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

export default function RefinePanel({ onRefine, busy, changes, history = [] }) {
  const [text, setText] = useState("");
  const ready = text.trim().length >= 2 && !busy;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    if (await onRefine(text.trim())) setText("");
  };

  return (
    <form className="dbb-refine" onSubmit={submit} aria-label="ปรับด้วย AI">
      <label htmlFor="dbb-refine-input">ปรับแดชบอร์ดด้วย AI</label>
      <textarea id="dbb-refine-input" rows={3} maxLength={1000} value={text} placeholder={REFINE_EXAMPLES[0]}
        onChange={(e) => setText(e.target.value)} />
      <div className="dbb-chips">
        {REFINE_EXAMPLES.map((example) => (
          <button type="button" key={example} className="dbb-chip" onClick={() => setText(example)}>{example}</button>
        ))}
      </div>
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
