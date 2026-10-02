import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardsApi } from "../../utils/dashboardsApi";
import { friendlyApiError } from "../../utils/apiError";

export const KIND_LABELS = { numeric: "ตัวเลข", categorical: "หมวดหมู่", date: "วันที่", text: "ข้อความ" };

export function describeKinds(counts) {
  if (!counts) return "—";
  const parts = Object.entries(KIND_LABELS)
    .filter(([kind]) => counts[kind] > 0)
    .map(([kind, label]) => `${label} ${counts[kind]}`);
  return parts.length ? parts.join(" · ") : "—";
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function DatasetPicker({ selected, onSelect }) {
  const [datasets, setDatasets] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardsApi.listDatasets()
      .then((res) => setDatasets(res.datasets || []))
      .catch((e) => { setError(e.message); setDatasets([]); });
  }, []);

  if (datasets === null) return <p className="dbb-muted">กำลังโหลดชุดข้อมูล…</p>;
  if (error) return <p role="alert" className="dbb-error">{error}</p>;
  if (datasets.length === 0) {
    return (
      <div className="dbb-empty">
        <p>ยังไม่มีชุดข้อมูลที่ผ่าน Quality Gate</p>
        <Link to="/ingestion">นำเข้าข้อมูล</Link>
      </div>
    );
  }
  return (
    <div className="dbb-scroll">
      <table className="dbb-table">
        <thead>
          <tr>
            <th aria-label="เลือก" />
            <th>ชุดข้อมูล</th>
            <th>แหล่งที่มา</th>
            <th>จำนวนแถว</th>
            <th>คอลัมน์</th>
            <th>ชนิดข้อมูล</th>
            <th>อัปเดตล่าสุด</th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((d) => {
            const isSelected = selected?.name === d.name;
            return (
              <tr key={d.name} className={isSelected ? "is-selected" : ""}>
                <td>
                  <input
                    type="radio"
                    name="dbb-dataset"
                    aria-label={`เลือก ${d.name}`}
                    checked={isSelected}
                    disabled={Boolean(d.error)}
                    onChange={() => onSelect(d)}
                  />
                </td>
                <td>
                  <strong>{d.name}</strong>
                  {d.error && <div className="dbb-error-inline">{friendlyApiError(d.error, "อ่านชุดข้อมูลนี้ไม่ได้")}</div>}
                </td>
                <td>{d.source || "—"}</td>
                <td>{d.records == null ? "—" : d.records.toLocaleString("en-US")}</td>
                <td>{d.columns ?? "—"}</td>
                <td>{describeKinds(d.kind_counts)}</td>
                <td>{formatDate(d.last_updated)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
