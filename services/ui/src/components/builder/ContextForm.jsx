import React from "react";

export const EXAMPLES = [
  "สร้าง Dashboard สำหรับวิเคราะห์ยอดขายรายเดือน",
  "ต้องการดูสินค้าขายดีที่สุดและยอดขายแยกตามจังหวัด",
  "สร้าง Dashboard สำหรับติดตาม Data Quality"
];

export const AUDIENCES = [
  { value: "business", label: "Business User" },
  { value: "analyst", label: "Data Analyst" },
  { value: "management", label: "Management" }
];

export default function ContextForm({ table, value, onChange, onGenerate, busy }) {
  const ready = value.context.trim().length >= 3 && !busy;
  const submit = (e) => {
    e.preventDefault();
    if (ready) onGenerate();
  };

  return (
    <form className="dbb-context" onSubmit={submit}>
      <label htmlFor="dbb-context-input">อยากวิเคราะห์อะไรจาก {table}</label>
      <textarea id="dbb-context-input" rows={4} maxLength={2000} value={value.context} placeholder={EXAMPLES[0]}
        onChange={(e) => onChange({ ...value, context: e.target.value })} />
      <div className="dbb-chips" aria-label="ตัวอย่างความต้องการ">
        {EXAMPLES.map((example) => (
          <button type="button" key={example} className="dbb-chip" onClick={() => onChange({ ...value, context: example })}>
            {example}
          </button>
        ))}
      </div>
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
