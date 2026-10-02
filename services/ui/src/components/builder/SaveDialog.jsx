import React, { useState } from "react";

export default function SaveDialog({ initial, onSave, onCancel, busy }) {
  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description || "");
  const ready = name.trim().length > 0 && !busy;
  const submit = (e) => {
    e.preventDefault();
    if (ready) onSave({ name: name.trim(), description: description.trim() });
  };

  return (
    <div className="dbb-modal" role="dialog" aria-modal="true" aria-labelledby="dbb-save-title">
      <form className="dbb-modal-card" onSubmit={submit}>
        <h2 id="dbb-save-title">บันทึกแดชบอร์ด</h2>
        <label htmlFor="dbb-save-name">ชื่อแดชบอร์ด</label>
        <input id="dbb-save-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="dbb-save-description">คำอธิบาย</label>
        <textarea id="dbb-save-description" rows={3} maxLength={500} value={description}
          onChange={(e) => setDescription(e.target.value)} />
        <div className="dbb-actions">
          <button type="button" onClick={onCancel}>ยกเลิก</button>
          <button type="submit" className="dbb-btn-primary" disabled={!ready}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      </form>
    </div>
  );
}
