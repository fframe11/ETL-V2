import React, { useEffect, useState } from "react";
import { InfoHint } from "./ui";

const PAGE_SIZE = 50;

const LAYERS = [
  { key: "active", label: "แถวที่ผ่าน", hint: "ข้อมูลล่าสุดของตาราง ระบบรวมแถวจากทุกรอบเข้าด้วยกันตามคีย์หลัก ถ้าเลือก 'เฉพาะแถวจากรอบนี้' จะเห็นเฉพาะแถวที่รอบนี้เขียนเป็นครั้งล่าสุด" },
  { key: "quarantine", label: "แถวที่ถูกกักกัน", hint: "แถวที่ไม่ผ่านการตรวจ เก็บแยกไว้ทุกรอบ ไม่ถูกลบทิ้ง คอลัมน์ reject_reason บอกเหตุผล" }
];

const formatCell = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export default function RunRecordsPanel({ tableName, runId, initialLayer = "active", onClose }) {
  const [layer, setLayer] = useState(initialLayer);
  const [search, setSearch] = useState("");
  const [onlyThisRun, setOnlyThisRun] = useState(Boolean(runId));
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLayer(initialLayer);
    setSearch("");
    setOnlyThisRun(Boolean(runId));
    setOffset(0);
  }, [tableName, runId, initialLayer]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (search.trim()) params.set("search", search.trim());
      if (onlyThisRun && runId) params.set("run_id", runId);
      fetch(`/api/v1/export/records/${layer}/${encodeURIComponent(tableName)}?${params.toString()}`, { credentials: "same-origin" })
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
          return r.json();
        })
        .then(setData)
        .catch((e) => { setData(null); setError(e.message); })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [tableName, runId, layer, search, onlyThisRun, offset]);

  const runIdsInTable = data?.run_ids || [];
  const tableStoresRunId = runIdsInTable.length > 0;
  const matched = data?.matched_rows ?? 0;
  const columns = data?.columns || [];
  const rows = data?.rows || [];
  const activeLayer = LAYERS.find((l) => l.key === layer);

  return (
    <div className="gs-pcard" style={{ marginTop: "16px" }} data-testid="run-records-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>ข้อมูลของตาราง <code>{tableName}</code></h3>
          {runId && <div className="gs-muted gs-mono" style={{ fontSize: "11px", marginTop: "4px" }}>รอบ {runId}</div>}
        </div>
        <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>ปิด</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", margin: "14px 0" }}>
        <div style={{ display: "inline-flex", border: "1px solid #CBD5E1", borderRadius: "6px", overflow: "hidden" }}>
          {LAYERS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => { setLayer(l.key); setOffset(0); }}
              aria-pressed={layer === l.key}
              style={{ padding: "6px 12px", border: "none", fontSize: "12px", fontWeight: 700, cursor: "pointer", background: layer === l.key ? "#1B3139" : "#FFFFFF", color: layer === l.key ? "#FFFFFF" : "#334155" }}
            >
              {l.label}
            </button>
          ))}
        </div>
        <InfoHint text={activeLayer.hint} />

        <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: runId && tableStoresRunId ? "#334155" : "#94A3B8" }}>
          <input
            type="checkbox"
            checked={onlyThisRun && tableStoresRunId}
            disabled={!runId || !tableStoresRunId}
            onChange={(e) => { setOnlyThisRun(e.target.checked); setOffset(0); }}
          />
          เฉพาะแถวจากรอบนี้
        </label>

        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          placeholder="ค้นหาค่าในทุกคอลัมน์"
          aria-label="ค้นหาข้อมูลในตาราง"
          style={{ flex: "1 1 220px", minWidth: "180px", padding: "7px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12.5px" }}
        />
      </div>

      {data && runId && !tableStoresRunId && (
        <div style={{ fontSize: "11px", color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "6px", padding: "6px 10px", marginBottom: "10px" }}>
          ตารางนี้ไม่ได้เก็บรหัสรอบไว้ในแถว จึงแสดงทุกแถวของตาราง
        </div>
      )}

      <div style={{ fontSize: "12px", color: "#475569", marginBottom: "8px" }}>
        {loading ? "กำลังโหลด..." : error ? <span style={{ color: "var(--accent-red)" }}>โหลดไม่สำเร็จ: {error}</span>
          : data ? `พบ ${matched.toLocaleString()} แถว จากทั้งหมด ${data.total_rows.toLocaleString()} แถว` : null}
      </div>

      {!loading && !error && data && (rows.length === 0 ? (
        <div className="gs-empty-cell">ไม่พบข้อมูล</div>
      ) : (
        <div className="gs-ptable-wrap" style={{ maxHeight: "420px", overflow: "auto" }}>
          <table className="gs-ptable">
            <thead>
              <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={offset + i}>
                  {columns.map((c) => (
                    <td key={c} className="gs-mono" style={{ whiteSpace: "nowrap", color: c === "reject_reason" ? "var(--accent-red)" : undefined }}>{formatCell(row[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {data && matched > PAGE_SIZE && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "12px" }}>
          <button type="button" className="ui-btn ui-btn-secondary" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>ก่อนหน้า</button>
          <span>แถว {(offset + 1).toLocaleString()}–{Math.min(offset + PAGE_SIZE, matched).toLocaleString()}</span>
          <button type="button" className="ui-btn ui-btn-secondary" disabled={offset + PAGE_SIZE >= matched || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>ถัดไป</button>
        </div>
      )}
    </div>
  );
}
