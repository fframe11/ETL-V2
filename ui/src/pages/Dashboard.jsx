import { Icon } from '../components/UiIcons';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApi, postApi } from '../hooks/useApi';
import {
  ComposedChart,
  AreaChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Cell
} from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import WorkflowJourneyBar from '../components/WorkflowJourneyBar';
import EchartsDataLineage from '../components/EchartsDataLineage';
import { useDashboardStore } from '../store/useDashboardStore';
import "./Dashboard.css";

const getQualityGrade = (score) => {
  if (score === null || score === undefined) return { grade: "N/A", color: "var(--text-muted)" };
  if (score >= 95) return { grade: "A Healthy", color: "var(--accent-green, #10B981)" };
  if (score >= 90) return { grade: "B+ Warning", color: "var(--accent-yellow, #F59E0B)" };
  if (score >= 85) return { grade: "B Caution", color: "var(--accent-yellow, #F59E0B)" };
  return { grade: "F Critical Anomaly", color: "var(--accent-red, #EF4444)" };
};

export default function Dashboard() {
  const navigate = useNavigate();

  // 1. Executive View Modes & Filters (Zustand Client State Management)
  const {
    viewMode,
    setViewMode,
    timeRange,
    setTimeRange,
    selectedAreaFilter,
    setSelectedAreaFilter,
    selectedSeverityFilter,
    setSelectedSeverityFilter,
    selectedSourceFilter,
    setSelectedSourceFilter
  } = useDashboardStore();

  const [selectedBusinessArea, setSelectedBusinessArea] = useState(null);
  const [lineageVisualMode, setLineageVisualMode] = useState('echarts'); // 'echarts' | 'linear'
  const [qualityChartType, setQualityChartType] = useState('bars'); // 'bars' | 'area'

  // Technical Cockpit States (Preserved)
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRun, setSelectedRun] = useState(null);
  const [userSelectedRunId, setUserSelectedRunId] = useState(null);
  const [leftTab, setLeftTab] = useState('Ratio');
  const [centerTab, setCenterTab] = useState('Trends');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 5;

  // 2. Data Fetching
  const exec = useApi('/executive/overview', { refreshInterval: 15000 });
  const kpi = useApi('/kpi/stats', { refreshInterval: 15000 });
  const anomaly = useApi('/anomaly/sources', { refreshInterval: 15000 });
  const services = useApi('/services/status', { refreshInterval: 10000 });
  const isHealthy = services.data && !services.error;
  const activity = useApi('/system/activity?limit=15', { refreshInterval: 15000 });
  const qualityHistory = useApi('/quality?limit=50', { refreshInterval: 15000 });
  const impact = useApi('/analytics/impact', { refreshInterval: 30000 });
  const remediations = useApi('/system/remediations', { refreshInterval: 20000 });
  const clustering = useApi('/analytics/clustering', { refreshInterval: 30000 });
  const projection = useApi('/analytics/projection', { refreshInterval: 30000 });
  const sellInOutApi = useApi('/analytics/sell-in-out', { refreshInterval: 30000 });
  const sellInOut = sellInOutApi.data || {
    summary: {
      total_sell_in_volume: 117500,
      total_sell_out_volume: 105150,
      reconciliation_gap_volume: 12350,
      quarantined_data_gap_volume: 8330,
      sales_accuracy_pct: 89.5,
      copdq_sales_loss_usd: 18544,
      quarantined_records_count: 1952
    },
    timeline: [
      { period: "18 Sep", sell_in: 14200, sell_out: 13900, quarantined_gap: 150, quality_score: 98.9, status: "Healthy", incident: "Data contract verified" },
      { period: "19 Sep", sell_in: 15400, sell_out: 14950, quarantined_gap: 220, quality_score: 98.4, status: "Healthy", incident: "Within normal variance" },
      { period: "20 Sep", sell_in: 16800, sell_out: 15600, quarantined_gap: 680, quality_score: 95.8, status: "Normal", incident: "Minor POS lag" },
      { period: "21 Sep", sell_in: 18200, sell_out: 13800, quarantined_gap: 2850, quality_score: 83.4, status: "Critical", incident: "Schema drift & Missing POS values" },
      { period: "22 Sep", sell_in: 17500, sell_out: 13200, quarantined_gap: 3100, quality_score: 81.8, status: "Critical", incident: "Quarantine threshold exceeded" },
      { period: "23 Sep", sell_in: 16900, sell_out: 15800, quarantined_gap: 950, quality_score: 94.2, status: "Recovering", incident: "Remediation ticket in progress" },
      { period: "24 Sep", sell_in: 18500, sell_out: 17900, quarantined_gap: 380, quality_score: 97.9, status: "Healthy", incident: "Pipeline normalized" }
    ],
    business_impact_narrative: "การเปรียบเทียบ Sell-In (117,500 ชิ้น) กับ Sell-Out (105,150 ชิ้น) เผยให้เห็นช่องว่าง (Discrepancy Gap) 12,350 ชิ้น โดยมีข้อมูลตกค้างใน Quarantine ถึง 8,330 ชิ้น ในช่วงที่ Data Quality ตกต่ำกว่า SLA 95% ส่งผลให้ระบบรายงานคาดการณ์สต็อกคลาดเคลื่อน และสร้างความเสี่ยงต่อยอดขายประเมินตาม Gartner COPDQ อยู่ที่ $18,544 USD"
  };
  const wbStateApi = useApi('/whitebox/state', { refreshInterval: 10000 });
  const aiContextApi = useApi('/whitebox/ai-context-explanations', { refreshInterval: 30000 });
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const wbMetrics = wbStateApi.data?.metrics || {};
  const wbTotal = wbMetrics.total_rows ?? 10100;
  const wbDatasetName = wbStateApi.data?.dataset_name || 'student_course_scores';
  const wbClean = wbMetrics.clean_rows ?? 9400;
  const wbReview = wbMetrics.review_rows ?? 100;
  const wbQuarantine = wbMetrics.quarantine_rows ?? 600;
  const wbScorePct = wbMetrics.quality_score_pct ?? 93.1;

  const handleRefreshAiLineage = async () => {
    setAiRefreshing(true);
    try {
      await fetch('/api/v1/whitebox/ai-context-explanations?force=true');
      aiContextApi.refetch();
    } catch {
      // ignore
    } finally {
      setAiRefreshing(false);
    }
  };

  // Sync selected run for technical cockpit
  useEffect(() => {
    if (qualityHistory.data && qualityHistory.data.length > 0) {
      if (!userSelectedRunId) {
        setSelectedRun(qualityHistory.data[0]);
      } else {
        const match = qualityHistory.data.find(r => r.run_id === userSelectedRunId);
        setSelectedRun(match || qualityHistory.data[0]);
      }
    }
  }, [qualityHistory.data, userSelectedRunId]);

  const terminalEndRef = useRef(null);

  // Executive Data extraction with safe, non-mock fallbacks
  const execData = exec.data || {};
  const execKpis = execData.executive_kpis || {};
  const dataHealth = execKpis.data_health || { score: null, status: 'N/A', trend_label: '', total_records: 0, clean_records: 0, quarantined_records: 0 };
  const dataAvailability = execKpis.data_availability || { score: null, status: 'N/A', total_pipelines: 0, failed_pipelines: 0 };
  const dataFreshness = execKpis.data_freshness || { score: null, status: 'N/A', avg_lag_hours: 0, sla_threshold_hours: 1.0 };
  const bizImpact = execKpis.business_impact || { areas_affected_count: 0, total_areas_count: 0, critical_issues_count: 0, reports_ok_pct: null, monetary_loss_usd: 0 };
  const reportAvail = execKpis.report_availability || { score: null, available_reports: 0, delayed_reports: 0, failed_reports: 0 };
  const activeCriticalCount = execKpis.active_critical_issues_count ?? 0;

  const bizAreas = execData.business_areas || [];
  const bizKpiImpactList = execData.business_kpi_impact || [];
  const sortedBizKpiImpactList = useMemo(() => {
    const sevOrder = { Critical: 0, Warning: 1, Normal: 2 };
    return [...bizKpiImpactList].sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));
  }, [bizKpiImpactList]);
  const criticalIssuesList = execData.critical_business_issues || [];
  const qualityBreakdown = execData.data_quality_breakdown || {
    missing_values_pct: 0,
    duplicate_records_pct: 0,
    invalid_type_pct: 0,
    schema_drift_count: 0,
    total_quarantined: 0
  };

  const fiveQuestions = execData.executive_summary_5w || {
    what: exec.loading ? "กำลังประมวลผลข้อมูลสถานะภาพรวมจากคลัสเตอร์..." : "ไม่พบความผิดปกติในระบบ ข้อมูลทุกส่วนทำงานปกติ",
    why: exec.loading ? "กำลังตรวจสอบสาเหตุ..." : "ท่อส่งข้อมูลทำงานตาม Data Contract",
    impact: exec.loading ? "กำลังประเมินผลกระทบ..." : "ไม่พบผลกระทบต่อส่วนงานธุรกิจ",
    how_much: exec.loading ? "กำลังประเมินความเสียหาย..." : "0 USD",
    action: exec.loading ? "กำลังดึงข้อมูลการดำเนินการ..." : "ระบบติดตามทำงานตามรอบปกติ"
  };

  // Filtered Critical Issues by severity & area
  const filteredCriticalIssues = useMemo(() => {
    return criticalIssuesList.filter(item => {
      const matchSev = selectedSeverityFilter === 'All' || (item.severity && item.severity.toLowerCase() === selectedSeverityFilter.toLowerCase());
      const matchArea = selectedAreaFilter === 'All' || (item.dataset && item.dataset.toLowerCase().includes(selectedAreaFilter.toLowerCase()));
      return matchSev && matchArea;
    });
  }, [criticalIssuesList, selectedSeverityFilter, selectedAreaFilter]);

  // Data Quality Trend Chart
  const qualityTrendData = useMemo(() => {
    if (!anomaly.data || !anomaly.data.timestamps || !anomaly.data.series) {
      return [];
    }
    return anomaly.data.timestamps.map((ts, i) => {
      const point = { time: ts, SLA: 95.0 };
      const seriesObj = anomaly.data.series;
      const keys = Object.keys(seriesObj);
      if (keys.length > 0) {
        let sum = 0;
        let validCount = 0;
        keys.forEach(k => {
          const val = seriesObj[k][i];
          if (val != null) {
            point[k] = val;
            sum += val;
            validCount++;
          }
        });
        point.Overall = validCount > 0 ? parseFloat((sum / validCount).toFixed(2)) : null;
      } else {
        point.Overall = null;
      }
      return point;
    });
  }, [anomaly.data]);

  // Technical cockpit filtered runs
  const filteredRuns = useMemo(() => {
    if (!qualityHistory.data || !Array.isArray(qualityHistory.data)) return [];
    return qualityHistory.data.filter(run => {
      const matchSearch =
        (run.run_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (run.table_name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchSource =
        selectedSourceFilter === 'All' ||
        (run.table_name || '').toLowerCase() === selectedSourceFilter.toLowerCase();
      return matchSearch && matchSource;
    });
  }, [qualityHistory.data, searchTerm, selectedSourceFilter]);

  const paginatedRuns = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return filteredRuns.slice(start, start + historyPageSize);
  }, [filteredRuns, historyPage]);

  const availableTables = useMemo(() => {
    if (!qualityHistory.data || !Array.isArray(qualityHistory.data)) return [];
    return Array.from(new Set(qualityHistory.data.map(r => r.table_name).filter(Boolean))).sort();
  }, [qualityHistory.data]);

  // Action: Resolve remediation ticket
  const [resolvingTicketId, setResolvingTicketId] = useState(null);
  const handleResolveTicket = async (ticketId) => {
    setResolvingTicketId(ticketId);
    try {
      await postApi(`/system/remediations/${ticketId}/resolve`);
      alert(`Ticket ${ticketId} marked as Resolved.`);
      remediations.refetch();
      exec.refetch();
    } catch (err) {
      alert(`Failed to resolve ticket: ${err.message}`);
    } finally {
      setResolvingTicketId(null);
    }
  };

  // Action: Pipeline retry
  const [retrying, setRetrying] = useState(false);
  const triggerPipelineRetry = async (runId) => {
    if (!runId) return;
    setRetrying(true);
    try {
      await postApi(`/pipeline/retry/${runId}`);
      alert("Pipeline retry triggered successfully.");
      qualityHistory.refetch();
      kpi.refetch();
      activity.refetch();
      exec.refetch();
    } catch (err) {
      alert("Failed to trigger pipeline retry: " + err.message);
    } finally {
      setRetrying(false);
    }
  };

  // CSV Export for Executive Summary
  const handleExportExecutiveCSV = () => {
    const csvRows = [
      ["SDOQAP Executive Overview Report"],
      ["Generated At", new Date().toISOString()],
      [],
      ["1. EXECUTIVE KPIS"],
      ["Metric", "Value", "Status", "Details"],
      ["Data Health Score", `${dataHealth.score}%`, dataHealth.status, `${dataHealth.clean_records} Clean / ${dataHealth.quarantined_records} Quarantined`],
      ["Data Availability", `${dataAvailability.score}%`, dataAvailability.status, `${dataAvailability.total_pipelines - dataAvailability.failed_pipelines}/${dataAvailability.total_pipelines} Active Pipelines`],
      ["Data Freshness", `${dataFreshness.score}%`, dataFreshness.status, `Avg Lag: ${dataFreshness.avg_lag_hours} hrs`],
      ["Business Impact", `${bizImpact.areas_affected_count} Areas`, "Warning", `Est. COPDQ Loss: $${bizImpact.monetary_loss_usd}`],
      ["Report Availability", `${reportAvail.score}%`, "Normal", `${reportAvail.available_reports} Available / ${reportAvail.delayed_reports} Delayed`],
      [],
      ["2. CRITICAL BUSINESS ISSUES"],
      ["Issue ID", "Issue Name", "Business Impact", "KPI Affected", "Severity", "Duration", "Status"],
      ...criticalIssuesList.map(ci => [ci.id, `"${ci.issue}"`, `"${ci.business_impact}"`, `"${ci.kpi_affected}"`, ci.severity, ci.duration, ci.status])
    ];
    const csvContent = "\uFEFF" + csvRows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SDOQAP_Executive_Overview_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activeRun = selectedRun || (qualityHistory.data && qualityHistory.data[0]);

  return (
    <div className="gs-dashboard">
      {/* ── TOP HEADER ── */}
      <div className="gs-topbar">
        <div>
          <h1 className="gs-title">
            Quality <span>Summary &amp; Trust Dashboard</span>
          </h1>
          <p className="gs-subtitle">
            สรุปผลลัพธ์การคัดกรองข้อมูลระดับ Medallion Pipeline สมการคำนวณคะแนนความเชื่อมั่น และการปิดช่องโหว่ที่ระบบต้นทาง
          </p>
        </div>

        {/* 4 View Modes Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div className="exec-view-tabs">
            <button
              className={`exec-view-tab ${viewMode === 'executive' ? 'active' : ''}`}
              onClick={() => setViewMode('executive')}
            >
              <Icon name="user" /> Executive Overview
            </button>
            <button
              className={`exec-view-tab ${viewMode === 'business' ? 'active' : ''}`}
              onClick={() => setViewMode('business')}
            >
              <Icon name="building" /> Business Impact
              {bizImpact.areas_affected_count > 0 && (
                <span className="exec-view-tab-badge">{bizImpact.areas_affected_count}</span>
              )}
            </button>
            <button
              className={`exec-view-tab ${viewMode === 'quality' ? 'active' : ''}`}
              onClick={() => setViewMode('quality')}
            >
              <Icon name="search" /> Data Quality
            </button>
            <button
              className={`exec-view-tab ${viewMode === 'technical' ? 'active' : ''}`}
              onClick={() => setViewMode('technical')}
            >
              <Icon name="settings" /> Technical Cockpit
            </button>
          </div>

          <div className="gs-status-cluster">
            <span className={`gs-status-dot ${isHealthy ? 'online' : 'offline'}`} />
            <span className="gs-status-label">{isHealthy ? 'CLUSTER HEALTHY' : 'CLUSTER DEGRADED'}</span>
          </div>
        </div>
      </div>



      {/* ── CONTROLS & FILTERS BAR ── */}
      <div className="exec-controls-bar">
        <div className="exec-filters-left">
          <span className="exec-filter-label">Filter By:</span>
          
          <select
            className="exec-filter-select"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="24h">Time: Last 24 Hours</option>
            <option value="7d">Time: Last 7 Days</option>
            <option value="30d">Time: Last 30 Days</option>
          </select>

          <select
            className="exec-filter-select"
            value={selectedAreaFilter}
            onChange={(e) => setSelectedAreaFilter(e.target.value)}
          >
            <option value="All">Business Area: All Areas</option>
            <option value="sales">Sales &amp; Revenue</option>
            <option value="customer">Customer Insights</option>
            <option value="reporting">Executive Reporting</option>
            <option value="operations">Supply Chain &amp; Ops</option>
            <option value="finance">Finance &amp; Audit</option>
          </select>

          <select
            className="exec-filter-select"
            value={selectedSeverityFilter}
            onChange={(e) => setSelectedSeverityFilter(e.target.value)}
          >
            <option value="All">Severity: All Levels</option>
            <option value="Critical"> Critical Only</option>
            <option value="Warning"> Warning Only</option>
            <option value="Normal"> Normal Only</option>
          </select>
        </div>

        <div className="exec-actions-right">
          <button
            className="exec-btn"
            onClick={() => { exec.refetch(); kpi.refetch(); anomaly.refetch(); wbStateApi.refetch(); }}
            title="Refresh All Real-time Metrics"
          >
            <Icon name="refresh" /> Refresh
          </button>
          <button
            className="exec-btn exec-btn-primary"
            onClick={handleExportExecutiveCSV}
            title="Export Executive CSV Report"
          >
            <Icon name="chart" /> Export Executive Report
          </button>
        </div>
      </div>
      {/* ═══════════════════════════════════════════════════════════
          VIEW 1: EXECUTIVE OVERVIEW (Section 4 - 8, 25 of Spec)
          ═══════════════════════════════════════════════════════════ */}
      {viewMode === 'executive' && (
        <>
          {/* Level 1 & 2: 6 Executive KPI Cards (Section 5) */}
          <div className="exec-kpi-grid">
            {/* Card 1: Data Health */}
            <div className={`exec-kpi-card ${dataHealth.status === 'Good' ? 'kpi-good' : dataHealth.status === 'Warning' ? 'kpi-warn' : 'kpi-crit'}`}>
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">Data Health Score</span>
                <span className={`exec-chip ${dataHealth.status === 'Good' ? 'exec-chip-good' : dataHealth.status === 'Warning' ? 'exec-chip-warn' : 'exec-chip-crit'}`}>
                  {dataHealth.status}
                </span>
              </div>
              <div className="exec-kpi-val">{dataHealth.score != null ? `${dataHealth.score}%` : '---'}</div>
              <div className="exec-kpi-sub">
                {dataHealth.clean_records?.toLocaleString()} clean · {dataHealth.quarantined_records?.toLocaleString()} quarantined
              </div>
            </div>

            {/* Card 2: Data Availability */}
            <div className={`exec-kpi-card ${dataAvailability.score >= 95 ? 'kpi-good' : 'kpi-warn'}`}>
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">Data Availability</span>
                <span className={`exec-chip ${dataAvailability.score >= 95 ? 'exec-chip-good' : 'exec-chip-warn'}`}>
                  {dataAvailability.score >= 95 ? 'HEALTHY' : 'DEGRADED'}
                </span>
              </div>
              <div className="exec-kpi-val">{dataAvailability.score != null ? `${dataAvailability.score}%` : '---'}</div>
              <div className="exec-kpi-sub">
                {dataAvailability.total_pipelines - dataAvailability.failed_pipelines}/{dataAvailability.total_pipelines} Pipelines Active
              </div>
            </div>

            {/* Card 3: Data Freshness */}
            <div className={`exec-kpi-card ${dataFreshness.score >= 90 ? 'kpi-good' : 'kpi-warn'}`}>
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">Data Freshness</span>
                <span className={`exec-chip ${dataFreshness.score >= 90 ? 'exec-chip-good' : 'exec-chip-warn'}`}>
                  {dataFreshness.score >= 90 ? 'ON-TIME' : 'DELAYED'}
                </span>
              </div>
              <div className="exec-kpi-val">{dataFreshness.score != null ? `${dataFreshness.score}%` : '---'}</div>
              <div className="exec-kpi-sub">
                Avg lag: {dataFreshness.avg_lag_hours} hrs (SLA &lt; {dataFreshness.sla_threshold_hours}h)
              </div>
            </div>

            {/* Card 4: Business Impact */}
            <div className="exec-kpi-card kpi-purple">
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">Business Impact</span>
                <span className="exec-chip exec-chip-warn">
                  {bizImpact.areas_affected_count} AREAS
                </span>
              </div>
              <div className="exec-kpi-val" style={{ color: 'var(--accent-purple)' }}>
                ${bizImpact.monetary_loss_usd?.toLocaleString()}
              </div>
              <div className="exec-kpi-sub">
                Est. COPDQ Loss · {bizImpact.areas_affected_count} Areas Impacted
              </div>
            </div>

            {/* Card 5: Report Availability */}
            <div className="exec-kpi-card kpi-blue">
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">Report Availability</span>
                <span className={`exec-chip ${(reportAvail.score || 0) >= 90 ? 'exec-chip-good' : 'exec-chip-warn'}`}>{reportAvail.score != null ? `${reportAvail.score}% OK` : 'N/A'}</span>
              </div>
              <div className="exec-kpi-val" style={{ color: '#3B82F6' }}>
                {reportAvail.score != null ? `${reportAvail.score}%` : '---'}
              </div>
              <div className="exec-kpi-sub">
                {reportAvail.available_reports} Ready · {reportAvail.delayed_reports} Delayed Report
              </div>
            </div>

            {/* Card 6: Active Critical Issues */}
            <div className={`exec-kpi-card ${activeCriticalCount > 0 ? 'kpi-crit' : 'kpi-good'}`}>
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">Critical Issues</span>
                <span className={`exec-chip ${activeCriticalCount > 0 ? 'exec-chip-crit' : 'exec-chip-good'}`}>
                  {activeCriticalCount > 0 ? 'ACTION' : 'CLEAR'}
                </span>
              </div>
              <div className="exec-kpi-val" style={{ color: activeCriticalCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {activeCriticalCount}
              </div>
              <div className="exec-kpi-sub">
                Active business risks requiring attention
              </div>
            </div>
          </div>

          {/* Level 3: Visualizations & 5-Questions Framework (Sections 6 & 25) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '16px' }}>
            {/* Left: Data Quality & Freshness Trend (SLA-Colored Bar Chart by Default) */}
            <div className="gs-card">
              <div className="gs-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'nowrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0 }}>Data Quality &amp; SLA Compliance Status</h3>
                    <span className="exec-chip exec-chip-good" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>Target 95.0%</span>
                  </div>
                  <p style={{ marginTop: '3px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Quality Score (%) vs 95% SLA Target across recent ingestion cycles
                  </p>
                </div>
                {/* Visual Mode Switcher - Single row, no stepping/wrapping */}
                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setQualityChartType('bars')}
                    style={{
                      background: qualityChartType === 'bars' ? 'var(--accent-purple)' : 'transparent',
                      color: qualityChartType === 'bars' ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      lineHeight: '1.2'
                    }}
                  >
                    SLA Bars
                  </button>
                  <button
                    type="button"
                    onClick={() => setQualityChartType('area')}
                    style={{
                      background: qualityChartType === 'area' ? 'var(--accent-purple)' : 'transparent',
                      color: qualityChartType === 'area' ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      lineHeight: '1.2'
                    }}
                  >
                    Area Trend
                  </button>
                </div>
              </div>

              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  {qualityChartType === 'bars' ? (
                    <BarChart data={qualityTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                      <YAxis domain={[70, 100]} stroke="var(--text-muted)" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const val = payload[0].value;
                            const status = val >= 95 ? 'Passed SLA (Healthy)' : val >= 90 ? 'Warning (SLA Borderline)' : 'SLA Breached (Critical Anomaly)';
                            const color = val >= 95 ? '#10B981' : val >= 90 ? '#F59E0B' : '#EF4444';
                            return (
                              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '11px' }}>
                                <div style={{ color: '#0F172A', fontWeight: 700, marginBottom: '2px' }}>รอบนำเข้า {label}</div>
                                <div style={{ color, fontWeight: 800 }}>คะแนนคุณภาพ {val}%</div>
                                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>สถานะ {status}</div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine y={95} stroke="#10B981" strokeDasharray="4 4" label={{ value: 'SLA Target 95%', fill: '#10B981', fontSize: 11, position: 'right' }} />
                      <Bar dataKey="Overall" name="Quality Score (%)" radius={[4, 4, 0, 0]}>
                        {qualityTrendData.map((entry, index) => {
                          const val = entry.Overall;
                          let barColor = '#10B981'; // Green
                          if (val !== null && val < 90) {
                            barColor = '#EF4444'; // Red
                          } else if (val !== null && val < 95) {
                            barColor = '#F59E0B'; // Amber
                          }
                          return <Cell key={`cell-${index}`} fill={barColor} />;
                        })}
                      </Bar>
                    </BarChart>
                  ) : (
                    <ComposedChart data={qualityTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="qualityGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--db-navy, #1B3139)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="var(--db-navy, #1B3139)" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                      <YAxis domain={[75, 100]} stroke="var(--text-muted)" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px', fontSize: '11px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                      <ReferenceLine y={95} stroke="var(--accent-green)" strokeDasharray="4 4" label={{ value: 'Target 95%', fill: 'var(--accent-green)', fontSize: 11 }} />
                      <Area type="monotone" dataKey="Overall" stroke="var(--accent-purple)" fillOpacity={1} fill="url(#qualityGradient)" strokeWidth={2} name="Overall Quality (%)" />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Status Badges Legend */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10B981' }} /> &ge;95% ผ่านเกณฑ์ SLA
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#F59E0B' }} /> 90-94% เฝ้าระวัง
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#EF4444' }} /> &lt;90% หลุดเกณฑ์ (SLA Breached)
                </span>
              </div>
            </div>

            {/* Right: 5-Question Executive Decision Framework (Section 25) */}
            <div className="exec-5w-card">
              <div className="exec-5w-header">
                <h3>
                  <span><Icon name="bolt" /></span> Executive 5-Question Framework
                </h3>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Instant Decision Support</span>
              </div>
              <div className="exec-5w-list">
                <div className="exec-5w-row what">
                  <div className="exec-5w-tag what"><Icon name="target" /> WHAT?</div>
                  <div className="exec-5w-text">{fiveQuestions.what}</div>
                </div>
                <div className="exec-5w-row why">
                  <div className="exec-5w-tag why"><Icon name="search" /> WHY?</div>
                  <div className="exec-5w-text">{fiveQuestions.why}</div>
                </div>
                <div className="exec-5w-row impact">
                  <div className="exec-5w-tag impact"><Icon name="alert" /> IMPACT?</div>
                  <div className="exec-5w-text">{fiveQuestions.impact}</div>
                </div>
                <div className="exec-5w-row howmuch">
                  <div className="exec-5w-tag howmuch"><Icon name="chart" /> HOW MUCH?</div>
                  <div className="exec-5w-text">{fiveQuestions.how_much}</div>
                </div>
                <div className="exec-5w-row action">
                  <div className="exec-5w-tag action"><Icon name="bolt" /> ACTION?</div>
                  <div className="exec-5w-text">{fiveQuestions.action}</div>
                </div>
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    ต้องการดูผลกระทบรูปธรรมต่อการกระจายสินค้า?
                  </span>
                  <button
                    type="button"
                    className="exec-btn exec-btn-primary"
                    style={{ fontSize: '10px', padding: '4px 10px', cursor: 'pointer' }}
                    onClick={() => setViewMode('business')}
                  >
                    ดูกราฟ Sell-In vs Sell-Out Volume →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Level 4: Business KPI Impact Matrix & Data Quality Breakdown (Sections 7 & 14) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
            {/* Left: Business KPI Impact Matrix (Section 7) */}
            <div className="exec-table-card">
              <div className="gs-card-head">
                <div>
                  <h3>Business KPI Impact Matrix</h3>
                  <p>Translating Technical Anomaly → KPI Degradation → Executive Business Impact</p>
                </div>
                <button
                  className="exec-btn"
                  onClick={() => setViewMode('business')}
                  style={{ fontSize: '10px' }}
                >
                  View Details →
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="exec-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: '11px' }}>Technical Issue</th>
                      <th style={{ fontSize: '11px' }}>Impacted Business KPI</th>
                      <th style={{ fontSize: '11px' }}>Executive Business Impact</th>
                      <th style={{ fontSize: '11px' }}>Severity</th>
                      <th style={{ fontSize: '11px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBizKpiImpactList.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: 'var(--accent-purple)', fontSize: '11px' }}>{item.technical_issue}</td>
                        <td style={{ fontWeight: 600, fontSize: '11px' }}>{item.impacted_kpi}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{item.business_impact}</td>
                        <td>
                          <span className={`exec-chip ${item.severity === 'Critical' ? 'exec-chip-crit' : item.severity === 'Warning' ? 'exec-chip-warn' : 'exec-chip-good'}`} style={{ fontSize: '11px' }}>
                            {item.severity}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '11px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Data Quality Breakdown (Section 14) */}
            <div className="gs-card">
              <div className="gs-card-head">
                <div>
                  <h3>Data Quality Status Breakdown</h3>
                  <p>Root cause distribution of quarantined data anomalies</p>
                </div>
                <span className="exec-chip exec-chip-warn">{qualityBreakdown.total_quarantined} Rows Quarantined</span>
              </div>
              <div className="exec-dim-grid">
                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name">Missing / Null Values</span>
                    <span className="exec-dim-score">{qualityBreakdown.missing_values_pct}%</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${Math.min(qualityBreakdown.missing_values_pct * 15, 100)}%`, background: 'var(--accent-yellow)' }} />
                  </div>
                </div>

                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name">Duplicate Records</span>
                    <span className="exec-dim-score">{qualityBreakdown.duplicate_records_pct}%</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${Math.min(qualityBreakdown.duplicate_records_pct * 30, 100)}%`, background: '#3B82F6' }} />
                  </div>
                </div>

                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name">Invalid Data Types / Format</span>
                    <span className="exec-dim-score">{qualityBreakdown.invalid_type_pct}%</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${Math.min(qualityBreakdown.invalid_type_pct * 40, 100)}%`, background: 'var(--accent-red)' }} />
                  </div>
                </div>

                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name">Schema Drift Events</span>
                    <span className="exec-dim-score">{qualityBreakdown.schema_drift_count} Active</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${qualityBreakdown.schema_drift_count > 0 ? 80 : 0}%`, background: 'var(--accent-purple)' }} />
                  </div>
                </div>

                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name">Clean &amp; Certified Records</span>
                    <span className="exec-dim-score" style={{ color: 'var(--accent-green)' }}>{dataHealth.score}%</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${dataHealth.score}%`, background: 'var(--accent-green)' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Level 5: Critical Business Issues (Section 8) */}
          <div className="exec-table-card">
            <div className="gs-card-head">
              <div>
                <h3>Critical Business Issues</h3>
                <p>Prioritized operational incidents impacting enterprise KPIs and reporting deadlines</p>
              </div>
              <span className="exec-chip exec-chip-crit">{filteredCriticalIssues.length} Incidents</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="exec-table">
                <thead>
                  <tr>
                    <th>Issue ID</th>
                    <th>Incident Name</th>
                    <th>Business Impact</th>
                    <th>KPI Affected</th>
                    <th>Severity</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCriticalIssues.map((issue) => (
                    <tr key={issue.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-muted)' }}>{issue.id}</td>
                      <td style={{ fontWeight: 700 }}>{issue.issue}</td>
                      <td style={{ color: 'var(--text-main)', fontSize: '11px' }}>{issue.business_impact}</td>
                      <td style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{issue.kpi_affected}</td>
                      <td>
                        <span className={`exec-chip ${issue.severity === 'Critical' ? 'exec-chip-crit' : 'exec-chip-warn'}`}>
                          {issue.severity}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{issue.duration}</td>
                      <td>
                        <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{issue.status}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="exec-btn"
                            style={{ padding: '3px 8px', fontSize: '9.5px' }}
                            onClick={() => {
                              setSelectedSourceFilter(issue.dataset?.split(' ')[0] || 'All');
                              setViewMode('technical');
                            }}
                          >
                            Drill-down <Icon name="settings" />
                          </button>
                          {issue.issue?.includes('Schema Drift') && (
                            <Link
                              to="/schema"
                              className="exec-btn exec-btn-primary"
                              style={{ padding: '3px 8px', fontSize: '9.5px', textDecoration: 'none' }}
                            >
                              Review Drift <Icon name="globe" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          VIEW 2: BUSINESS IMPACT DASHBOARD (Sections 9 - 12 of Spec)
          ═══════════════════════════════════════════════════════════ */}
      {viewMode === 'business' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Business Areas Cards (Section 11) */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Business Areas Health &amp; Impact
            </div>
            <div className="biz-area-grid">
              {bizAreas.map((area) => (
                <div
                  key={area.id}
                  className={`biz-area-card ${selectedBusinessArea === area.id ? 'selected' : ''}`}
                  onClick={() => setSelectedBusinessArea(selectedBusinessArea === area.id ? null : area.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="biz-area-name">{area.name}</span>
                    <span className={`exec-chip ${area.status === 'Normal' ? 'exec-chip-good' : area.status === 'Warning' ? 'exec-chip-warn' : 'exec-chip-crit'}`}>
                      {area.status}
                    </span>
                  </div>
                  <div className="biz-area-score" style={{ color: area.status === 'Normal' ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                    {area.health_pct}%
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    {area.impact_summary}
                  </div>
                  {area.affected_datasets && area.affected_datasets.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {area.affected_datasets.map((ds, i) => (
                        <span key={i} style={{ background: 'var(--bg-primary)', padding: '2px 5px', borderRadius: '4px', fontSize: '8.5px', fontFamily: 'var(--font-mono)' }}>
                          {ds}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Business Impact Mapping Flow (Section 10) */}
          <div className="gs-card">
            <div className="gs-card-head">
              <div>
                <h3>Business Impact Mapping Flow</h3>
                <p>How technical pipeline events cascade into business KPI decisions</p>
              </div>
            </div>
            <div className="biz-flow-diagram">
              <div className="biz-flow-box red">
                <div className="biz-flow-title">1. Technical Issue</div>
                <div className="biz-flow-sub">Pipeline Failure / Drift</div>
              </div>
              <div className="biz-flow-arrow">→</div>
              <div className="biz-flow-box amber">
                <div className="biz-flow-title">2. Technical Impact</div>
                <div className="biz-flow-sub">Data Delay &amp; Quarantine</div>
              </div>
              <div className="biz-flow-arrow">→</div>
              <div className="biz-flow-box purple">
                <div className="biz-flow-title">3. KPI Impact</div>
                <div className="biz-flow-sub">Sales &amp; Forecast Reliability</div>
              </div>
              <div className="biz-flow-arrow">→</div>
              <div className="biz-flow-box green">
                <div className="biz-flow-title">4. Business Action</div>
                <div className="biz-flow-sub">Remediation Ticket &amp; Decision</div>
              </div>
            </div>
          </div>

          {/* Concrete Business Evidence: Sell-In vs. Sell-Out Volume Reconciliation Chart */}
          <div className="gs-card" style={{ padding: '20px' }}>
            <div className="gs-card-head" style={{ marginBottom: '14px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: 'var(--accent-purple)', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                    CONCRETE BUSINESS EVIDENCE
                  </span>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>Sell-In vs. Sell-Out Volume Reconciliation &amp; Data Quality Discrepancy</h3>
                </div>
                <p style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  เปรียบเทียบยอดกระจายสินค้าเข้าสู่ช่องทางจัดจำหน่าย (Sell-In) กับยอดขายจริงหน้าร้าน POS (Sell-Out) เพื่อระบุสต็อกลวง (Phantom Inventory) และความเสียหายจากข้อมูลตกหล่น
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span className="exec-chip exec-chip-warn" style={{ fontSize: '10.5px' }}>
                  Reconciliation Gap: {sellInOut.summary.reconciliation_gap_volume.toLocaleString()} Units
                </span>
                <span className="exec-chip exec-chip-crit" style={{ fontSize: '10.5px' }}>
                  COPDQ Sales Risk: ${sellInOut.summary.copdq_sales_loss_usd.toLocaleString()} USD
                </span>
              </div>
            </div>

            {/* Metric Summary Cards Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '4px solid #1E3A8A', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sell-In Volume (ERP / DC)</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
                  {sellInOut.summary.total_sell_in_volume.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>units</span>
                </div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>ยอดส่งสินค้าเข้าช่องทางจำหน่าย</div>
              </div>

              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '4px solid #10B981', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sell-Out Volume (Retail POS)</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#10B981', marginTop: '2px' }}>
                  {sellInOut.summary.total_sell_out_volume.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>units</span>
                </div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>ยอดขายออกสู่ผู้บริโภคจริง (POS)</div>
              </div>

              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '4px solid #EF4444', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Quarantined Data Gap</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#EF4444', marginTop: '2px' }}>
                  {sellInOut.summary.quarantined_data_gap_volume.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>units</span>
                </div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>ยอดที่บันทึกไม่สำเร็จ/ติดกักกัน</div>
              </div>

              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '4px solid #8B5CF6', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sales Reconciliation Rate</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-purple)', marginTop: '2px' }}>
                  {sellInOut.summary.sales_accuracy_pct}%
                </div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>ความสมบูรณ์ของท่อส่งยอดขาย</div>
              </div>
            </div>

            {/* The Visual Chart: ComposedChart with Bars and SLA Line */}
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={sellInOut.timeline} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={11} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" domain={[70, 100]} stroke="var(--text-muted)" fontSize={10} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px' }}>
                            <strong style={{ color: '#0F172A', display: 'block', marginBottom: '4px' }}>{label} ({data.status})</strong>
                            <div style={{ color: '#1E3A8A' }}>● Sell-In Volume: <strong>{data.sell_in?.toLocaleString()}</strong> units</div>
                            <div style={{ color: '#10B981' }}>● Sell-Out Volume: <strong>{data.sell_out?.toLocaleString()}</strong> units</div>
                            <div style={{ color: '#EF4444' }}>● Quarantined Gap: <strong>{data.quarantined_gap?.toLocaleString()}</strong> units</div>
                            <div style={{ color: '#8B5CF6', marginTop: '4px' }}>★ Data Quality Score: <strong>{data.quality_score}%</strong></div>
                            <div style={{ color: '#64748B', fontSize: '10px', marginTop: '4px', fontStyle: 'italic' }}>Note: {data.incident}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                  <ReferenceLine yAxisId="right" y={95} stroke="#10B981" strokeDasharray="3 3" label={{ value: 'SLA Target 95%', fill: '#10B981', fontSize: 10, position: 'right' }} />
                  <Bar yAxisId="left" dataKey="sell_in" name="Sell-In Volume (ERP/Inflow)" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="sell_out" name="Sell-Out Volume (POS/Outflow)" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="quarantined_gap" name="Quarantined / Missing Gap" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="quality_score" name="Pipeline Quality Score (%)" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Concrete Narrative Insight Callout */}
            <div style={{ marginTop: '14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '3px solid var(--accent-purple)', borderRadius: '6px', padding: '10px 14px', fontSize: '11.5px', color: 'var(--text-main)', lineHeight: '1.55' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <Icon name="sparkles" /> บทวิเคราะห์ผลกระทบรูปธรรมต่อห่วงโซ่อุปทานและการขาย (Supply Chain &amp; Revenue Reality)
              </div>
              <div>{sellInOut.business_impact_narrative}</div>
            </div>
          </div>

          {/* COPDQ Financial Loss Breakdown (Section 23) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="gs-card">
              <div className="gs-card-head">
                <div>
                  <h3>COPDQ Financial Loss Breakdown</h3>
                  <p>Gartner &amp; IBM Framework: Cost of Poor Data Quality</p>
                </div>
                <span className="exec-chip exec-chip-crit">${bizImpact.monetary_loss_usd} Total</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                  <div>
                    <strong style={{ fontSize: '11.5px' }}>1. Cost of Correction</strong>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Operational engineering compute to re-ingest quarantined rows</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${(bizImpact.monetary_loss_usd * 0.35).toFixed(0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                  <div>
                    <strong style={{ fontSize: '11.5px' }}>2. Cost of Lost Opportunities</strong>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sales inaccuracy and delayed decision execution</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${(bizImpact.monetary_loss_usd * 0.45).toFixed(0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                  <div>
                    <strong style={{ fontSize: '11.5px' }}>3. Cost of Risk &amp; Compliance</strong>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Schema drift SLA penalties and governance audit risk</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${(bizImpact.monetary_loss_usd * 0.20).toFixed(0)}</span>
                </div>
              </div>
            </div>

            {/* Active Remediation Tickets (Section 21) */}
            <div className="gs-card">
              <div className="gs-card-head">
                <div>
                  <h3>Upstream Governance Tickets</h3>
                  <p>Remediation tickets assigned to upstream data engineers</p>
                </div>
                <span className="exec-chip exec-chip-warn">
                  {remediations.data?.tickets?.length || 0} Open Tickets
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {!remediations.data?.tickets || remediations.data.tickets.length === 0 ? (
                  <div className="gs-empty">No pending remediation tickets</div>
                ) : (
                  remediations.data.tickets.map((tkt) => (
                    <div
                      key={tkt.ticket_id}
                      style={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700 }}>{tkt.table_name} - Run #{tkt.run_id}</div>
                        <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                          Assigned to: {tkt.target_owner || 'Data Engineer Team'}
                        </div>
                      </div>
                      <button
                        className="exec-btn"
                        style={{ fontSize: '10px', padding: '3px 8px' }}
                        disabled={resolvingTicketId === tkt.ticket_id}
                        onClick={() => handleResolveTicket(tkt.ticket_id)}
                      >
                        {resolvingTicketId === tkt.ticket_id ? 'Resolving...' : 'Resolve '}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          VIEW 3: DATA QUALITY DASHBOARD (Sections 13 - 15 of Spec)
          ═══════════════════════════════════════════════════════════ */}
      {viewMode === 'quality' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Quality Dimensions Grid */}
          <div className="exec-kpi-grid">
            <div className="exec-kpi-card kpi-good">
              <span className="exec-kpi-title">Completeness</span>
              <div className="exec-kpi-val">{exec.loading ? '...' : `${(100 - (qualityBreakdown.missing_values_pct || 0)).toFixed(1)}%`}</div>
              <div className="exec-kpi-sub">{qualityBreakdown.missing_values_pct > 0 ? `${qualityBreakdown.missing_values_pct}% missing fields` : '100% complete'}</div>
            </div>
            <div className="exec-kpi-card kpi-good">
              <span className="exec-kpi-title">Uniqueness</span>
              <div className="exec-kpi-val">{exec.loading ? '...' : `${(100 - (qualityBreakdown.duplicate_records_pct || 0)).toFixed(1)}%`}</div>
              <div className="exec-kpi-sub">{qualityBreakdown.duplicate_records_pct > 0 ? `${qualityBreakdown.duplicate_records_pct}% duplicates isolated` : 'Zero duplicates'}</div>
            </div>
            <div className="exec-kpi-card kpi-good">
              <span className="exec-kpi-title">Validity</span>
              <div className="exec-kpi-val">{exec.loading ? '...' : `${(100 - (qualityBreakdown.invalid_type_pct || 0)).toFixed(1)}%`}</div>
              <div className="exec-kpi-sub">{qualityBreakdown.invalid_type_pct > 0 ? `${qualityBreakdown.invalid_type_pct}% type mismatches` : 'Type & bounds checked'}</div>
            </div>
            <div className={`exec-kpi-card ${(dataFreshness.score || 100) >= 90 ? 'kpi-good' : 'kpi-warn'}`}>
              <span className="exec-kpi-title">Timeliness</span>
              <div className="exec-kpi-val">{dataFreshness.score != null ? `${dataFreshness.score}%` : '---'}</div>
              <div className="exec-kpi-sub">Avg latency {dataFreshness.avg_lag_hours || 0} hrs</div>
            </div>
            <div className="exec-kpi-card kpi-purple">
              <span className="exec-kpi-title">Consistency</span>
              <div className="exec-kpi-val">{dataHealth.score != null ? `${dataHealth.score}%` : '---'}</div>
              <div className="exec-kpi-sub">Cross-table checks OK</div>
            </div>
            <div className={`exec-kpi-card ${qualityBreakdown.schema_drift_count > 0 ? 'kpi-warn' : 'kpi-blue'}`}>
              <span className="exec-kpi-title">Drift Integrity</span>
              <div className="exec-kpi-val">{qualityBreakdown.schema_drift_count > 0 ? `${Math.max(0, 100 - qualityBreakdown.schema_drift_count * 10).toFixed(1)}%` : '100.0%'}</div>
              <div className="exec-kpi-sub">{qualityBreakdown.schema_drift_count > 0 ? `${qualityBreakdown.schema_drift_count} Schema Evolution(s)` : 'No schema drift'}</div>
            </div>
          </div>

          {/* Datasets Quality Ranking */}
          <div className="exec-table-card">
            <div className="gs-card-head">
              <div>
                <h3>Dataset Quality Leaderboard</h3>
                <p>Continuous audit scores per table catalog</p>
              </div>
              <Link to="/rules" className="exec-btn" style={{ fontSize: '10px', textDecoration: 'none' }}>
                Governance Rules →
              </Link>
            </div>
            <table className="exec-table">
              <thead>
                <tr>
                  <th>Dataset / Table</th>
                  <th>Quality Score</th>
                  <th>Total Rows</th>
                  <th>Quarantined</th>
                  <th>Status</th>
                  <th>Last Audited</th>
                </tr>
              </thead>
              <tbody>
                {availableTables.map((tbl, i) => {
                  const runsForTable = qualityHistory.data?.filter(r => r.table_name === tbl) || [];
                  const latest = runsForTable[0] || {};
                  const score = latest.quality_score != null ? latest.quality_score : null;
                  const grade = getQualityGrade(score);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>{tbl}</td>
                      <td>
                        <span style={{ color: grade.color, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                          {score != null ? `${score.toFixed(1)}%` : 'N/A'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{latest.total_records != null ? latest.total_records.toLocaleString() : '-'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: (latest.quarantined_records || 0) > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                        {latest.quarantined_records != null ? latest.quarantined_records.toLocaleString() : '-'}
                      </td>
                      <td>
                        <span className={`exec-chip ${score != null && score >= 95 ? 'exec-chip-good' : score != null && score >= 90 ? 'exec-chip-warn' : 'exec-chip-crit'}`}>
                          {grade.grade}
                        </span>
                      </td>
                      <td style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {latest.timestamp ? new Date(latest.timestamp).toLocaleTimeString() : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          VIEW 4: TECHNICAL MONITORING COCKPIT (Original Engine)
          ═══════════════════════════════════════════════════════════ */}
      {viewMode === 'technical' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Interactive Score Derivation & 4-Step Operational Lineage Bar */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "16px 20px", boxShadow: "0 1px 2px rgba(15,23,42,0.03)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ background: "#1B3139", color: "#FFFFFF", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", letterSpacing: "0.04em" }}>
                    LAKEHOUSE MONITORING · DATA QUALITY LINEAGE
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A" }}>
                    <Icon name="chart" /> สูตรคำนวณดัชนีคุณภาพข้อมูล ({wbDatasetName}):
                  </span>
                  <code style={{ background: "#F8FAFC", color: "#0F172A", border: "1px solid #E2E8F0", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700 }}>
                    (ข้อมูลสะอาด {wbClean.toLocaleString()} แถว ÷ ข้อมูลขาเข้าทั้งหมด {wbTotal.toLocaleString()} แถว) × 100 = {wbScorePct}%
                  </code>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleRefreshAiLineage}
                  disabled={aiRefreshing}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#1B3139",
                    background: "#F8FAFC",
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "1px solid #CBD5E1",
                    cursor: aiRefreshing ? "wait" : "pointer"
                  }}
                >
                  <Icon name="sparkles" /> {aiRefreshing ? "AI กำลังสรุปภาพรวม..." : "อัปเดตบทวิเคราะห์ AI"}
                </button>
                <Link
                  to="/ingestion"
                  style={{ fontSize: "11px", fontWeight: 700, color: "#FFFFFF", textDecoration: "none", background: "#1B3139", padding: "5px 12px", borderRadius: "6px" }}
                >
                  <Icon name="search" /> เปิดคอนโซล Bronze Ingestion <Icon name="arrow-right" />
                </Link>
              </div>
            </div>

            {/* AI Contextual Narrative Banner */}
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderLeft: "3px solid #FF3621", borderRadius: "6px", padding: "10px 12px", marginBottom: "12px", fontSize: "11.5px", color: "#334155", lineHeight: "1.55" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px", flexWrap: "wrap", gap: "6px" }}>
                <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#1B3139", display: "flex", alignItems: "center", gap: "5px" }}>
                  <Icon name="sparkles" /> สรุปสถานะคุณภาพข้อมูลและเส้นทางสายข้อมูลโดย AI ({aiContextApi.data?.model || "openai/gpt-oss-120b"})
                </span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748B" }}>
                  ตาราง: {wbDatasetName} ({wbTotal.toLocaleString()} แถว)
                </span>
              </div>
              <div style={{ fontWeight: 500, color: "#0F172A" }}>
                {aiContextApi.data?.step5_lineage?.executive_narrative ||
                  `ภาพรวมคุณภาพข้อมูลของตาราง '${wbDatasetName}' อยู่ที่ ${wbScorePct}% โดยมีข้อมูลสะอาดพร้อมใช้งาน ${wbClean.toLocaleString()} แถว รอผู้ดูแลตรวจสอบใน Review Queue ${wbReview.toLocaleString()} แถว และกักกันเพื่อส่งรายงานแจ้งแก้ที่ระบบต้นทาง ${wbQuarantine.toLocaleString()} แถว`}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
              <Link to="/ingestion" style={{ textDecoration: "none", background: "#FFFFFF", border: "1px solid #E2E8F0", borderLeft: "3px solid #DC2626", borderRadius: "6px", padding: "10px 12px", display: "block" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", letterSpacing: "0.04em" }}>BRONZE INGESTION (/ingestion)</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", marginTop: "2px" }}><Icon name="search" /> สแกนพบความผิดปกติ {Array.isArray(wbStateApi.data?.selected_findings) ? wbStateApi.data.selected_findings.length : wbStateApi.data?.selected_findings ? Object.values(wbStateApi.data.selected_findings).filter(Boolean).length : 3} หมวดหมู่</div>
                <div style={{ fontSize: "10.5px", color: "#475569", marginTop: "3px", lineHeight: "1.4" }}>
                  {aiContextApi.data?.step5_lineage?.step1_card_desc || `สแกน ${wbTotal.toLocaleString()} แถว พบค่าว่าง ค่านอกช่วง คีย์ซ้ำ และค่าเกินรั้วสถิติ → คลิกดู`}
                </div>
              </Link>

              <Link to="/rules" style={{ textDecoration: "none", background: "#FFFFFF", border: "1px solid #E2E8F0", borderLeft: "3px solid #D97706", borderRadius: "6px", padding: "10px 12px", display: "block" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", letterSpacing: "0.04em" }}>DELTA EXPECTATIONS (/rules)</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", marginTop: "2px" }}><Icon name="scale" /> ตั้งเกณฑ์และยืนยันกฎ</div>
                <div style={{ fontSize: "10.5px", color: "#475569", marginTop: "3px", lineHeight: "1.4" }}>
                  {aiContextApi.data?.step5_lineage?.step2_card_desc || `Range [${wbStateApi.data?.min_score ?? 0},${wbStateApi.data?.max_score ?? 100}] · Tukey ${wbStateApi.data?.tukey_multiplier || "3.0"}× IQR → คลิกปรับเกณฑ์`}
                </div>
              </Link>

              <Link to="/pipeline" style={{ textDecoration: "none", background: "#FFFFFF", border: "1px solid #E2E8F0", borderLeft: "3px solid #0284C7", borderRadius: "6px", padding: "10px 12px", display: "block" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", letterSpacing: "0.04em" }}>SILVER QUALITY GATES (/pipeline)</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", marginTop: "2px" }}><Icon name="settings" /> คัดแยก 3 โซน &amp; อนุมัติคิว</div>
                <div style={{ fontSize: "10.5px", color: "#475569", marginTop: "3px", lineHeight: "1.4" }}>
                  {aiContextApi.data?.step5_lineage?.step3_card_desc || `สะอาด ${wbClean.toLocaleString()} | รอตรวจ ${wbReview.toLocaleString()} | กักกัน ${wbQuarantine.toLocaleString()} → คลิกสั่งการ`}
                </div>
              </Link>

              <Link to="/export" style={{ textDecoration: "none", background: "#FFFFFF", border: "1px solid #E2E8F0", borderLeft: "3px solid #16A34A", borderRadius: "6px", padding: "10px 12px", display: "block" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", letterSpacing: "0.04em" }}>GOLD EXPORT (/export)</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", marginTop: "2px" }}><Icon name="box" /> ส่งออก CSV แยก 3 โซน ({wbClean.toLocaleString()} แถว)</div>
                <div style={{ fontSize: "10.5px", color: "#475569", marginTop: "3px", lineHeight: "1.4" }}>
                  {aiContextApi.data?.step5_lineage?.step4_card_desc || `ดาวน์โหลด Clean CSV และใบแจ้งแก้ต้นทาง → คลิกส่งออก`}
                </div>
              </Link>
            </div>

            {/* Bottom Action Bar in Primary Summary Mode */}
            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "#334155", fontWeight: 600 }}>
                ต้องการดูรายการเรคคอร์ดทั้งหมด ({wbTotal.toLocaleString()} แถว) ของตาราง {wbDatasetName} แบบละเอียดพร้อมกรองตามประเภทความผิดปกติหรือไม่?
              </span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Link
                  to="/whitebox"
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "#1B3139",
                    color: "#FFFFFF",
                    textDecoration: "none"
                  }}
                >
                  เปิดตารางตรวจสอบข้อมูลเชิงลึก (/whitebox) →
                </Link>
                <Link
                  to="/rules"
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: "#F8FAFC",
                    color: "#334155",
                    border: "1px solid #CBD5E1",
                    textDecoration: "none"
                  }}
                >
                  กลับไปปรับเกณฑ์ที่ Delta Expectations (/rules)
                </Link>
              </div>
            </div>
          </div>

          {/* Data Lineage & Network Graph: Apache ECharts vs Classic Linear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Medallion Data Lineage Visualizer
            </div>
            <div style={{ display: 'inline-flex', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => setLineageVisualMode('echarts')}
                style={{
                  background: lineageVisualMode === 'echarts' ? 'var(--accent-purple)' : 'transparent',
                  color: lineageVisualMode === 'echarts' ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '3px 10px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Apache ECharts (Heavy Data Canvas)
              </button>
              <button
                type="button"
                onClick={() => setLineageVisualMode('linear')}
                style={{
                  background: lineageVisualMode === 'linear' ? 'var(--accent-purple)' : 'transparent',
                  color: lineageVisualMode === 'linear' ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '3px 10px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Linear Track
              </button>
            </div>
          </div>

          {lineageVisualMode === 'echarts' ? (
            <EchartsDataLineage
              totalRecords={activeRun?.total_records || wbTotal}
              quarantinedRecords={activeRun?.quarantined_records || wbQuarantine}
              tableName={activeRun?.table_name || wbDatasetName}
              qualityScore={activeRun?.quality_score || wbScorePct}
            />
          ) : (
            <div className="gs-lineage-hero">
              <div className="gs-lineage-header">
                <h2>Medallion Flow Data Lineage Track</h2>
                <span className="gs-lineage-route">Route: Bronze (HDFS) → Silver (Spark Engine) → Gold (Active/Quarantine)</span>
              </div>
              {(() => {
                const totalRecs = activeRun?.total_records || 0;
                const quarRecs = activeRun?.quarantined_records || 0;
                const hasError = activeRun && quarRecs > 0;
                const hasClean = activeRun && (totalRecs - quarRecs > 0);
                return (
                  <div className="gs-lineage-track" style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                    <div className="gs-node active">
                      <span className="gs-node-icon"><Icon name="download" /></span>
                      <div className="gs-node-text">
                        <strong>{activeRun ? activeRun.data_source || activeRun.table_name : 'Ingest Source'}</strong>
                        <small>Bronze Layer</small>
                        <span className="gs-node-stat">{totalRecs.toLocaleString()} rows</span>
                      </div>
                    </div>
                    <div className="gs-connector active"><div className="gs-connector-line"></div><div className="gs-connector-arrow">→</div></div>

                    <div className="gs-node active">
                      <span className="gs-node-icon"><Icon name="settings" /></span>
                      <div className="gs-node-text">
                        <strong>Spark QA Engine</strong>
                        <small>Quality Rules Audit</small>
                      </div>
                    </div>
                    <div className="gs-connector active"><div className="gs-connector-line"></div><div className="gs-connector-arrow">→</div></div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className={`gs-node ${hasClean ? 'active' : ''}`}>
                        <span className="gs-node-icon"><Icon name="check" /></span>
                        <div className="gs-node-text">
                          <strong>Active Store</strong>
                          <small>Clean Delta Lake</small>
                          <span className="gs-node-stat">{(totalRecs - quarRecs).toLocaleString()} rows</span>
                        </div>
                      </div>
                      <div className={`gs-node ${hasError ? 'danger' : ''}`}>
                        <span className="gs-node-icon"><Icon name="alert" /></span>
                        <div className="gs-node-text">
                          <strong>Quarantine Store</strong>
                          <small>Bad Data Isolation</small>
                          <span className="gs-node-stat">{quarRecs.toLocaleString()} rows</span>
                        </div>
                      </div>
                    </div>

                    <div className="gs-connector active"><div className="gs-connector-line"></div><div className="gs-connector-arrow">→</div></div>
                    <div className="gs-node active">
                      <span className="gs-node-icon"><Icon name="chart" /></span>
                      <div className="gs-node-text">
                        <strong>Serving API</strong>
                        <small>BI &amp; BI Cockpit</small>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Technical Cockpit Scorecard History & Actions */}
          <div className="gs-main">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="gs-card gs-card-tall">
                <div className="gs-card-head">
                  <div>
                    <h3>Pipeline Run Audit History</h3>
                    <p>Select run to inspect quarantine details or trigger retry</p>
                  </div>
                  <input
                    type="text"
                    placeholder="Search table/run..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="gs-search"
                  />
                </div>
                <div className="gs-ptable-wrap" style={{ flexGrow: 1, minHeight: 0 }}>
                  <table className="gs-ptable">
                    <thead>
                      <tr>
                        <th>TIMESTAMP</th>
                        <th>TABLE</th>
                        <th>RUN ID</th>
                        <th>TOTAL ROWS</th>
                        <th>SCORE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRuns.map((run) => (
                        <tr
                          key={run.run_id}
                          className={`gs-run-item ${selectedRun && selectedRun.run_id === run.run_id ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedRun(run);
                            setUserSelectedRunId(run.run_id);
                          }}
                        >
                          <td className="gs-mono">{run.timestamp ? new Date(run.timestamp).toLocaleTimeString() : '-'}</td>
                          <td><strong>{run.table_name}</strong></td>
                          <td className="gs-mono" style={{ fontSize: '9px' }}>{run.run_id}</td>
                          <td className="gs-mono">{run.total_records?.toLocaleString()}</td>
                          <td>
                            <span className={`gs-badge ${run.quality_score >= 95 ? 'high' : 'warn'}`}>
                              {run.quality_score}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Page {historyPage} of {Math.max(1, Math.ceil(filteredRuns.length / historyPageSize))}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="exec-btn"
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                    >
                      Prev
                    </button>
                    <button
                      className="exec-btn"
                      disabled={historyPage >= Math.ceil(filteredRuns.length / historyPageSize)}
                      onClick={() => setHistoryPage(p => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Selected Run Inspector & Retry */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="gs-card">
                <div className="gs-card-head">
                  <div>
                    <h3>Run Inspector</h3>
                    <p>{activeRun ? activeRun.run_id : 'No run selected'}</p>
                  </div>
                  {activeRun && (
                    <button
                      className="exec-btn exec-btn-primary"
                      disabled={retrying}
                      onClick={() => triggerPipelineRetry(activeRun.run_id)}
                    >
                      {retrying ? 'Retrying...' : ' Retry Run'}
                    </button>
                  )}
                </div>

                {activeRun && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Table:</span>
                      <strong>{activeRun.table_name}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Quality Score:</span>
                      <strong style={{ color: activeRun.quality_score >= 95 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                        {activeRun.quality_score}%
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Total Records:</span>
                      <span>{activeRun.total_records?.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Quarantined:</span>
                      <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>
                        {activeRun.quarantined_records?.toLocaleString()}
                      </span>
                    </div>
                    {activeRun.quarantine_breakdown && Object.keys(activeRun.quarantine_breakdown).length > 0 && (
                      <div style={{ marginTop: '8px', background: 'var(--bg-primary)', padding: '8px', borderRadius: '6px' }}>
                        <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                          Quarantine Breakdown
                        </div>
                        {Object.entries(activeRun.quarantine_breakdown).map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                            <span>{k}:</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Live Terminal Log Streamer */}
              <div className="gs-terminal">
                <div className="gs-terminal-bar">
                  <div className="gs-terminal-dots"><i/><i/><i/></div>
                  <span>LIVE INGESTION &amp; SPARK LOG STREAM</span>
                </div>
                <div className="gs-terminal-body">
                  {!activity.data || activity.data.length === 0 ? (
                    <div style={{ color: '#64748b' }}>Awaiting pipeline event stream...</div>
                  ) : (
                    activity.data.map((log, i) => (
                      <div key={i} className={`gs-log ${log.level === 'ERROR' ? 'error' : log.level === 'WARN' ? 'warn' : ''}`}>
                        <span className="gs-log-ts">[{log.timestamp ? log.timestamp.slice(11, 19) : '00:00:00'}]</span>{' '}
                        <span className="gs-log-lvl">{log.level || 'INFO'}:</span> {log.message || log.event}
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
