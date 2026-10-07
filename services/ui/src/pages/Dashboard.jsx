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
import EchartsDataLineage from '../components/EchartsDataLineage';
import DataFlowStreamChart from '../components/DataFlowStreamChart';
import { useDashboardStore } from '../store/useDashboardStore';
import { getPage } from '../config/pages';
import { formatUsd, formatThbApprox, formatUsdWithThb } from '../utils/currency';
import { InfoHint } from '../components/ui';
import "./Dashboard.css";

const getQualityGrade = (score) => {
  if (score === null || score === undefined) return { grade: "N/A", color: "var(--text-muted)" };
  if (score >= 95) return { grade: "A Healthy", color: "var(--accent-green, #10B981)" };
  if (score >= 90) return { grade: "B+ Warning", color: "var(--accent-yellow, #F59E0B)" };
  if (score >= 85) return { grade: "B Caution", color: "var(--accent-yellow, #F59E0B)" };
  return { grade: "F Critical Anomaly", color: "var(--accent-red, #EF4444)" };
};

const AREA_DATASET_MAP = {
  sales: ['products', 'orders', 'transactions', 'pos', 'grocery'],
  customer: ['users', 'customers', 'mbti', 'student', 'student_course_scores'],
  operations: ['products', 'dirty_dataset', 'inventory', 'fulfillment', 'stock'],
  reporting: ['users', 'products', 'mbti', 'dirty_dataset', 'pipeline'],
  finance: ['products', 'orders', 'transactions', 'sales', 'finance']
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

  const [ticketFilterTab, setTicketFilterTab] = useState('OPEN'); // 'OPEN' | 'ALL'
  const [lineageVisualMode, setLineageVisualMode] = useState('stream'); // 'stream' | 'echarts' | 'linear'
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
  const areaQueryParam = selectedAreaFilter !== 'All' ? `&business_area=${selectedAreaFilter}` : '';
  const exec = useApi(`/executive/overview?time_range=${timeRange}${areaQueryParam}`, { refreshInterval: 15000 });
  const kpi = useApi('/kpi/stats', { refreshInterval: 15000 });
  const anomaly = useApi(`/anomaly/sources?time_range=${timeRange}${areaQueryParam}`, { refreshInterval: 15000 });
  const services = useApi('/services/status', { refreshInterval: 10000 });
  const isHealthy = services.data && !services.error;
  const activity = useApi('/system/activity?limit=15', { refreshInterval: 15000 });
  const qualityHistory = useApi('/quality?limit=50', { refreshInterval: 15000 });
  const impact = useApi(`/analytics/impact?time_range=${timeRange}${areaQueryParam}`, { refreshInterval: 30000 });
  const remediations = useApi('/system/remediations', { refreshInterval: 20000 });
  const clustering = useApi('/analytics/clustering', { refreshInterval: 30000 });
  const projection = useApi('/analytics/projection', { refreshInterval: 30000 });
  const sellInOutApi = useApi(`/analytics/sell-in-out?time_range=${timeRange}${areaQueryParam}`, { refreshInterval: 30000 });
  const sellInOut = sellInOutApi.data || {
    summary: {
      total_inbound_volume: 0,
      total_delivered_volume: 0,
      total_sell_in_volume: 0,
      total_sell_out_volume: 0,
      reconciliation_gap_volume: 0,
      quarantined_data_gap_volume: 0,
      sales_accuracy_pct: 100.0,
      data_integrity_pct: 100.0,
      copdq_sales_loss_usd: 0,
      copdq_type: 'operational_waste',
      quarantined_records_count: 0
    },
    timeline: [],
    business_impact_narrative: "กำลังโหลดข้อมูลการกระทบยอดปริมาณข้อมูลในท่อส่ง..."
  };

  const handleInvestigateTable = (datasetOrIssue) => {
    if (!datasetOrIssue) return;
    const clean = datasetOrIssue.split(' ')[0].replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    setSelectedSourceFilter(clean || 'All');
    setSearchTerm(clean || '');
    setViewMode('technical');
  };
  const wbStateApi = useApi('/whitebox/state', { refreshInterval: 10000 });
  const aiContextApi = useApi('/whitebox/ai-context-explanations', { refreshInterval: 30000 });
  const [aiRefreshing, setAiRefreshing] = useState(false);
  // Root Cause Fix: these used to fall back to hardcoded numbers (10100, 9400, 100,
  // 600, 93.1) indistinguishable from real data whenever /whitebox/state hadn't loaded
  // or errored. Fall back to null instead, and render "—" via fmtOrDash() below rather
  // than fabricating a plausible-looking figure.
  const wbMetrics = wbStateApi.data?.metrics || {};
  const wbTotal = wbMetrics.total_rows ?? null;
  const wbDatasetName = wbStateApi.data?.dataset_name || 'student_course_scores';
  const wbClean = wbMetrics.clean_rows ?? null;
  const wbReview = wbMetrics.review_rows ?? null;
  const wbQuarantine = wbMetrics.quarantine_rows ?? null;
  const wbScorePct = wbMetrics.quality_score_pct ?? null;
  const fmtOrDash = (v) => (typeof v === 'number' ? v.toLocaleString() : '—');

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

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const handleManualRefresh = async () => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        exec.refetch(),
        kpi.refetch(),
        anomaly.refetch(),
        sellInOutApi.refetch(),
        impact.refetch(),
        qualityHistory.refetch(),
        wbStateApi.refetch(),
        activity.refetch(),
        remediations.refetch()
      ]);
      const now = new Date();
      setLastRefreshedAt(now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setTimeout(() => setIsManualRefreshing(false), 650);
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
  // These backend narrative strings (fiveQuestions.how_much, area.impact_summary,
  // item/issue.business_impact) embed the same global monetary_loss_usd figure as
  // free-form prose ("Estimated COPDQ impact $14,277 USD due to bad values").
  // Rather than parse a rendered sentence for its number, append the Baht
  // reference only when the sentence actually names a dollar figure.
  const thbFootnote = (text) => (typeof text === 'string' && text.includes('$')) ? ` (${formatThbApprox(bizImpact.monetary_loss_usd)})` : '';

  const bizAreas = execData.business_areas || [];
  const bizKpiImpactList = execData.business_kpi_impact || [];
  const filteredBizKpiImpactList = useMemo(() => {
    const sevOrder = { Critical: 0, Warning: 1, Normal: 2 };
    let list = [...bizKpiImpactList];
    if (selectedSeverityFilter !== 'All') {
      list = list.filter(item => item.severity && item.severity.toLowerCase() === selectedSeverityFilter.toLowerCase());
    }
    if (selectedAreaFilter !== 'All') {
      const targetDatasets = AREA_DATASET_MAP[selectedAreaFilter.toLowerCase()] || [];
      list = list.filter(item => {
        if (item.business_area && item.business_area.toLowerCase() === selectedAreaFilter.toLowerCase()) return true;
        const sourceStr = (item.affected_source || '').toLowerCase();
        if (targetDatasets.some(d => sourceStr.includes(d))) return true;
        const areaStr = `${item.impacted_kpi || ''} ${item.business_impact || ''} ${item.technical_issue || ''}`.toLowerCase();
        return areaStr.includes(selectedAreaFilter.toLowerCase());
      });
    }
    return list.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9));
  }, [bizKpiImpactList, selectedSeverityFilter, selectedAreaFilter]);
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
      if (!matchSev) return false;
      if (selectedAreaFilter === 'All') return true;
      if (item.business_area && item.business_area.toLowerCase() === selectedAreaFilter.toLowerCase()) return true;
      const targetDatasets = AREA_DATASET_MAP[selectedAreaFilter.toLowerCase()] || [];
      const itemDataset = (item.dataset || '').toLowerCase();
      return targetDatasets.some(d => itemDataset.includes(d)) || itemDataset.includes(selectedAreaFilter.toLowerCase());
    });
  }, [criticalIssuesList, selectedSeverityFilter, selectedAreaFilter]);

  // Dynamic Cascade for Business Impact Mapping Flow (Section 10)
  const activeImpactFlow = useMemo(() => {
    const allTickets = remediations.data?.tickets || [];
    if (selectedAreaFilter !== 'All') {
      const targetDatasets = AREA_DATASET_MAP[selectedAreaFilter.toLowerCase()] || [];
      const matchingIssues = criticalIssuesList.filter(ci =>
        targetDatasets.some(d => (ci.dataset || '').toLowerCase().includes(d)) ||
        (ci.business_area && ci.business_area.toLowerCase() === selectedAreaFilter.toLowerCase())
      );
      const matchingKpis = bizKpiImpactList.filter(bk =>
        (bk.business_area && bk.business_area.toLowerCase() === selectedAreaFilter.toLowerCase()) ||
        targetDatasets.some(d => (bk.affected_source || '').toLowerCase().includes(d))
      );
      const matchingTickets = allTickets.filter(t =>
        targetDatasets.includes((t.table_name || '').toLowerCase())
      );

      const topIssue = matchingIssues[0];
      const topKpi = matchingKpis[0];
      const topTicket = matchingTickets[0];

      return {
        scopeLabel: `${selectedAreaFilter.toUpperCase()} Domain (${targetDatasets.slice(0, 3).join(', ')})`,
        step1: {
          title: "1. Technical Issue",
          sub: topIssue ? topIssue.issue : `Data Quality Validation in ${selectedAreaFilter}`,
          color: "red"
        },
        step2: {
          title: "2. Technical Impact",
          sub: topIssue ? topIssue.business_impact : `${sellInOut.summary?.quarantined_data_gap_volume?.toLocaleString()} records quarantined`,
          color: "amber"
        },
        step3: {
          title: "3. KPI Impact",
          sub: topKpi ? `${topKpi.impacted_kpi}` : "Operational SLA & Reporting",
          color: "purple"
        },
        step4: {
          title: "4. Business Action",
          sub: topTicket ? `Ticket: ${topTicket.target_system} (${topTicket.status})` : (topKpi ? topKpi.status : "Remediation Ticket Assigned"),
          color: "green"
        }
      };
    }

    const openCount = allTickets.filter(t => t.status !== 'RESOLVED').length;
    return {
      scopeLabel: "Enterprise-wide (All Data Pipelines)",
      step1: {
        title: "1. Technical Issue",
        sub: criticalIssuesList[0] ? criticalIssuesList[0].issue : "Pipeline Ingestion Failure & Schema Drift",
        color: "red"
      },
      step2: {
        title: "2. Technical Impact",
        sub: `${sellInOut.summary?.quarantined_data_gap_volume?.toLocaleString()} Records Quarantined`,
        color: "amber"
      },
      step3: {
        title: "3. KPI Impact",
        sub: `COPDQ Risk ${formatUsd(bizImpact.monetary_loss_usd)} (${bizImpact.areas_affected_count} Areas Impacted)`,
        color: "purple"
      },
      step4: {
        title: "4. Business Action",
        sub: `${openCount} Upstream Remediation Tickets Active`,
        color: "green"
      }
    };
  }, [selectedAreaFilter, criticalIssuesList, bizKpiImpactList, sellInOut.summary, remediations.data, bizImpact]);

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

  // CSV Export for Executive Summary (Synchronized with 4 Hero KPI Cards & Active Filters)
  const handleExportExecutiveCSV = () => {
    const csvRows = [
      ["SDOQAP Executive Overview Report"],
      ["Generated At", new Date().toISOString()],
      ["Time Filter", timeRange],
      ["Business Area Filter", selectedAreaFilter],
      ["Severity Filter", selectedSeverityFilter],
      [],
      ["1. EXECUTIVE HERO KPIS"],
      ["Metric", "Value", "Status", "Details"],
      ["Data Health Score", `${dataHealth.score}%`, dataHealth.status, `${dataHealth.clean_records?.toLocaleString()} Clean / ${dataHealth.quarantined_records?.toLocaleString()} Quarantined`],
      ["Pipeline SLA Availability", `${dataAvailability.score}%`, dataAvailability.score >= 95 ? 'HEALTHY' : 'DEGRADED', `${dataAvailability.total_pipelines - dataAvailability.failed_pipelines}/${dataAvailability.total_pipelines} Active Pipelines (Avg Lag: ${dataFreshness.avg_lag_hours} hrs)`],
      ["Sell-In / Out Volume Gap (Demo)", `${sellInOut.summary?.reconciliation_gap_volume?.toLocaleString()} Units`, "Demo Scenario", `${sellInOut.summary?.quarantined_data_gap_volume?.toLocaleString()} Quarantined Gap (${sellInOut.summary?.sales_accuracy_pct}% Accuracy)`],
      ["Financial COPDQ Risk", formatUsd(bizImpact.monetary_loss_usd), bizImpact.monetary_loss_usd > 0 ? "ACTION" : "CLEAR", `Est. Revenue Exposure (${formatThbApprox(bizImpact.monetary_loss_usd)})`],
      [],
      ["2. CRITICAL BUSINESS ISSUES"],
      ["Issue ID", "Issue Name", "Business Impact", "KPI Affected", "Severity", "Duration", "Status"],
      ...filteredCriticalIssues.map(ci => [ci.id, `"${ci.issue}"`, `"${ci.business_impact}"`, `"${ci.kpi_affected}"`, ci.severity, ci.duration, ci.status]),
      [],
      ["3. STRATEGIC BUSINESS KPI IMPACT MATRIX"],
      ["Technical Issue", "Impacted Business KPI", "Executive Impact", "Severity", "Status"],
      ...filteredBizKpiImpactList.map(b => [`"${b.technical_issue}"`, `"${b.impacted_kpi}"`, `"${b.business_impact}"`, b.severity, b.status])
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
          <h1 className="gs-title">{getPage("dashboard").label}</h1>
          <p className="gs-subtitle">{getPage("dashboard").subtitle}</p>
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

      {/* Formula banner relocated to the Technical Cockpit tab further down this file
          (mari's af85d87 "relocate lakehouse lineage and formula bar into technical
          cockpit tab") — the null-safety fix from this spot (fmtOrDash, typeof-guard
          on wbScorePct) is re-applied at the relocated copy below instead of duplicated
          here. */}

      {/* ── CONTROLS & FILTERS BAR ── */}
      <div className="exec-controls-bar">
        <div className="exec-filters-left">
          <span className="exec-filter-label">Filter By:</span>
          
          <select
            className="exec-filter-select"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="all">Time: All Time (Historical)</option>
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
          {lastRefreshedAt && (
            <span className="exec-refresh-time" title="เวลาที่อัปเดตข้อมูลล่าสุด">
              อัปเดตเมื่อ: {lastRefreshedAt}
            </span>
          )}
          <button
            className={`exec-btn ${isManualRefreshing ? 'exec-btn-refreshing' : ''}`}
            onClick={handleManualRefresh}
            disabled={isManualRefreshing}
            title="Refresh All Real-time Metrics"
          >
            <Icon name="refresh" /> {isManualRefreshing ? 'กำลังรีเฟรช...' : 'Refresh'}
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
          {/* Active Scope Banner when filtered */}
          {selectedAreaFilter !== 'All' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-blue, #3B82F6)' }}>Scope Filter Active:</span>
                <span className="exec-chip exec-chip-warn" style={{ fontSize: '11px', textTransform: 'capitalize' }}>
                  {selectedAreaFilter} Area
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  (Target Datasets: {AREA_DATASET_MAP[selectedAreaFilter.toLowerCase()]?.slice(0, 4).join(', ')})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAreaFilter('All')}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
              >
                Reset to All Areas
              </button>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              ZONE 1: THE CORE 4 EXECUTIVE HERO KPI CARDS (BA Standard)
              ═══════════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '16px' }}>
            {/* Card 1: Data Health Score */}
            <div className={`exec-kpi-card ${dataHealth.status === 'Good' ? 'kpi-good' : dataHealth.status === 'Warning' ? 'kpi-warn' : dataHealth.status === 'No Data' ? 'kpi-blue' : 'kpi-crit'}`}>
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">Data Health Score</span>
                <span className={`exec-chip ${dataHealth.status === 'Good' ? 'exec-chip-good' : dataHealth.status === 'Warning' ? 'exec-chip-warn' : dataHealth.status === 'No Data' ? 'exec-chip-neutral' : 'exec-chip-crit'}`} style={{ fontSize: '11px' }}>
                  {dataHealth.status || 'No Data'}
                </span>
              </div>
              <div className="exec-kpi-val">{dataHealth.score != null ? `${dataHealth.score}%` : '---'}</div>
              <div className="exec-kpi-sub" style={{ fontSize: '11px' }}>
                {dataHealth.total_records ? `${dataHealth.clean_records?.toLocaleString()} clean · ${dataHealth.quarantined_records?.toLocaleString()} quarantined` : 'No run records in selected period'}
              </div>
            </div>

            {/* Card 2: Pipeline SLA Availability */}
            {/* Root Cause Fix: score >= 95 evaluates false for score === null (still
                loading, or /executive/overview failed), so the card rendered a false
                "DEGRADED" alarm on every load instead of a neutral loading state. */}
            <div className={`exec-kpi-card ${dataAvailability.score == null ? '' : dataAvailability.score >= 95 ? 'kpi-good' : 'kpi-warn'}`}>
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">Pipeline SLA Availability</span>
                <span className={`exec-chip ${dataAvailability.score == null ? '' : dataAvailability.score >= 95 ? 'exec-chip-good' : 'exec-chip-warn'}`} style={{ fontSize: '11px' }}>
                  {dataAvailability.score == null ? 'LOADING' : dataAvailability.score >= 95 ? 'HEALTHY' : 'DEGRADED'}
                </span>
              </div>
              <div className="exec-kpi-val">{dataAvailability.score != null ? `${dataAvailability.score}%` : '---'}</div>
              <div className="exec-kpi-sub" style={{ fontSize: '11px' }}>
                {dataAvailability.total_pipelines - dataAvailability.failed_pipelines}/{dataAvailability.total_pipelines} Active · Avg lag {dataFreshness.avg_lag_hours}h
              </div>
            </div>

            {/* Card 3: Data Pipeline Flow Reconciliation Gap */}
            <div className="exec-kpi-card kpi-purple">
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">
                  Pipeline Flow Delivery Gap
                  <span style={{ marginLeft: '6px', fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-purple)', border: '1px solid rgba(139, 92, 246, 0.3)', fontWeight: 700 }}>RECONCILIATION</span>
                </span>
                <span className="exec-chip exec-chip-warn" style={{ fontSize: '11px' }}>
                  {sellInOut.summary?.reconciliation_gap_volume?.toLocaleString()} ROWS
                </span>
              </div>
              <div className="exec-kpi-val" style={{ color: 'var(--accent-purple)' }}>
                {sellInOut.summary?.reconciliation_gap_volume?.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>rows</span>
              </div>
              <div className="exec-kpi-sub" style={{ fontSize: '11px' }}>
                {sellInOut.summary?.quarantined_data_gap_volume?.toLocaleString()} quarantined · {sellInOut.summary?.data_integrity_pct ?? sellInOut.summary?.sales_accuracy_pct}% delivery integrity
              </div>
            </div>

            {/* Card 4: Financial COPDQ Risk / Operational Remediation Waste */}
            <div className={`exec-kpi-card ${(bizImpact.monetary_loss_usd > 0 || (sellInOut.summary?.copdq_sales_loss_usd > 0)) ? 'kpi-crit' : 'kpi-good'}`}>
              <div className="exec-kpi-top">
                <span className="exec-kpi-title">
                  {sellInOut.summary?.copdq_type === 'operational_waste' ? 'COPDQ Remediation Waste' : 'Financial COPDQ Risk'}
                  <InfoHint text={sellInOut.summary?.copdq_type === 'operational_waste' ? "คำนวณจากต้นทุนวิศวกรรมและการประมวลผลในการจัดการข้อมูลติดกักกัน ($2.50 ต่อแถว) ตามหลัก Gartner TCO" : "คำนวณจากมูลค่าความเสี่ยงทางการเงินจริงของแถวข้อมูลที่ติดกักกัน"} />
                </span>
                <span className={`exec-chip ${(bizImpact.monetary_loss_usd > 0 || (sellInOut.summary?.copdq_sales_loss_usd > 0)) ? 'exec-chip-crit' : 'exec-chip-good'}`} style={{ fontSize: '11px' }}>
                  {(bizImpact.monetary_loss_usd > 0 || (sellInOut.summary?.copdq_sales_loss_usd > 0)) ? 'ACTION' : 'CLEAR'}
                </span>
              </div>
              <div className="exec-kpi-val" style={{ color: (bizImpact.monetary_loss_usd > 0 || (sellInOut.summary?.copdq_sales_loss_usd > 0)) ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {formatUsd(bizImpact.monetary_loss_usd || sellInOut.summary?.copdq_sales_loss_usd)}
              </div>
              <div className="exec-kpi-sub" style={{ fontSize: '11px' }}>
                {sellInOut.summary?.copdq_type === 'operational_waste' ? 'Engineering & compute remediation TCO' : 'Estimated revenue exposure from bad data'} · {formatThbApprox(bizImpact.monetary_loss_usd || sellInOut.summary?.copdq_sales_loss_usd)}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              ZONE 2: SLA COMPLIANCE TREND & 5-QUESTION DECISION FRAMEWORK
              ═══════════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '16px', marginBottom: '16px', alignItems: 'stretch' }}>
            {/* Left: Data Quality & SLA Compliance Status (SLA-Colored Bar Chart) */}
            <div className="gs-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px' }}>
              <div className="gs-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'nowrap', marginBottom: '8px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '13px' }}>Data Quality &amp; SLA Compliance Status</h3>
                    <span className="exec-chip exec-chip-good" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>Target 95.0%</span>
                  </div>
                  <p style={{ marginTop: '2px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Quality Score (%) vs 95% SLA Target
                  </p>
                </div>
                {/* Visual Mode Switcher */}
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

              <div style={{ width: '100%', height: 210 }}>
                <ResponsiveContainer>
                  {qualityChartType === 'bars' ? (
                    <BarChart data={qualityTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                      <YAxis domain={[(dataMin) => Math.max(0, Math.floor((dataMin - 5) / 10) * 10), 100]} stroke="var(--text-muted)" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
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
                          let barColor = '#10B981';
                          if (val !== null && val < 90) {
                            barColor = '#EF4444';
                          } else if (val !== null && val < 95) {
                            barColor = '#F59E0B';
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
                      <YAxis domain={[(dataMin) => Math.max(0, Math.floor((dataMin - 5) / 10) * 10), 100]} stroke="var(--text-muted)" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip contentStyle={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                      <ReferenceLine y={95} stroke="var(--accent-green)" strokeDasharray="4 4" label={{ value: 'Target 95%', fill: 'var(--accent-green)', fontSize: 11 }} />
                      <Area type="monotone" dataKey="Overall" stroke="var(--accent-purple)" fillOpacity={1} fill="url(#qualityGradient)" strokeWidth={2} name="Overall Quality (%)" />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Status Badges Legend */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: 'auto', paddingTop: '8px', fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10B981' }} /> &ge;95% ผ่านเกณฑ์ SLA
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#F59E0B' }} /> 90-94% เฝ้าระวัง
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#EF4444' }} /> &lt;90% หลุดเกณฑ์
                </span>
              </div>
            </div>

            {/* Right: 5-Question Executive Decision Framework */}
            <div className="exec-5w-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '16px' }}>
              <div className="exec-5w-header" style={{ marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '13px' }}>
                  <span><Icon name="bolt" /></span> Executive 5-Question Framework
                </h3>
              </div>
              <div className="exec-5w-list" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '6px' }}>
                <div className="exec-5w-row what" style={{ padding: '6px 8px' }}>
                  <div className="exec-5w-tag what" style={{ fontSize: '10px' }}><Icon name="target" /> WHAT?</div>
                  <div className="exec-5w-text" style={{ fontSize: '11px' }}>{fiveQuestions.what}</div>
                </div>
                <div className="exec-5w-row why" style={{ padding: '6px 8px' }}>
                  <div className="exec-5w-tag why" style={{ fontSize: '10px' }}><Icon name="search" /> WHY?</div>
                  <div className="exec-5w-text" style={{ fontSize: '11px' }}>{fiveQuestions.why}</div>
                </div>
                <div className="exec-5w-row impact" style={{ padding: '6px 8px' }}>
                  <div className="exec-5w-tag impact" style={{ fontSize: '10px' }}><Icon name="alert" /> IMPACT?</div>
                  <div className="exec-5w-text" style={{ fontSize: '11px' }}>{fiveQuestions.impact}</div>
                </div>
                <div className="exec-5w-row howmuch" style={{ padding: '6px 8px' }}>
                  <div className="exec-5w-tag howmuch" style={{ fontSize: '10px' }}><Icon name="chart" /> HOW MUCH?</div>
                  <div className="exec-5w-text" style={{ fontSize: '11px' }}>{fiveQuestions.how_much}{thbFootnote(fiveQuestions.how_much)}</div>
                </div>
                <div className="exec-5w-row action" style={{ padding: '6px 8px' }}>
                  <div className="exec-5w-tag action" style={{ fontSize: '10px' }}><Icon name="bolt" /> ACTION?</div>
                  <div className="exec-5w-text" style={{ fontSize: '11px' }}>{fiveQuestions.action}</div>
                </div>
              </div>
              <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  ต้องการดูหลักฐานเจาะลึกห่วงโซ่อุปทาน &amp; ยอดขาย?
                </span>
                <button
                  type="button"
                  className="exec-btn exec-btn-primary"
                  style={{ fontSize: '10px', padding: '3px 10px', cursor: 'pointer' }}
                  onClick={() => setViewMode('business')}
                >
                  ดูกราฟ Sell-In vs Sell-Out Volume →
                </button>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              ZONE 3: STRATEGIC IMPACT MATRIX & ROOT CAUSE BREAKDOWN
              ═══════════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px', marginBottom: '16px', alignItems: 'stretch' }}>
            {/* Left: Business KPI Impact Matrix (Sorted by Severity) */}
            <div className="exec-table-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="gs-card-head" style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '13px' }}>Business KPI Impact Matrix</h3>
                  {(selectedAreaFilter !== 'All' || selectedSeverityFilter !== 'All') && (
                    <span className="exec-chip exec-chip-warn" style={{ fontSize: '10px' }}>
                      Filtered: {selectedAreaFilter !== 'All' ? selectedAreaFilter : ''} {selectedSeverityFilter !== 'All' ? `(${selectedSeverityFilter})` : ''}
                    </span>
                  )}
                </div>
                <button
                  className="exec-btn"
                  onClick={() => setViewMode('business')}
                  style={{ fontSize: '11px' }}
                >
                  View Details →
                </button>
              </div>
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <table className="exec-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: '11px' }}>Technical Issue</th>
                      <th style={{ fontSize: '11px' }}>Impacted Business KPI</th>
                      <th style={{ fontSize: '11px' }}>Executive Business Impact</th>
                      <th style={{ fontSize: '11px' }}>Severity</th>
                      <th style={{ fontSize: '11px' }}>Status</th>
                      <th style={{ fontSize: '11px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBizKpiImpactList.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: 'var(--accent-purple)', fontSize: '11px' }}>{item.technical_issue}</td>
                        <td style={{ fontWeight: 600, fontSize: '11px' }}>{item.impacted_kpi}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{item.business_impact}{thbFootnote(item.business_impact)}</td>
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
                        <td>
                          <button
                            type="button"
                            className="exec-btn"
                            style={{ padding: '2px 8px', fontSize: '10px', whiteSpace: 'nowrap' }}
                            onClick={() => handleInvestigateTable(item.technical_issue || item.impacted_kpi)}
                          >
                            Cockpit <Icon name="settings" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Data Quality Status Breakdown */}
            <div className="gs-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="gs-card-head" style={{ marginBottom: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '13px' }}>Data Quality Status Breakdown</h3>
                  <p style={{ marginTop: '2px', fontSize: '11px' }}>Root cause distribution of quarantined data anomalies</p>
                </div>
                <span className="exec-chip exec-chip-warn" style={{ fontSize: '11px' }}>{qualityBreakdown.total_quarantined} Rows Quarantined</span>
              </div>
              <div className="exec-dim-grid" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px' }}>
                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name" style={{ fontSize: '11px' }}>Missing / Null Values</span>
                    <span className="exec-dim-score" style={{ fontSize: '11px' }}>{qualityBreakdown.missing_values_pct}%</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${Math.min(Math.max(qualityBreakdown.missing_values_pct, 0), 100)}%`, minWidth: qualityBreakdown.missing_values_pct > 0 ? '6px' : '0', background: 'var(--accent-yellow)' }} />
                  </div>
                </div>

                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name" style={{ fontSize: '11px' }}>Duplicate Records</span>
                    <span className="exec-dim-score" style={{ fontSize: '11px' }}>{qualityBreakdown.duplicate_records_pct}%</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${Math.min(Math.max(qualityBreakdown.duplicate_records_pct, 0), 100)}%`, minWidth: qualityBreakdown.duplicate_records_pct > 0 ? '6px' : '0', background: '#3B82F6' }} />
                  </div>
                </div>

                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name" style={{ fontSize: '11px' }}>Invalid Data Types / Format</span>
                    <span className="exec-dim-score" style={{ fontSize: '11px' }}>{qualityBreakdown.invalid_type_pct}%</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${Math.min(Math.max(qualityBreakdown.invalid_type_pct, 0), 100)}%`, minWidth: qualityBreakdown.invalid_type_pct > 0 ? '6px' : '0', background: 'var(--accent-red)' }} />
                  </div>
                </div>

                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name" style={{ fontSize: '11px' }}>Schema Drift Events</span>
                    <span className="exec-dim-score" style={{ fontSize: '11px' }}>{qualityBreakdown.schema_drift_count} Active</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${Math.min(qualityBreakdown.schema_drift_count * 20, 100)}%`, minWidth: qualityBreakdown.schema_drift_count > 0 ? '6px' : '0', background: 'var(--accent-purple)' }} />
                  </div>
                </div>

                <div className="exec-dim-item">
                  <div className="exec-dim-top">
                    <span className="exec-dim-name" style={{ fontSize: '11px' }}>Clean &amp; Certified Records</span>
                    <span className="exec-dim-score" style={{ color: 'var(--accent-green)', fontSize: '11px' }}>{dataHealth.score}%</span>
                  </div>
                  <div className="exec-dim-bar">
                    <div className="exec-dim-fill" style={{ width: `${Math.min(Math.max(dataHealth.score || 0, 0), 100)}%`, background: 'var(--accent-green)' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              ZONE 4: CRITICAL OPERATIONAL ISSUES (Incident Resolution Log)
              ═══════════════════════════════════════════════════════════ */}
          <div className="exec-table-card">
            <div className="gs-card-head" style={{ marginBottom: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '13px' }}>Critical Business Issues</h3>
                <p style={{ marginTop: '2px', fontSize: '11px' }}>Prioritized operational incidents impacting enterprise KPIs and reporting deadlines</p>
              </div>
              <span className="exec-chip exec-chip-crit" style={{ fontSize: '11px' }}>{filteredCriticalIssues.length} Incidents</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="exec-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: '11px' }}>Issue ID</th>
                    <th style={{ fontSize: '11px' }}>Incident Name</th>
                    <th style={{ fontSize: '11px' }}>Business Impact</th>
                    <th style={{ fontSize: '11px' }}>KPI Affected</th>
                    <th style={{ fontSize: '11px' }}>Severity</th>
                    <th style={{ fontSize: '11px' }}>Duration</th>
                    <th style={{ fontSize: '11px' }}>Status</th>
                    <th style={{ fontSize: '11px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCriticalIssues.map((issue) => (
                    <tr key={issue.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px' }}>{issue.id}</td>
                      <td style={{ fontWeight: 700, fontSize: '11px' }}>{issue.issue}</td>
                      <td style={{ color: 'var(--text-main)', fontSize: '11px' }}>{issue.business_impact}{thbFootnote(issue.business_impact)}</td>
                      <td style={{ color: 'var(--accent-purple)', fontWeight: 600, fontSize: '11px' }}>{issue.kpi_affected}</td>
                      <td>
                        <span className={`exec-chip ${issue.severity === 'Critical' ? 'exec-chip-crit' : 'exec-chip-warn'}`} style={{ fontSize: '11px' }}>
                          {issue.severity}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '11px' }}>{issue.duration}</td>
                      <td>
                        <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{issue.status}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="exec-btn"
                            style={{ padding: '3px 8px', fontSize: '10px' }}
                            onClick={() => handleInvestigateTable(issue.dataset)}
                          >
                            Drill-down <Icon name="settings" />
                          </button>
                          {issue.issue?.includes('Schema Drift') && (
                            <Link
                              to="/schema"
                              className="exec-btn exec-btn-primary"
                              style={{ padding: '3px 8px', fontSize: '10px', textDecoration: 'none' }}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Business Areas Health &amp; Impact
              </div>
              {selectedAreaFilter !== 'All' && (
                <button
                  type="button"
                  onClick={() => setSelectedAreaFilter('All')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
                >
                  Reset Filter (Viewing All Areas)
                </button>
              )}
            </div>
            <div className="biz-area-grid">
              {bizAreas.map((area) => {
                const isSelected = selectedAreaFilter.toLowerCase() === area.id.toLowerCase();
                return (
                  <div
                    key={area.id}
                    className={`biz-area-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedAreaFilter(isSelected ? 'All' : area.id)}
                    title={`Click to filter entire dashboard by ${area.name}`}
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
                      {area.impact_summary}{thbFootnote(area.impact_summary)}
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
                    {isSelected && (
                      <div style={{ marginTop: '8px', fontSize: '10px', fontWeight: 700, color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ● Active Filter Scope
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Business Impact Mapping Flow (Section 10) */}
          <div className="gs-card">
            <div className="gs-card-head">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0 }}>Business Impact Mapping Flow</h3>
                  <span className="exec-chip exec-chip-warn" style={{ fontSize: '10px' }}>
                    {activeImpactFlow.scopeLabel}
                  </span>
                </div>
                <p style={{ marginTop: '2px' }}>How technical pipeline events cascade into business KPI decisions</p>
              </div>
            </div>
            <div className="biz-flow-diagram">
              <div className={`biz-flow-box ${activeImpactFlow.step1.color}`}>
                <div className="biz-flow-title">{activeImpactFlow.step1.title}</div>
                <div className="biz-flow-sub">{activeImpactFlow.step1.sub}</div>
              </div>
              <div className="biz-flow-arrow">→</div>
              <div className={`biz-flow-box ${activeImpactFlow.step2.color}`}>
                <div className="biz-flow-title">{activeImpactFlow.step2.title}</div>
                <div className="biz-flow-sub">{activeImpactFlow.step2.sub}</div>
              </div>
              <div className="biz-flow-arrow">→</div>
              <div className={`biz-flow-box ${activeImpactFlow.step3.color}`}>
                <div className="biz-flow-title">{activeImpactFlow.step3.title}</div>
                <div className="biz-flow-sub">{activeImpactFlow.step3.sub}</div>
              </div>
              <div className="biz-flow-arrow">→</div>
              <div className={`biz-flow-box ${activeImpactFlow.step4.color}`}>
                <div className="biz-flow-title">{activeImpactFlow.step4.title}</div>
                <div className="biz-flow-sub">{activeImpactFlow.step4.sub}</div>
              </div>
            </div>
          </div>

          {/* Concrete Business Evidence: Data Pipeline Flow Reconciliation Chart */}
          <div className="gs-card" style={{ padding: '20px' }}>
            <div className="gs-card-head" style={{ marginBottom: '14px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: 'var(--accent-purple)', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                    DATA PIPELINE RECONCILIATION
                  </span>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>Data Ingestion vs. Delivery Volume Flow Reconciliation</h3>
                </div>
                <p style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  เปรียบเทียบปริมาณข้อมูลที่ไหลเข้าจาก Raw Ingestion กับข้อมูลที่ผ่านการตรวจสอบคุณภาพและส่งมอบสำเร็จ (Delivered Active) เพื่อตรวจหาข้อมูลสูญหายและอัตราการกักกัน
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span className="exec-chip exec-chip-warn" style={{ fontSize: '10.5px' }}>
                  Reconciliation Gap: {sellInOut.summary?.reconciliation_gap_volume?.toLocaleString()} Records
                </span>
                <span className="exec-chip exec-chip-crit" style={{ fontSize: '10.5px' }}>
                  COPDQ: {formatUsd(sellInOut.summary?.copdq_sales_loss_usd)} ({formatThbApprox(sellInOut.summary?.copdq_sales_loss_usd)})
                </span>
              </div>
            </div>

            {/* Metric Summary Cards Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '4px solid #1E3A8A', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inbound Raw Volume (HDFS Raw)</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
                  {(sellInOut.summary?.total_inbound_volume ?? sellInOut.summary?.total_sell_in_volume)?.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>records</span>
                </div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>ปริมาณข้อมูลไหลเข้าระบบต้นทาง</div>
              </div>

              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '4px solid #10B981', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Delivered Active Volume (Gold)</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#10B981', marginTop: '2px' }}>
                  {(sellInOut.summary?.total_delivered_volume ?? sellInOut.summary?.total_sell_out_volume)?.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>records</span>
                </div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>ข้อมูลสะอาดส่งมอบเข้าปลายทาง</div>
              </div>

              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '4px solid #EF4444', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Quarantined Data Gap</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#EF4444', marginTop: '2px' }}>
                  {sellInOut.summary?.quarantined_data_gap_volume?.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>records</span>
                </div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>ข้อมูลติดข้อผิดพลาด/กักกัน</div>
              </div>

              <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '4px solid #8B5CF6', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pipeline Delivery Integrity</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-purple)', marginTop: '2px' }}>
                  {sellInOut.summary?.data_integrity_pct ?? sellInOut.summary?.sales_accuracy_pct}%
                </div>
                <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>อัตราความสมบูรณ์ของการส่งมอบ</div>
              </div>
            </div>

            {/* The Visual Chart: ComposedChart with Bars and SLA Line */}
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={sellInOut.timeline ?? []} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
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
                            <div style={{ color: '#1E3A8A' }}>● Inbound Raw Volume: <strong>{(data.inbound ?? data.sell_in)?.toLocaleString()}</strong> rows</div>
                            <div style={{ color: '#10B981' }}>● Delivered Active Volume: <strong>{(data.delivered ?? data.sell_out)?.toLocaleString()}</strong> rows</div>
                            <div style={{ color: '#EF4444' }}>● Quarantined Gap: <strong>{data.quarantined_gap?.toLocaleString()}</strong> rows</div>
                            <div style={{ color: '#8B5CF6', marginTop: '4px' }}>★ Data Quality Score: <strong>{data.quality_score}%</strong></div>
                            <div style={{ color: '#64748B', fontSize: '10px', marginTop: '4px', fontStyle: 'italic' }}>Dataset: {data.dataset || 'N/A'} — {data.incident}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                  <ReferenceLine yAxisId="right" y={95} stroke="#10B981" strokeDasharray="3 3" label={{ value: 'SLA Target 95%', fill: '#10B981', fontSize: 10, position: 'right' }} />
                  <Bar yAxisId="left" dataKey="sell_in" name="Inbound Raw Volume" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="sell_out" name="Delivered Active Volume" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="quarantined_gap" name="Quarantined Records Gap" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="quality_score" name="Pipeline Quality Score (%)" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Concrete Narrative Insight Callout */}
            <div style={{ marginTop: '14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderLeft: '3px solid var(--accent-purple)', borderRadius: '6px', padding: '10px 14px', fontSize: '11px', color: 'var(--text-main)', lineHeight: '1.6' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent-purple)', marginBottom: '4px' }}>
                บทวิเคราะห์ผลกระทบเชิงรูปธรรมของท่อส่งข้อมูล (Data Pipeline Integrity &amp; Operational Reality)
              </div>
              <div>{sellInOut.business_impact_narrative}</div>
              {sellInOut.summary?.copdq_sales_loss_usd != null && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {formatThbApprox(sellInOut.summary.copdq_sales_loss_usd)}
                </div>
              )}
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
                <span className="exec-chip exec-chip-crit">${(bizImpact.monetary_loss_usd ?? 0).toLocaleString()} Total ({formatThbApprox(bizImpact.monetary_loss_usd)})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
                {/* Root Cause Fix: these three figures used to be an invented client-side
                    35/45/20% split of the total, styled identically to real analytics.
                    The API already computes these three components server-side
                    (api/app/api/analytics.py get_business_impact) — it just never
                    returned them. Now consumes the real cost_breakdown field. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                  <div>
                    <strong style={{ fontSize: '11.5px' }}>1. Cost of Correction</strong>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Operational engineering compute to re-ingest quarantined rows</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>
                    ${(impact.data?.cost_breakdown?.cost_of_correction_usd ?? 0).toFixed(0)}
                    <div style={{ fontSize: '9.5px', fontWeight: 400, color: 'var(--text-muted)' }}>{formatThbApprox(impact.data?.cost_breakdown?.cost_of_correction_usd)}</div>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                  <div>
                    <strong style={{ fontSize: '11.5px' }}>2. Cost of Lost Opportunities</strong>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sales inaccuracy and delayed decision execution</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>
                    ${(impact.data?.cost_breakdown?.cost_of_lost_opportunities_usd ?? 0).toFixed(0)}
                    <div style={{ fontSize: '9.5px', fontWeight: 400, color: 'var(--text-muted)' }}>{formatThbApprox(impact.data?.cost_breakdown?.cost_of_lost_opportunities_usd)}</div>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                  <div>
                    <strong style={{ fontSize: '11.5px' }}>3. Cost of Risk &amp; Compliance</strong>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Schema drift SLA penalties and governance audit risk</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>
                    ${(impact.data?.cost_breakdown?.cost_of_risk_usd ?? 0).toFixed(0)}
                    <div style={{ fontSize: '9.5px', fontWeight: 400, color: 'var(--text-muted)' }}>{formatThbApprox(impact.data?.cost_breakdown?.cost_of_risk_usd)}</div>
                  </span>
                </div>
              </div>
            </div>

            {/* Active Remediation Tickets (Section 21) */}
            {(() => {
              const allTickets = remediations.data?.tickets || [];
              const targetDatasets = selectedAreaFilter !== 'All' ? (AREA_DATASET_MAP[selectedAreaFilter.toLowerCase()] || []) : null;
              
              let filteredTickets = allTickets;
              if (targetDatasets && targetDatasets.length > 0) {
                filteredTickets = filteredTickets.filter(t => targetDatasets.includes((t.table_name || '').toLowerCase()));
              }
              const openCount = filteredTickets.filter(t => t.status !== 'RESOLVED').length;
              const displayTickets = ticketFilterTab === 'OPEN' 
                ? filteredTickets.filter(t => t.status !== 'RESOLVED')
                : filteredTickets;

              return (
                <div className="gs-card">
                  <div className="gs-card-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0 }}>Upstream Governance Tickets</h3>
                        {selectedAreaFilter !== 'All' && (
                          <span className="exec-chip exec-chip-warn" style={{ fontSize: '10px' }}>
                            {selectedAreaFilter.toUpperCase()} Scope
                          </span>
                        )}
                      </div>
                      <p style={{ marginTop: '2px' }}>Remediation tickets assigned to upstream data engineers</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <button
                          type="button"
                          onClick={() => setTicketFilterTab('OPEN')}
                          style={{
                            background: ticketFilterTab === 'OPEN' ? 'var(--accent-purple)' : 'transparent',
                            color: ticketFilterTab === 'OPEN' ? '#fff' : 'var(--text-muted)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Open ({openCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTicketFilterTab('ALL')}
                          style={{
                            background: ticketFilterTab === 'ALL' ? 'var(--accent-purple)' : 'transparent',
                            color: ticketFilterTab === 'ALL' ? '#fff' : 'var(--text-muted)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          All ({filteredTickets.length})
                        </button>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                    {displayTickets.length === 0 ? (
                      <div className="gs-empty" style={{ padding: '24px 0' }}>
                        {selectedAreaFilter !== 'All' 
                          ? `No tickets for ${selectedAreaFilter} domain (All in good standing)` 
                          : "No pending remediation tickets (All resolved)"}
                      </div>
                    ) : (
                      displayTickets.map((tkt) => (
                        <div
                          key={tkt.ticket_id}
                          style={{
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderLeft: `3px solid ${tkt.status === 'RESOLVED' ? 'var(--accent-green)' : (tkt.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-yellow)')}`,
                            borderRadius: '8px',
                            padding: '10px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>
                                {tkt.table_name}
                              </span>
                              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                                Run #{tkt.run_id}
                              </span>
                              <span className={`exec-chip ${tkt.severity === 'critical' ? 'exec-chip-crit' : 'exec-chip-warn'}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                                {(tkt.severity || 'warning').toUpperCase()}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {tkt.status === 'RESOLVED' ? (
                                <span className="exec-chip exec-chip-good" style={{ fontSize: '10px' }}>RESOLVED</span>
                              ) : (
                                <button
                                  className="exec-btn"
                                  style={{ fontSize: '10px', padding: '3px 10px', background: 'var(--bg-secondary)' }}
                                  disabled={resolvingTicketId === tkt.ticket_id}
                                  onClick={() => handleResolveTicket(tkt.ticket_id)}
                                >
                                  {resolvingTicketId === tkt.ticket_id ? 'Resolving...' : 'Resolve'}
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {/* Remediation Action description */}
                          {tkt.remediation_action && (
                            <div style={{ fontSize: '11px', color: 'var(--text-main)', lineHeight: '1.45' }}>
                              {tkt.remediation_action}
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9.5px', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-color)', paddingTop: '4px', marginTop: '2px' }}>
                            <span>Target: <strong style={{ color: 'var(--text-main)' }}>{tkt.target_system || tkt.target_owner || 'Data Engineer'}</strong></span>
                            <span>{tkt.timestamp ? new Date(tkt.timestamp).toLocaleString('th-TH') : ''}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}
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
            <div className={`exec-kpi-card ${dataFreshness.score == null ? '' : dataFreshness.score >= 90 ? 'kpi-good' : 'kpi-warn'}`}>
              <span className="exec-kpi-title">Timeliness</span>
              <div className="exec-kpi-val">{dataFreshness.score != null ? `${dataFreshness.score}%` : '---'}</div>
              <div className="exec-kpi-sub">Avg latency {dataFreshness.avg_lag_hours || 0} hrs</div>
            </div>
            <div className="exec-kpi-card kpi-purple">
              <span className="exec-kpi-title">Consistency</span>
              <div className="exec-kpi-val">{dataHealth.score != null ? `${dataHealth.score}%` : '---'}</div>
              <div className="exec-kpi-sub">Cross-batch Trend Stability</div>
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
                    (ข้อมูลสะอาด {fmtOrDash(wbClean)} แถว ÷ ข้อมูลขาเข้าทั้งหมด {fmtOrDash(wbTotal)} แถว) × 100 = {typeof wbScorePct === 'number' ? `${wbScorePct}%` : '—'}
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
                  {aiContextApi.data?.ai_live_generated && <Icon name="sparkles" />} สรุปสถานะคุณภาพข้อมูล{aiContextApi.data?.ai_live_generated ? " โดย AI" : ""}
                </span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748B" }}>
                  ตาราง: {wbDatasetName} ({fmtOrDash(wbTotal)} แถว)
                </span>
              </div>
              <div style={{ fontWeight: 500, color: "#0F172A" }}>
                {aiContextApi.data?.step5_lineage?.executive_narrative ||
                  (wbScorePct !== null
                    ? `ภาพรวมคุณภาพข้อมูลของตาราง '${wbDatasetName}' อยู่ที่ ${wbScorePct}% โดยมีข้อมูลสะอาดพร้อมใช้งาน ${fmtOrDash(wbClean)} แถว รอผู้ดูแลตรวจสอบใน Review Queue ${fmtOrDash(wbReview)} แถว และกักกันเพื่อส่งรายงานแจ้งแก้ที่ระบบต้นทาง ${fmtOrDash(wbQuarantine)} แถว`
                    : (wbStateApi.loading ? "กำลังโหลดข้อมูลคุณภาพจาก pipeline..." : "ยังไม่มีข้อมูลจาก /whitebox/state — รัน pipeline อย่างน้อยหนึ่งครั้งก่อน"))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
              <Link to="/ingestion" style={{ textDecoration: "none", background: "#FFFFFF", border: "1px solid #E2E8F0", borderLeft: "3px solid #DC2626", borderRadius: "6px", padding: "10px 12px", display: "block" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", letterSpacing: "0.04em" }}>BRONZE INGESTION (/ingestion)</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", marginTop: "2px" }}><Icon name="search" /> สแกนพบความผิดปกติ {Array.isArray(wbStateApi.data?.selected_findings) ? wbStateApi.data.selected_findings.length : wbStateApi.data?.selected_findings ? Object.values(wbStateApi.data.selected_findings).filter(Boolean).length : 3} หมวดหมู่</div>
                <div style={{ fontSize: "10.5px", color: "#475569", marginTop: "3px", lineHeight: "1.4" }}>
                  {aiContextApi.data?.step5_lineage?.step1_card_desc || `สแกน ${fmtOrDash(wbTotal)} แถว พบค่าว่าง ค่านอกช่วง คีย์ซ้ำ และค่าเกินรั้วสถิติ → คลิกดู`}
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
                  {aiContextApi.data?.step5_lineage?.step3_card_desc || `สะอาด ${fmtOrDash(wbClean)} | รอตรวจ ${fmtOrDash(wbReview)} | กักกัน ${fmtOrDash(wbQuarantine)} → คลิกสั่งการ`}
                </div>
              </Link>

              <Link to="/export" style={{ textDecoration: "none", background: "#FFFFFF", border: "1px solid #E2E8F0", borderLeft: "3px solid #16A34A", borderRadius: "6px", padding: "10px 12px", display: "block" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748B", letterSpacing: "0.04em" }}>GOLD EXPORT (/export)</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A", marginTop: "2px" }}><Icon name="box" /> ส่งออก CSV แยก 3 โซน ({fmtOrDash(wbClean)} แถว)</div>
                <div style={{ fontSize: "10.5px", color: "#475569", marginTop: "3px", lineHeight: "1.4" }}>
                  {aiContextApi.data?.step5_lineage?.step4_card_desc || `ดาวน์โหลด Clean CSV และใบแจ้งแก้ต้นทาง → คลิกส่งออก`}
                </div>
              </Link>
            </div>

            {/* Bottom Action Bar in Primary Summary Mode */}
            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "#334155", fontWeight: 600 }}>
                ต้องการดูรายการเรคคอร์ดทั้งหมด ({fmtOrDash(wbTotal)} แถว) ของตาราง {wbDatasetName} แบบละเอียดพร้อมกรองตามประเภทความผิดปกติหรือไม่?
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

          {/* Data Flow & Medallion Architecture Visualizer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Data Quality Telemetry &amp; Medallion Architecture
            </div>
            <div style={{ display: 'inline-flex', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => setLineageVisualMode('stream')}
                style={{
                  background: lineageVisualMode === 'stream' ? 'var(--accent-purple)' : 'transparent',
                  color: lineageVisualMode === 'stream' ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Icon name="chart" /> Data Flow Telemetry (Real-Time Flow)
              </button>
              <button
                type="button"
                onClick={() => setLineageVisualMode('echarts')}
                style={{
                  background: lineageVisualMode === 'echarts' ? 'var(--accent-purple)' : 'transparent',
                  color: lineageVisualMode === 'echarts' ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Icon name="grid" /> Medallion Architecture (DAG Network)
              </button>
            </div>
          </div>

          {lineageVisualMode === 'stream' ? (
            <DataFlowStreamChart
              runs={qualityHistory.data || []}
              selectedTableName={selectedSourceFilter !== 'All' ? selectedSourceFilter : 'All Tables'}
              onSelectRun={(run) => {
                setSelectedRun(run);
                setUserSelectedRunId(run.run_id);
              }}
              activeRunId={activeRun?.run_id}
              onRefreshRuns={() => qualityHistory.refetch()}
            />
          ) : (
            <EchartsDataLineage
              // Root Cause Fix: wbTotal/wbQuarantine/wbScorePct can now be null (see the
              // fmtOrDash fix above) instead of a fake fallback number. `|| null` would
              // pass null straight through and skip this component's own default
              // parameters (JS defaults only trigger on undefined, not null), crashing
              // on .toLocaleString(). Falling through to undefined here restores the
              // component's own placeholder-while-loading behavior instead of crashing.
              totalRecords={activeRun?.total_records ?? wbTotal ?? 0}
              quarantinedRecords={activeRun?.quarantined_records ?? wbQuarantine ?? 0}
              tableName={activeRun?.table_name || wbDatasetName}
              qualityScore={activeRun?.quality_score ?? wbScorePct ?? 100}
            />
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
