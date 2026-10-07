import React from "react";
import { statusText } from "./semanticModel";

export default function SemanticStatus({ view, dirty, busy, onDraft, onSaveDraft, onApprove }) {
  const offline = view.status === "unavailable";
  return (
    <div className={`dbb-semantic-status is-${view.status}`}>
      <div>
        <strong role="status">{statusText(view)}</strong>
        {view.status !== "approved" && <p className="dbb-muted">ยังไม่ได้อนุมัติความหมายคอลัมน์ ตัวเลขอาจแสดงหน่วยไม่ถูก</p>}
        {dirty && <p className="dbb-muted">มีการแก้ไขที่ยังไม่บันทึก</p>}
      </div>
      <div className="dbb-actions">
        <button type="button" onClick={onDraft} disabled={offline || Boolean(busy)}>
          {busy === "draft" ? "AI กำลังร่าง…" : "ให้ AI ร่าง"}
        </button>
        <button type="button" onClick={onSaveDraft} disabled={offline || !dirty || Boolean(busy)}>บันทึกร่าง</button>
        <button type="button" className="dbb-btn-primary" onClick={onApprove} disabled={offline || Boolean(busy)}>
          {busy === "approve" ? "กำลังอนุมัติ…" : "อนุมัติ"}
        </button>
      </div>
    </div>
  );
}
