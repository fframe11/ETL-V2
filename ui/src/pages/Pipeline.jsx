import { Icon } from '../components/UiIcons';
import React, { useState, useEffect } from 'react';
import { useApi, postApi } from '../hooks/useApi';
import TileCard from "../components/ui/TileCard";
import { PageHeader, InfoHint, NextStepLink } from "../components/ui";
import ConfirmationModal from '../components/ConfirmationModal';
import "./Pipeline.css";

const ZONE_ROW_COLUMNS = [
  { key: "dirty_row_id", label: "Row ID" },
  { key: "student_id", label: "รหัสนักศึกษา" },
  { key: "course", label: "วิชา" },
  { key: "score", label: "คะแนน" },
  { key: "study_hours", label: "ชม.เรียน" },
  { key: "whitebox_status", label: "โซนปัจจุบัน" },
  { key: "whitebox_error_type", label: "ประเภทปัญหา" },
  { key: "whitebox_rule_applied", label: "เหตุผล" }
];

export default function Pipeline() {
  const pipeline = useApi('/pipeline?limit=20', { refreshInterval: 30000 });
  const quality = useApi('/quality?limit=20', { refreshInterval: 30000 });

  const [retrying, setRetrying] = useState({});
  const [retryResult, setRetryResult] = useState(null);
  
  // Gold Layer Rebuild State
  const [goldRebuilding, setGoldRebuilding] = useState(false);
  const [goldResult, setGoldResult] = useState(null);

  // Transform Traceability & 3-Way Segregation Interactive State (Backed by /api/v1/whitebox/state)
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [wbState, setWbState] = useState(null);
  const [showTraceability, setShowTraceability] = useState(true);
  const [selectedZone, setSelectedZone] = useState("ALL");
  const [executingRules, setExecutingRules] = useState(false);
  const [reviewAction, setReviewAction] = useState("KEEP");
  const [upstreamTicketSent, setUpstreamTicketSent] = useState(false);
  const [rowDecisions, setRowDecisions] = useState({});
  const [recordSearch, setRecordSearch] = useState("");

  // Record-Level Inspection Table: backed by the real /api/v1/whitebox/preview-zone/{zone} endpoint
  const [zoneData, setZoneData] = useState(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneVersion, setZoneVersion] = useState(0);
  const [decidingRow, setDecidingRow] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: "", message: "", onConfirm: () => {} });

  const triggerConfirm = (title, message, onConfirm) => {
    setModalConfig({
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setModalOpen(false);
      }
    });
    setModalOpen(true);
  };

  const handleRowDecision = async (rowId, decision) => {
    setDecidingRow(rowId);
    const nextDecisions = { ...rowDecisions, [rowId]: decision };
    setRowDecisions(nextDecisions);
    try {
      await syncPipelineState({ row_decisions: { [rowId]: decision } });
      setZoneVersion(v => v + 1);
    } finally {
      setDecidingRow(null);
    }
  };

  const syncPipelineState = async (overrides = {}) => {
    try {
      const res = await fetch('/api/v1/whitebox/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides)
      });
      if (res.ok) {
        const d = await res.json();
        setWbState(d);
        if (d.review_action) setReviewAction(d.review_action);
        if (d.upstream_ticket_sent !== undefined) setUpstreamTicketSent(d.upstream_ticket_sent);
        if (d.row_decisions) setRowDecisions(d.row_decisions);
        return d;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const handleRunPipelineRules = async () => {
    setExecutingRules(true);
    await syncPipelineState({});
    setExecutingRules(false);
    setZoneVersion(v => v + 1);
  };

  const handleSetReviewAction = async (action) => {
    setReviewAction(action);
    await syncPipelineState({ review_action: action });
    setZoneVersion(v => v + 1);
  };

  const handleToggleUpstreamTicket = async (forceVal) => {
    const nextVal = forceVal !== undefined ? forceVal : !upstreamTicketSent;
    setUpstreamTicketSent(nextVal);
    await syncPipelineState({ upstream_ticket_sent: nextVal });
  };

  const m = wbState?.metrics ?? null;
  const totalRows = m?.total_rows ?? null;
  const initialOutlierCount = m?.initial_outlier_count ?? null;
  const cleanRowsCount = m?.clean_rows ?? null;
  const reviewRowsCount = m?.review_rows ?? null;
  const quarantineRowsCount = m?.quarantine_rows ?? null;
  const gate1Quarantined = m?.gate1_quarantined ?? null;
  const gate2Quarantined = m?.gate2_quarantined ?? null;
  const missingScoreCount = m?.missing_score_count ?? null;
  const invalidRangeCount = m?.invalid_range_count ?? null;
  const fmt = (n) => (typeof n === "number" ? n.toLocaleString() : "—");
  const pct = (n) => (typeof n === "number" && totalRows ? Math.round((n / totalRows) * 100) : 0);

  useEffect(() => {
    fetch('/api/v1/whitebox/benchmark')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setBenchmarkData(d); })
      .catch(() => {});
    fetch('/api/v1/whitebox/state')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) {
          setWbState(d);
          if (d.review_action) setReviewAction(d.review_action);
          if (d.upstream_ticket_sent !== undefined) setUpstreamTicketSent(d.upstream_ticket_sent);
          if (d.row_decisions) setRowDecisions(d.row_decisions);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch real per-row records for the Record-Level Inspection table (debounced on search)
  useEffect(() => {
    const zoneParam = selectedZone.toLowerCase();
    setZoneLoading(true);
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ limit: "15" });
      if (recordSearch.trim()) params.set("search", recordSearch.trim());
      fetch(`/api/v1/whitebox/preview-zone/${zoneParam}?${params.toString()}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d) setZoneData(d); })
        .catch(() => {})
        .finally(() => setZoneLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [selectedZone, recordSearch, zoneVersion]);

  const handleRetry = async (runId) => {
    setRetrying(prev => ({ ...prev, [runId]: true }));
    setRetryResult(null);
    try {
      const res = await postApi(`/pipeline/retry/${runId}`);
      setRetryResult({ success: true, message: `Retry triggered successfully (New Run ID: ${res.new_run_id || 'N/A'})` });
      // Refresh listings
      pipeline.refetch();
      quality.refetch();
    } catch (err) {
      setRetryResult({ success: false, message: `Failed to trigger retry: ${err.message}` });
    } finally {
      setRetrying(prev => ({ ...prev, [runId]: false }));
    }
  };

  const handleGoldRebuild = async () => {
    setGoldRebuilding(true);
    setGoldResult(null);
    try {
      const res = await postApi('/gold/rebuild');
      setGoldResult({ success: true, message: res.message || 'Gold Layer rebuild triggered successfully in the background.' });
    } catch (err) {
      setGoldResult({ success: false, message: `Failed to rebuild Gold Layer: ${err.message}` });
    } finally {
      setGoldRebuilding(false);
    }
  };

  const getStatusBadge = (state) => {
    if (state === 'success') return <span className="gs-badge" style={{ background: '#d1fae5', color: '#059669' }}>SUCCESS</span>;
    if (state === 'failed') return <span className="gs-badge" style={{ background: '#fee2e2', color: '#dc2626' }}>FAILED</span>;
    return <span className="gs-badge" style={{ background: '#fff7ed', color: '#d97706' }}>QUARANTINED</span>;
  };

  const getScoreColor = (score) => {
    if (score >= 95) return '#10b981';
    if (score >= 85) return '#f59e0b';
    return '#f43f5e';
  };

  return (
    <div className="gs-pipeline">
      
      <PageHeader
        pageKey="pipeline"
        actions={
          <>
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => triggerConfirm(
                "สร้าง Gold Layer ใหม่?",
                "ระบบจะรวมข้อมูล Clean ล่าสุดเป็นตารางสำหรับ Dashboard อาจใช้เวลาสักครู่",
                handleGoldRebuild
              )}
              disabled={goldRebuilding}
            >
              {goldRebuilding ? "กำลังสร้าง..." : "สร้าง Gold ใหม่"}
            </button>
            <button type="button" className="ui-btn ui-btn-primary" onClick={handleRunPipelineRules} disabled={executingRules}>
              {executingRules ? "กำลังรัน..." : "รัน Pipeline"}
            </button>
          </>
        }
      />

      {/* Interactive Pipeline Rule Execution & 3-Way Routing Workspace */}
      <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
          <div className="pl-dataset-line">
            ชุดข้อมูล <code>{wbState?.dataset_name || "—"}</code> · {fmt(totalRows)} แถว
          </div>
          {!m && <div className="pl-notice">ยังไม่มีผลการรันสำหรับชุดข้อมูลนี้</div>}

          {/* Compact validation funnel: click a step to filter the record table below */}
          <div className="pl-funnel">
            {[
              { label: "นำเข้า", value: totalRows, zone: "ALL" },
              { label: "Gate 1 กักกัน", value: gate1Quarantined, zone: "QUARANTINE", tone: "red" },
              { label: "Gate 2 กักกัน", value: gate2Quarantined, zone: "QUARANTINE", tone: "red" },
              { label: "Review", value: reviewRowsCount, zone: "REVIEW", tone: "amber" },
              { label: "Clean", value: cleanRowsCount, zone: "CLEAN", tone: "green" }
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                className={`pl-funnel-step ${s.tone || ""} ${selectedZone === s.zone ? "active" : ""}`}
                onClick={() => setSelectedZone(s.zone)}
              >
                <span className="pl-funnel-value">{fmt(s.value)}</span>
                <span className="pl-funnel-label">{s.label}</span>
              </button>
            ))}
          </div>

          {/* 3 Databricks Tile Cards — Exact 3-Element Card Anatomy from Databricks Learn UI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '14px', marginBottom: '18px' }}>
            {/* Card 1: Validated Silver Dataset */}
            <TileCard
              category="Clean"
              title={`${fmt(cleanRowsCount)} แถว`}
              subtitle={`score ${wbState?.min_score ?? 0}–${wbState?.max_score ?? 100} · ไม่มีค่าว่าง`}
              percent={pct(cleanRowsCount)}
              gradient="linear-gradient(135deg, #059669 0%, #34D399 100%)"
              iconName="check"
              selected={selectedZone === "CLEAN"}
              onClick={() => setSelectedZone(selectedZone === "CLEAN" ? "ALL" : "CLEAN")}
              footerSlot={
                <button
                  type="button"
                  onClick={() => setSelectedZone(selectedZone === "CLEAN" ? "ALL" : "CLEAN")}
                  style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
                >
                  {selectedZone === "CLEAN" ? 'แสดงทั้งหมด' : 'ดูในตาราง'}
                </button>
              }
            />

            {/* Card 2: Human Review Queue */}
            <TileCard
              category="Review"
              title={`${fmt(reviewRowsCount)} แถว`}
              subtitle="study_hours สูงผิดปกติ"
              percent={Math.max(1, pct(reviewRowsCount))}
              gradient="linear-gradient(135deg, #D97706 0%, #FBBF24 100%)"
              iconName="search"
              selected={selectedZone === "REVIEW"}
              onClick={() => setSelectedZone(selectedZone === "REVIEW" ? "ALL" : "REVIEW")}
              footerSlot={
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={!initialOutlierCount}
                    onClick={() => triggerConfirm(
                      "อนุมัติ Review ทั้งหมด?",
                      `ย้าย ${fmt(initialOutlierCount)} แถวจาก Review ไป Clean? กด "คืนค่า" เพื่อย้อนกลับได้`,
                      () => handleSetReviewAction("APPROVE")
                    )}
                    style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #2272B4', background: reviewAction === "APPROVE" ? '#2272B4' : '#FFFFFF', color: reviewAction === "APPROVE" ? '#FFFFFF' : '#2272B4', cursor: initialOutlierCount ? 'pointer' : 'not-allowed' }}
                  >
                    {reviewAction === "APPROVE" ? "อนุมัติแล้ว" : "อนุมัติ"}
                  </button>
                  <button
                    type="button"
                    disabled={!initialOutlierCount}
                    onClick={() => triggerConfirm(
                      "กักกัน Review ทั้งหมด?",
                      `ย้าย ${fmt(initialOutlierCount)} แถวจาก Review ไป Quarantine? กด "คืนค่า" เพื่อย้อนกลับได้`,
                      () => handleSetReviewAction("REJECT")
                    )}
                    style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #DC2626', background: reviewAction === "REJECT" ? '#DC2626' : '#FFFFFF', color: reviewAction === "REJECT" ? '#FFFFFF' : '#DC2626', cursor: initialOutlierCount ? 'pointer' : 'not-allowed' }}
                  >
                    กักกัน
                  </button>
                  {reviewAction !== "KEEP" && (
                    <button
                      type="button"
                      onClick={() => handleSetReviewAction("KEEP")}
                      style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#334155', cursor: 'pointer' }}
                    >
                      คืนค่า
                    </button>
                  )}
                  <InfoHint text={`แถวที่ study_hours เกิน Q3 + ${wbState?.tukey_multiplier || "3.0"}×IQR ถูกส่งให้คนตรวจแทนการลบทิ้ง`} />
                </div>
              }
            />

            {/* Card 3: Quarantine Store */}
            <TileCard
              category="Quarantine"
              title={`${fmt(quarantineRowsCount)} แถว`}
              subtitle={`ค่าว่าง ${fmt(missingScoreCount)} · นอกช่วง ${fmt(invalidRangeCount)} · ซ้ำ ${fmt(gate2Quarantined)}`}
              percent={pct(quarantineRowsCount)}
              gradient="linear-gradient(135deg, #DC2626 0%, #F87171 100%)"
              iconName="alert"
              selected={selectedZone === "QUARANTINE"}
              onClick={() => setSelectedZone(selectedZone === "QUARANTINE" ? "ALL" : "QUARANTINE")}
              footerSlot={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedZone(selectedZone === "QUARANTINE" ? "ALL" : "QUARANTINE")}
                    style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
                  >
                    {selectedZone === "QUARANTINE" ? 'แสดงทั้งหมด' : 'ดูในตาราง'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleUpstreamTicket()}
                    style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: 'none', background: upstreamTicketSent ? '#16A34A' : '#DC2626', color: '#FFFFFF', cursor: 'pointer' }}
                  >
                    {upstreamTicketSent ? 'แจ้งแล้ว #UP-89' : 'แจ้งแก้ต้นทาง'}
                  </button>
                </div>
              }
            />
          </div>

          {/* Interactive Row-Level Inspection & Decision Table */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                  <Icon name="list" /> ตรวจสอบรายแถว
                </span>
                <input
                  type="text"
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  placeholder="ค้นหา Row ID, รหัสนักศึกษา, วิชา"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '11px',
                    minWidth: '250px',
                    background: '#FFFFFF'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: "ALL", label: `ทั้งหมด ${fmt(totalRows)}` },
                  { id: "QUARANTINE", label: `Quarantine ${fmt(quarantineRowsCount)}` },
                  { id: "REVIEW", label: `Review ${fmt(reviewRowsCount)}` },
                  { id: "CLEAN", label: `Clean ${fmt(cleanRowsCount)}` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedZone(tab.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      border: selectedZone === tab.id ? '1px solid #1D4ED8' : '1px solid #CBD5E1',
                      background: selectedZone === tab.id ? '#1D4ED8' : '#FFFFFF',
                      color: selectedZone === tab.id ? '#FFFFFF' : '#334155',
                      cursor: 'pointer'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              {(() => {
                const displayCols = ZONE_ROW_COLUMNS.filter(c => zoneData?.columns?.includes(c.key));
                const cols = displayCols.length > 0 ? displayCols : (zoneData?.columns || []).slice(0, 6).map(k => ({ key: k, label: k }));
                const rows = zoneData?.rows || [];
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                        {cols.map(c => (
                          <th key={c.key} style={{ padding: '10px 12px' }}>{c.label}</th>
                        ))}
                        {cols.some(c => c.key === "whitebox_status") && (
                          <th style={{ padding: '10px 12px' }}>จัดการ</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {zoneLoading ? (
                        <tr>
                          <td colSpan={cols.length + 1} style={{ padding: '24px 12px', textAlign: 'center', color: '#64748B', fontSize: '12px' }}>
                            กำลังโหลดข้อมูลเรคคอร์ด...
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={cols.length + 1} style={{ padding: '24px 12px', textAlign: 'center', color: '#64748B', fontSize: '12px' }}>
                            ไม่พบเรคคอร์ดในโซนนี้{recordSearch.trim() ? ` ที่ตรงกับ "${recordSearch.trim()}"` : ""}
                          </td>
                        </tr>
                      ) : (
                        rows.map((row, i) => {
                          const rowId = String(row.dirty_row_id ?? i);
                          const canDecide = cols.some(c => c.key === "whitebox_status") && row.whitebox_status !== undefined;
                          return (
                            <tr key={rowId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              {cols.map(c => (
                                <td key={c.key} style={{ padding: '8px 12px', color: '#334155' }}>
                                  {row[c.key] === null || row[c.key] === undefined || row[c.key] === "" ? "—" : String(row[c.key])}
                                </td>
                              ))}
                              {cols.some(c => c.key === "whitebox_status") && (
                                <td style={{ padding: '8px 12px' }}>
                                  {canDecide && (
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <button
                                        type="button"
                                        disabled={decidingRow === rowId}
                                        onClick={() => handleRowDecision(rowId, "APPROVE")}
                                        style={{ padding: '3px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, border: '1px solid #2272B4', background: '#FFFFFF', color: '#2272B4', cursor: decidingRow === rowId ? 'wait' : 'pointer' }}
                                      >
                                        อนุมัติ
                                      </button>
                                      <button
                                        type="button"
                                        disabled={decidingRow === rowId}
                                        onClick={() => handleRowDecision(rowId, "REJECT")}
                                        style={{ padding: '3px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, border: '1px solid #DC2626', background: '#FFFFFF', color: '#DC2626', cursor: decidingRow === rowId ? 'wait' : 'pointer' }}
                                      >
                                        กักกัน
                                      </button>
                                    </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                );
              })()}
            </div>
            {zoneData && (
              <div style={{ padding: '8px 14px', fontSize: '10.5px', color: '#94A3B8', borderTop: '1px solid #E2E8F0' }}>
                {`แสดง ${zoneData.rows?.length || 0} จาก ${fmt(zoneData.matched_rows ?? zoneData.total_zone_rows ?? 0)} แถว`}
              </div>
            )}
          </div>

          <div className="pl-next">
            <NextStepLink from="pipeline" />
          </div>
        </div>

      {/* Optional: Cluster Pipeline Executions & Quality Audit History */}
      <details style={{ marginTop: "20px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "14px", marginBottom: "20px" }}>
        <summary style={{ cursor: "pointer", fontSize: "12px", fontWeight: 700, color: "#475569" }}>
          <Icon name="activity" /> ประวัติการรัน
        </summary>
        <div style={{ marginTop: "14px" }}>
      <div className="gs-pipeline-grid">
        {/* Pipeline Runs Table */}
        <div className="gs-pcard">
          <h3>Recent Pipeline Ingestion Runs</h3>
          <div className="gs-ptable-wrap">
            {pipeline.loading ? (
              <div className="gs-empty-cell">Fetching pipeline executions...</div>
            ) : pipeline.error ? (
              <div className="gs-empty-cell" style={{ color: 'var(--accent-red)' }}>Failed to load pipeline executions</div>
            ) : (
              <table className="gs-ptable">
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Table Name</th>
                    <th>Status</th>
                    <th>Duration (s)</th>
                    <th>Timestamp</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(pipeline.data) && pipeline.data.map((run) => (
                    <tr key={run.run_id}>
                      <td className="gs-mono" style={{ fontWeight: 700 }}>{run.run_id}</td>
                      <td><strong>{run.table_name}</strong></td>
                      <td>{getStatusBadge(run.state)}</td>
                      <td className="gs-mono">{run.duration_seconds != null ? run.duration_seconds.toFixed(2) : '-'}</td>
                      <td className="gs-muted">{run.timestamp ? new Date(run.timestamp).toLocaleString() : '-'}</td>
                      <td>
                        {(run.state === 'failed' || run.state === 'quarantined') && (
                          <button
                            className="gs-btn-retry"
                            disabled={retrying[run.run_id]}
                            onClick={() => handleRetry(run.run_id)}
                          >
                            {retrying[run.run_id] ? 'Retrying...' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Quality Audit History Table */}
        <div className="gs-pcard">
          <h3>Quality Audit Logs</h3>
          <div className="gs-ptable-wrap">
            {quality.loading ? (
              <div className="gs-empty-cell">Fetching quality audits...</div>
            ) : quality.error ? (
              <div className="gs-empty-cell" style={{ color: 'var(--accent-red)' }}>Failed to load quality audits</div>
            ) : (
              <table className="gs-ptable">
                <thead>
                  <tr>
                    <th>Table Name</th>
                    <th>Total Records</th>
                    <th>Clean</th>
                    <th>Quarantined</th>
                    <th>Quality Score</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(quality.data) && quality.data.map((audit, i) => (
                    <tr key={i}>
                      <td><strong>{audit.table_name || 'unknown'}</strong></td>
                      <td className="gs-mono">{audit.total_records != null ? audit.total_records.toLocaleString() : '-'}</td>
                      <td className="gs-mono">{audit.clean_records != null ? audit.clean_records.toLocaleString() : '-'}</td>
                      <td className="gs-mono" style={{ color: (audit.quarantined_records || 0) > 0 ? 'var(--accent-red)' : 'inherit', fontWeight: (audit.quarantined_records || 0) > 0 ? 700 : 'normal' }}>
                        {audit.quarantined_records != null ? audit.quarantined_records.toLocaleString() : '-'}
                      </td>
                      <td>
                        {audit.quality_score != null ? (
                          <div className="gs-score-cell">
                            <span style={{ color: getScoreColor(audit.quality_score), fontWeight: 700 }} className="gs-mono">
                              {audit.quality_score.toFixed(1)}%
                            </span>
                            <div className="gs-score-bar-bg">
                              <div className="gs-score-bar" style={{ width: `${Math.min(100, Math.max(0, audit.quality_score))}%`, backgroundColor: getScoreColor(audit.quality_score) }} />
                            </div>
                          </div>
                        ) : (
                          <span className="gs-muted gs-mono" style={{ fontSize: '11px' }}>N/A</span>
                        )}
                      </td>
                      <td className="gs-muted">{audit.timestamp ? new Date(audit.timestamp).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
        </div>
      </details>

      <ConfirmationModal
        isOpen={modalOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalOpen(false)}
      />
    </div>
  );
}
