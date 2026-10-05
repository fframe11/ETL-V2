import { Icon } from '../components/UiIcons';
import React, { useState, useEffect, useRef } from "react";
import { postApi } from "../hooks/useApi";
import TileCard from "../components/ui/TileCard";
import { PageHeader, LearnMore, NextStepLink } from "../components/ui";
import { friendlyApiError } from "../utils/apiError";
import RunStatusLine from "../components/RunStatusLine";
import "./Ingestion.css";

// Must match QUALITY_ENGINE_COLUMNS in api/app/api/whitebox.py.
// QUALITY_CHECK_COLUMNS removed to support generic datasets.

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
  const [rdbmsTableName, setRdbmsTableName] = useState("");
  const [dbType, setDbType] = useState("postgresql");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState(5432);
  const [dbUser, setDbUser] = useState("");
  const [dbPass, setDbPass] = useState("");
  const [dbName, setDbName] = useState("");
  const [dbQuery, setDbQuery] = useState("");
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
  const [streamTopic, setStreamTopic] = useState("");
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
        range: sf.includes("range") || sf.includes("Range"),
        duplicate: sf.includes("duplicate") || sf.includes("Duplicate") || sf.includes("composite_key"),
        outlier: sf.includes("outlier") || sf.includes("Outlier") || sf.includes("iqr") || sf.includes("IQR")
      };
    }
    if (sf && typeof sf === "object") {
      return {
        range: Boolean(sf.range ?? true),
        duplicate: Boolean(sf.duplicate ?? true),
        outlier: Boolean(sf.outlier ?? true)
      };
    }
    return { range: true, duplicate: true, outlier: true };
  };

  const [selectedFindings, setSelectedFindings] = useState({ range: true, duplicate: true, outlier: true });
  const [expandedFinding, setExpandedFinding] = useState(null);
  const [findingRecords, setFindingRecords] = useState({});
  const [activeSourceTab, setActiveSourceTab] = useState("csv");
  const [activeSourceSummary, setActiveSourceSummary] = useState("");
  const [primaryDatasetName, setPrimaryDatasetName] = useState("");
  const [rawSearchQuery, setRawSearchQuery] = useState("");
  const [rawSearchResults, setRawSearchResults] = useState(null);
  const [quickUploadNotice, setQuickUploadNotice] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [queuedRun, setQueuedRun] = useState(null);
  const [queueError, setQueueError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
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
    const cleanTbl = String(tableName || "uploaded_dataset").replace(/[^a-zA-Z0-9_]/g, "_");
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
        const rows = d.rows_ingested == null ? "" : ` (${d.rows_ingested.toLocaleString()} แถว)`;
        setQuickUploadNotice(d.simulated
          ? `โหมดสาธิต: ยังไม่ได้เชื่อมต่อ ${sourceType} จริง ระบบตรวจข้อมูลชุดที่โหลดไว้ '${cleanTbl}'${rows} แทน`
          : `เชื่อมต่อแหล่งข้อมูล ${sourceType} ตาราง '${cleanTbl}'${rows} และตรวจข้อมูลแล้ว`);
      } else {
        const detail = await res.json().catch(() => null);
        setUploadError(friendlyApiError(detail?.detail, `เชื่อมต่อแหล่งข้อมูลไม่สำเร็จ (HTTP ${res.status})`))
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
  // Picking or dropping a file only stages it and pre-fills the table name
  // from the file name; the import button does the upload, so the name can
  // still be edited first.
  const stageCsvFile = (file) => {
    if (!file) return;
    const name = file.name.replace(/\.(csv|xlsx|xls)$/i, "").replace(/[^a-zA-Z0-9_]/g, "_");
    setCsvFile(file);
    setPrimaryDatasetName(name);
    setCsvTableName(name);
    setUploadError("");
    setQuickUploadNotice("");
  };

  // The interactive engine above only profiles the file in memory. This sends the same file
  // to the Spark pipeline (raw landing -> quality run), which is what fills the data layers.
  const queueInPipeline = async (file, tableName) => {
    try {
      const fd = new FormData();
      fd.append("table_name", tableName);
      fd.append("file", file);
      const res = await fetch("/api/v1/pipeline/ingest/csv", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setQueueError(`ส่งเข้าคิวตรวจคุณภาพไม่สำเร็จ: ${friendlyApiError(body?.detail, `HTTP ${res.status}`)}`);
      } else {
        setQueuedRun({ ingestId: body?.ingest_id, duplicate: body?.status === "duplicate" });
      }
    } catch (err) {
      console.error("Failed to queue the pipeline run:", err);
      setQueueError("ส่งเข้าคิวตรวจคุณภาพไม่สำเร็จ: ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
    }
  };

  // Real PostgreSQL ingest: the API opens the connection, runs the SELECT read-only, lands the
  // rows in HDFS and queues the Spark quality run. Nothing is simulated here.
  const ingestFromRdbms = async () => {
    const source = rdbmsTable.trim();
    const sql = dbQuery.trim() || `SELECT * FROM ${source}`;
    const target = source.replace(/[^a-zA-Z0-9_]/g, "_");
    setProfilingLoading(true);
    setUploadError("");
    setQuickUploadNotice("");
    setQueuedRun(null);
    setQueueError("");
    try {
      const res = await fetch("/api/v1/pipeline/ingest/rdbms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_name: target,
          db_type: "postgresql",
          host: rdbmsHost.trim(),
          port: Number(rdbmsPort),
          username: dbUser.trim(),
          password: dbPass,
          database: rdbmsDb.trim(),
          query: sql
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setUploadError(friendlyApiError(body?.detail, `ดึงข้อมูลจากฐานข้อมูลไม่สำเร็จ (HTTP ${res.status})`));
      } else {
        setPrimaryDatasetName(target);
        setActiveSourceSummary(`RDBMS · ${rdbmsHost.trim()}:${rdbmsPort}/${rdbmsDb.trim()}`);
        const rows = body?.rows_ingested == null ? "" : ` (${body.rows_ingested.toLocaleString()} แถว)`;
        setQuickUploadNotice(`ดึงข้อมูลจากตาราง '${source}'${rows} เข้าตาราง '${target}' แล้ว`);
        setQueuedRun({ ingestId: body?.ingest_id, duplicate: body?.status === "duplicate" });
        setDbPass("");
      }
    } catch (err) {
      console.error("Failed to ingest from the database:", err);
      setUploadError("ดึงข้อมูลจากฐานข้อมูลไม่สำเร็จ: ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
    } finally {
      setProfilingLoading(false);
    }
  };

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
    setQueuedRun(null);
    setQueueError("");
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
        setQuickUploadNotice(`นำเข้า '${file.name}' แล้ว (${(upData.rows_ingested ?? 0).toLocaleString()} แถว)`);
        handleRescanProfile();
        await queueInPipeline(file, cleanName);
      } else {
        const detail = await upRes.json().catch(() => null);
        setUploadError(friendlyApiError(detail?.detail, `นำเข้าไฟล์ไม่สำเร็จ (HTTP ${upRes.status})`));
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

  // An empty object is not a profile; only a response with a row count is.
  const hasProfile = profilingData?.total_rows != null;
  const colProfiles = profilingData?.columns_profile || profilingData?.column_profiles || {};
  
  // Dynamic finding extraction from profile
  const numericCols = Object.entries(colProfiles).filter(([k, v]) => ["Integer", "Float"].includes(v?.data_type)).map(([k]) => k);
  const nullCols = Object.entries(colProfiles).filter(([k, v]) => (v?.null_count || 0) > 0).sort((a, b) => b[1].null_count - a[1].null_count).map(([k]) => k);
  const outlierCols = Object.entries(colProfiles).filter(([k, v]) => (v?.outlier_count || 0) > 0).sort((a, b) => b[1].outlier_count - a[1].outlier_count).map(([k]) => k);
  
  const totalIngestedRows = profilingData?.total_rows;
  const duplicateRows = profilingData?.duplicate_analysis?.duplicate_rows_detected || 0;
  const duplicateKey = profilingData?.duplicate_analysis?.tested_composite_key || [];
  const distinctRows = totalIngestedRows != null ? totalIngestedRows - duplicateRows : null;
  const fmtNum = (v) => (v == null ? "—" : Number(v).toLocaleString());
  const fmtStat = (v) => (v == null ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));

  // Collect generic quality issues across all columns
  const nullEntries = Object.entries(colProfiles).filter(([c, p]) => c !== "dirty_row_id" && (p.null_count || 0) > 0);
  const outlierEntries = Object.entries(colProfiles).filter(([c, p]) => c !== "dirty_row_id" && (p.outlier_count || 0) > 0);
  const totalNullCount = nullEntries.reduce((acc, [, p]) => acc + (p.null_count || 0), 0);
  const totalOutlierCount = outlierEntries.reduce((acc, [, p]) => acc + (p.outlier_count || 0), 0);

  const issueParts = [
    ["ค่าว่าง", totalNullCount],
    ["ซ้ำ", duplicateRows],
    ["ผิดปกติ", totalOutlierCount]
  ].filter(([, v]) => v > 0);
  const issueCount = issueParts.length;
  const issueSummary = issueCount
    ? `พบปัญหา ${issueCount} ด้าน: ${issueParts.map(([label, v]) => `${label} ${Number(v).toLocaleString()}`).join(" · ")}`
    : "ไม่พบปัญหาผิดปกติในข้อมูล";

  return (
    <div className="gs-ingestion">
      <PageHeader pageKey="ingestion" />

      {/* Source card: picker + active connector form */}
      <section className="ing-card">
        <div className="ing-card-head">
          <h3>แหล่งข้อมูล</h3>
          <div className="ing-seg" role="tablist" aria-label="แหล่งข้อมูล">
            {[
              { id: "csv", label: "ไฟล์", icon: "upload" },
              { id: "rdbms", label: "ฐานข้อมูล", icon: "box" },
              { id: "api", label: "API", icon: "globe" },
              { id: "stream", label: "Stream", icon: "bolt" }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeSourceTab === tab.id}
                className={activeSourceTab === tab.id ? "is-active" : ""}
                onClick={() => setActiveSourceTab(tab.id)}
              >
                <Icon name={tab.icon} size={13} /> {tab.label}
              </button>
            ))}
          </div>
        </div>
        {/* Active Source Tab Content */}
        {activeSourceTab === "csv" && (
          <div className="ing-upload">
            <label
              className={`ing-dropzone${isDragging ? " is-dragging" : ""}${csvFile ? " has-file" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                stageCsvFile(e.dataTransfer.files?.[0]);
              }}
            >
              <span className="ing-dropzone-icon"><Icon name={csvFile ? "check" : "upload"} size={22} style={{ marginRight: 0 }} /></span>
              <strong>{csvFile ? csvFile.name : "เลือกไฟล์ หรือลากมาวางที่นี่"}</strong>
              <span>{csvFile ? `${(csvFile.size / 1024).toFixed(1)} KB · กดเพื่อเปลี่ยนไฟล์` : ".csv หรือ .xlsx"}</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                hidden
                onChange={(e) => stageCsvFile(e.target.files?.[0])}
              />
            </label>

            <div className="ing-upload-side">
              <label className="ing-field">
                <span>ชื่อตาราง</span>
                <input
                  type="text"
                  value={primaryDatasetName}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^a-zA-Z0-9_]/g, "_");
                    setPrimaryDatasetName(v);
                    setCsvTableName(v);
                  }}
                />
              </label>
              <button
                type="button"
                className="ui-btn ui-btn-primary ing-upload-btn"
                onClick={() => uploadCsvFile(csvFile, primaryDatasetName)}
                disabled={profilingLoading || !csvFile}
              >
                {profilingLoading ? "กำลังนำเข้า..." : "นำเข้าและตรวจข้อมูล"}
              </button>
            </div>
          </div>
        )}

        {activeSourceTab === "rdbms" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ingestFromRdbms();
            }}
            style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Engine</label>
                <select value="postgresql" disabled style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }}>
                  <option value="postgresql">PostgreSQL</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Host & Port</label>
                <div style={{ display: "flex", gap: "6px", minWidth: 0 }}>
                  <input type="text" required value={rdbmsHost} onChange={(e) => setRdbmsHost(e.target.value)} placeholder="postgres" style={{ flex: 2, minWidth: 0, padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
                  <input type="number" required value={rdbmsPort} onChange={(e) => setRdbmsPort(e.target.value)} placeholder="5432" style={{ flex: "0 0 72px", minWidth: 0, padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Database Name</label>
                <input type="text" required value={rdbmsDb} onChange={(e) => setRdbmsDb(e.target.value)} placeholder="ชื่อฐานข้อมูล" style={{ width: "100%", minWidth: 0, padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Username</label>
                <input type="text" required autoComplete="off" value={dbUser} onChange={(e) => setDbUser(e.target.value)} style={{ width: "100%", minWidth: 0, padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Password</label>
                <input type="password" autoComplete="new-password" value={dbPass} onChange={(e) => setDbPass(e.target.value)} style={{ width: "100%", minWidth: 0, padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Source Table Name</label>
                <input type="text" required pattern="[A-Za-z_][A-Za-z0-9_.]*" value={rdbmsTable} onChange={(e) => setRdbmsTable(e.target.value)} placeholder="ชื่อตารางต้นทาง เช่น orders" style={{ width: "100%", minWidth: 0, padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF", fontWeight: 700 }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>คำสั่ง SQL (ไม่บังคับ — ถ้าเว้นว่างจะใช้ SELECT * FROM ตารางต้นทาง)</label>
                <input type="text" value={dbQuery} onChange={(e) => setDbQuery(e.target.value)} placeholder="SELECT ... (อ่านอย่างเดียว ไม่เกิน 1,000,000 แถว)" style={{ width: "100%", minWidth: 0, padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF" }} />
              </div>
              <div>
                <button type="submit" disabled={profilingLoading} style={{ width: "100%", padding: "9px 14px", background: "#1B3139", color: "#FFFFFF", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: profilingLoading ? "wait" : "pointer", opacity: profilingLoading ? 0.6 : 1 }}>
                  {profilingLoading ? "กำลังดึงข้อมูล..." : "ดึงข้อมูลจากฐานข้อมูล"}
                </button>
              </div>
            </div>
          </form>
        )}

        {activeSourceTab === "api" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConnectSourceAndProfile("REST_API", apiTableName || "uploaded_dataset", apiUrl || "https://api.internal.org/v1/records");
            }}
            style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "8px", padding: "16px" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>Target Table Name</label>
                <input type="text" value={apiTableName} onChange={(e) => setApiTableName(e.target.value)} placeholder="uploaded_dataset" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", fontWeight: 700, background: "#FFFFFF" }} />
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
              handleConnectSourceAndProfile("KAFKA_STREAM", streamTopic || "uploaded_dataset", `${streamBrokers}/${streamTopic}`);
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
                <input type="text" value={streamTopic} onChange={(e) => setStreamTopic(e.target.value)} placeholder="" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", fontWeight: 700, background: "#FFFFFF" }} />
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
          <div className="ing-notice ing-notice-ok">
            <Icon name="check" /> {quickUploadNotice}
          </div>
        )}
        {uploadError && (
          <div className="ing-notice ing-notice-error" role="alert">
            <Icon name="alert" /> {uploadError}
          </div>
        )}
        {queuedRun && (queuedRun.duplicate
          ? <p className="ing-notice ing-notice-ok">เคยนำเข้าไฟล์นี้แล้ว (รอบ {queuedRun.ingestId}) จึงไม่ส่งตรวจซ้ำ</p>
          : <RunStatusLine ingestId={queuedRun.ingestId} />)}
        {queueError && (
          <div className="ing-notice ing-notice-error" role="alert">
            <Icon name="alert" /> {queueError}
          </div>
        )}
      </section>

      {/* Profiling results */}
      <section className="ing-results">
        <div className="ing-results-head">
          <div>
            <h3>ผลตรวจข้อมูล</h3>
            <p>
              {hasProfile ? (
                <>ตาราง <code>{primaryDatasetName}</code> · {issueSummary}</>
              ) : (
                "ยังไม่มีข้อมูล นำเข้าไฟล์ด้านบนเพื่อเริ่มตรวจ"
              )}
            </p>
          </div>
          {hasProfile && (
            <div className="ing-results-actions">
              <button type="button" className="ui-btn ui-btn-secondary" onClick={handleRescanProfile} disabled={profilingLoading}>
                {profilingLoading ? "กำลังตรวจ..." : "ตรวจใหม่"}
              </button>
              <NextStepLink from="ingestion" />
            </div>
          )}
        </div>

        {hasProfile && (
          <div className="ing-summary">
            <div><span>แถวทั้งหมด</span><strong>{fmtNum(totalIngestedRows)}</strong></div>
            <div><span>คอลัมน์</span><strong>{fmtNum(profilingData.total_columns)}</strong></div>
            <div><span>แถวไม่ซ้ำ</span><strong>{fmtNum(distinctRows)}</strong></div>
            <div className={issueCount ? "is-warn" : "is-ok"}>
              <span>ประเด็นที่ต้องดูแล</span>
              <strong>{issueCount ? `${issueCount} ด้าน` : "0 (ปกติ)"}</strong>
            </div>
          </div>
        )}

        {profilingLoading && !profilingData && (
          <div className="ing-empty"><Icon name="clock" /> กำลังตรวจข้อมูล...</div>
        )}

        {hasProfile && (
          <>
            {/* Generic Schema & Column Profiling Evidence Table */}
            <div style={{ marginTop: "14px", marginBottom: "16px", overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#1E293B" }}>
                  หลักฐานการสำรวจข้อมูล (Profiling Evidence Layer)
                </h4>
                <span style={{ fontSize: "11px", color: "#64748B" }}>
                  ตรวจพบ {Object.keys(colProfiles).filter(c => c !== "dirty_row_id").length} คอลัมน์ · พร้อมส่งต่อไปยัง Rule Recommendation
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left", background: "#FFFFFF", borderRadius: "8px", border: "1px solid #CBD5E1" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #CBD5E1", color: "#475569" }}>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>คอลัมน์</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>ชนิดข้อมูล (Inferred Type)</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>ค่าว่าง (Null Rate)</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>ความไม่ซ้ำ (Unique)</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>ขอบเขตค่า / หมวดหมู่</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>ข้อสังเกตคุณภาพ (Evidence)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(colProfiles).filter(([col]) => col !== "dirty_row_id").map(([col, p]) => {
                    const hasNull = (p.null_count || 0) > 0;
                    const hasOutlier = (p.outlier_count || 0) > 0;
                    const isId = p.data_type === "Identifier" || col.toLowerCase().endsWith("_id") || col.toLowerCase() === "id";
                    return (
                      <tr key={col} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 600, fontFamily: "monospace", color: "#0F172A" }}>{col}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: isId ? "#EFF6FF" : p.data_type === "Date" ? "#F5F3FF" : (p.data_type === "Integer" || p.data_type === "Float") ? "#ECFDF5" : "#F1F5F9",
                            color: isId ? "#1D4ED8" : p.data_type === "Date" ? "#6D28D9" : (p.data_type === "Integer" || p.data_type === "Float") ? "#047857" : "#475569"
                          }}>
                            {p.data_type || "String"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px", color: hasNull ? "#DC2626" : "#64748B" }}>
                          {hasNull ? `${p.null_count.toLocaleString()} แถว (${fmtStat(p.null_rate_pct)}%)` : "0 (สมบูรณ์ 100%)"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {fmtNum(p.distinct_count)} ค่า ({fmtStat(p.unique_rate_pct)}%)
                        </td>
                        <td style={{ padding: "8px 12px", color: "#334155" }}>
                          {p.min != null && p.max != null
                            ? `[${fmtStat(p.min)} → ${fmtStat(p.max)}]`
                            : p.top_categories && Object.keys(p.top_categories).length > 0
                              ? Object.keys(p.top_categories).slice(0, 3).join(", ") + (Object.keys(p.top_categories).length > 3 ? "..." : "")
                              : (p.sample_values || []).slice(0, 3).join(", ") || "—"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            {hasNull && <span style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: "10px", padding: "1px 5px", borderRadius: "3px" }}>มีค่าว่าง</span>}
                            {hasOutlier && <span style={{ background: "#FEF3C7", color: "#B45309", fontSize: "10px", padding: "1px 5px", borderRadius: "3px" }}>ค่าผิดปกติ ({p.outlier_count})</span>}
                            {isId && <span style={{ background: "#E0E7FF", color: "#3730A3", fontSize: "10px", padding: "1px 5px", borderRadius: "3px" }}>คีย์หลัก</span>}
                            {!hasNull && !hasOutlier && !isId && <span style={{ color: "#10B981", fontSize: "11px" }}>✓ ปกติ</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Quality Finding Cards */}
            <div className="ing-findings">
              <>
                {duplicateRows > 0 && (
                  <FindingCard
                    tone="warning"
                    column={duplicateKey.length ? duplicateKey.join(" + ") : "Entity Natural Key"}
                    title="เรคคอร์ดซ้ำ (Uniqueness)"
                    icon="key"
                    count={duplicateRows}
                    countLabel="แถวซ้ำ"
                    stats={[
                      ["แถวไม่ซ้ำ", distinctRows != null ? `${fmtNum(distinctRows)} / ${fmtNum(totalIngestedRows)}` : "—"],
                      ["แถวซ้ำ", `${fmtNum(duplicateRows)} แถว`]
                    ]}
                    explanation="พบเรคคอร์ดที่มีคีย์หรือข้อมูลซ้ำซ้อนกัน ละเมิดความถูกต้องเชิงสัมพันธ์ (Relational Integrity)"
                    selected={selectedFindings.duplicate ?? true}
                    onToggle={(v) => toggleFinding("duplicate", v)}
                    expanded={expandedFinding === "dup"}
                    onInspect={() => handleInspectFindingRows("dup", "quarantine", "Duplicate")}
                    samples={findingRecords.dup}
                    renderSample={(r) => `#${r.dirty_row_id || 1} · ${duplicateKey.map(k => `${k}=${r[k]}`).join(" · ")}`}
                  />
                )}

                {nullEntries.slice(0, 2).map(([col, p]) => (
                  <FindingCard
                    key={`range_${col}`}
                    tone="critical"
                    column={col}
                    title={`ความสมบูรณ์ข้อมูล (${col})`}
                    icon="alert"
                    count={p.null_count}
                    countLabel="แถวว่าง"
                    stats={[
                      ["จำนวนค่าว่าง", `${fmtNum(p.null_count)} แถว`],
                      ["อัตราค่าว่าง", `${fmtStat(p.null_rate_pct)}%`]
                    ]}
                    explanation={`คอลัมน์ '${col}' มีค่าว่าง ละเมิดเกณฑ์ความสมบูรณ์ (Completeness Check) ควรกักกันเพื่อป้องกันข้อผิดพลาด`}
                    selected={selectedFindings.range ?? true}
                    onToggle={(v) => toggleFinding("range", v)}
                    expanded={expandedFinding === `range_${col}`}
                    onInspect={() => handleInspectFindingRows(`range_${col}`, "quarantine", "Null")}
                    samples={findingRecords[`range_${col}`]}
                    renderSample={(r) => `#${r.dirty_row_id || 1} · ${col}=NULL`}
                  />
                ))}

                {outlierEntries.slice(0, 2).map(([col, p]) => (
                  <FindingCard
                    key={`outlier_${col}`}
                    tone="info"
                    column={col}
                    title={`การกระจายตัวผิดปกติ (${col})`}
                    icon="chart"
                    count={p.outlier_count}
                    countLabel="ค่าผิดปกติ"
                    stats={[
                      ["Q1 / Q3", `${fmtStat(p.q1)} / ${fmtStat(p.q3)}`],
                      ["ช่วงปกติ (Tukey)", `${fmtStat(p.lower_fence)} ถึง ${fmtStat(p.upper_fence)}`]
                    ]}
                    explanation={`พบค่าที่อยู่นอกช่วง Tukey Outer Fence ใน '${col}' แนะนำให้ส่งเข้าคิว Review เพื่อให้ผู้เชี่ยวชาญตรวจสอบ`}
                    selected={selectedFindings.outlier ?? true}
                    onToggle={(v) => toggleFinding("outlier", v)}
                    expanded={expandedFinding === `outlier_${col}`}
                    onInspect={() => handleInspectFindingRows(`outlier_${col}`, "review", "Outlier")}
                    samples={findingRecords[`outlier_${col}`]}
                    renderSample={(r) => `#${r.dirty_row_id || 1} · ${col}=${r[col]}`}
                  />
                ))}
              </>
            </div>

            <LearnMore summary="ค้นหาเรคคอร์ด">
              <input
                type="search"
                className="ing-search"
                value={rawSearchQuery}
                onChange={async (e) => {
                  const q = e.target.value;
                  setRawSearchQuery(q);
                  if (q.trim()) {
                    try {
                      const r = await fetch(`/api/v1/whitebox/preview-zone/raw?limit=8&search=${encodeURIComponent(q.trim())}`);
                      if (r.ok) setRawSearchResults(await r.json());
                    } catch {}
                  } else {
                    setRawSearchResults(null);
                  }
                }}
                placeholder="รหัสนักศึกษา ชื่อวิชา หรือค่าอื่น"
              />
              {rawSearchQuery.trim() !== "" && (
                <ul className="ing-samples">
                  <li><strong>พบ {fmtNum(rawSearchResults?.matched_rows ?? 0)} แถว</strong></li>
                  {(rawSearchResults?.rows || []).map((item, idx) => {
                    // Dynamic: show first 4 non-metadata columns
                    const displayCols = Object.keys(colProfiles || {}).filter(c => c !== "dirty_row_id").slice(0, 4);
                    return (
                      <li key={idx}>
                        #{item.dirty_row_id ?? item.record_id ?? idx + 1} · {displayCols.map(c => `${c}=${String(item[c] ?? "")}`).join(" · ")}
                      </li>
                    );
                  })}
                </ul>
              )}
            </LearnMore>
          </>
        )}
      </section>
    </div>
  );
}

function FindingCard({ tone, icon, column, title, count, countLabel, stats, explanation, selected, onToggle, expanded, onInspect, samples, renderSample }) {
  const status = count == null ? "unknown" : count > 0 ? tone : "ok";
  return (
    <div className={`ing-finding ing-finding-${status}${selected ? " is-selected" : ""}`}>
      <div className="ing-finding-head">
        <span className="ing-finding-icon"><Icon name={count === 0 ? "check" : icon} size={16} style={{ marginRight: 0 }} /></span>
        <div className="ing-finding-title">
          <h4>{title}</h4>
          <code>{column}</code>
        </div>
      </div>

      <div className="ing-finding-count">
        <strong>{count == null ? "—" : Number(count).toLocaleString()}</strong>
        <span>{count === 0 ? "ไม่พบปัญหา" : countLabel}</span>
      </div>

      <dl className="ing-finding-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <LearnMore summary="ทำไมถึงเป็นปัญหา">
        <p className="ing-finding-note">{explanation}</p>
      </LearnMore>

      {expanded && (
        <ul className="ing-samples">
          {samples === undefined ? (
            <li>กำลังโหลด...</li>
          ) : samples.length === 0 ? (
            <li>ไม่พบตัวอย่าง</li>
          ) : (
            samples.map((r, i) => <li key={i}>{renderSample(r)}</li>)
          )}
        </ul>
      )}

      <div className="ing-finding-foot">
        <label>
          <input type="checkbox" checked={selected} onChange={(e) => onToggle(e.target.checked)} />
          <span>ใช้สร้างเกณฑ์</span>
        </label>
        <button type="button" className="ui-btn-link" onClick={onInspect}>
          {expanded ? "ซ่อนตัวอย่าง" : "ดูตัวอย่าง"}
        </button>
      </div>
    </div>
  );
}
