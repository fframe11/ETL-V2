import { Icon } from '../components/UiIcons';
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import WorkflowJourneyBar, { DatabricksTileCard } from "../components/WorkflowJourneyBar";
import "./DataExport.css";

export default function DataExport() {
  const [activeTab, setActiveTab] = useState("datasets"); // "datasets" or "gold"
  const [selectedExportZone, setSelectedExportZone] = useState("CLEAN"); // "CLEAN" | "REVIEW" | "QUARANTINE"
  const [zoneDownloaded, setZoneDownloaded] = useState({});

  const [wbState, setWbState] = useState(null);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewLimit, setPreviewLimit] = useState(20);
  const [customFilename, setCustomFilename] = useState("student_course_scores");
  const [matchedTotal, setMatchedTotal] = useState(null);
  const [zonePreviewData, setZonePreviewData] = useState(null);
  const [zonePreviewLoading, setZonePreviewLoading] = useState(false);

  const loadZonePreview = async (zone, limitOverride, searchOverride) => {
    const activeZone = zone || selectedExportZone;
    const lim = limitOverride !== undefined ? limitOverride : previewLimit;
    const srch = searchOverride !== undefined ? searchOverride : previewSearch;
    setSelectedExportZone(activeZone);
    setZonePreviewLoading(true);
    try {
      const safeLimit = Math.max(1, Math.min(Number(lim) || 20, 500));
      const res = await fetch(
        `/api/v1/whitebox/preview-zone/${activeZone.toLowerCase()}?limit=${safeLimit}&search=${encodeURIComponent(srch || "")}`
      );
      if (res.ok) {
        const d = await res.json();
        setZonePreviewData({ columns: d.columns || [], rows: d.rows || [] });
        setMatchedTotal(d.matched_rows ?? d.total_zone_rows ?? null);
      }
    } catch {
      // ignore fallback
    } finally {
      setZonePreviewLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/v1/whitebox/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setWbState(d);
      })
      .catch(() => {});
    loadZonePreview("CLEAN", 20, "");
  }, []);

  const wbMetrics = wbState?.metrics || {};
  const cleanCount = wbMetrics.clean_rows ?? 9400;
  const reviewCount = wbMetrics.review_rows ?? 100;
  const quarantineCount = wbMetrics.quarantine_rows ?? 600;
  const qualityPct = wbMetrics.quality_score_pct ?? 93.1;

  const handleZoneCSVDownload = async (zone) => {
    await loadZonePreview(zone);
    const zoneKey = zone.toLowerCase();
    const rowCount = zone === "CLEAN" ? cleanCount : zone === "REVIEW" ? reviewCount : quarantineCount;
    const basePrefix = (customFilename || "student_course_scores").trim().replace(/\.csv$/i, "");
    const filename = `${basePrefix}_${zoneKey}_${rowCount}rows.csv`;
    setExportStatus({ loading: true, message: `กำลังสร้างและดาวน์โหลดไฟล์ ${filename} (${rowCount.toLocaleString()} แถว)...` });
    try {
      const res = await fetch(`/api/v1/whitebox/export-csv/${zoneKey}`);
      if (!res.ok) throw new Error("Failed to stream CSV");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setZoneDownloaded(prev => ({ ...prev, [zone]: new Date().toLocaleTimeString() }));
      setExportStatus({ success: true, message: `ดาวน์โหลดไฟล์ ${filename} (${rowCount.toLocaleString()} แถว) สำเร็จแล้ว` });
    } catch (e) {
      setExportStatus({ success: false, message: `ไม่สามารถดาวน์โหลดไฟล์ได้: ${e.message}` });
    }
  };
  
  // Datasets State
  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedLayer, setSelectedLayer] = useState("active");
  const [subreddit, setSubreddit] = useState("python");
  const [redditAvailable, setRedditAvailable] = useState(false);
  
  // Gold BI Reports State
  const [goldMetric, setGoldMetric] = useState("daily-quality");
  const [goldDays, setGoldDays] = useState(14);
  
  // Preview & Export Status
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [exportStatus, setExportStatus] = useState(null);

  // Load available tables
  const fetchTables = async () => {
    setTablesLoading(true);
    try {
      const res = await fetch("/api/v1/export/tables");
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
        setRedditAvailable(data.reddit_available || false);
        if (data.tables && data.tables.length > 0) {
          setSelectedTable(data.tables[0].name);
        }
      }
    } catch (e) {
      console.error("Failed to load tables", e);
    } finally {
      setTablesLoading(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!selectedTable) return;
    if (window.confirm(` WARNING: Are you sure you want to completely delete dataset '${selectedTable}'? This will delete all raw, active, and quarantined data in HDFS, along with all rules configurations, AI proposals, lineage runs, and schema metrics from Elasticsearch. This action cannot be undone.`)) {
      try {
        const response = await fetch(`/api/v1/export/tables/${selectedTable}`, {
          method: "DELETE"
        });
        if (response.ok) {
          alert(`Successfully deleted dataset '${selectedTable}'.`);
          setSelectedTable("");
          fetchTables();
        } else {
          const err = await response.json();
          alert(`Failed to delete dataset: ${err.detail || "Server error"}`);
        }
      } catch (e) {
        alert(`Failed to delete dataset: ${e.message}`);
      }
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // Fetch Preview Data when selections change
  useEffect(() => {
    const fetchPreview = async () => {
      let url = "";
      const isGold = activeTab === "gold";

      if (isGold) {
        url = `/api/v1/gold/${goldMetric}?days=${goldDays}`;
      } else {
        if (selectedLayer === "reddit") {
          url = `/api/v1/export/preview/reddit/${subreddit}`;
        } else {
          if (!selectedTable) return;
          url = `/api/v1/export/preview/${selectedLayer}/${selectedTable}`;
        }
      }

      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewData(null);
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (isGold) {
            let list = [];
            if (Array.isArray(data)) {
              list = data;
            } else if (data.data && Array.isArray(data.data)) {
              list = data.data;
            } else if (data.daily && Array.isArray(data.daily)) {
              list = data.daily;
            }
            
            if (list.length === 0) {
              setPreviewError("No gold metrics found for the selected date range.");
            } else {
              setPreviewData({
                columns: Object.keys(list[0] || {}),
                rows: list.slice(0, 10)
              });
            }
          } else {
            setPreviewData(data);
          }
        } else {
          const errData = await res.json();
          setPreviewError(errData.detail || "No data available in this layer.");
        }
      } catch (err) {
        setPreviewError("Failed to fetch preview data.");
      } finally {
        setPreviewLoading(false);
      }
    };

    fetchPreview();
  }, [selectedTable, selectedLayer, subreddit, goldMetric, goldDays, activeTab]);

  // Handle CSV Download
  const handleDownload = async () => {
    let downloadUrl = "";
    let filename = "";

    if (activeTab === "datasets") {
      if (selectedLayer === "reddit") {
        downloadUrl = `/api/v1/export/reddit?subreddit=${subreddit}`;
        filename = `reddit_${subreddit}.csv`;
      } else {
        if (!selectedTable) return;
        downloadUrl = `/api/v1/export/${selectedLayer}/${selectedTable}`;
        filename = `${selectedTable}_${selectedLayer}.csv`;
      }
    } else {
      downloadUrl = `/api/v1/export/gold/${goldMetric}?days=${goldDays}`;
      filename = `gold_${goldMetric}_${goldDays}d.csv`;
    }

    setExportStatus({ loading: true, message: "Generating CSV export from HDFS raw storage..." });
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Export failed.");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      setExportStatus({ success: true, message: `Successfully downloaded ${filename}!` });
      setTimeout(() => setExportStatus(null), 5000);
    } catch (err) {
      setExportStatus({ success: false, message: err.message || "Failed to download data." });
    }
  };

  // Find layer support for currently selected table
  const currentTableConfig = tables.find(t => t.name === selectedTable);
  const supportedLayers = currentTableConfig ? currentTableConfig.layers : [];

  return (
    <div className="gs-export">
      {/* 1. Page Header */}
      <div className="gs-page-header">
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(255, 54, 33, 0.08)", color: "#FF3621", border: "1px solid rgba(255, 54, 33, 0.25)", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "6px" }}>
            GOLD LAYER · CERTIFIED DATA EXPORT & AUDIT REPORT
          </div>
          <h1 className="gs-page-title">Gold Certified <span style={{ color: "#1B3139" }}>& Data Export</span></h1>
          <p className="gs-page-desc">ส่งออกชุดข้อมูลระดับ Gold Certified พร้อมเปรียบเทียบคุณภาพและรายงานสรุปสำหรับระบบปลายทาง</p>
        </div>
      </div>

      {/* Interactive 3-Zone Export & Quality Deliverables Console */}
      <div style={{ background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
              <span style={{ background: "#1B3139", color: "#FFFFFF", fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", letterSpacing: "0.05em" }}>
                GOLD CERTIFIED · LAKEHOUSE DELIVERABLES
              </span>
              <span style={{ background: "#DCFCE7", color: "#15803D", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px" }}>
                <Icon name="check" /> ผ่านการคัดกรองจาก Pipeline แล้ว ({(wbState?.metrics?.total_rows ?? 10100).toLocaleString()} แถว)
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: "16px", color: "#0F172A", fontWeight: 800 }}>
              <Icon name="box" /> ส่งออกชุดข้อมูลและรายงานการคัดแยก (Lakehouse Export & Deliverables Console)
            </h3>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
              <span style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name="dot-green" /> Gold: Analytics &amp; BI
              </span>
              <span style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name="dot-yellow" /> Review: Expert Queue
              </span>
              <span style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name="dot-red" /> Quarantine: Upstream Root-Cause
              </span>
            </div>
          </div>
          <Link
            to="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 16px",
              background: "#2563EB",
              color: "#FFFFFF",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 1px 2px rgba(37,99,235,0.2)"
            }}
          >
            <span>ดูภาพรวมความน่าเชื่อถือที่ Trust Dashboard <Icon name="arrow-right" /></span>
          </Link>
        </div>

        {/* Databricks Workspace Filter Toolbar (Matches Screenshot 2 Workspace View) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "14px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: "4px", padding: "5px 10px", width: "240px" }}>
              <span style={{ color: "#64748B", fontSize: "12px" }}><Icon name="search" /></span>
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>Search</span>
            </div>
            <button type="button" style={{ padding: "5px 10px", borderRadius: "4px", fontSize: "12px", border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#334155", cursor: "pointer" }}>
              Type ▾
            </button>
            <button type="button" style={{ padding: "5px 10px", borderRadius: "4px", fontSize: "12px", border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#334155", cursor: "pointer" }}>
              Owner ▾
            </button>
            <button type="button" style={{ padding: "5px 10px", borderRadius: "4px", fontSize: "12px", border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#334155", cursor: "pointer" }}>
              Last modified ▾
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => handleZoneCSVDownload("CLEAN")}
              style={{ padding: "5px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: 600, border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#0F172A", cursor: "pointer" }}
            >
              Share
            </button>
            <button
              type="button"
              onClick={() => handleZoneCSVDownload("CLEAN")}
              style={{ padding: "5px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: 600, border: "none", background: "#2272B4", color: "#FFFFFF", cursor: "pointer" }}
            >
              Export CSV ▾
            </button>
          </div>
        </div>

        {/* Full-Width Borderless Workspace Table (Exact match to Screenshot 2 Workspace Table) */}
        <div style={{ overflowX: "auto", marginBottom: "22px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #CBD5E1", color: "#475569", fontSize: "11.5px" }}>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Name ↑</th>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Type</th>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Rows</th>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Owner</th>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Last updated at</th>
                <th style={{ padding: "8px 10px", fontWeight: 600, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                <td style={{ padding: "10px", color: "#2272B4", fontWeight: 600, cursor: "pointer" }} onClick={() => loadZonePreview("CLEAN")}>
                  <Icon name="table" /> certified_gold_clean.csv
                </td>
                <td style={{ padding: "10px", color: "#334155" }}>Gold Certified Table</td>
                <td style={{ padding: "10px", fontWeight: 600, color: "#15803D" }}>{cleanCount.toLocaleString()} rows</td>
                <td style={{ padding: "10px", color: "#475569" }}>fframew01@gmail.com</td>
                <td style={{ padding: "10px", color: "#475569" }}>Sep 23, 2026, 12:47 PM</td>
                <td style={{ padding: "10px", textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => handleZoneCSVDownload("CLEAN")}
                    style={{ padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: "#2272B4", color: "#FFFFFF", border: "none", cursor: "pointer" }}
                  >
                    {zoneDownloaded.CLEAN ? "Downloaded" : "Download CSV"}
                  </button>
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                <td style={{ padding: "10px", color: "#2272B4", fontWeight: 600, cursor: "pointer" }} onClick={() => loadZonePreview("REVIEW")}>
                  <Icon name="search" /> human_review_outliers.csv
                </td>
                <td style={{ padding: "10px", color: "#334155" }}>Steward Review Queue</td>
                <td style={{ padding: "10px", fontWeight: 600, color: "#D97706" }}>{reviewCount.toLocaleString()} rows</td>
                <td style={{ padding: "10px", color: "#475569" }}>fframew01@gmail.com</td>
                <td style={{ padding: "10px", color: "#475569" }}>Sep 23, 2026, 12:47 PM</td>
                <td style={{ padding: "10px", textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => handleZoneCSVDownload("REVIEW")}
                    style={{ padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: "#FFFFFF", color: "#0F172A", border: "1px solid #CBD5E1", cursor: "pointer" }}
                  >
                    {zoneDownloaded.REVIEW ? "Downloaded" : "Download CSV"}
                  </button>
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                <td style={{ padding: "10px", color: "#2272B4", fontWeight: 600, cursor: "pointer" }} onClick={() => loadZonePreview("QUARANTINE")}>
                  <Icon name="alert" /> quarantine_root_cause_audit.csv
                </td>
                <td style={{ padding: "10px", color: "#334155" }}>Quarantine Audit Log</td>
                <td style={{ padding: "10px", fontWeight: 600, color: "#DC2626" }}>{quarantineCount.toLocaleString()} rows</td>
                <td style={{ padding: "10px", color: "#475569" }}>fframew01@gmail.com</td>
                <td style={{ padding: "10px", color: "#475569" }}>Sep 23, 2026, 12:47 PM</td>
                <td style={{ padding: "10px", textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => handleZoneCSVDownload("QUARANTINE")}
                    style={{ padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: "#FFFFFF", color: "#DC2626", border: "1px solid #FECACA", cursor: "pointer" }}
                  >
                    {zoneDownloaded.QUARANTINE ? "Downloaded" : "Download CSV"}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 3 Databricks Tile Cards — Exact 3-Element Card Anatomy from Databricks Learn UI */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "14px" }}>
          {/* Zone 1: Clean Data CSV */}
          <DatabricksTileCard
            category="Gold Layer · BI & ML Ready"
            title={`Certified Gold Dataset (${cleanCount.toLocaleString()} แถว)`}
            subtitle={`score ∈ [${wbState?.min_score ?? 0}, ${wbState?.max_score ?? 100}] · Null 0% · Unique 100%`}
            percent={100}
            gradient="linear-gradient(135deg, #059669 0%, #34D399 100%)"
            iconName="check"
            selected={selectedExportZone === "CLEAN"}
            onClick={() => loadZonePreview("CLEAN")}
            footerSlot={
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => loadZonePreview("CLEAN")}
                  style={{ padding: "5px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: "#FFFFFF", color: "#0F172A", border: "1px solid #CBD5E1", cursor: "pointer" }}
                >
                  แสดงรายการข้อมูล
                </button>
                <button
                  type="button"
                  onClick={() => handleZoneCSVDownload("CLEAN")}
                  style={{ flex: 1, padding: "5px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: "#1B3139", color: "#FFFFFF", border: "none", cursor: "pointer" }}
                >
                  {zoneDownloaded.CLEAN ? `ดาวน์โหลดแล้ว (${zoneDownloaded.CLEAN})` : `ดาวน์โหลด Gold CSV`}
                </button>
              </div>
            }
          />

          {/* Zone 2: Human Review Queue CSV */}
          <DatabricksTileCard
            category="Data Steward · Outlier Review"
            title={`Human Review Queue (${reviewCount.toLocaleString()} แถว)`}
            subtitle={`study_hours > Q3 + ${wbState?.tukey_multiplier || "3.0"}× IQR`}
            percent={Math.max(1, Math.round((reviewCount / 10100) * 100))}
            gradient="linear-gradient(135deg, #D97706 0%, #FBBF24 100%)"
            iconName="search"
            selected={selectedExportZone === "REVIEW"}
            onClick={() => loadZonePreview("REVIEW")}
            footerSlot={
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => loadZonePreview("REVIEW")}
                  style={{ padding: "5px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: "#FFFFFF", color: "#0F172A", border: "1px solid #CBD5E1", cursor: "pointer" }}
                >
                  แสดงรายการข้อมูล
                </button>
                <button
                  type="button"
                  onClick={() => handleZoneCSVDownload("REVIEW")}
                  style={{ flex: 1, padding: "5px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: "#2272B4", color: "#FFFFFF", border: "none", cursor: "pointer" }}
                >
                  {zoneDownloaded.REVIEW ? `ดาวน์โหลดแล้ว (${zoneDownloaded.REVIEW})` : `ดาวน์โหลด Review CSV`}
                </button>
              </div>
            }
          />

          {/* Zone 3: Quarantine Root-Cause Log CSV */}
          <DatabricksTileCard
            category="Upstream Governance · Diagnostic Log"
            title={`Quarantine Audit Log (${quarantineCount.toLocaleString()} แถว)`}
            subtitle={`Null ${wbMetrics.missing_score_count ?? 300} · Range ${wbMetrics.invalid_range_count ?? 200} · Dup ${wbMetrics.gate2_quarantined ?? 100}`}
            percent={Math.round((quarantineCount / 10100) * 100)}
            gradient="linear-gradient(135deg, #DC2626 0%, #F87171 100%)"
            iconName="alert"
            selected={selectedExportZone === "QUARANTINE"}
            onClick={() => loadZonePreview("QUARANTINE")}
            footerSlot={
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => loadZonePreview("QUARANTINE")}
                  style={{ padding: "5px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: "#FFFFFF", color: "#0F172A", border: "1px solid #CBD5E1", cursor: "pointer" }}
                >
                  แสดงรายการข้อมูล
                </button>
                <button
                  type="button"
                  onClick={() => handleZoneCSVDownload("QUARANTINE")}
                  style={{ flex: 1, padding: "5px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: "#DC2626", color: "#FFFFFF", border: "none", cursor: "pointer" }}
                >
                  {zoneDownloaded.QUARANTINE ? `ดาวน์โหลดแล้ว (${zoneDownloaded.QUARANTINE})` : `ดาวน์โหลด Quarantine CSV`}
                </button>
              </div>
            }
          />
        </div>

        {/* Interactive Search, Row Limit & Custom Filename Input Bar */}
        <div style={{ marginTop: "14px", background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "240px" }}>
            <Icon name="search" />
            <input
              type="text"
              value={previewSearch}
              onChange={(e) => {
                const val = e.target.value;
                setPreviewSearch(val);
                loadZonePreview(selectedExportZone, previewLimit, val);
              }}
              placeholder={`ค้นหารายการในโซน ${selectedExportZone}...`}
              style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid #94A3B8", fontSize: "12px", background: "#FFFFFF", color: "#0F172A" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#334155" }}>
            <span style={{ fontWeight: 700 }}>จำนวนแถวที่แสดง:</span>
            <input
              type="number"
              min="1"
              max="500"
              value={previewLimit}
              onChange={(e) => {
                const val = e.target.value;
                setPreviewLimit(val);
                if (val !== "" && !isNaN(Number(val))) {
                  loadZonePreview(selectedExportZone, Number(val), previewSearch);
                }
              }}
              style={{ width: "68px", padding: "5px 8px", borderRadius: "6px", border: "1px solid #94A3B8", fontSize: "12px", fontWeight: 700, textAlign: "center", background: "#FFFFFF", color: "#0F172A" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#334155" }}>
            <span style={{ fontWeight: 700 }}>ชื่อไฟล์ CSV:</span>
            <input
              type="text"
              value={customFilename}
              onChange={(e) => setCustomFilename(e.target.value)}
              placeholder="student_course_scores"
              style={{ width: "175px", padding: "5px 8px", borderRadius: "6px", border: "1px solid #94A3B8", fontSize: "12px", fontFamily: "monospace", background: "#FFFFFF", color: "#0F172A" }}
            />
          </div>
          {matchedTotal !== null && (
            <span style={{ background: "#E0F2FE", color: "#0369A1", fontSize: "11px", fontWeight: 800, padding: "4px 8px", borderRadius: "4px" }}>
              พบตรงเงื่อนไข {Number(matchedTotal).toLocaleString()} แถว
            </span>
          )}
        </div>

        {/* Embedded Zone Preview Table right below the Filter Bar */}
        <div style={{ marginTop: "14px", border: "1px solid #E2E8F0", borderRadius: "8px", overflow: "hidden", background: "#FFFFFF" }}>
          <div style={{ padding: "10px 14px", background: "#F1F5F9", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: "12px", color: "#0F172A" }}>
              <Icon name="list" /> ตารางตัวอย่างข้อมูลปลายทาง: <code>{selectedExportZone === "CLEAN" ? "GOLD CERTIFIED" : selectedExportZone === "REVIEW" ? "REVIEW QUEUE" : "QUARANTINE STORE"}</code> ({zonePreviewData?.rows?.length || 0} แถวที่แสดง)
            </strong>
            <span style={{ fontSize: "11px", color: "#475569" }}>
              ไฟล์ปลายทาง: <code>{(customFilename || "student_course_scores").trim()}_{selectedExportZone.toLowerCase()}.csv</code>
            </span>
          </div>
          <div className="gs-preview-wrap" style={{ maxHeight: "360px", overflowY: "auto" }}>
            {zonePreviewLoading ? (
              <div className="gs-empty">กำลังโหลดข้อมูลจากโซน {selectedExportZone}...</div>
            ) : zonePreviewData && zonePreviewData.rows && zonePreviewData.rows.length > 0 && Array.isArray(zonePreviewData.columns) ? (
              <table className="gs-preview-table">
                <thead>
                  <tr>
                    {(zonePreviewData.columns || []).map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zonePreviewData.rows.map((row, idx) => (
                    <tr key={idx}>
                      {(zonePreviewData.columns || []).map(col => (
                        <td key={col} title={String(row[col])}>
                          {row[col] !== null && row[col] !== undefined ? String(row[col]) : <em>null</em>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="gs-empty">ไม่พบข้อมูลที่ตรงกับคำค้นหาในโซน {selectedExportZone}</div>
            )}
          </div>
        </div>
      </div>

      {/* Cluster Tables & Gold BI Deliverables */}
      <details style={{ marginTop: "16px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "14px", marginBottom: "20px" }}>
        <summary style={{ cursor: "pointer", fontSize: "12px", fontWeight: 700, color: "#475569" }}>
          <Icon name="database" /> ส่งออกตารางเพิ่มเติมจากคลัสเตอร์ (Cluster Tables &amp; Gold BI Reports) ▼
        </summary>
        <div style={{ marginTop: "14px" }}>
      <div className="gs-export-tabs" style={{ alignSelf: 'flex-start' }}>
        <button 
          className={`gs-export-btn ${activeTab === "datasets" ? "active" : ""}`}
          onClick={() => { setActiveTab("datasets"); setPreviewData(null); }}
        >
          Pipeline Datasets (HDFS)
        </button>
        <button 
          className={`gs-export-btn ${activeTab === "gold" ? "active" : ""}`}
          onClick={() => { setActiveTab("gold"); setPreviewData(null); }}
        >
          Gold BI Reports (Elasticsearch)
        </button>
      </div>

      {/* 3. Grid Workspace */}
      <div className="gs-export-layout">
        {/* Left Card: Ingestion/Export configuration */}
        <div className="gs-ecard">
          <h3>Export Configuration</h3>

          {activeTab === "datasets" ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="gs-input-grp">
                <label>Target Data Layer</label>
                <select 
                  value={selectedLayer} 
                  onChange={(e) => {
                    setSelectedLayer(e.target.value);
                    if (e.target.value !== "reddit" && tables.length > 0 && !selectedTable) {
                      setSelectedTable(tables[0].name);
                    }
                  }}
                >
                  <option value="active">Active Layer (Silver/Clean)</option>
                  <option value="raw">Raw Layer (Bronze/Raw CSV)</option>
                  <option value="quarantine">Quarantine Zone (Bad Records)</option>
                  {redditAvailable && <option value="reddit">Reddit Streaming Dataset</option>}
                </select>
              </div>

              {selectedLayer === "reddit" ? (
                <div className="gs-input-grp">
                  <label>Streaming Subreddit</label>
                  <select value={subreddit} onChange={(e) => setSubreddit(e.target.value)}>
                    <option value="python">r/python</option>
                    <option value="bigdata">r/bigdata</option>
                    <option value="datascience">r/datascience</option>
                    <option value="machinelearning">r/machinelearning</option>
                    <option value="technology">r/technology</option>
                  </select>
                </div>
              ) : (
                <div className="gs-input-grp">
                  <label>Table Source</label>
                  {tablesLoading ? (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Loading catalog...</span>
                  ) : (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)} style={{ flex: 1 }}>
                        {tables.map(t => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        className="gs-btn-outline"
                        style={{
                          padding: "8px 12px",
                          color: "var(--accent-red)",
                          borderColor: "var(--accent-red)",
                          background: "rgba(239, 68, 68, 0.05)",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          borderRadius: "8px",
                          height: "38px"
                        }}
                        onClick={handleDeleteTable}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedLayer !== "reddit" && selectedTable && supportedLayers.length > 0 && (
                <div className="gs-layer-status">
                  <strong>Available Medallion Layers</strong>
                  <div className="gs-layer-pills">
                    {["raw", "active", "quarantine"].map(l => {
                      const yes = supportedLayers.includes(l);
                      return (
                        <span key={l} className={`gs-layer-pill ${yes ? 'yes' : 'no'}`}>
                          {l.toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="gs-input-grp">
                <label>Gold Metric Index Type</label>
                <select value={goldMetric} onChange={(e) => setGoldMetric(e.target.value)}>
                  <option value="daily-quality">Daily Quality Summaries</option>
                  <option value="error-patterns">Common Error Patterns</option>
                  <option value="financial-impact">Financial Loss Estimates (COPDQ)</option>
                  <option value="schema-drift">Schema Drift History</option>
                </select>
              </div>

              <div className="gs-input-grp">
                <label>Range (Last N Days)</label>
                <input 
                  type="number" 
                  value={goldDays} 
                  onChange={(e) => setGoldDays(parseInt(e.target.value) || 7)}
                  min="1" 
                  max="365"
                />
              </div>
            </div>
          )}

          {exportStatus && (
            <div className={`gs-toast ${exportStatus.loading ? 'loading' : exportStatus.success ? 'ok' : 'err'}`} style={{ marginTop: '12px' }}>
              {exportStatus.message}
            </div>
          )}

          <button 
            onClick={handleDownload}
            disabled={exportStatus?.loading || (activeTab === "datasets" && !selectedTable && selectedLayer !== "reddit")}
            className="gs-btn-download"
            style={{ marginTop: 'auto' }}
          >
            {exportStatus?.loading ? "Generating export..." : "Export CSV File"}
          </button>
        </div>

        {/* Right Card: Preview Grid */}
        <div className="gs-ecard" style={{ overflow: "hidden" }}>
          <div className="gs-preview-header">
            <h3>Dataset Preview (First 10 Rows)</h3>
            {activeTab === "datasets" ? (
              <span>
                HDFS: <code>/data/{selectedLayer}/{selectedLayer === 'reddit' ? `subreddit=${subreddit}` : selectedTable}</code>
              </span>
            ) : (
              <span>
                Elasticsearch Index: <code>sdoqap_gold_{goldMetric.replace("-", "_")}</code>
              </span>
            )}
          </div>

          <div className="gs-preview-wrap">
            {previewLoading ? (
              <div className="gs-empty">Loading delta preview rows...</div>
            ) : previewError ? (
              <div className="gs-empty" style={{ color: 'var(--accent-red)' }}>
                <span><Icon name="alert" /></span> {previewError}
              </div>
            ) : previewData && previewData.rows && previewData.rows.length > 0 && Array.isArray(previewData.columns) ? (
              <table className="gs-preview-table">
                <thead>
                  <tr>
                    {(previewData.columns || []).map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.rows.map((row, idx) => (
                    <tr key={idx}>
                      {(previewData.columns || []).map(col => (
                        <td key={col} title={String(row[col])}>
                          {row[col] !== null ? String(row[col]) : <em>null</em>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="gs-empty">Select catalog table to preview delta rows</div>
            )}
        </div>
        </div>
        </div>
        </div>
      </details>
    </div>
  );
}
