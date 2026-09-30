import React from "react";
import { useRunStatus } from "../hooks/useRunStatus";

const LABELS = {
  QUEUED: "รอคิวตรวจ",
  RUNNING: "กำลังตรวจคุณภาพ",
  SUCCEEDED: "ตรวจเสร็จแล้ว",
  FAILED: "ตรวจไม่สำเร็จ",
  SKIPPED: "ข้าม เพราะมีรอบอื่นกำลังใช้ตารางนี้",
  TRIGGER_FAILED: "สั่งตรวจไม่สำเร็จ"
};

export default function RunStatusLine({ ingestId, intervalMs }) {
  const { state, error } = useRunStatus(ingestId, intervalMs);
  if (!ingestId) return null;
  const text = error ? "ยังอ่านสถานะรอบไม่ได้" : (LABELS[state] || "กำลังส่งงาน");
  return <p role="status" className="run-status-line">สถานะรอบ: {text}</p>;
}
