import React from "react";

const count = (n) => Number(n).toLocaleString("en-US");
const percent = (n) => `${Number(n).toFixed(2)}%`;

export function describeQuality(quality) {
  if (!quality || quality.score == null) return { tone: "none", text: "ยังไม่มีผลตรวจ" };
  if (quality.passed === true) return { tone: "ok", text: `${percent(quality.score)} ผ่านเกณฑ์` };
  if (quality.passed === false) return { tone: "low", text: `${percent(quality.score)} ต่ำกว่าเกณฑ์ ${quality.threshold}%` };
  return { tone: "unknown", text: `${percent(quality.score)} ไม่ทราบเกณฑ์` };
}

export function QualityBadge({ quality }) {
  const { tone, text } = describeQuality(quality);
  return <span className={`dbb-quality dbb-quality-${tone}`}>{text}</span>;
}

// Shown only when the latest quality run missed its threshold. The three run figures always add up
// (นำเข้า = ผ่าน + กักกัน) and "ผ่าน" is the row count the preview shows, unless the table also holds
// rows from earlier runs: the Spark job merges each run into the same table.
export function QualityNotice({ quality, tableRows }) {
  if (quality?.passed !== false) return null;
  const { total_records: total, clean_records: clean, quarantined_records: quarantined } = quality;
  const hasCounts = total != null && clean != null && quarantined != null;
  const accumulated = hasCounts && tableRows != null && tableRows !== clean;
  return (
    <aside className="dbb-quality-notice" aria-label="คุณภาพข้อมูล">
      <strong>{describeQuality(quality).text}</strong>
      <span>
        รอบตรวจล่าสุด
        {hasCounts ? ` นำเข้า ${count(total)} แถว ผ่าน ${count(clean)} กักกัน ${count(quarantined)}` : " ไม่ถึงเกณฑ์"}
        {accumulated ? ` ตารางนี้มี ${count(tableRows)} แถว เพราะสะสมข้อมูลหลายรอบ` : ""}
        {" "}ตัวเลขในแดชบอร์ดอาจไม่ครบ ควรตรวจก่อนนำไปใช้
      </span>
    </aside>
  );
}
