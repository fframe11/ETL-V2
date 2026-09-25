import { Icon } from '../components/UiIcons';
import React, { useState, useEffect, useRef } from "react";
import { postApi } from "../hooks/useApi";
import TileCard from "../components/ui/TileCard";
import { PageHeader, LearnMore, NextStepLink } from "../components/ui";
import "./Ingestion.css";

export default function Ingestion() {
  // Empirical Data Profiling State (White-Box Foundation)
  const [profilingData, setProfilingData] = useState(null);
  const [profilingLoading, setProfilingLoading] = useState(false);

  // CSV Upload State
  const [csvTableName, setCsvTableName] = useState("");
  const [csvFile, setCsvFile] = useState(null);
  const [csvStatus, setCsvStatus] = useState(null);
  const [csvDragging, setCsvDragging] = useState(false);

  // API Ingest State
  const [apiTableName, setApiTableName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiMethod, setApiMethod] = useState("GET");
  const [apiInterval, setApiInterval] = useState(10);
  const [apiStatus, setApiStatus] = useState(null);
  const [apiKey, setApiKey] = useState("");

  // RDBMS Ingest State
  const [rdbmsTableName, setRdbmsTableName] = useState("student_course_scores");
  const [dbType, setDbType] = useState("postgresql");
  const [dbHost, setDbHost] = useState("postgres-prod.internal");
  const [dbPort, setDbPort] = useState(5432);
  const [dbUser, setDbUser] = useState("etl_reader");
  const [dbPass, setDbPass] = useState("");
  const [dbName, setDbName] = useState("academic_prod");
  const [dbQuery, setDbQuery] = useState("SELECT * FROM student_course_scores");
  const [rdbmsStatus, setRdbmsStatus] = useState(null);
  const [isRdbmsUnlocked, setIsRdbmsUnlocked] = useState(false);
  const [showRdbmsLearnMore, setShowRdbmsLearnMore] = useState(false);
  const [hasAcknowledgedRdbms, setHasAcknowledgedRdbms] = useState(false);

  // Unified aliases for RDBMS tab inputs
  const rdbmsType = dbType;
  const setRdbmsType = setDbType;
  const rdbmsHost = dbHost;
  const setRdbmsHost = setDbHost;
  const rdbmsPort = dbPort;
  const setRdbmsPort = setDbPort;
  const rdbmsDb = dbName;
  const setRdbmsDb = setDbName;
  const rdbmsTable = rdbmsTableName;
  const setRdbmsTable = setRdbmsTableName;

  // Kafka / Event Stream Ingest State
  const [streamBrokers, setStreamBrokers] = useState("kafka:9092");
  const [streamTopic, setStreamTopic] = useState("student_course_scores");
  const [streamGroup, setStreamGroup] = useState("sdoqap-profiler-group");
  const [redditTopic, setRedditTopic] = useState("#Technology, #AI");
  const [redditDuration, setRedditDuration] = useState(40);
  const [redditSubreddits, setRedditSubreddits] = useState("python,bigdata");
  const [redditStatus, setRedditStatus] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamInfo, setStreamInfo] = useState({
    status: "idle",
    remaining: 0,
    elapsed: 0,
    logs: []
  });

  const handleStreamSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      await handleRedditToggle();
    } catch {}
  };

  const [pollingTable, setPollingTable] = useState(null);
  const [pollingType, setPollingType] = useState(null);

  const terminalEndRef = useRef(null);

  // Poll ingestion / streaming status continuously on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch("/api/v1/pipeline/ingest/reddit/status");
        if (response.ok) {
          const data = await response.json();
          setStreamInfo(data);
          setIsStreaming(data.status === "running");
        }
      } catch (err) {
        console.error("Failed to fetch stream status:", err);
      }
    };

    checkStatus(); // immediate check
    const intervalId = setInterval(checkStatus, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Interactive Auto-Profiling & Anomaly Selection State (Synced with Backend /api/v1/whitebox/state)
  const normalizeFindingsObj = (sf) => {
    if (Array.isArray(sf)) {
      return {
        range: sf.includes("score_range_null") || sf.includes("range"),
        duplicate: sf.includes("composite_key_dup") || sf.includes("duplicate"),
        outlier: sf.includes("study_hours_outlier") || sf.includes("outlier")
      };
    }
    if (sf && typeof sf === "object") {
      return {
        range: Boolean(sf.range ?? sf.score_range_null ?? true),
        duplicate: Boolean(sf.duplicate ?? sf.composite_key_dup ?? true),
        outlier: Boolean(sf.outlier ?? sf.study_hours_outlier ?? true)
      };
    }
    return { range: true, duplicate: true, outlier: true };
  };

  const [selectedFindings, setSelectedFindings] = useState({ range: true, duplicate: true, outlier: true });
  const [expandedFinding, setExpandedFinding] = useState(null);
  const [findingRecords, setFindingRecords] = useState({});
  const [activeSourceTab, setActiveSourceTab] = useState("csv");
  const [activeSourceSummary, setActiveSourceSummary] = useState("FILE_UPLOAD · student_course_scores.csv");
  const [primaryDatasetName, setPrimaryDatasetName] = useState("student_course_scores");
  const [rawSearchQuery, setRawSearchQuery] = useState("");
  const [rawSearchResults, setRawSearchResults] = useState(null);
  const [quickUploadNotice, setQuickUploadNotice] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [aiContext, setAiContext] = useState(null);
  const [aiContextLoading, setAiContextLoading] = useState(false);

  const fetchAiContext = async (force = false) => {
    setAiContextLoading(true);
    try {
      const res = await fetch(`/api/v1/whitebox/ai-context-explanations${force ? "?force=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        setAiContext(data);
      }
    } catch (e) {
      console.error("Failed to fetch AI context explanations:", e);
    } finally {
      setAiContextLoading(false);
    }
  };

  const handleInspectFindingRows = async (findingKey, zone, errorType) => {
    if (expandedFinding === findingKey) {
      setExpandedFinding(null);
      return;
    }
    setExpandedFinding(findingKey);
    try {
      const res = await fetch(`/api/v1/whitebox/preview-zone/${zone}?limit=5&error_type=${encodeURIComponent(errorType)}`);
      if (res.ok) {
        const d = await res.json();
        setFindingRecords((prev) => ({ ...prev, [findingKey]: d.rows || [] }));
      }
    } catch (e) {
      console.error("Failed to load finding rows:", e);
    }
  };

  const handleConnectSourceAndProfile = async (sourceType, tableName, connectionUri) => {
    setProfilingLoading(true);
    setUploadError("");
    setQuickUploadNotice("");
    const cleanTbl = String(tableName || "student_course_scores").replace(/[^a-zA-Z0-9_]/g, "_");
    setPrimaryDatasetName(cleanTbl);
    setActiveSourceSummary(`${sourceType} · ${connectionUri || cleanTbl}`);
    try {
      const res = await fetch("/api/v1/whitebox/ingest-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: sourceType,
          table_name: cleanTbl,
          connection_uri: connectionUri
        })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.profile) setProfilingData(d.profile);
        setQuickUploadNotice(`เชื่อมต่อแหล่งข้อมูล [${sourceType}] ตาราง '${cleanTbl}' (${(d.rows_ingested ?? 0).toLocaleString()} แถว) และอัปเดตผลวิเคราะห์ System Auto-Profiling เรียบร้อยแล้ว`);
        fetchAiContext(true);
      } else {
        const detail = await res.json().catch(() => null);
        setUploadError(detail?.detail || `เชื่อมต่อแหล่งข้อมูลไม่สำเร็จ (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error("Failed to connect source and profile:", err);
      setUploadError("เชื่อมต่อแหล่งข้อมูลไม่สำเร็จ: ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
    } finally {
      setProfilingLoading(false);
    }
  };

  // Uploads an actual CSV/Excel file's bytes to the server (used by both the
  // hidden file input and the "นำเข้าไฟล์และรัน Auto-Profiling ทันที" button —
  // that button used to call handleConnectSourceAndProfile instead, which never
  // sent the file itself and silently 404'd when no dataset already existed).
  const uploadCsvFile = async (file, tableName) => {
    if (!file) {
      setUploadError("กรุณาเลือกไฟล์ก่อน");
      return;
    }
    const cleanName = String(tableName || file.name.replace(/\.(csv|xlsx|xls)$/i, ""))
      .replace(/[^a-zA-Z0-9_]/g, "_");
    setProfilingLoading(true);
    setUploadError("");
    setQuickUploadNotice("");
    setCsvFile(file);
    setPrimaryDatasetName(cleanName);
    setCsvTableName(cleanName);
    setActiveSourceSummary(`FILE_UPLOAD · ${file.name}`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("table_name", cleanName);
      const upRes = await fetch("/api/v1/whitebox/upload-csv", { method: "POST", body: fd });
      if (upRes.ok) {
        const upData = await upRes.json();
        if (upData.profile) setProfilingData(upData.profile);
        setQuickUploadNotice(`นำเข้าไฟล์ '${file.name}' (${(upData.rows_ingested ?? 0).toLocaleString()} แถว) และประมวลผล System Auto-Profiling สำเร็จแล้ว`);
        fetchAiContext(true);
        handleRescanProfile();
      } else {
        const detail = await upRes.json().catch(() => null);
        setUploadError(detail?.detail || `นำเข้าไฟล์ไม่สำเร็จ (HTTP ${upRes.status})`);
      }
    } catch (err) {
      console.error("Failed to upload CSV file:", err);
      setUploadError("นำเข้าไฟล์ไม่สำเร็จ: ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
    } finally {
      setProfilingLoading(false);
    }
  };

  const toggleFinding = async (key, checked) => {
    const next = { ...normalizeFindingsObj(selectedFindings), [key]: checked };
    setSelectedFindings(next);
    try {
      await fetch("/api/v1/whitebox/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_findings: next })
      });
    } catch (err) {
      console.error("Failed to sync finding selection:", err);
    }
  };

  const handleRescanProfile = async () => {
    setProfilingLoading(true);
    try {
      const [profRes, stateRes] = await Promise.all([
        fetch("/api/v1/whitebox/profile"),
        fetch("/api/v1/whitebox/state")
      ]);
      if (profRes.ok) {
        const data = await profRes.json();
        setProfilingData(data);
      }
      if (stateRes.ok) {
        const st = await stateRes.json();
        if (st.selected_findings) setSelectedFindings(normalizeFindingsObj(st.selected_findings));
        if (st.dataset_name) setPrimaryDatasetName(st.dataset_name);
        if (st.source_type) setActiveSourceSummary(`${st.source_type} · ${st.connection_uri || st.dataset_name}`);
      }
      fetchAiContext(false);
    } catch (err) {
      console.error("Failed to fetch data profile:", err);
    } finally {
      setTimeout(() => setProfilingLoading(false), 250);
    }
  };

  useEffect(() => {
    handleRescanProfile();
  }, []);

  // Load state from localStorage on mount
  useEffect(() => {
    const savedTable = localStorage.getItem("ingest_polling_table");
    const savedType = localStorage.getItem("ingest_polling_type");
    if (savedTable && savedType) {
      setPollingTable(savedTable);
      setPollingType(savedType);
    }
    
    const savedCsvInput = localStorage.getItem("csv_table_name_input");
    if (savedCsvInput) setCsvTableName(savedCsvInput);
    
    const savedApiInput = localStorage.getItem("api_table_name_input");
    if (savedApiInput) setApiTableName(savedApiInput);
    
    const savedApiUrl = localStorage.getItem("api_url_input");
    if (savedApiUrl) setApiUrl(savedApiUrl);
  }, []);

  // Save polling state to localStorage when it changes
  useEffect(() => {
    if (pollingTable && pollingType) {
      localStorage.setItem("ingest_polling_table", pollingTable);
      localStorage.setItem("ingest_polling_type", pollingType);
    } else {
      localStorage.removeItem("ingest_polling_table");
      localStorage.removeItem("ingest_polling_type");
    }
  }, [pollingTable, pollingType]);

  // Save input fields to localStorage when they change
  useEffect(() => {
    if (csvTableName) localStorage.setItem("csv_table_name_input", csvTableName);
  }, [csvTableName]);

  useEffect(() => {
    if (apiTableName) localStorage.setItem("api_table_name_input", apiTableName);
  }, [apiTableName]);

  useEffect(() => {
    if (apiUrl) localStorage.setItem("api_url_input", apiUrl);
  }, [apiUrl]);

  // Do not call scrollIntoView on window to prevent viewport scroll jumping

  // Track active ingestion job progress via Spark daemon status and logs
  useEffect(() => {
    if (!pollingTable || !pollingType) return;

    const isRunning = streamInfo.status === "running";
    const logsStr = Array.isArray(streamInfo.logs) ? streamInfo.logs.join("\n") : "";
    const startedMsg = `Starting Spark Quality Engine Rerun for table '${pollingTable}'`;
    const finishedMsg = `finished for table '${pollingTable}'`;
    const remediatingMsg = `Auto-Remediation:`;
    const remediationSuccessMsg = `Remediation successful`;
    const revalidationDoneMsg = `Remediation re-validation completed for table '${pollingTable}'`;
    const revalidationFinishedMsg = `re-validation finished for table '${pollingTable}'`;

    const setStatus = (statusObj) => {
      if (pollingType === "csv") setCsvStatus(statusObj);
      else if (pollingType === "api") setApiStatus(statusObj);
      else if (pollingType === "rdbms") setRdbmsStatus(statusObj);
    };

    if (isRunning) {
      // Check for remediation states (more specific → less specific)
      if (logsStr.includes(remediationSuccessMsg) && logsStr.includes(`Re-running Spark Quality Engine`)) {
        setStatus({
          loading: true,
          message: ` AI remediation successful! Re-validating fixed data for '${pollingTable}'...`
        });
      } else if (logsStr.includes(remediatingMsg) && logsStr.includes("Starting AI remediation")) {
        setStatus({
          loading: true,
          message: ` AI is remediating quarantined records for '${pollingTable}'...`
        });
      } else if (logsStr.includes(startedMsg)) {
        setStatus({
          loading: true,
          message: `Spark quality engine is actively validating table '${pollingTable}'...`
        });
      } else {
        setStatus({
          loading: true,
          message: `Waiting for Spark validation of '${pollingTable}' to boot...`
        });
      }
    } else {
      // Daemon is idle — check if we have a final result
      if (logsStr.includes(revalidationDoneMsg) || logsStr.includes(revalidationFinishedMsg)) {
        // Remediation + re-validation cycle completed
        if (logsStr.includes(`(Exit code: 0)`)) {
          setStatus({
            success: true,
            message: ` Successfully processed '${pollingTable}'! AI remediated quarantined records and re-validated.`
          });
        } else {
          setStatus({
            success: true,
            message: `Processed '${pollingTable}'. Some records may remain in quarantine after AI remediation.`
          });
        }
        setPollingTable(null);
        setPollingType(null);
      } else if (logsStr.includes("No records could be fixed")) {
        // Remediation attempted but failed — still a completed state
        setStatus({
          success: true,
          message: `Processed '${pollingTable}'. AI could not remediate quarantined records — check Quarantine zone for details.`
        });
        setPollingTable(null);
        setPollingType(null);
      } else if (logsStr.includes(finishedMsg)) {
        if (logsStr.includes(`${finishedMsg} (Exit code: 0)`)) {
          setStatus({
            success: true,
            message: `Successfully processed and ingested table '${pollingTable}'!`
          });
          setPollingTable(null);
          setPollingType(null);
        } else {
          setStatus({
            success: false,
            message: `Quality validation failed for table '${pollingTable}'. See details in Terminal logs below.`
          });
          setPollingTable(null);
          setPollingType(null);
        }
      }
    }
  }, [streamInfo, pollingTable, pollingType]);

  // CSV Drag and Drop Handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setCsvDragging(true);
  };

  const handleDragLeave = () => {
    setCsvDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setCsvDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
      if (file.name.endsWith(".csv") || isExcel) {
        setCsvFile(file);
        if (!csvTableName) {
          const ext = isExcel ? (file.name.endsWith(".xlsx") ? ".xlsx" : ".xls") : ".csv";
          setCsvTableName(file.name.replace(ext, "").replace(/[^a-zA-Z0-9_]/g, "_"));
        }
      } else {
        setCsvStatus({ success: false, message: "Only CSV and Excel files are supported." });
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setCsvFile(file);
      if (!csvTableName) {
        const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
        const ext = isExcel ? (file.name.endsWith(".xlsx") ? ".xlsx" : ".xls") : ".csv";
        setCsvTableName(file.name.replace(ext, "").replace(/[^a-zA-Z0-9_]/g, "_"));
      }
    }
  };

  // Submit CSV Ingestion
  const handleCsvSubmit = async (e) => {
    e.preventDefault();
    if (!csvTableName || !csvFile) {
      setCsvStatus({ success: false, message: "Please provide both filename and CSV file." });
      return;
    }

    setCsvStatus({ loading: true, message: "Uploading HDFS raw store and triggering quality check..." });
    try {
      const formData = new FormData();
      formData.append("table_name", csvTableName);
      formData.append("file", csvFile);

      const response = await fetch("/api/v1/pipeline/ingest/csv", {
        method: "POST",
        body: formData
      });
      const res = await response.json();

      if (response.ok) {
        setStreamInfo({
          status: "running",
          logs: [],
          remaining: 0,
          elapsed: 0
        });
        setPollingTable(csvTableName);
        setPollingType("csv");
        setCsvStatus({ loading: true, message: "CSV uploaded. Triggering Spark validation..." });
      } else {
        setCsvStatus({ success: false, message: res.detail || "Upload failed." });
      }
    } catch (err) {
      setCsvStatus({ success: false, message: `Error: ${err.message}` });
    }
  };

  // Submit API Ingestion
  const handleApiSubmit = async (e) => {
    e.preventDefault();
    if (!apiTableName || !apiUrl) {
      setApiStatus({ success: false, message: "Please provide table name and API URL." });
      return;
    }

    setApiStatus({ loading: true, message: "Fetching REST endpoint data and triggering Spark..." });
    try {
      const res = await postApi("/pipeline/ingest/api", {
        table_name: apiTableName,
        url: apiUrl,
        api_key: apiKey || null
      });
      
      setStreamInfo({
        status: "running",
        logs: [],
        remaining: 0,
        elapsed: 0
      });
      setPollingTable(apiTableName);
      setPollingType("api");
      setApiStatus({ loading: true, message: "API handshake completed. Triggering Spark validation..." });
      
      setApiTableName("");
      setApiUrl("");
      setApiKey("");
    } catch (err) {
      setApiStatus({ success: false, message: `Error: ${err.message}` });
    }
  };

  // Toggle Reddit Ingestion
  const handleRedditToggle = async () => {
    if (isStreaming) {
      // stop
      try {
        const res = await postApi("/pipeline/ingest/reddit/stop");
        setRedditStatus({ success: true, message: res.message });
        setIsStreaming(false);
      } catch (err) {
        setRedditStatus({ success: false, message: `Error: ${err.message}` });
      }
    } else {
      // start
      setRedditStatus(null);
      try {
        const res = await postApi("/pipeline/ingest/reddit", {
          subreddits: redditSubreddits,
          duration: parseInt(redditDuration)
        });
        setIsStreaming(true);
        setRedditStatus({ success: true, message: res.message });
      } catch (err) {
        setRedditStatus({ success: false, message: `Error: ${err.message}` });
      }
    }
  };

  const handleRdbmsSubmit = async (e) => {
    e.preventDefault();
    if (!rdbmsTableName || !dbHost || !dbPort || !dbUser || !dbName || !dbQuery) {
      setRdbmsStatus({ success: false, message: "Please fill in all required fields." });
      return;
    }

    setRdbmsStatus({ loading: true, message: "Connecting to database and running Spark ingestion..." });
    try {
      const res = await postApi("/pipeline/ingest/rdbms", {
        table_name: rdbmsTableName,
        db_type: dbType,
        host: dbHost,
        port: parseInt(dbPort),
        username: dbUser,
        password: dbPass,
        database: dbName,
        query: dbQuery
      });
      
      setStreamInfo({
        status: "running",
        logs: [],
        remaining: 0,
        elapsed: 0
      });
      setPollingTable(rdbmsTableName);
      setPollingType("rdbms");
      setRdbmsStatus({ loading: true, message: "RDBMS query executed. Triggering Spark validation..." });
      
      setRdbmsTableName("");
      setDbHost("");
      setDbUser("");
      setDbPass("");
      setDbName("");
      setDbQuery("");
    } catch (err) {
      setRdbmsStatus({ success: false, message: `Error: ${err.message}` });
    }
  };

  const getPercentage = () => {
    if (!streamInfo.duration || streamInfo.duration <= 0) return 0;
    return Math.min(100, Math.max(0, (streamInfo.elapsed / streamInfo.duration) * 100));
  };

  const totalIngestedRows = profilingData?.total_rows ?? 10100;
  const distinctRows = (profilingData?.total_rows ?? 10100) - (profilingData?.duplicate_analysis?.duplicate_rows_detected ?? 100);

  return (
    <div className="gs-ingestion">
      <PageHeader pageKey="ingestion" />

      {/* Source picker */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid #E2E8F0" }}>
        {[
          { id: "csv", label: "ไฟล์" },
          { id: "rdbms", label: "ฐานข้อมูล" },
          { id: "api", label: "API" },
          { id: "stream", label: "Stream" }
        ].map((tab) => {
          const isAct = activeSourceTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSourceTab(tab.id)}
              style={{
                background: isAct ? "#0F172A" : "#FFFFFF",
                color: isAct ? "#FFFFFF" : "#475569",
                border: isAct ? "1px solid #0F172A" : "1px solid #CBD5E1",
                borderRadius: "6px",
                padding: "5px 12px",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer"
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* PART 1: UNIFIED SOURCE CONNECTOR FORM */}
      <div className="gs-icard" style={{ minHeight: "auto", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px 20px", marginBottom: "16px" }}>
        {/* Active Source Tab Content */}
        {activeSourceTab === "csv" && (
          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Target Table Name
                </label>
                <input
                  type="text"
                  value={primaryDatasetName}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^a-zA-Z0-9_]/g, "_");
                    setPrimaryDatasetName(v);
                    setCsvTableName(v);
                  }}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12.5px", fontWeight: 700, color: "#0F172A", background: "#FFFFFF" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Source Data File (.csv, .xlsx)
                </label>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "8px 14px", background: "#FFFFFF", border: "1px dashed #CBD5E1", borderRadius: "6px", fontSize: "12px", fontWeight: 700, color: "#1B3139", cursor: "pointer" }}>
                  <Icon name="folder" /> {csvFile ? `${csvFile.name} (${(csvFile.size / 1024).toFixed(1)} KB)` : "Browse or drop CSV / Excel file"}
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        uploadCsvFile(e.target.files[0], e.target.files[0].name.replace(/\.(csv|xlsx|xls)$/i, ""));
                      }
                    }}
                  />
                </label>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => uploadCsvFile(csvFile, primaryDatasetName)}
                  disabled={profilingLoading}
                  style={{ width: "100%", padding: "9px 16px", background: "#1B3139", color: "#FFFFFF", border: "none", borderRadius: "6px", fontSize: "12.5px", fontWeight: 700, cursor: profilingLoading ? "wait" : "pointer" }}
                >
                  {profilingLoading ? "กำลังนำเข้าและวิเคราะห์..." : "นำเข้าไฟล์และรัน Auto-Profiling ทันที"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSourceTab === "rdbms" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConnectSourceAndProfile("RDBMS", rdbmsTable || "student_course_scores", `${rdbmsType}://${rdbmsHost}:${rdbmsPort}/${rdbmsDb}`);
            }}
            style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Engine</label>
                <select value={rdbmsType} onChange={(e) => setRdbmsType(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }}>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="sqlserver">SQL Server</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Host & Port</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input type="text" value={rdbmsHost} onChange={(e) => setRdbmsHost(e.target.value)} placeholder="db.internal" style={{ flex: 2, padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
                  <input type="text" value={rdbmsPort} onChange={(e) => setRdbmsPort(e.target.value)} placeholder="5432" style={{ flex: 1, padding: "8px 8px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Database Name</label>
                <input type="text" value={rdbmsDb} onChange={(e) => setRdbmsDb(e.target.value)} placeholder="academic_prod" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Source Table Name</label>
                <input type="text" value={rdbmsTable} onChange={(e) => setRdbmsTable(e.target.value)} placeholder="student_course_scores" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", fontWeight: 700, background: "#FFFFFF" }} />
              </div>
              <div>
                <button type="submit" disabled={profilingLoading} style={{ width: "100%", padding: "9px 14px", background: "#1B3139", color: "#FFFFFF", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: profilingLoading ? "wait" : "pointer", opacity: profilingLoading ? 0.6 : 1 }}>
                  {profilingLoading ? "กำลังนำเข้าและวิเคราะห์..." : "ดึงข้อมูล RDBMS และรัน Auto-Profiling"}
                </button>
              </div>
            </div>
          </form>
        )}

        {activeSourceTab === "api" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConnectSourceAndProfile("REST_API", apiTableName || "student_course_scores", apiUrl || "https://api.internal.org/v1/records");
            }}
            style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Target Table Name</label>
                <input type="text" value={apiTableName} onChange={(e) => setApiTableName(e.target.value)} placeholder="student_course_scores" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", fontWeight: 700, background: "#FFFFFF" }} />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>REST Endpoint URL</label>
                <input type="url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.enterprise.internal/v1/scores" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>HTTP Method & Auth</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <select value={apiMethod} onChange={(e) => setApiMethod(e.target.value)} style={{ padding: "8px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }}>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Bearer Token" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
                </div>
              </div>
              <div>
                <button type="submit" disabled={profilingLoading} style={{ width: "100%", padding: "9px 14px", background: "#1B3139", color: "#FFFFFF", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: profilingLoading ? "wait" : "pointer", opacity: profilingLoading ? 0.6 : 1 }}>
                  {profilingLoading ? "กำลังนำเข้าและวิเคราะห์..." : "ดึงข้อมูล API และรัน Auto-Profiling"}
                </button>
              </div>
            </div>
          </form>
        )}

        {activeSourceTab === "stream" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleStreamSubmit(e);
              handleConnectSourceAndProfile("KAFKA_STREAM", streamTopic || "student_course_scores", `${streamBrokers}/${streamTopic}`);
            }}
            style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Kafka Bootstrap Brokers</label>
                <input type="text" value={streamBrokers} onChange={(e) => setStreamBrokers(e.target.value)} placeholder="kafka:9092" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 800, color: "#334155", marginBottom: "4px" }}>Topic Name</label>
                <input type="text" value={streamTopic} onChange={(e) => setStreamTopic(e.target.value)} placeholder="student_course_scores" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", fontWeight: 700, background: "#FFFFFF" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Consumer Group ID</label>
                <input type="text" value={streamGroup} onChange={(e) => setStreamGroup(e.target.value)} placeholder="sdoqap-profiler-group" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
              </div>
              <div>
                <button type="submit" disabled={profilingLoading} style={{ width: "100%", padding: "9px 14px", background: "#1B3139", color: "#FFFFFF", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: profilingLoading ? "wait" : "pointer", opacity: profilingLoading ? 0.6 : 1 }}>
                  {profilingLoading ? "กำลังนำเข้าและวิเคราะห์..." : "รับข้อมูล Stream และรัน Auto-Profiling"}
                </button>
              </div>
            </div>
          </form>
        )}

        {quickUploadNotice && (
          <div style={{ marginTop: "12px", background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700 }}>
            <Icon name="check" /> {quickUploadNotice}
          </div>
        )}
        {uploadError && (
          <div style={{ marginTop: "12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700 }}>
            <Icon name="alert" /> {uploadError}
          </div>
        )}
      </div>

      {/* DATASET PROFILING & SCHEMA DISCOVERY */}
      <div className="gs-icard" style={{ minHeight: "auto", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "10px", padding: "20px", boxShadow: "0 1px 2px rgba(15,23,42,0.03)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", color: "#0F172A", fontWeight: 800 }}>
              <Icon name="search" /> ผลสำรวจข้อมูล
            </h3>
            <div style={{ fontSize: "12.5px", color: "#64748B", marginTop: "4px" }}>
              Table: <code>{primaryDatasetName}</code> · {totalIngestedRows.toLocaleString()} rows ({distinctRows.toLocaleString()} distinct)
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => fetchAiContext(true)}
              disabled={aiContextLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                background: "#FFFFFF",
                color: "#1E293B",
                border: "1px solid #CBD5E1",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: aiContextLoading ? "wait" : "pointer"
              }}
            >
              <Icon name="sparkles" />
              <span>{aiContextLoading ? "กำลังสรุป..." : "สรุปด้วย AI"}</span>
            </button>
            <button
              type="button"
              onClick={handleRescanProfile}
              disabled={profilingLoading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                background: "#1B3139",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: profilingLoading ? "wait" : "pointer"
              }}
            >
              <span>{profilingLoading ? "กำลังสแกน..." : "สแกนใหม่"}</span>
            </button>
            <NextStepLink from="ingestion" />
          </div>
        </div>

        {/* Databricks-style AI Contextual Summary Banner */}
        <LearnMore summary="สรุปจาก AI">
          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderLeft: "4px solid #1B3139", borderRadius: "8px", padding: "12px 16px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "12px", color: "#334155", lineHeight: "1.6", fontWeight: 500 }}>
              {aiContext?.step1_findings?.overview_summary ||
                `จากการสแกนโครงสร้างและค่าสถิติของตาราง '${primaryDatasetName}' (${totalIngestedRows.toLocaleString()} แถว) พบรายการที่ต้องกำหนดเกณฑ์ควบคุมคุณภาพ 3 หมวดหมู่หลักก่อนนำไปประมวลผลต่อ`}
            </div>
          </div>
        </LearnMore>

        {/* Unified Live Record Filter Bar */}
        <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "280px" }}>
              <label style={{ display: "block", fontSize: "10.5px", fontWeight: 800, color: "#475569", textTransform: "uppercase", marginBottom: "4px" }}>
                ค้นหาเรคคอร์ด
              </label>
              <input
                type="text"
                value={rawSearchQuery}
                onChange={async (e) => {
                  const q = e.target.value;
                  setRawSearchQuery(q);
                  if (q.trim()) {
                    try {
                      const r = await fetch(`/api/v1/whitebox/preview-zone/raw?limit=8&search=${encodeURIComponent(q.trim())}`);
                      if (r.ok) {
                        const d = await r.json();
                        setRawSearchResults(d);
                      }
                    } catch {}
                  } else {
                    setRawSearchResults(null);
                  }
                }}
                placeholder="กรอกรหัสประจำตัว ชื่อวิชา หรือค่าที่ต้องการค้นหาในตาราง..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", color: "#0F172A", background: "#FFFFFF" }}
              />
            </div>
          </div>

          {rawSearchQuery.trim() !== "" && (
            <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "8px 10px", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
              <div style={{ fontWeight: 800, color: "#0F172A", marginBottom: "4px" }}>
                ผลการค้นหาเรคคอร์ดในตาราง (พบ {(rawSearchResults?.matched_rows ?? 0).toLocaleString()} แถวที่ตรงกับ &quot;{rawSearchQuery}&quot;):
              </div>
              {(rawSearchResults?.rows || []).map((item, idx) => (
                <div key={idx} style={{ padding: "3px 0", borderBottom: "1px solid #F1F5F9", color: "#334155" }}>
                  <strong>Row #{item.dirty_row_id ?? item.record_id ?? idx + 1}</strong> · student_id=<code>{String(item.student_id ?? "")}</code> · course=<code>{String(item.course ?? "")}</code> · score=<code>{String(item.score ?? "NULL")}</code> · study_hours=<code>{String(item.study_hours ?? "")}</code> · semester=<code>{String(item.semester ?? "")}</code>
                </div>
              ))}
            </div>
          )}
        </div>

        {profilingLoading && !profilingData ? (
          <div style={{ padding: "24px", textAlign: "center", color: "#64748B", fontSize: "13px" }}>
            <Icon name="clock" /> กำลังสแกนคำนวณค่าสถิติของชุดข้อมูล...
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
            {/* Card 1: Value Range & Nulls (Databricks Clean Surface + Top Accent) */}
            <div style={{ background: "#FFFFFF", border: selectedFindings.range ? "1px solid #94A3B8" : "1px solid #E2E8F0", borderTop: "3px solid #DC2626", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", gap: "8px" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "#64748B", fontWeight: 800, letterSpacing: "0.04em" }}>score</span>
                    <h4 style={{ margin: "2px 0 0", color: "#0F172A", fontSize: "13.5px", fontWeight: 800 }}>ค่าว่างและช่วงค่า</h4>
                  </div>
                  <span style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                    — flagged
                  </span>
                </div>

                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "10px 12px", marginBottom: "10px", fontSize: "11.5px", color: "#334155" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #E2E8F0" }}>
                    <span>Min → Max Observed:</span>
                    <strong style={{ color: "#0F172A" }}>{(profilingData?.columns_profile || profilingData?.column_profiles)?.score?.min ?? -10.0} → {(profilingData?.columns_profile || profilingData?.column_profiles)?.score?.max ?? 150.0}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #E2E8F0" }}>
                    <span>Null Count (<code>NULL</code>):</span>
                    <strong style={{ color: "#0F172A" }}>{(profilingData?.columns_profile || profilingData?.column_profiles)?.score?.null_rate_pct ?? 3.02}% ({(profilingData?.columns_profile || profilingData?.column_profiles)?.score?.null_count ?? 305} rows)</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span>Out-of-Bounds Rows:</span>
                    <strong style={{ color: "#0F172A" }}>—</strong>
                  </div>
                </div>

                <LearnMore summary="บริบทข้อมูล">
                  <div style={{ background: "#F8FAFC", borderLeft: "3px solid #475569", padding: "8px 10px", borderRadius: "4px", marginBottom: "10px", fontSize: "11px", color: "#334155", lineHeight: "1.55" }}>
                    {aiContext?.step1_findings?.finding1_explanation ||
                      "คอลัมน์ score มีทั้งค่าว่างและค่าที่อยู่นอกช่วงปกติ (-10 ถึง 150) หากปล่อยผ่านจะทำให้การคำนวณค่าเฉลี่ยของชุดข้อมูลคลาดเคลื่อน"}
                  </div>
                </LearnMore>

                {expandedFinding === "range" && (
                  <div style={{ background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: "6px", padding: "8px", marginBottom: "10px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "#1E293B" }}>
                    <div style={{ fontWeight: 800, marginBottom: "4px" }}>ตัวอย่างเรคคอร์ดที่ไม่ผ่านเกณฑ์ (Sample Rows):</div>
                    {(findingRecords.range || []).map((r, i) => (
                      <div key={i}>• Row #{r.dirty_row_id}: student_id={r.student_id}, course={r.course}, score={String(r.score ?? "NULL")} ({r.whitebox_error_type})</div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #E2E8F0", gap: "6px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: 700, color: "#1E293B", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedFindings.range}
                    onChange={(e) => toggleFinding("range", e.target.checked)}
                  />
                  <span>เลือกไปสร้างเกณฑ์ใน Rule Hub</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleInspectFindingRows("range", "quarantine", "Score")}
                  style={{ padding: "4px 10px", fontSize: "10.5px", fontWeight: 700, borderRadius: "4px", border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#334155", cursor: "pointer" }}
                >
                  {expandedFinding === "range" ? "ซ่อนตัวอย่าง" : "ดูตัวอย่างเรคคอร์ด"}
                </button>
              </div>
            </div>

            {/* Card 2: Key Uniqueness (Databricks Clean Surface + Top Accent) */}
            <div style={{ background: "#FFFFFF", border: selectedFindings.duplicate ? "1px solid #94A3B8" : "1px solid #E2E8F0", borderTop: "3px solid #D97706", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", gap: "8px" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "#64748B", fontWeight: 800, letterSpacing: "0.04em" }}>คีย์รวม</span>
                    <h4 style={{ margin: "2px 0 0", color: "#0F172A", fontSize: "13.5px", fontWeight: 800 }}>คีย์ซ้ำ</h4>
                  </div>
                  <span style={{ background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A", fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                    {profilingData?.duplicate_analysis?.duplicate_rows_detected ?? 100} duplicates
                  </span>
                </div>

                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "10px 12px", marginBottom: "10px", fontSize: "11.5px", color: "#334155" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #E2E8F0" }}>
                    <span>Composite Key:</span>
                    <strong style={{ color: "#0F172A" }}><code>student_id + course + semester</code></strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #E2E8F0" }}>
                    <span>Distinct Entities:</span>
                    <strong style={{ color: "#0F172A" }}>{distinctRows.toLocaleString()} / {totalIngestedRows.toLocaleString()} rows</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span>Duplicate Records:</span>
                    <strong style={{ color: "#0F172A" }}>{profilingData?.duplicate_analysis?.duplicate_rows_detected ?? "—"} rows</strong>
                  </div>
                </div>

                <LearnMore summary="บริบทข้อมูล">
                  <div style={{ background: "#F8FAFC", borderLeft: "3px solid #475569", padding: "8px 10px", borderRadius: "4px", marginBottom: "10px", fontSize: "11px", color: "#334155", lineHeight: "1.55" }}>
                    {aiContext?.step1_findings?.finding2_explanation ||
                      "พบเรคคอร์ดที่มีรหัสประจำตัว รายวิชา และภาคการศึกษาซ้ำกันเกิน 1 ครั้ง ซึ่งเกิดจากการส่งข้อมูลซ้ำจากระบบต้นทางและต้องแยกออกเพื่อป้องกันการนับยอดซ้ำ"}
                  </div>
                </LearnMore>

                {expandedFinding === "dup" && (
                  <div style={{ background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: "6px", padding: "8px", marginBottom: "10px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "#1E293B" }}>
                    <div style={{ fontWeight: 800, marginBottom: "4px" }}>ตัวอย่างเรคคอร์ดที่ซ้ำซ้อน (Sample Duplicate Rows):</div>
                    {(findingRecords.dup || []).map((r, i) => (
                      <div key={i}>• Row #{r.dirty_row_id}: {r.student_id} + {r.course} + {r.semester} (score={r.score})</div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #E2E8F0", gap: "6px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: 700, color: "#1E293B", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedFindings.duplicate}
                    onChange={(e) => toggleFinding("duplicate", e.target.checked)}
                  />
                  <span>เลือกไปสร้างเกณฑ์ใน Rule Hub</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleInspectFindingRows("dup", "quarantine", "Duplicate")}
                  style={{ padding: "4px 10px", fontSize: "10.5px", fontWeight: 700, borderRadius: "4px", border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#334155", cursor: "pointer" }}
                >
                  {expandedFinding === "dup" ? "ซ่อนตัวอย่าง" : "ดูตัวอย่างเรคคอร์ด"}
                </button>
              </div>
            </div>

            {/* Card 3: Adaptive Outliers (Databricks Clean Surface + Top Accent) */}
            <div style={{ background: "#FFFFFF", border: selectedFindings.outlier ? "1px solid #94A3B8" : "1px solid #E2E8F0", borderTop: "3px solid #0284C7", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", gap: "8px" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "#64748B", fontWeight: 800, letterSpacing: "0.04em" }}>study_hours</span>
                    <h4 style={{ margin: "2px 0 0", color: "#0F172A", fontSize: "13.5px", fontWeight: 800 }}>ค่าผิดปกติ</h4>
                  </div>
                  <span style={{ background: "#F0F9FF", color: "#0369A1", border: "1px solid #BAE6FD", fontSize: "10.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                    — outliers
                  </span>
                </div>

                <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "10px 12px", marginBottom: "10px", fontSize: "11.5px", color: "#334155" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #E2E8F0" }}>
                    <span>Q1 / Q3 / IQR:</span>
                    <strong style={{ color: "#0F172A" }}>Q1={(profilingData?.columns_profile || profilingData?.column_profiles)?.study_hours?.q1 ?? 4.0} · Q3={(profilingData?.columns_profile || profilingData?.column_profiles)?.study_hours?.q3 ?? 6.0} · IQR={(profilingData?.columns_profile || profilingData?.column_profiles)?.study_hours?.iqr ?? 2.0}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #E2E8F0" }}>
                    <span>Inner Fence (<code>1.5× IQR &gt; 9.0</code>):</span>
                    <strong style={{ color: "#0F172A" }}>—</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span>Outer Fence (<code>3.0× IQR &gt; 12.0</code>):</span>
                    <strong style={{ color: "#0F172A" }}>—</strong>
                  </div>
                </div>

                <LearnMore summary="บริบทข้อมูล">
                  <div style={{ background: "#F8FAFC", borderLeft: "3px solid #475569", padding: "8px 10px", borderRadius: "4px", marginBottom: "10px", fontSize: "11px", color: "#334155", lineHeight: "1.55" }}>
                    {aiContext?.step1_findings?.finding3_explanation ||
                      "ค่าในคอลัมน์ study_hours ที่สูงเกินรั้วสถิติควรคัดแยกเข้าคิวตรวจสอบ เพื่อให้ผู้รับผิดชอบพิจารณาแทนการตัดทิ้งอัตโนมัติ"}
                  </div>
                </LearnMore>

                {expandedFinding === "outlier" && (
                  <div style={{ background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: "6px", padding: "8px", marginBottom: "10px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "#1E293B" }}>
                    <div style={{ fontWeight: 800, marginBottom: "4px" }}>ตัวอย่างเรคคอร์ดที่เกินเกณฑ์สถิติ (Sample Outlier Rows):</div>
                    {(findingRecords.outlier || []).map((r, i) => (
                      <div key={i}>• Row #{r.dirty_row_id}: student_id={r.student_id}, study_hours={r.study_hours} ชม., score={r.score}</div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid #E2E8F0", gap: "6px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: 700, color: "#1E293B", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedFindings.outlier}
                    onChange={(e) => toggleFinding("outlier", e.target.checked)}
                  />
                  <span>เลือกไปสร้างเกณฑ์ใน Rule Hub</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleInspectFindingRows("outlier", "review", "Outlier")}
                  style={{ padding: "4px 10px", fontSize: "10.5px", fontWeight: 700, borderRadius: "4px", border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#334155", cursor: "pointer" }}
                >
                  {expandedFinding === "outlier" ? "ซ่อนตัวอย่าง" : "ดูตัวอย่างเรคคอร์ด"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}