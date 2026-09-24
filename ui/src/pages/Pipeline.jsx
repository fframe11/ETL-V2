import { Icon } from '../components/UiIcons';
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi, postApi } from '../hooks/useApi';
import WorkflowJourneyBar, { DatabricksTileCard } from '../components/WorkflowJourneyBar';
import ConfirmationModal from '../components/ConfirmationModal';
import "./Pipeline.css";

const ZONE_ROW_COLUMNS = [
  { key: "dirty_row_id", label: "Row ID" },
  { key: "student_id", label: "รหัสนักศึกษา" },
  { key: "course", label: "วิชา" },
  { key: "score", label: "คะแนน (Score)" },
  { key: "study_hours", label: "ชม.เรียน (Study Hours)" },
  { key: "whitebox_status", label: "โซนปัจจุบัน" },
  { key: "whitebox_error_type", label: "ประเภทปัญหา" },
  { key: "whitebox_rule_applied", label: "หลักฐานการคัดแยก (Rule Evidence)" }
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
  const [executionStep, setExecutionStep] = useState(3); // 0=idle, 1=gate1, 2=gate2, 3=completed
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
    setExecutionStep(1);
    setTimeout(() => setExecutionStep(2), 300);
    setTimeout(async () => {
      await syncPipelineState({});
      setExecutionStep(3);
      setExecutingRules(false);
      setZoneVersion(v => v + 1);
    }, 650);
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

  const m = wbState?.metrics || {};
  const initialOutlierCount = m.initial_outlier_count ?? (wbState?.tukey_multiplier === "1.5" ? 154 : 100);
  const cleanRowsCount = m.clean_rows ?? (reviewAction === "APPROVE" ? 9500 : 9400);
  const reviewRowsCount = m.review_rows ?? (reviewAction === "KEEP" ? initialOutlierCount : 0);
  const quarantineRowsCount = m.quarantine_rows ?? (reviewAction === "REJECT" ? 600 + initialOutlierCount : 600);
  const gate1Quarantined = m.gate1_quarantined ?? 500;
  const gate1Passed = m.gate1_passed ?? 9600;
  const gate2Quarantined = m.gate2_quarantined ?? 100;
  const gate2Passed = m.gate2_passed ?? 9500;
  const missingScoreCount = m.missing_score_count ?? 300;
  const invalidRangeCount = m.invalid_range_count ?? 200;

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
      
      {/* Header & Gold Layer Rebuild Panel */}
      <div className="gs-page-header">
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(255, 54, 33, 0.08)", color: "#FF3621", border: "1px solid rgba(255, 54, 33, 0.25)", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "6px" }}>
            SILVER LAYER · 3-GATE EXECUTION & HUMAN-IN-THE-LOOP ROUTING
          </div>
          <h1 className="gs-page-title">Silver Segregation <span style={{ color: "#1B3139" }}>& Execution</span></h1>
          <p className="gs-page-desc">ประมวลผลคัดกรองข้อมูลผ่านด่านกฎ 3 ชั้น (Clean, Review, Quarantine) พร้อมระบบตรวจสอบและตัดสินใจรายเรคคอร์ด</p>
        </div>

        {/* Gold Layer Rebuild Action Card */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '10px 16px', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A' }}>Gold Layer Aggregation</div>
            <div style={{ fontSize: '10px', color: '#64748B' }}>Rebuild executive BI & analytics tables</div>
          </div>
          <button
            onClick={() => triggerConfirm(
              "Rebuild Gold Layer?",
              "This will re-aggregate the executive BI & analytics tables from the current Silver layer output. It can take a while and will affect what the Dashboard shows.",
              handleGoldRebuild
            )}
            disabled={goldRebuilding}
            style={{
              padding: '7px 14px',
              fontSize: '11px',
              fontWeight: 700,
              background: goldRebuilding ? '#94A3B8' : '#1B3139',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              cursor: goldRebuilding ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {goldRebuilding ? "Rebuilding..." : "Rebuild Gold Layer"}
          </button>
        </div>
      </div>

      {/* Interactive Pipeline Rule Execution & 3-Way Routing Workspace */}
      <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <span style={{ background: '#1B3139', color: '#FFFFFF', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.05em' }}>
                  SILVER PIPELINE · QUALITY GATES
                </span>
                <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', border: '1px solid #FCD34D' }}>
                  <Icon name="target" /> Target Dataset: {wbState?.dataset_name || "student_course_scores"} ({(wbState?.metrics?.total_rows ?? 10100).toLocaleString()} rows)
                </span>
                <span style={{ background: executingRules ? '#FEF3C7' : '#DCFCE7', color: executingRules ? '#D97706' : '#15803D', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                  {executingRules ? ` Evaluating Gate ${executionStep}/3...` : ` Validated (Clean ${cleanRowsCount.toLocaleString()} | Review ${reviewRowsCount} | Quarantine ${quarantineRowsCount})`}
                </span>
              </div>
              <h3 style={{ margin: 0, fontSize: "16px", color: "#0F172A", fontWeight: 800 }}>
                <Icon name="settings" /> Silver Quality Gates & Dataset Routing Console
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#475569", maxWidth: "820px", lineHeight: "1.5" }}>
                ประมวลผลคัดกรองข้อมูลตาม Delta Expectations ที่ยืนยันแล้ว สามารถสั่งรัน Pipeline ใหม่ ตรวจสอบและอนุมัติคิว Human Review และส่งต่อข้อมูลสู่ Gold Layer
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleRunPipelineRules}
                disabled={executingRules}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 14px',
                  background: executingRules ? '#64748B' : '#1B3139',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: executingRules ? 'wait' : 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }}
              >
                <span>{executingRules ? 'Evaluating Gates...' : <><Icon name="play" /> Execute Silver Pipeline</>}</span>
              </button>
            </div>
          </div>

          {/* Live Step-by-Step Rule Execution Funnel */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155' }}>
                <Icon name="refresh" /> Validation Gate Execution Flow:
              </span>
              <span style={{ fontSize: '11px', color: '#64748B' }}>
                คลิกที่ด่านหรือการ์ดด้านล่างเพื่อกรองตารางเรคคอร์ดและสั่งการ
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}>
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderLeft: '3px solid #1B3139', borderRadius: '6px', padding: '8px 10px', fontSize: '11px' }}>
                <div style={{ fontWeight: 700, color: '#0F172A' }}><Icon name="download" /> Raw Bronze Ingestion</div>
                <div style={{ color: '#475569', marginTop: '2px' }}>Total <strong style={{ color: '#0F172A' }}>{(wbState?.metrics?.total_rows ?? 10100).toLocaleString()} rows</strong> (100%)</div>
              </div>
              <div
                onClick={() => setSelectedZone("QUARANTINE")}
                style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderLeft: '3px solid #DC2626', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 700, color: '#0F172A' }}>Gate 1: Domain Range & Nulls</div>
                <div style={{ color: '#475569', marginTop: '2px' }}>Quarantine <strong style={{ color: '#DC2626' }}><Icon name="dot-red" /> {gate1Quarantined.toLocaleString()} rows</strong> → Passed <strong>{gate1Passed.toLocaleString()} rows</strong></div>
              </div>
              <div
                onClick={() => setSelectedZone("QUARANTINE")}
                style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderLeft: '3px solid #D97706', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 700, color: '#0F172A' }}>Gate 2: Key Uniqueness</div>
                <div style={{ color: '#475569', marginTop: '2px' }}>Quarantine <strong style={{ color: '#D97706' }}><Icon name="dot-red" /> {gate2Quarantined.toLocaleString()} rows</strong> → Passed <strong>{gate2Passed.toLocaleString()} rows</strong></div>
              </div>
              <div
                onClick={() => setSelectedZone("REVIEW")}
                style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderLeft: '3px solid #0284C7', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 700, color: '#0F172A' }}>Gate 3: Outlier & Anomaly Detection</div>
                <div style={{ color: '#475569', marginTop: '2px' }}>
                  Review Queue <strong style={{ color: '#0369A1' }}><Icon name="dot-yellow" /> {reviewRowsCount} rows</strong> → Clean Silver <strong style={{ color: '#15803D' }}><Icon name="dot-green" /> {cleanRowsCount.toLocaleString()} rows</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Databricks Filter & Segmented Toolbar (Matches Learn & Workspace UI) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '5px 10px', width: '220px' }}>
                <span style={{ color: '#64748B', fontSize: '12px' }}><Icon name="search" /></span>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>Filter pipeline tables...</span>
              </div>
              <div style={{ display: 'inline-flex', border: '1px solid #CBD5E1', borderRadius: '4px', overflow: 'hidden', background: '#FFFFFF' }}>
                <button
                  type="button"
                  onClick={() => setSelectedZone("ALL")}
                  style={{ padding: '5px 12px', fontSize: '12px', fontWeight: selectedZone === "ALL" ? 600 : 400, background: selectedZone === "ALL" ? '#EFF6FF' : '#FFFFFF', color: selectedZone === "ALL" ? '#1D4ED8' : '#475569', border: 'none', cursor: 'pointer' }}
                >
                  All (10,100)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedZone("CLEAN")}
                  style={{ padding: '5px 12px', fontSize: '12px', fontWeight: selectedZone === "CLEAN" ? 600 : 400, background: selectedZone === "CLEAN" ? '#EFF6FF' : '#FFFFFF', color: selectedZone === "CLEAN" ? '#1D4ED8' : '#475569', border: 'none', borderLeft: '1px solid #E2E8F0', cursor: 'pointer' }}
                >
                  Validated Silver ({cleanRowsCount.toLocaleString()})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedZone("REVIEW")}
                  style={{ padding: '5px 12px', fontSize: '12px', fontWeight: selectedZone === "REVIEW" ? 600 : 400, background: selectedZone === "REVIEW" ? '#EFF6FF' : '#FFFFFF', color: selectedZone === "REVIEW" ? '#1D4ED8' : '#475569', border: 'none', borderLeft: '1px solid #E2E8F0', cursor: 'pointer' }}
                >
                  Review Queue ({reviewRowsCount.toLocaleString()})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedZone("QUARANTINE")}
                  style={{ padding: '5px 12px', fontSize: '12px', fontWeight: selectedZone === "QUARANTINE" ? 600 : 400, background: selectedZone === "QUARANTINE" ? '#EFF6FF' : '#FFFFFF', color: selectedZone === "QUARANTINE" ? '#1D4ED8' : '#475569', border: 'none', borderLeft: '1px solid #E2E8F0', cursor: 'pointer' }}
                >
                  Quarantine ({quarantineRowsCount.toLocaleString()})
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleUpstreamTicket()}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                background: upstreamTicketSent ? '#16A34A' : '#2272B4',
                color: '#FFFFFF',
                cursor: 'pointer'
              }}
            >
              {upstreamTicketSent ? 'Upstream Ticket Dispatched (#UP-89)' : 'Dispatch Upstream Ticket'}
            </button>
          </div>

          {/* 3 Databricks Tile Cards — Exact 3-Element Card Anatomy from Databricks Learn UI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '14px', marginBottom: '18px' }}>
            {/* Card 1: Validated Silver Dataset */}
            <DatabricksTileCard
              category="Silver Layer · Certified Asset"
              title={`Validated Silver (${cleanRowsCount.toLocaleString()} แถว)`}
              subtitle={`score ∈ [${wbState?.min_score ?? 0}, ${wbState?.max_score ?? 100}] · Null 0% · Recall 100%`}
              percent={Math.round((cleanRowsCount / 10100) * 100)}
              gradient="linear-gradient(135deg, #059669 0%, #34D399 100%)"
              iconName="check"
              selected={selectedZone === "CLEAN"}
              onClick={() => setSelectedZone(selectedZone === "CLEAN" ? "ALL" : "CLEAN")}
              footerSlot={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                  <span style={{ color: '#15803D', fontWeight: 600 }}>Target: gold_analytics_table</span>
                  <button
                    type="button"
                    onClick={() => setSelectedZone(selectedZone === "CLEAN" ? "ALL" : "CLEAN")}
                    style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
                  >
                    {selectedZone === "CLEAN" ? 'แสดงทั้งหมด' : 'กรองดูในตาราง'}
                  </button>
                </div>
              }
            />

            {/* Card 2: Human Review Queue */}
            <DatabricksTileCard
              category="Data steward · Outlier review"
              title={`Human Review Queue (${reviewRowsCount.toLocaleString()} แถว)`}
              subtitle={`study_hours > Tukey ${wbState?.tukey_multiplier || "3.0"}× IQR · คะแนนปกติ 75–98`}
              percent={Math.max(1, Math.round((reviewRowsCount / 10100) * 100))}
              gradient="linear-gradient(135deg, #D97706 0%, #FBBF24 100%)"
              iconName="search"
              selected={selectedZone === "REVIEW"}
              onClick={() => setSelectedZone(selectedZone === "REVIEW" ? "ALL" : "REVIEW")}
              footerSlot={
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => triggerConfirm(
                      "Approve Review Queue into Clean?",
                      `This will move all ${initialOutlierCount} rows currently in the Human Review Queue into the Clean Silver dataset. This action can be reversed by clicking "คืนค่า" afterward, but will affect Gold Layer rebuilds until then.`,
                      () => handleSetReviewAction("APPROVE")
                    )}
                    style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #2272B4', background: reviewAction === "APPROVE" ? '#2272B4' : '#FFFFFF', color: reviewAction === "APPROVE" ? '#FFFFFF' : '#2272B4', cursor: 'pointer' }}
                  >
                    {reviewAction === "APPROVE" ? `อนุมัติแล้ว (+${initialOutlierCount})` : `อนุมัติเข้า Clean (+${initialOutlierCount})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerConfirm(
                      "Quarantine the Review Queue?",
                      `This will move all ${initialOutlierCount} rows currently in the Human Review Queue into Quarantine. This action can be reversed by clicking "คืนค่า" afterward, but will affect Gold Layer rebuilds until then.`,
                      () => handleSetReviewAction("REJECT")
                    )}
                    style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #DC2626', background: reviewAction === "REJECT" ? '#DC2626' : '#FFFFFF', color: reviewAction === "REJECT" ? '#FFFFFF' : '#DC2626', cursor: 'pointer' }}
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
                </div>
              }
            />

            {/* Card 3: Quarantine Store */}
            <DatabricksTileCard
              category="Audit sink · Upstream remediation"
              title={`Quarantine Store (${quarantineRowsCount.toLocaleString()} แถว)`}
              subtitle={`Null: ${missingScoreCount} · Range: ${invalidRangeCount} · DupKey: ${gate2Quarantined}`}
              percent={Math.round((quarantineRowsCount / 10100) * 100)}
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
                    {selectedZone === "QUARANTINE" ? 'แสดงทั้งหมด' : `ดูรายการที่กักกัน (${quarantineRowsCount})`}
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
                  <Icon name="list" /> ตารางตรวจสอบ แก้ไขค่า และตัดสินใจระดับเรคคอร์ด (Record-Level Inspection &amp; Inline Fix)
                </span>
                <input
                  type="text"
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  placeholder="ค้นหา Row ID (#48, #73, #105), รหัสนักศึกษา, วิชา..."
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
                  { id: "ALL", label: `ทั้งหมด (${(wbState?.metrics?.total_rows ?? 10100).toLocaleString()})` },
                  { id: "QUARANTINE", label: `กักกัน (${quarantineRowsCount})` },
                  { id: "REVIEW", label: `รอตรวจสอบ (${reviewRowsCount})` },
                  { id: "CLEAN", label: `ข้อมูลสะอาด (${cleanRowsCount.toLocaleString()})` }
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
                          <th style={{ padding: '10px 12px' }}>การจัดการ (Action)</th>
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
                แสดง {zoneData.rows?.length || 0} จาก {zoneData.matched_rows ?? zoneData.total_zone_rows ?? 0} เรคคอร์ดที่ตรงเงื่อนไข (ทั้งโซน {zoneData.total_zone_rows ?? 0} แถว) — ข้อมูลจริงจาก /api/v1/whitebox/preview-zone
              </div>
            )}
          </div>

          {/* Single Primary Action Button */}
          <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
            <Link
              to="/export"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 22px",
                background: "#059669",
                color: "#FFFFFF",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 800,
                textDecoration: "none",
                boxShadow: "0 2px 4px rgba(5,150,105,0.25)"
              }}
            >
              <span>นำข้อมูลสะอาด ({cleanRowsCount.toLocaleString()} แถว) ไปส่งออก (Step 4: Export Hub) <Icon name="arrow-right" /></span>
            </Link>
          </div>
        </div>

      {/* Optional: Cluster Pipeline Executions & Quality Audit History */}
      <details style={{ marginTop: "20px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "14px", marginBottom: "20px" }}>
        <summary style={{ cursor: "pointer", fontSize: "12px", fontWeight: 700, color: "#475569" }}>
          <Icon name="activity" /> บันทึกประวัติการประมวลผลคลัสเตอร์ย้อนหลัง &amp; Gold Rebuild (Cluster Execution Runs &amp; Audit Logs) ▼
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
