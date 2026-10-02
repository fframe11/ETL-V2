import React, { useEffect, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";
import { KIND_LABELS } from "./DatasetPicker";

export default function DataPreview({ table }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setError("");
    dashboardsApi.previewDataset(table)
      .then((p) => { if (alive) setPreview(p); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [table]);

  if (error) return <p role="alert" className="dbb-error">{error}</p>;
  if (!preview) return <p className="dbb-muted">กำลังโหลดตัวอย่างข้อมูล…</p>;
  const { profile, sample } = preview;
  const stats = [
    ["จำนวนแถว", profile.rows.toLocaleString("en-US")],
    ["จำนวนคอลัมน์", profile.column_count],
    ["ค่าว่าง", profile.missing_cells.toLocaleString("en-US")],
    ...Object.entries(KIND_LABELS).map(([kind, label]) => [`คอลัมน์${label}`, profile.kind_counts[kind] ?? 0])
  ];

  return (
    <div className="dbb-preview">
      <dl className="dbb-stats">
        {stats.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <h3>โครงสร้างคอลัมน์</h3>
      <div className="dbb-scroll">
        <table className="dbb-table">
          <thead>
            <tr><th>คอลัมน์</th><th>ประเภท</th><th>dtype</th><th>ค่าว่าง</th><th>ค่าไม่ซ้ำ</th></tr>
          </thead>
          <tbody>
            {profile.columns.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td><span className={`dbb-kind dbb-kind-${c.kind}`}>{KIND_LABELS[c.kind]}</span></td>
                <td><code>{c.dtype}</code></td>
                <td>{c.missing} ({c.missing_pct}%)</td>
                <td>{c.distinct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>ตัวอย่าง {sample.length} แถวแรก</h3>
      <div className="dbb-scroll">
        <table className="dbb-table">
          <thead>
            <tr>{profile.columns.map((c) => <th key={c.name}>{c.name}</th>)}</tr>
          </thead>
          <tbody>
            {sample.map((row, i) => (
              <tr key={i}>
                {profile.columns.map((c) => (
                  <td key={c.name}>{row[c.name] == null ? <span className="dbb-null">null</span> : String(row[c.name])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
