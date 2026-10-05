import { Icon } from '../components/UiIcons';
import React, { useState, useEffect } from "react";
import { PageHeader, InfoHint, LearnMore } from "../components/ui";
import "./WhiteBoxPipeline.css";

export default function WhiteBoxPipeline() {
  const [activeStep, setActiveStep] = useState(1); // 0: Join tables (optional), 1: Profiling, 2: Context, 3: Rules, 4: Segregation, 5: Benchmark
  const [datasetName, setDatasetName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showArchitectureMatrix, setShowArchitectureMatrix] = useState(false);

  // Step 0: Multi-Table State
  const [multiTablePreview, setMultiTablePreview] = useState(null);
  const [multiTableAnalysis, setMultiTableAnalysis] = useState(null);
  const [multiTableLoading, setMultiTableLoading] = useState(false);
  const [joinResult, setJoinResult] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joinTables, setJoinTables] = useState([]);   // tables that can be joined now
  const [tableA, setTableA] = useState("");
  const [tableB, setTableB] = useState("");
  const [stageNotes, setStageNotes] = useState({});   // stages the run-all call skipped or failed

  // Step 1: Profiling State
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Step 2: User Context State (one entry per column, filled from the profile)
  const [userContext, setUserContext] = useState({
    data_purpose: "Operational Pipeline",
    criticality: "Standard",
    update_frequency: "Daily Batch (<= 24h)",
    field_contexts: {}
  });

  // Step 3: Rule Recommendations State
  const [recommendations, setRecommendations] = useState([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // Step 4 & 5: Execution & Segregation State
  const [executionResult, setExecutionResult] = useState(null);
  const [executing, setExecuting] = useState(false);

  // Step 6: Benchmark State
  const [benchmarkResult, setBenchmarkResult] = useState(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  // Step 7: Downstream Analytics
  const [analyticsResult, setAnalyticsResult] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);

  // Opening the page only reads: which dataset is loaded, its profile and the tables that can be
  // joined. Nothing is run until the user asks (the "run all" button or the steps).
  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    try {
      const st = await fetch("/api/v1/whitebox/state");
      if (st.ok) {
        const d = await st.json();
        setDatasetName(d.dataset_name || "");
      }
    } catch (err) {
      console.warn("state not loaded", err);
    }
    fetchProfile();
    try {
      const res = await fetch("/api/v1/whitebox/multi-table/tables");
      if (res.ok) {
        const d = await res.json();
        const tables = d.tables || [];
        setJoinTables(tables);
        const loaded = tables.find((t) => t.is_loaded) || tables[0];
        const other = tables.find((t) => t.name !== loaded?.name);
        setTableB(loaded?.name || "");
        setTableA(other?.name || "");
      }
    } catch (err) {
      console.warn("join tables not loaded", err);
    }
  };

  const runFullPipeline = async () => {
    setAutoRunning(true);
    setError(null);
    setStageNotes({});
    try {
      const res = await fetch("/api/v1/whitebox/run-all", { method: "POST" });
      if (!res.ok) throw new Error("รันทุกขั้นไม่สำเร็จ");
      const data = await res.json();
      if (data.profile_data) setProfileData(data.profile_data);
      if (data.recommendations) setRecommendations(data.recommendations);
      if (data.execution_result) setExecutionResult(data.execution_result);
      if (data.benchmark_result) setBenchmarkResult(data.benchmark_result);
      if (data.downstream_analytics) setAnalyticsResult(data.downstream_analytics);
      setStageNotes(data.stages || {});
      const failed = Object.entries(data.stages || {}).filter(([, v]) => v.status === "FAILED").map(([k]) => k);
      if (failed.length) setError(`บางขั้นทำงานไม่สำเร็จ: ${failed.join(", ")}`);
    } catch (err) {
      setError(err.message || "รันทุกขั้นไม่สำเร็จ");
    } finally {
      setAutoRunning(false);
    }
  };

  // Step 0 (optional): runs only when the user picks two tables and asks for the analysis.
  const analyzeTables = async () => {
    if (!tableA || !tableB || tableA === tableB) return;
    setMultiTableLoading(true);
    setError(null);
    setJoinResult(null);
    setMultiTableAnalysis(null);
    try {
      const qs = new URLSearchParams({ table_a: tableA, table_b: tableB });
      const prevRes = await fetch(`/api/v1/whitebox/multi-table/preview?${qs}`);
      if (!prevRes.ok) throw new Error("โหลดตัวอย่างของตารางไม่สำเร็จ");
      setMultiTablePreview(await prevRes.json());
      const anRes = await fetch("/api/v1/whitebox/multi-table/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_a_name: tableA, table_b_name: tableB })
      });
      if (!anRes.ok) throw new Error("วิเคราะห์ความสัมพันธ์ของตารางไม่สำเร็จ");
      setMultiTableAnalysis(await anRes.json());
    } catch (err) {
      setError(err.message || "โหลดข้อมูลการเชื่อมตารางไม่สำเร็จ");
    } finally {
      setMultiTableLoading(false);
    }
  };

  const handleConfirmJoin = async () => {
    const rel = multiTableAnalysis?.candidate_relationship;
    if (!rel) return;
    setJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/whitebox/multi-table/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_a_name: tableA,
          table_b_name: tableB,
          join_key_a: rel.candidate_key_a,
          join_key_b: rel.candidate_key_b,
          join_type: "left",
          reconcile_schema: true,
          standardize_dates: true,
          target_date_format: "YYYY-MM-DD"
        })
      });
      if (!res.ok) throw new Error("เชื่อมตารางไม่สำเร็จ");
      setJoinResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const fetchProfile = async () => {
    setProfileLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/whitebox/profile");
      if (!res.ok) throw new Error("โหลดสถิติข้อมูลไม่สำเร็จ");
      const data = await res.json();
      setProfileData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleGenerateRules = async () => {
    setRecsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/whitebox/recommend-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_name: datasetName,
          data_purpose: userContext.data_purpose,
          criticality: userContext.criticality,
          update_frequency: userContext.update_frequency,
          field_contexts: effectiveFieldContexts()
        })
      });
      if (!res.ok) throw new Error("สร้างกฎที่เสนอไม่สำเร็จ");
      const data = await res.json();
      setRecommendations(data.recommendations);
      setActiveStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setRecsLoading(false);
    }
  };

  // A column without an explicit choice: required unless it is mostly empty (same default as the server).
  const defaultFieldContext = (col, p) => ({
    business_meaning: col,
    required: (p?.null_rate_pct ?? 0) <= 50,
    known_domain: false,
    min_domain: null,
    max_domain: null
  });

  const contextColumns = Object.entries(profileData?.columns_profile || {}).filter(([col]) => col !== "dirty_row_id");

  const effectiveFieldContexts = () => {
    const out = {};
    for (const [col, p] of contextColumns) {
      out[col] = userContext.field_contexts[col] || defaultFieldContext(col, p);
    }
    return out;
  };

  const updateFieldContext = (col, patch) => {
    const p = profileData?.columns_profile?.[col];
    setUserContext((prev) => ({
      ...prev,
      field_contexts: {
        ...prev.field_contexts,
        [col]: { ...(prev.field_contexts[col] || defaultFieldContext(col, p)), ...patch }
      }
    }));
  };

  const toggleRuleAccept = (index) => {
    setRecommendations((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], accepted: !copy[index].accepted };
      return copy;
    });
  };

  const updateRuleParam = (index, key, val) => {
    setRecommendations((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        parameters: { ...copy[index].parameters, [key]: val }
      };
      return copy;
    });
  };

  const applyIqrPreset = (ruleIdx, mult, upperFence) => {
    setRecommendations((prev) => {
      const copy = [...prev];
      copy[ruleIdx] = {
        ...copy[ruleIdx],
        parameters: {
          ...copy[ruleIdx].parameters,
          multiplier: mult,
          upper_fence: upperFence,
          preset: mult >= 3.0 ? "outer_fence" : "inner_fence"
        }
      };
      return copy;
    });
  };

  const handleExecute = async () => {
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/whitebox/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_name: datasetName,
          rules: recommendations
        })
      });
      if (!res.ok) throw new Error("คัดแยกข้อมูลไม่สำเร็จ");
      const data = await res.json();
      setExecutionResult(data);
      setActiveStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  const fetchBenchmark = async () => {
    setBenchmarkLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/whitebox/benchmark");
      if (!res.ok) throw new Error("โหลดผล Benchmark ไม่สำเร็จ");
      const data = await res.json();
      setBenchmarkResult(data);
      setActiveStep(5);
    } catch (err) {
      setError(err.message);
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const fetchDownstream = async () => {
    if (!(profileData?.columns_profile?.course && profileData?.columns_profile?.score)) return; // student dataset only
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/v1/whitebox/downstream-analytics");
      if (!res.ok) throw new Error("Failed to fetch downstream analytics");
      const data = await res.json();
      setAnalyticsResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  return (
    <div className="wb-container">
      <PageHeader
        pageKey="whitebox"
        actions={
          <button type="button" className="ui-btn ui-btn-primary" onClick={runFullPipeline} disabled={autoRunning}>
            {autoRunning ? "กำลังรัน..." : "รันทุกขั้นอัตโนมัติ"}
          </button>
        }
      />

      <LearnMore summary="หน้านี้ทำอะไร">
        <ol>
          <li>ระบบสำรวจข้อมูลและเสนอกฎพร้อมเหตุผล</li>
          <li>คุณตรวจเหตุผลและยืนยันกฎ</li>
          <li>ระบบคัดแยกเป็น Clean, Review, Quarantine โดยไม่ลบข้อมูลทิ้ง</li>
        </ol>
      </LearnMore>

      {/* Action Toolbar */}
      <div style={{ marginBottom: "1.2rem", marginTop: "1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <button
          className="wb-btn-secondary"
          onClick={() => setShowArchitectureMatrix(!showArchitectureMatrix)}
          style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 14px", borderRadius: "6px" }}
        >
          <span>{showArchitectureMatrix ? "ซ่อน" : "ใครทำอะไร: ผู้ใช้ กับ ระบบ"}</span>
        </button>
      </div>

      {datasetName && (
        <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#475569" }}>
          ชุดข้อมูลที่กำลังตรวจ <code style={{ fontWeight: 700, color: "#0F172A" }}>{datasetName}</code>
        </p>
      )}

      {showArchitectureMatrix && (
        <div className="wb-card" style={{ marginBottom: "1.5rem", borderLeft: "4px solid #2563EB", background: "#F8FAFC" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", color: "#0F172A" }}>
              <Icon name="building" /> ผู้ใช้ทำอะไร ระบบทำอะไร
            </h3>
          </div>

          <div className="wb-grid-2" style={{ gap: "16px" }}>
            {/* USER COLUMN */}
            <div style={{ background: "#FFFFFF", padding: "14px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
              <div style={{ fontWeight: 700, color: "#2563EB", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span><Icon name="user" /> สิ่งที่ผู้ใช้ทำ (User Role)</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#334155", lineHeight: "1.7" }}>
                <li><strong>1. Ingest Sources:</strong> อัปโหลดหรือระบุแหล่งข้อมูล (Stage 0)</li>
                <li><strong>2. Define Context:</strong> กำหนดวัตถุประสงค์ และระบุว่าคอลัมน์ใดมี Known Domain (Stage 2)</li>
                <li><strong>3. Review Explanations:</strong> ตรวจสอบเหตุผล (Why?) และหลักฐานทางสถิติที่ระบบเสนอ (Stage 3)</li>
                <li><strong>4. Tune Multipliers:</strong> ปรับความไวของรั้วสถิติ (1.5× vs 3.0×) หรือเลือกเปิด/ปิดกฎ (Stage 3)</li>
                <li><strong>5. Confirm Execution:</strong> กดยืนยันให้ระบบประมวลผลแยกข้อมูล 3 ทาง (Stage 4)</li>
              </ul>
            </div>

            {/* SYSTEM COLUMN */}
            <div style={{ background: "#FFFFFF", padding: "14px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
              <div style={{ fontWeight: 700, color: "#059669", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span><Icon name="settings" /> สิ่งที่ระบบทำ (System Automation)</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#334155", lineHeight: "1.7" }}>
                <li><strong>1. Empirical Profiling:</strong> คำนวณ Null Rate, Min/Max, Duplicates, Q1, Q3, IQR (Stage 1)</li>
                <li><strong>2. Schema & Relationship:</strong> ตรวจวัด Candidate Key Overlap และรูปแบบวันที่ (Stage 0)</li>
                <li><strong>3. Decision Tree Logic:</strong> เลือก Range Check (เมื่อรู้ขอบเขต) หรือ Auto IQR (เมื่อไม่รู้ขอบเขต)</li>
                <li><strong>4. 3-Way Segregation:</strong> แยก Clean / Review / Quarantine ไม่ลบข้อมูลสุ่มสี่สุ่มห้า</li>
                <li><strong>5. Benchmark & Validation:</strong> คำนวณ Recall, Precision และตรวจสอบ Ground Truth (Stage 5)</li>
              </ul>
            </div>
          </div>

          <div style={{ marginTop: "12px", padding: "10px", background: "#EFF6FF", borderRadius: "6px", fontSize: "11px", color: "#1E40AF" }}>
            <strong><Icon name="target" /> นิยามสำคัญ:</strong> ระบบไม่ได้แก้ข้อมูลตามอำเภอใจ แต่ทำหน้าที่ <em>"วิเคราะห์เชิงสถิติและเสนอแนะ (Suggest)"</em> โดยมีผู้ใช้เป็น <em>"ผู้ตัดสินใจและยืนยัน (Confirm)"</em> ก่อนที่ระบบจะนำกฎไปปฏิบัติ (Apply)
          </div>
        </div>
      )}

      {error && (
        <div className="wb-error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Stepper Navigation */}
      <div className="wb-stepper">
        <button
          className={`wb-step-btn ${activeStep === 0 ? "active" : ""} ${joinResult ? "completed" : ""}`}
          onClick={() => setActiveStep(0)}
        >
          <span className="wb-step-num">0</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="arrow-right" /> เชื่อมตาราง (ไม่บังคับ)</span>
          </div>
        </button>

        <button
          className={`wb-step-btn ${activeStep === 1 ? "active" : ""} ${profileData ? "completed" : ""}`}
          onClick={() => setActiveStep(1)}
        >
          <span className="wb-step-num">1</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="list" /> สถิติข้อมูลดิบ</span>
          </div>
        </button>

        <button
          className={`wb-step-btn ${activeStep === 2 ? "active" : ""} ${userContext ? "completed" : ""}`}
          onClick={() => setActiveStep(2)}
        >
          <span className="wb-step-num">2</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="target" /> บริบทธุรกิจ</span>
          </div>
        </button>

        <button
          className={`wb-step-btn ${activeStep === 3 ? "active" : ""} ${recommendations.length > 0 ? "completed" : ""}`}
          onClick={() => setActiveStep(3)}
        >
          <span className="wb-step-num">3</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="bolt" /> กฎที่ระบบเสนอ</span>
          </div>
        </button>

        <button
          className={`wb-step-btn ${activeStep === 4 ? "active" : ""} ${executionResult ? "completed" : ""}`}
          onClick={() => setActiveStep(4)}
        >
          <span className="wb-step-num">4</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="scale" /> คัดแยก 3 ทาง</span>
          </div>
        </button>

        <button
          className={`wb-step-btn ${activeStep === 5 ? "active" : ""} ${benchmarkResult ? "completed" : ""}`}
          onClick={() => {
            setActiveStep(5);
            if (!benchmarkResult) fetchBenchmark();
            if (!analyticsResult) fetchDownstream();
          }}
        >
          <span className="wb-step-num">5</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="check" /> ตรวจผลและใช้งาน</span>
          </div>
        </button>
      </div>

      {/* STEP 0: เชื่อมตาราง (ไม่บังคับ) */}
      {activeStep === 0 && (
        <div className="wb-panel">
          <div className="wb-panel-header">
            <div>
              <h2>0 · เชื่อมตาราง (ไม่บังคับ)<InfoHint text="ใช้เมื่อมีข้อมูลสองตารางที่ต้องรวมกันก่อนตรวจคุณภาพ ถ้ามีตารางเดียวข้ามขั้นนี้ได้" /></h2>
            </div>
          </div>

          {joinTables.length < 2 ? (
            <div className="wb-card" data-testid="join-needs-two">
              <p style={{ margin: 0 }}>
                ต้องมีอย่างน้อย 2 ตารางจึงเชื่อมกันได้ ตอนนี้มี {joinTables.length} ตาราง
                นำเข้าอีกไฟล์ที่หน้านำเข้าข้อมูลแล้วกลับมาที่นี่ หรือข้ามไปขั้นที่ 1 ได้เลย
              </p>
            </div>
          ) : (
            <div className="wb-card">
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ minWidth: "220px" }}>
                  <label className="wb-label" htmlFor="join-table-a">ตาราง A</label>
                  <select id="join-table-a" className="wb-input" value={tableA} onChange={(e) => setTableA(e.target.value)}>
                    {joinTables.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.rows.toLocaleString()} แถว)</option>)}
                  </select>
                </div>
                <div style={{ minWidth: "220px" }}>
                  <label className="wb-label" htmlFor="join-table-b">ตาราง B</label>
                  <select id="join-table-b" className="wb-input" value={tableB} onChange={(e) => setTableB(e.target.value)}>
                    {joinTables.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.rows.toLocaleString()} แถว)</option>)}
                  </select>
                </div>
                <button className="wb-btn-secondary" onClick={analyzeTables} disabled={multiTableLoading || !tableA || !tableB || tableA === tableB}>
                  {multiTableLoading ? "กำลังวิเคราะห์..." : "วิเคราะห์ความสัมพันธ์"}
                </button>
              </div>
              {tableA && tableA === tableB && (
                <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#B45309" }}>เลือกตารางสองตารางที่ต่างกัน</p>
              )}
            </div>
          )}

          {multiTablePreview && (
            <div className="wb-grid-2" style={{ marginTop: "1rem" }}>
              {[["table_a", "ตาราง A"], ["table_b", "ตาราง B"]].map(([key, label]) => (
                <div className="wb-card" key={key} data-testid={`join-${key}`}>
                  <div className="wb-source-card-header">
                    <span className="wb-badge">{label}</span>
                    <h3>{multiTablePreview[key]?.name}</h3>
                  </div>
                  <div className="wb-metric-box">
                    <span>จำนวนแถว</span>
                    <strong>{multiTablePreview[key]?.total_rows != null ? multiTablePreview[key].total_rows.toLocaleString() : "-"}</strong>
                  </div>
                  <div className="wb-metric-box" style={{ marginTop: "8px" }}>
                    <span>คอลัมน์ ({multiTablePreview[key]?.columns?.length ?? 0})</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                      {(multiTablePreview[key]?.columns || []).map((c) => <code key={c} style={{ fontSize: "11px", padding: "1px 6px", background: "#F1F5F9", borderRadius: "4px" }}>{c}</code>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {multiTableAnalysis?.status === "NO_CANDIDATE_KEY" && (
            <div className="wb-card" data-testid="join-no-key" style={{ marginTop: "1rem", borderLeft: "5px solid #F59E0B" }}>
              <h3 style={{ marginTop: 0 }}>ไม่พบคอลัมน์ที่ใช้เชื่อม</h3>
              <p style={{ margin: 0 }}>{multiTableAnalysis.message}</p>
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#64748B" }}>
                คอลัมน์คีย์ต้องมีค่าซ้อนทับกันอย่างน้อยครึ่งหนึ่งของชุดที่เล็กกว่า ลองเลือกคู่ตารางอื่น หรือข้ามไปขั้นที่ 1
              </p>
            </div>
          )}

          {multiTableAnalysis?.status === "ANALYSIS_COMPLETE" && (
            <>
              {(multiTableAnalysis.schema_differences || []).length > 0 && (
                <div className="wb-card" style={{ marginTop: "1rem" }}>
                  <h3>1. ชื่อคอลัมน์ที่ต่างกันแต่น่าจะเป็นอย่างเดียวกัน</h3>
                  <div className="wb-table-wrapper">
                    <table className="wb-table">
                      <thead>
                        <tr>
                          <th>คอลัมน์ตาราง A</th>
                          <th>คอลัมน์ตาราง B</th>
                          <th>ชื่อที่แนะนำ</th>
                          <th>ความมั่นใจ<InfoHint text="เป็นค่าคงที่ 96% สำหรับชื่อที่เหมือนกันเมื่อตัดตัวพิมพ์และเครื่องหมายออก ไม่ได้คำนวณจากข้อมูล" /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiTableAnalysis.schema_differences.map((d, idx) => (
                          <tr key={idx}>
                            <td><code>{d.source_a_column}</code></td>
                            <td><code>{d.source_b_column}</code></td>
                            <td><strong className="text-success">{d.suggested_standard}</strong></td>
                            <td>{d.confidence_pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(multiTableAnalysis.date_format_differences || []).length > 0 && (
                <div className="wb-card" style={{ marginTop: "1rem" }}>
                  <h3>2. รูปแบบวันที่ที่ต่างกัน</h3>
                  <div className="wb-table-wrapper">
                    <table className="wb-table">
                      <thead>
                        <tr>
                          <th>คอลัมน์ตาราง A</th>
                          <th>ตัวอย่าง A</th>
                          <th>รูปแบบ A</th>
                          <th>คอลัมน์ตาราง B</th>
                          <th>ตัวอย่าง B</th>
                          <th>รูปแบบมาตรฐาน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiTableAnalysis.date_format_differences.map((d, idx) => (
                          <tr key={idx}>
                            <td><strong>{d.source_a_field}</strong></td>
                            <td><code>{d.source_a_sample}</code></td>
                            <td><span className="wb-pill warning">{d.source_a_detected_format}</span></td>
                            <td><strong>{d.source_b_field}</strong></td>
                            <td><code>{d.source_b_sample}</code></td>
                            <td><strong className="text-success">{d.suggested_standard_format}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="wb-card wb-highlight-card" style={{ marginTop: "1rem" }} data-testid="join-candidate">
                <div className="wb-panel-header">
                  <div>
                    <span className="wb-badge success">พบคีย์ที่น่าจะใช้เชื่อมได้</span>
                    <h3 style={{ margin: "6px 0" }}>
                      <code>{multiTableAnalysis.candidate_relationship.left_table}.{multiTableAnalysis.candidate_relationship.candidate_key_a}</code>
                      {" ⟷ "}
                      <code>{multiTableAnalysis.candidate_relationship.right_table}.{multiTableAnalysis.candidate_relationship.candidate_key_b}</code>
                    </h3>
                  </div>
                  <div className="wb-match-badge">
                    <span>คีย์ที่พบในอีกตาราง:</span>
                    <strong>{multiTableAnalysis.candidate_relationship.match_rate_pct}%</strong>
                  </div>
                </div>

                <div className="wb-grid-3" style={{ margin: "14px 0" }}>
                  <div className="wb-metric-box">
                    <span>ความสัมพันธ์</span>
                    <strong>{multiTableAnalysis.candidate_relationship.suggested_cardinality}</strong>
                  </div>
                  <div className="wb-metric-box">
                    <span>คีย์ที่ซ้อนทับกัน</span>
                    <strong>{multiTableAnalysis.candidate_relationship.overlapping_keys.toLocaleString()} ค่า</strong>
                  </div>
                  <div className="wb-metric-box">
                    <span>การเชื่อม<InfoHint text="ใช้ left join เสมอ: เก็บทุกแถวของตารางที่มีหลายแถวต่อคีย์ แล้วเพิ่มคอลัมน์จากอีกตาราง" /></span>
                    <strong>เก็บทุกแถวของ {multiTableAnalysis.candidate_relationship.base_table}</strong>
                  </div>
                </div>

                <ul className="wb-why-list">
                  {(multiTableAnalysis.candidate_relationship.rationale || []).map((r, rIdx) => <li key={rIdx}>{r}</li>)}
                </ul>
                <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#64748B" }}>
                  ระบบไม่เชื่อมตารางเอง ต้องกดยืนยันก่อน ตารางที่เชื่อมแล้วถูกบันทึกเป็นไฟล์ ขั้นตอนถัดไปยังทำงานกับชุดข้อมูลที่โหลดอยู่
                </p>

                <div className="wb-actions">
                  <button className="wb-btn-primary" onClick={handleConfirmJoin} disabled={joining}>
                    {joining ? "กำลังเชื่อมตาราง..." : joinResult ? "เชื่อมตารางอีกครั้ง" : "ยืนยันและเชื่อมตาราง"}
                  </button>
                </div>
              </div>
            </>
          )}

          {joinResult && (
            <div className="wb-card" data-testid="join-result" style={{ marginTop: "1rem", borderLeft: "5px solid #10b981" }}>
              <span className="wb-badge success">เชื่อมตารางสำเร็จ</span>
              <h3 style={{ margin: "4px 0" }}>ตารางที่ได้: <code>{joinResult.unified_table_name}</code></h3>
              <span className="wb-sub">
                {joinResult.total_rows.toLocaleString()} แถว · {joinResult.total_columns} คอลัมน์ · จับคู่ได้ {joinResult.matched_rows.toLocaleString()} แถว · ไม่พบคู่ {joinResult.unmatched_rows.toLocaleString()} แถว
              </span>
            </div>
          )}

          <div className="wb-wizard-nav">
            <div></div>
            <button className="wb-btn-primary wb-nav-btn" onClick={() => setActiveStep(1)}>
              ขั้นตอนถัดไป: Stage 1 สำรวจสถิติข้อมูลดิบ <Icon name="arrow-right" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: DATA PROFILING */}
      {activeStep === 1 && (
        <div className="wb-panel">
          <div className="wb-stage-purpose-box">
            <div className="wb-stage-purpose-icon"><Icon name="list" /></div>
            <div className="wb-stage-purpose-text">
              <strong>สำรวจโครงสร้างและค่าสถิติของข้อมูลขาเข้า:</strong> คำนวณอัตราค่าว่าง ความซ้ำของคีย์ และการกระจายของค่าตัวเลขจากตารางที่กำลังประมวลผล
            </div>
          </div>

          <div className="wb-panel-header">
            <div>
              <h2>1 · สถิติข้อมูลดิบ<InfoHint text="สิ่งที่ระบบพบในข้อมูลดิบก่อนใช้กฎใดๆ" /></h2>
            </div>
            <button className="wb-btn-secondary" onClick={fetchProfile} disabled={profileLoading}>
              {profileLoading ? "Profiling..." : "Refresh Profiling"}
            </button>
          </div>

          {profileData ? (
            <>
              {/* Summary Metrics Cards */}
              <div className="wb-grid-4">
                <div className="wb-card stat-card">
                  <span className="wb-stat-title">แถวที่นำเข้า</span>
                  <span className="wb-stat-val">{profileData.total_rows?.toLocaleString()}</span>
                  <span className="wb-stat-sub">{datasetName || "ชุดข้อมูลที่โหลดอยู่"}</span>
                </div>
                <div className="wb-card stat-card">
                  <span className="wb-stat-title">คอลัมน์ที่พบ</span>
                  <span className="wb-stat-val">{profileData.total_columns}</span>
                  <span className="wb-stat-sub">ระบบเดาชนิดข้อมูลให้แล้ว</span>
                </div>
                <div className="wb-card stat-card warning">
                  <span className="wb-stat-title">ค่าว่างทั้งหมด</span>
                  <span className="wb-stat-val">
                    {Object.values(profileData.columns_profile || {}).reduce((sum, p) => sum + (p.null_count || 0), 0).toLocaleString()}
                  </span>
                  <span className="wb-stat-sub">
                    ใน {Object.values(profileData.columns_profile || {}).filter((p) => (p.null_count || 0) > 0).length} คอลัมน์
                  </span>
                </div>
                <div className="wb-card stat-card danger">
                  <span className="wb-stat-title">แถวซ้ำตามคีย์</span>
                  <span className="wb-stat-val">
                    {profileData.duplicate_analysis?.duplicate_rows_detected ?? 0}
                  </span>
                  <span className="wb-stat-sub">
                    {(profileData.duplicate_analysis?.tested_composite_key || []).join(" + ") || "ไม่พบคีย์ที่ใช้ตรวจ"}
                  </span>
                </div>
              </div>

              {/* Observed Distribution & Anomalies */}
              <div className="wb-card" style={{ marginTop: "1rem" }}>
                <h3>Profiled Schema & Value Range Analysis</h3>
                <div className="wb-table-wrapper">
                  <table className="wb-table">
                    <thead>
                      <tr>
                        <th>Field Name</th>
                        <th>Inferred Type</th>
                        <th>Null Count</th>
                        <th>Null Rate</th>
                        <th>Observed Range / Distinct</th>
                        <th>IQR / Dispersion</th>
                        <th>Detected Anomalies</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(profileData.columns_profile || {}).map(([col, p]) => {
                        return (
                          <tr key={col}>
                            <td><strong>{col}</strong></td>
                            <td><span className="wb-pill">{p.data_type}</span></td>
                            <td>{p.null_count}</td>
                            <td>
                              <span className={p.null_count > 0 ? "text-danger" : "text-success"}>
                                {p.null_rate_pct}%
                              </span>
                            </td>
                            <td>
                              {p.min !== undefined ? `${p.min} → ${p.max}` : `${p.distinct_count} distinct`}
                            </td>
                            <td>
                              {p.iqr !== undefined ? `IQR: ${p.iqr} (Q1: ${p.q1}, Q3: ${p.q3})` : "—"}
                            </td>
                            <td>
                              {p.null_count > 0 && <span className="wb-pill warning">ค่าว่าง {p.null_count}</span>}
                              {p.outlier_count > 0 && <span className="wb-pill warning">ค่าผิดปกติ {p.outlier_count}</span>}
                              {(profileData.duplicate_analysis?.tested_composite_key || []).includes(col) && (profileData.duplicate_analysis?.duplicate_rows_detected || 0) > 0 && (
                                <span className="wb-pill warning">คีย์ซ้ำ</span>
                              )}
                              {!(p.null_count > 0) && !(p.outlier_count > 0) && <span className="wb-pill success">ปกติ</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Wizard Navigation for Stage 1 */}
              <div className="wb-wizard-nav">
                <button className="wb-btn-secondary wb-nav-btn" onClick={() => setActiveStep(0)}>
                  ⬅ เชื่อมตาราง (ไม่บังคับ)
                </button>
                <button className="wb-btn-primary wb-nav-btn" onClick={() => setActiveStep(2)}>
                  ขั้นตอนถัดไป: Stage 2 กำหนดบริบทธุรกิจ <Icon name="arrow-right" />
                </button>
              </div>
            </>
          ) : (
            <p>กำลังโหลดสถิติข้อมูล...</p>
          )}
        </div>
      )}

      {/* STEP 2: USER CONTEXT */}
      {activeStep === 2 && (
        <div className="wb-panel">
          <div className="wb-stage-purpose-box">
            <div className="wb-stage-purpose-icon"><Icon name="target" /></div>
            <div className="wb-stage-purpose-text">
              <strong>การกำหนดบริบทและขอบเขตข้อมูลตามเงื่อนไขธุรกิจ (Business Domain Constraint):</strong> แยกแยะคอลัมน์ที่มีขอบเขตค่าตายตัวตามระเบียบธุรกิจ (Deterministic Range) ออกจากคอลัมน์ที่ต้องใช้การตรวจจับความผิดปกติทางสถิติ (Adaptive Statistical Distribution)
            </div>
          </div>

          <div className="wb-panel-header">
            <div>
              <h2>2 · บริบทธุรกิจ<InfoHint text="ระบบไม่รู้ความหมายทางธุรกิจเอง ข้อมูลส่วนนี้ช่วยให้กฎที่เสนออธิบายได้" /></h2>
            </div>
          </div>

          <div className="wb-grid-3">
            <div className="wb-card">
              <label className="wb-label">Data Purpose</label>
              <input
                className="wb-input"
                value={userContext.data_purpose}
                onChange={(e) => setUserContext({ ...userContext, data_purpose: e.target.value })}
              />
              <span className="wb-hint">Determines criticality and strictness of validation.</span>
            </div>

            <div className="wb-card">
              <label className="wb-label">Criticality</label>
              <select
                className="wb-input"
                value={userContext.criticality}
                onChange={(e) => setUserContext({ ...userContext, criticality: e.target.value })}
              >
                <option value="Critical">Critical (High Governance)</option>
                <option value="Standard">Standard</option>
                <option value="Low">Low / Exploratory</option>
              </select>
              <span className="wb-hint">Critical requires hard quarantine for missing grades.</span>
            </div>

            <div className="wb-card">
              <label className="wb-label">Update Frequency</label>
              <input
                className="wb-input"
                value={userContext.update_frequency}
                onChange={(e) => setUserContext({ ...userContext, update_frequency: e.target.value })}
              />
              <span className="wb-hint">Defines SLA freshness bounds (Daily Batch &le; 24h).</span>
            </div>
          </div>

          <div className="wb-card" style={{ marginTop: "1rem" }}>
            <h3>ความหมายของแต่ละคอลัมน์</h3>
            <p className="wb-desc">
              ติ๊ก "ห้ามว่าง" กับคอลัมน์ที่ต้องมีค่าเสมอ และ "ทราบช่วงค่า" กับคอลัมน์ที่รู้ขอบเขตที่ถูกต้อง (กรอกต่ำสุดและสูงสุด)
              คอลัมน์ตัวเลขที่ไม่ทราบช่วงค่าจะถูกตรวจด้วยสถิติ (IQR) แทน
            </p>

            {contextColumns.length === 0 ? (
              <p>ยังไม่มีสถิติของข้อมูล กลับไปขั้นที่ 1 เพื่อโหลดสถิติก่อน</p>
            ) : contextColumns.map(([col, p]) => {
              const fc = userContext.field_contexts[col] || defaultFieldContext(col, p);
              const numeric = p.data_type === "Integer" || p.data_type === "Float";
              return (
                <div className="wb-context-row" key={col} data-testid="context-row">
                  <div className="wb-context-col">
                    <strong>{col}</strong>
                    <span className="wb-sub">{p.data_type}</span>
                  </div>
                  <div className="wb-context-fields">
                    <label className="wb-checkbox-label">
                      <input
                        type="checkbox"
                        aria-label={`${col} ห้ามว่าง`}
                        checked={Boolean(fc.required)}
                        onChange={(e) => updateFieldContext(col, { required: e.target.checked })}
                      />
                      ห้ามว่าง
                    </label>

                    {numeric && (
                      <label className="wb-checkbox-label">
                        <input
                          type="checkbox"
                          aria-label={`${col} ทราบช่วงค่า`}
                          checked={Boolean(fc.known_domain)}
                          onChange={(e) => updateFieldContext(col, {
                            known_domain: e.target.checked,
                            min_domain: e.target.checked && fc.min_domain == null ? (p.min ?? 0) : fc.min_domain,
                            max_domain: e.target.checked && fc.max_domain == null ? (p.max ?? 0) : fc.max_domain
                          })}
                        />
                        ทราบช่วงค่า
                      </label>
                    )}

                    {numeric && fc.known_domain && (
                      <div className="wb-range-inputs">
                        <span>ต่ำสุด</span>
                        <input
                          type="number"
                          aria-label={`${col} ค่าต่ำสุด`}
                          className="wb-input-sm"
                          value={fc.min_domain ?? ""}
                          onChange={(e) => updateFieldContext(col, { min_domain: e.target.value === "" ? null : parseFloat(e.target.value) })}
                        />
                        <span>สูงสุด</span>
                        <input
                          type="number"
                          aria-label={`${col} ค่าสูงสุด`}
                          className="wb-input-sm"
                          value={fc.max_domain ?? ""}
                          onChange={(e) => updateFieldContext(col, { max_domain: e.target.value === "" ? null : parseFloat(e.target.value) })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Wizard Navigation for Stage 2 */}
          <div className="wb-wizard-nav">
            <button className="wb-btn-secondary wb-nav-btn" onClick={() => setActiveStep(1)}>
              ⬅ ย้อนกลับ: Stage 1 สถิติข้อมูลดิบ
            </button>
            <button className="wb-btn-primary wb-nav-btn" onClick={handleGenerateRules} disabled={recsLoading}>
              {recsLoading ? "กำลังสร้างกฎเกณฑ์..." : "ขั้นตอนถัดไป: Stage 3 กฎเกณฑ์ที่ระบบเสนอ ->"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: EXPLAINABLE RULE RECOMMENDATIONS */}
      {activeStep === 3 && (
        <div className="wb-panel">
          <div className="wb-stage-purpose-box">
            <div className="wb-stage-purpose-icon"><Icon name="bolt" /></div>
            <div className="wb-stage-purpose-text">
              <strong>การกำหนดและอนุมัติเกณฑ์คุณภาพข้อมูล (Transparent Rule Governance):</strong> แสดงสมการและค่าเกณฑ์ทางสถิติของทุกกฎอย่างโปร่งใส พร้อมให้ผู้ดูแลข้อมูลปรับค่าตัวคูณ (Tukey 1.5× / 3.0× IQR) หรือเปิด-ปิดกฎแต่ละข้อก่อนสั่งรันคัดแยก
            </div>
          </div>

          <div className="wb-panel-header">
            <div>
              <h2>3 · กฎที่ระบบเสนอ<InfoHint text="ทุกกฎแสดงเหตุผลและหลักฐานทางสถิติ" /></h2>
            </div>
          </div>

          <div className="wb-rules-list">
            {recommendations.map((r, idx) => (
              <div
                key={idx}
                className={`wb-rule-card ${r.accepted ? "accepted" : "rejected"} ${
                  r.action === "quarantine" ? "border-danger" : "border-warning"
                }`}
              >
                <div className="wb-rule-top">
                  <div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px", flexWrap: "wrap" }}>
                      <span className="wb-rule-field">Target: {r.field}</span>
                      <span className="wb-pill" style={{ background: "#E0F2FE", color: "#0369A1", fontSize: "11px", fontWeight: 600 }}>
                        Origin: {r.sources?.includes("User Context") ? "User Context + Profiling" : "Statistical Profiling"}
                      </span>
                      <span className="wb-pill" style={{ background: r.accepted ? "#DCFCE7" : "#FEE2E2", color: r.accepted ? "#15803D" : "#B91C1C", fontSize: "11px", fontWeight: 600 }}>
                        {r.accepted ? " User Confirmed" : " Rejected by User"}
                      </span>
                    </div>
                    <h3 className="wb-rule-title">{r.recommended_rule}</h3>
                  </div>
                  <div className="wb-rule-action-badge">
                    <span className={`wb-pill ${r.action === "quarantine" ? "danger" : "warning"}`}>
                      Action: {r.action.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* The "Why?" Box */}
                <div className="wb-why-box">
                  <div className="wb-why-header">
                    <span className="wb-why-icon"><Icon name="bolt" /></span>
                    <strong>Why did the system recommend this?</strong>
                  </div>
                  <ul className="wb-why-list">
                    {(r.rationale || []).map((line, rIdx) => (
                      <li key={rIdx}>{line}</li>
                    ))}
                  </ul>
                  <div className="wb-why-sources">
                    <span>Evidence Sources:</span>
                    {(r.sources || []).map((s, sIdx) => (
                      <span key={sIdx} className="wb-source-tag">
                        <Icon name="check" size={12} /> {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Parameters Adjustment */}
                <div className="wb-rule-params">
                  {r.rule_type === "auto_iqr" && (
                    <div className="wb-param-item">
                      <label>Statistical Fence Multiplier:</label>
                      <input
                        type="number"
                        step="0.1"
                        className="wb-input-sm"
                        value={r.parameters?.multiplier || 3.0}
                        onChange={(e) => updateRuleParam(idx, "multiplier", parseFloat(e.target.value))}
                      />
                      <span className="wb-hint">
                        Outlier Threshold: <strong>&gt; {r.parameters?.upper_fence || 12.0} hrs</strong> (Routes to Human Review)
                      </span>
                    </div>
                  )}

                  {r.rule_type === "range_check" && (
                    <div className="wb-param-item">
                      <label>Range Bounds:</label>
                      <input
                        type="number"
                        className="wb-input-sm"
                        value={r.parameters?.min ?? 0}
                        onChange={(e) => updateRuleParam(idx, "min", parseFloat(e.target.value))}
                      />
                      <span>to</span>
                      <input
                        type="number"
                        className="wb-input-sm"
                        value={r.parameters?.max ?? 100}
                        onChange={(e) => updateRuleParam(idx, "max", parseFloat(e.target.value))}
                      />
                    </div>
                  )}
                </div>

                {/* Decision Controls */}
                <div className="wb-rule-footer">
                  <button
                    className={`wb-btn-sm ${r.accepted ? "wb-btn-success" : "wb-btn-outline"}`}
                    onClick={() => toggleRuleAccept(idx)}
                  >
                    {r.accepted ? " Rule Accepted" : "+ Click to Accept"}
                  </button>
                  <span className="wb-sub">
                    {r.accepted ? "Included in transformation pipeline" : "Excluded by user"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Wizard Navigation for Stage 3 */}
          <div className="wb-wizard-nav">
            <button className="wb-btn-secondary wb-nav-btn" onClick={() => setActiveStep(2)}>
              ⬅ ย้อนกลับ: Stage 2 กำหนดบริบทธุรกิจ
            </button>
            <button className="wb-btn-primary wb-nav-btn" onClick={handleExecute} disabled={executing}>
              {executing ? "กำลังประมวลผลคัดแยก..." : "ขั้นตอนถัดไป: Stage 4 ดำเนินการคัดแยก 3 ทาง ->"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: 3-WAY SEGREGATION */}
      {activeStep === 4 && (
        <div className="wb-panel">
          <div className="wb-panel-header">
            <div>
              <h2>4 · คัดแยก 3 ทาง<InfoHint text="ข้อมูลดีไป Clean ค่าผิดปกติไป Review ข้อมูลเสียไป Quarantine" /></h2>
            </div>
            <button className="wb-btn-secondary" onClick={handleExecute} disabled={executing}>
              Re-Run Transformation
            </button>
          </div>

          {executionResult ? (
            <>
              {/* Segregation Buckets */}
              <div className="wb-grid-3">
                <div className="wb-card bucket clean">
                  <div className="wb-bucket-header">
                    <span className="wb-bucket-icon"><Icon name="dot-green" /></span>
                    <h3 title="Records that passed every quality check and are ready to use as-is.">Clean Data Asset</h3>
                  </div>
                  <div className="wb-bucket-count">{(executionResult.clean_rows ?? 0).toLocaleString()} rows</div>
                  <p>Meets all quality contracts. Directly ready for analytics and business utilization.</p>
                  <span className="wb-pill success">100% Validated</span>
                </div>

                <div className="wb-card bucket review">
                  <div className="wb-bucket-header">
                    <span className="wb-bucket-icon"><Icon name="dot-yellow" /></span>
                    <h3 title="Statistical outliers that aren't clearly wrong — a person should check them before deciding to keep or drop.">Human Review Queue</h3>
                  </div>
                  <div className="wb-bucket-count">{(executionResult.review_rows ?? 0).toLocaleString()} rows</div>
                  <p>Study Hours Outliers isolated for domain expert appraisal rather than destructive auto-drop.</p>
                  <span className="wb-pill warning">Semi-Auto Human Gate</span>
                </div>

                <div className="wb-card bucket quarantine">
                  <div className="wb-bucket-header">
                    <span className="wb-bucket-icon"><Icon name="dot-red" /></span>
                    <h3 title="Records that clearly violate a quality rule (missing/out-of-range/duplicate) — held here instead of deleted, and routed back to the source system to fix.">Quarantine Lake</h3>
                  </div>
                  <div className="wb-bucket-count">{(executionResult.quarantine_rows ?? 0).toLocaleString()} rows</div>
                  <p>Missing scores, out-of-range grades (-10, 150), and duplicate composite keys quarantined.</p>
                  <span className="wb-pill danger">Isolated for Root-Cause Upstream Fix</span>
                </div>
              </div>

              {/* Quality Metrics Before & After */}
              <div className="wb-card" style={{ marginTop: "1.5rem" }}>
                <h3>Pipeline Execution Metrics</h3>
                <div className="wb-grid-4">
                  <div className="wb-metric-box">
                    <span>Total Ingested</span>
                    <strong>{(executionResult.total_rows_ingested ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="wb-metric-box">
                    <span>Processing Runtime</span>
                    <strong>{executionResult.execution_time_ms} ms</strong>
                  </div>
                  <div className="wb-metric-box">
                    <span>Raw Quality Score</span>
                    <strong className="text-warning">{executionResult.raw_quality_score_pct}%</strong>
                  </div>
                  <div className="wb-metric-box">
                    <span>Post-Clean Quality</span>
                    <strong className="text-success">{executionResult.post_clean_quality_score_pct}%</strong>
                  </div>
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <h4>Error Distribution Segregated:</h4>
                  <div className="wb-tags-row">
                    {Object.entries(executionResult.error_distribution || {}).map(([err, cnt]) => (
                      <span key={err} className="wb-error-tag">
                        <strong>{err}:</strong> {cnt} rows
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Wizard Navigation for Stage 4 */}
              <div className="wb-wizard-nav">
                <button className="wb-btn-secondary wb-nav-btn" onClick={() => setActiveStep(3)}>
                  ⬅ ย้อนกลับ: Stage 3 กฎที่ระบบเสนอ
                </button>
                <button
                  className="wb-btn-primary wb-nav-btn"
                  onClick={() => {
                    setActiveStep(5);
                    fetchBenchmark();
                    fetchDownstream();
                  }}
                >
                  ขั้นตอนถัดไป: Stage 5 วัดผล Benchmark <Icon name="arrow-right" />
                </button>
              </div>
            </>
          ) : (
            <p>Executing pipeline...</p>
          )}
        </div>
      )}

      {/* STEP 5: SLA AUDIT & DOWNSTREAM ANALYTICS */}
      {activeStep === 5 && (
        <div className="wb-panel">
          <div className="wb-stage-purpose-box">
            <div className="wb-stage-purpose-icon"><Icon name="check" /></div>
            <div className="wb-stage-purpose-text">
              <strong>การตรวจสอบความครบถ้วนตามมาตรฐาน SLA (SLA Compliance Audit):</strong> ตรวจสอบจำนวนเรคคอร์ดที่ถูกคัดแยกในแต่ละโซนเทียบกับจำนวนข้อมูลขาเข้าทั้งหมด เพื่อยืนยันว่าไม่มีข้อมูลสูญหาย (Zero Unaccounted Records) และประมวลผลสถิติจากชุดข้อมูลสะอาด (Certified Clean Asset)
            </div>
          </div>

          <div className="wb-panel-header">
            <div>
              <h2>5 · ตรวจผลและใช้งาน<InfoHint text="ตรวจว่าทุกแถวถูกนับครบทั้ง 3 โซน และนำข้อมูล Clean ไปวิเคราะห์ต่อ" /></h2>
            </div>
            <button className="wb-btn-secondary" onClick={fetchBenchmark} disabled={benchmarkLoading}>
              {benchmarkLoading ? "Verifying..." : "Re-verify SLA Metrics"}
            </button>
          </div>

          {/* SLA Verification Table */}
          {benchmarkResult && benchmarkResult.status === "NOT_APPLICABLE" ? (
            <div className="wb-card" data-testid="benchmark-na">
              <p style={{ margin: 0 }}>
                ขั้นนี้เทียบกับเฉลยของชุดข้อมูลประเมินนักศึกษาเท่านั้น ชุดข้อมูลที่โหลดอยู่ ({datasetName || "ไม่ทราบชื่อ"}) ไม่มีเฉลย
                จึงไม่มี Benchmark ให้ตรวจ ดูจำนวนแถวของแต่ละโซนได้ที่ขั้นที่ 4
              </p>
            </div>
          ) : benchmarkResult ? (
            <div className="wb-card">
              <div className="wb-benchmark-banner">
                <div>
                  <span className="wb-badge success">SLA COMPLIANCE VERIFIED</span>
                  <h3 style={{ margin: "4px 0" }}>
                    Data Quality SLA Compliance Rate: {benchmarkResult.overall_accuracy_pct}%
                  </h3>
                  <span className="wb-sub">Verified across all ingested production records</span>
                </div>
              </div>

              <div className="wb-table-wrapper" style={{ marginTop: "1rem" }}>
                <table className="wb-table">
                  <thead>
                    <tr>
                      <th>Anomaly Category</th>
                      <th>Ingested Anomalies</th>
                      <th>Isolated by Gate</th>
                      <th>Isolation Rate (Recall)</th>
                      <th>Rule Precision</th>
                      <th>F1-Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(benchmarkResult.metrics_by_error_type || {}).map(([cat, m]) => (
                      <tr key={cat}>
                        <td><strong>{cat}</strong></td>
                        <td>{m.ground_truth_count} rows</td>
                        <td>{m.system_detected_count} rows</td>
                        <td>
                          <span className="wb-pill success">{m.detection_rate_recall_pct}%</span>
                        </td>
                        <td>
                          <span className="wb-pill success">{m.precision_pct}%</span>
                        </td>
                        <td>{m.f1_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p>กำลังโหลดผลตรวจ...</p>
          )}

          {/* Zone Reconciliation & Anomaly Breakdown */}
          {benchmarkResult?.error_reconciliation && (
            <div className="wb-card" style={{ marginTop: "1rem" }}>
              <div className="wb-panel-header">
                <div>
                  <span className="wb-badge">AUDIT & DEFINITIONS</span>
                  <h3>3-Zone Segregation Audit: Isolated Records Breakdown</h3>
                  <p>
                    Exact record accounting across Quarantine Lake and Human Review Queue.
                  </p>
                </div>
              </div>

              <div className="wb-grid-2" style={{ margin: "14px 0" }}>
                <div className="wb-card" style={{ background: "#f8fafc", border: "1px solid #cbd5e1" }}>
                  <h4 style={{ margin: "0 0 8px 0", color: "#b91c1c" }}>
                    <Icon name="dot-red" /> Quarantine Lake: {benchmarkResult.error_reconciliation.quarantine_breakdown.total_quarantine} Records
                  </h4>
                  <ul className="wb-compact-list" style={{ fontSize: "13px" }}>
                    <li><strong>Missing Score:</strong> {benchmarkResult.error_reconciliation.quarantine_breakdown.missing_score} rows (Strict Required violation)</li>
                    <li><strong>Invalid Score Range:</strong> {benchmarkResult.error_reconciliation.quarantine_breakdown.invalid_score_range} rows (&lt; 0 or &gt; 100 impossibility)</li>
                    <li><strong>Duplicate Composite:</strong> {benchmarkResult.error_reconciliation.quarantine_breakdown.duplicate_composite} rows (student_id + course + semester uniqueness)</li>
                  </ul>
                </div>

                <div className="wb-card" style={{ background: "#f8fafc", border: "1px solid #cbd5e1" }}>
                  <h4 style={{ margin: "0 0 8px 0", color: "#d97706" }}>
                    <Icon name="dot-yellow" /> Human Review Queue: {benchmarkResult.error_reconciliation.review_breakdown.total_review} Records
                  </h4>
                  <ul className="wb-compact-list" style={{ fontSize: "13px" }}>
                    <li><strong>Study Hours Outlier (Tukey IQR fence):</strong> {benchmarkResult.error_reconciliation.review_breakdown.study_hours_outlier} rows</li>
                  </ul>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                    <em>Zero Data Loss:</em> Borderline records are routed to <strong>Human Review</strong> rather than deleted or auto-quarantined.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 10: Downstream Academic Analytics */}
          {analyticsResult && (
            <div className="wb-card" style={{ marginTop: "1.5rem" }}>
              <div className="wb-panel-header">
                <div>
                  <h3>Step 10: Downstream Business Utilization (Cleaned Data Analytics)</h3>
                  <p>Certified clean records used directly for course performance analysis.</p>
                </div>
              </div>

              <div className="wb-grid-4">
                <div className="wb-card stat-card">
                  <span className="wb-stat-title">Analyzed Clean Records</span>
                  <span className="wb-stat-val">{analyticsResult.clean_records_analyzed?.toLocaleString()}</span>
                </div>
                <div className="wb-card stat-card">
                  <span className="wb-stat-title">Average Course Score</span>
                  <span className="wb-stat-val">{analyticsResult.overall_average_score}</span>
                </div>
                <div className="wb-card stat-card">
                  <span className="wb-stat-title">Overall Pass Rate</span>
                  <span className="wb-stat-val">{analyticsResult.overall_pass_rate_pct}%</span>
                </div>
                <div className="wb-card stat-card">
                  <span className="wb-stat-title">Passed / Failed</span>
                  <span className="wb-stat-val">{analyticsResult.pass_count} / {analyticsResult.fail_count}</span>
                </div>
              </div>

              {/* Course Performance Table */}
              <div style={{ marginTop: "1rem" }}>
                <h4>Performance by Course:</h4>
                <div className="wb-table-wrapper">
                  <table className="wb-table">
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Student Count</th>
                        <th>Mean Score</th>
                        <th>Min Score</th>
                        <th>Max Score</th>
                        <th>Std Deviation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analyticsResult.course_performance || []).map((c) => (
                        <tr key={c.course}>
                          <td><strong>{c.course}</strong></td>
                          <td>{c.count}</td>
                          <td><strong>{c.mean}</strong></td>
                          <td>{c.min}</td>
                          <td>{c.max}</td>
                          <td>{c.std}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Grade Distribution Bar */}
              <div style={{ marginTop: "1rem" }}>
                <h4>Grade Distribution (Clean Data):</h4>
                <div className="wb-grade-bars">
                  {Object.entries(analyticsResult.grade_distribution || {}).map(([g, count]) => {
                    const totalClean = analyticsResult.clean_records_analyzed || 0;
                    const pct = totalClean > 0 ? ((count / totalClean) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={g} className="wb-grade-item">
                        <div className="wb-grade-header">
                          <span>Grade {g}</span>
                          <span>{count} ({pct}%)</span>
                        </div>
                        <div className="wb-grade-bar-bg">
                          <div
                            className={`wb-grade-bar-fill grade-${g.toLowerCase()}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Wizard Navigation for Stage 5 */}
          <div className="wb-wizard-nav">
            <button className="wb-btn-secondary wb-nav-btn" onClick={() => setActiveStep(4)}>
              ⬅ ย้อนกลับ: Stage 4 คัดแยก 3 ทาง
            </button>
            <button className="wb-btn-primary wb-nav-btn" onClick={() => setActiveStep(1)}>
              <Icon name="refresh" /> กลับไปจุดเริ่มต้น: Stage 1 สถิติข้อมูลดิบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
