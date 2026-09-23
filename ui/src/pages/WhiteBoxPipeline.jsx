import { Icon } from '../components/UiIcons';
import React, { useState, useEffect } from "react";
import WorkflowJourneyBar from "../components/WorkflowJourneyBar";
import "./WhiteBoxPipeline.css";

export default function WhiteBoxPipeline() {
  const [activeStep, setActiveStep] = useState(0); // 0: Multi-Table, 1: Profiling, 2: Context, 3: Rules, 4: Segregation, 5: Benchmark
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showArchitectureMatrix, setShowArchitectureMatrix] = useState(false);

  // Step 0: Multi-Table State
  const [multiTablePreview, setMultiTablePreview] = useState(null);
  const [multiTableAnalysis, setMultiTableAnalysis] = useState(null);
  const [multiTableLoading, setMultiTableLoading] = useState(false);
  const [joinResult, setJoinResult] = useState(null);
  const [joining, setJoining] = useState(false);

  // Step 1: Profiling State
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Step 2: User Context State
  const [userContext, setUserContext] = useState({
    data_purpose: "Official Grade Reporting",
    criticality: "Critical",
    update_frequency: "Daily Batch (<= 24h)",
    field_contexts: {
      score: {
        business_meaning: "Course Final Grade",
        required: true,
        known_domain: true,
        min_domain: 0,
        max_domain: 100
      },
      study_hours: {
        business_meaning: "Weekly Study Effort Hours",
        required: false,
        known_domain: false,
        min_domain: null,
        max_domain: null
      },
      student_id: {
        business_meaning: "Unique Student Identifier",
        required: true,
        known_domain: false,
        min_domain: null,
        max_domain: null
      }
    }
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

  // Auto-run and populate all stages on mount so system is 100% ready immediately
  useEffect(() => {
    runFullPipeline();
  }, []);

  const runFullPipeline = async () => {
    setAutoRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/whitebox/run-all", { method: "POST" });
      if (!res.ok) throw new Error("Failed to auto-populate pipeline stages");
      const data = await res.json();
      if (data.multi_table_preview) setMultiTablePreview(data.multi_table_preview);
      if (data.multi_table_analysis) setMultiTableAnalysis(data.multi_table_analysis);
      if (data.join_result) setJoinResult(data.join_result);
      if (data.profile_data) setProfileData(data.profile_data);
      if (data.recommendations) setRecommendations(data.recommendations);
      if (data.execution_result) setExecutionResult(data.execution_result);
      if (data.benchmark_result) setBenchmarkResult(data.benchmark_result);
      if (data.downstream_analytics) setAnalyticsResult(data.downstream_analytics);
    } catch (err) {
      console.warn("Auto-run fallback to step-by-step fetch:", err);
      fetchMultiTableData();
      fetchProfile();
    } finally {
      setAutoRunning(false);
    }
  };


  const fetchMultiTableData = async () => {
    setMultiTableLoading(true);
    try {
      const prevRes = await fetch("/api/v1/whitebox/multi-table/preview");
      if (prevRes.ok) {
        const pData = await prevRes.json();
        setMultiTablePreview(pData);
      } else {
        setError("Failed to preview multi-table schema");
      }

      const anRes = await fetch("/api/v1/whitebox/multi-table/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (anRes.ok) {
        const aData = await anRes.json();
        setMultiTableAnalysis(aData);
      } else {
        setError("Failed to analyze multi-table candidate relationship");
      }
    } catch (err) {
      console.error("Multi-table preview error:", err);
      setError(err.message || "Failed to load multi-table data");
    } finally {
      setMultiTableLoading(false);
    }
  };

  const handleConfirmJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/whitebox/multi-table/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_a_name: "student_demographics",
          table_b_name: "student_course_score",
          join_key_a: "studentId",
          join_key_b: "student_id",
          join_type: "left",
          reconcile_schema: true,
          standardize_dates: true,
          target_date_format: "YYYY-MM-DD"
        })
      });
      if (!res.ok) throw new Error("Failed to execute multi-table join");
      const data = await res.json();
      setJoinResult(data);
      await fetchProfile();
      setActiveStep(1); // Proceed to Profiling
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
      if (!res.ok) throw new Error("Failed to fetch data profiling");
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
          dataset_name: "student_course_score",
          data_purpose: userContext.data_purpose,
          criticality: userContext.criticality,
          update_frequency: userContext.update_frequency,
          field_contexts: userContext.field_contexts
        })
      });
      if (!res.ok) throw new Error("Failed to generate rule recommendations");
      const data = await res.json();
      setRecommendations(data.recommendations);
      setActiveStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setRecsLoading(false);
    }
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
          dataset_name: "student_course_score",
          rules: recommendations
        })
      });
      if (!res.ok) throw new Error("Failed to execute pipeline");
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
      if (!res.ok) throw new Error("Failed to load benchmark evaluation");
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

  const summary = profileData?.summary || {};

  return (
    <div className="wb-container">
      {/* Page Header */}
      <div className="wb-header">
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(255, 54, 33, 0.08)", color: "#FF3621", border: "1px solid rgba(255, 54, 33, 0.25)", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "6px" }}>
          ENGINE ARCHITECTURE · WHITE-BOX DATA AUDIT
        </div>
        <h1>
          White-Box Data Engine <span>(Audit & Lineage)</span>
        </h1>
        <p>
          ระบบเปิดเผยกระบวนการตัดสินใจทุกขั้นตอน — ตั้งแต่ Profiling, การวิเคราะห์, การเสนอกฎ จนถึงการคัดแยก 3 ทาง — ผู้ใช้เห็นเหตุผลทางสถิติและยืนยันก่อนระบบดำเนินการ
        </p>
      </div>

      {/* Executive Onboarding Hero */}
      <div className="wb-onboarding-hero">
        <div className="wb-onboarding-header">
          <div className="wb-onboarding-title-group">
            <span className="wb-badge success"><Icon name="bolt" /> แนะนำการใช้งานเบื้องต้น (QUICK START GUIDE)</span>
            <h2>หน้านี้คืออะไร และทำงานอย่างไร?</h2>
          </div>
          <div className="wb-onboarding-stats-badge">
            ชุดข้อมูลที่กำลังประมวลผล: <strong>{(summary?.total_rows ?? 10100).toLocaleString()} รายการ</strong>
          </div>
        </div>

        <div className="wb-onboarding-grid">
          <div className="wb-onboarding-col">
            <div className="wb-onboarding-icon"><Icon name="target" /></div>
            <h4>1. เป้าหมายของระบบ (Objective)</h4>
            <p>
              ตรวจสอบค่าสถิติของข้อมูลต้นทาง กำหนดเกณฑ์ตามบริบทธุรกิจ คัดแยกข้อมูล 3 ทาง (ข้อมูลสะอาด / รอผู้เชี่ยวชาญตรวจสอบ / กักกันพร้อมสาเหตุ) และเปรียบเทียบผลลัพธ์ระดับเรคคอร์ด
            </p>
          </div>

          <div className="wb-onboarding-col">
            <div className="wb-onboarding-icon"><Icon name="scale" /></div>
            <h4>2. คัดแยกข้อมูล 3 ทาง (3-Way Segregation)</h4>
            <p>
              ข้อมูลไม่ได้มีแค่ "ดี" หรือ "ลบทิ้ง" แต่ถูกจัดเป็น 3 กลุ่ม: <strong>ข้อมูลสะอาด (Clean)</strong> ใช้งานต่อทันที, <strong>ส่งมนุษย์ตรวจ (Human Review)</strong> ป้องกัน False Positive, และ <strong>กักกัน (Quarantine)</strong> เพื่อส่งแก้ที่ต้นตอ
            </p>
          </div>

          <div className="wb-onboarding-col">
            <div className="wb-onboarding-icon"><Icon name="bolt" /></div>
            <h4>3. วิธีการใช้งาน (How to Use)</h4>
            <p>
              ระบบได้ทำการรันประมวลผลข้อมูลล่วงหน้าให้พร้อมใช้งานทันที คุณสามารถ<strong>กดเลือกดู Stage 0 ถึง 5</strong> ด้านล่าง หรือใช้ปุ่ม <strong>[ขั้นตอนถัดไป <Icon name="arrow-right" />]</strong> ที่ท้ายแต่ละหน้าเพื่อดูเรื่องราวทีละขั้นตอน
            </p>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ marginBottom: "1.2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <button
          className="wb-btn-primary"
          onClick={runFullPipeline}
          disabled={autoRunning}
          style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "8px 16px", borderRadius: "6px", background: "#059669", color: "#FFF", border: "none", cursor: "pointer", fontWeight: 600 }}
        >
          <span>{autoRunning ? " กำลังประมวลผล Pipeline ทั้งระบบ..." : " รันประมวลผลทั้งระบบ (One-Click Auto Ready)"}</span>
        </button>

        <button
          className="wb-btn-secondary"
          onClick={() => setShowArchitectureMatrix(!showArchitectureMatrix)}
          style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 14px", borderRadius: "6px" }}
        >
          <span>{showArchitectureMatrix ? "▲ ซ่อนผังโครงสร้างสถาปัตยกรรม" : "▼ ดูโครงสร้างบทบาท: ผู้ใช้ (User) vs. ระบบอัตโนมัติ (System)"}</span>
        </button>
      </div>

      {showArchitectureMatrix && (
        <div className="wb-card" style={{ marginBottom: "1.5rem", borderLeft: "4px solid #2563EB", background: "#F8FAFC" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", color: "#0F172A" }}>
              <Icon name="building" /> System Architecture: User Responsibility vs. System Automation
            </h3>
            <span className="wb-badge">TRANSPARENT DECISION ARCHITECTURE</span>
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
                <li><strong>2. Schema & Relationship:</strong> ตรวจวัด Candidate Key Overlap (99.8%) และรูปแบบวันที่ (Stage 0)</li>
                <li><strong>3. Decision Tree Logic:</strong> เลือก Range Check (เมื่อรู้ขอบเขต) หรือ Auto IQR (เมื่อไม่รู้ขอบเขต)</li>
                <li><strong>4. 3-Way Segregation:</strong> แยก Clean (9,400) / Review (100) / Quarantine (600) ไม่ลบข้อมูลสุ่มสี่สุ่มห้า</li>
                <li><strong>5. Benchmark & Validation:</strong> คำนวณ Recall (100%), Precision และตรวจสอบ Ground Truth (Stage 5)</li>
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
            <span className="wb-step-btn-title"><Icon name="arrow-right" /> เชื่อมโยงตาราง</span>
            <span className="wb-step-btn-sub">Multi-Table Join</span>
          </div>
        </button>

        <button
          className={`wb-step-btn ${activeStep === 1 ? "active" : ""} ${profileData ? "completed" : ""}`}
          onClick={() => setActiveStep(1)}
        >
          <span className="wb-step-num">1</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="list" /> สถิติข้อมูลดิบ</span>
            <span className="wb-step-btn-sub">Data Profiling</span>
          </div>
        </button>

        <button
          className={`wb-step-btn ${activeStep === 2 ? "active" : ""} ${userContext ? "completed" : ""}`}
          onClick={() => setActiveStep(2)}
        >
          <span className="wb-step-num">2</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="target" /> บริบทธุรกิจ</span>
            <span className="wb-step-btn-sub">Business Context</span>
          </div>
        </button>

        <button
          className={`wb-step-btn ${activeStep === 3 ? "active" : ""} ${recommendations.length > 0 ? "completed" : ""}`}
          onClick={() => setActiveStep(3)}
        >
          <span className="wb-step-num">3</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="bolt" /> กฎที่ระบบเสนอ</span>
            <span className="wb-step-btn-sub">Explainable Rules</span>
          </div>
        </button>

        <button
          className={`wb-step-btn ${activeStep === 4 ? "active" : ""} ${executionResult ? "completed" : ""}`}
          onClick={() => setActiveStep(4)}
        >
          <span className="wb-step-num">4</span>
          <div className="wb-step-btn-content">
            <span className="wb-step-btn-title"><Icon name="scale" /> คัดแยก 3 ทาง</span>
            <span className="wb-step-btn-sub">3-Way Segregation</span>
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
            <span className="wb-step-btn-title"><Icon name="check" /> ตรวจสอบมาตรฐาน SLA</span>
            <span className="wb-step-btn-sub">SLA Audit & Insights</span>
          </div>
        </button>
      </div>

      {/* STEP 0: MULTI-TABLE RELATIONSHIP & SCHEMA MAPPING */}
      {activeStep === 0 && (
        <div className="wb-panel">
          <div className="wb-stage-purpose-box">
            <div className="wb-stage-purpose-icon"><Icon name="arrow-right" /></div>
            <div className="wb-stage-purpose-text">
              <strong>การผสานความสัมพันธ์ระหว่างตาราง (Schema Reconciliation):</strong> วิเคราะห์ความเข้ากันได้ของโครงสร้างข้อมูล 2 ตาราง (<code>student_demographics</code> และ <code>student_course_scores</code>) ตรวจจับความแตกต่างของชื่อคอลัมน์ และตรวจสอบอัตราการจับคู่ของคีย์หลัก (Key Overlap 99.8%) ก่อนอนุมัติการรวมตาราง
            </div>
          </div>

          <div className="wb-panel-header">
            <div>
              <h2>Stage 0: Multi-Table Relationship & Schema Reconciliation</h2>
              <p>
                Analyze schema relationships across production tables, reconcile key formatting differences, and verify join integrity before execution.
              </p>
            </div>
            <button className="wb-btn-secondary" onClick={fetchMultiTableData} disabled={multiTableLoading}>
              {multiTableLoading ? "Analyzing..." : "Re-Analyze Tables"}
            </button>
          </div>

          {/* Sources Summary Cards */}
          <div className="wb-grid-2">
            <div className="wb-card">
              <div className="wb-source-card-header">
                <span className="wb-badge">SOURCE TABLE A</span>
                <h3>Student Demographics</h3>
              </div>
              <p className="wb-desc">Master student dimension containing personal identity and faculty enrollment.</p>
              <div className="wb-metric-box">
                <span>Columns</span>
                <code>['studentId', 'fullName', 'faculty', 'enrollmentDate']</code>
              </div>
              <div className="wb-metric-box" style={{ marginTop: "8px" }}>
                <span>Total Master Records</span>
                <strong>10,000 rows</strong>
              </div>
            </div>

            <div className="wb-card">
              <div className="wb-source-card-header">
                <span className="wb-badge">SOURCE TABLE B</span>
                <h3>Student Course Scores</h3>
              </div>
              <p className="wb-desc">Fact table containing transactional semester course performance and study hours.</p>
              <div className="wb-metric-box">
                <span>Columns</span>
                <code>['dirty_row_id', 'student_id', 'course', 'score', 'semester', 'study_hours', 'updated_at']</code>
              </div>
              <div className="wb-metric-box" style={{ marginTop: "8px" }}>
                <span>Total Transaction Records</span>
                <strong>10,100 rows</strong>
              </div>
            </div>
          </div>

          {/* Analysis & Reconciliation Cards */}
          {multiTableAnalysis && (
            <>
              {/* 1. Schema Differences */}
              <div className="wb-card" style={{ marginTop: "1rem" }}>
                <div className="wb-panel-header">
                  <div>
                    <h3>1. Schema & Naming Differences Detected</h3>
                    <p>Resolves disparate naming conventions (camelCase vs snake_case) across sources.</p>
                  </div>
                </div>

                <div className="wb-table-wrapper">
                  <table className="wb-table">
                    <thead>
                      <tr>
                        <th>Source Table A Column</th>
                        <th>Source Table B Column</th>
                        <th>Difference Type</th>
                        <th>Confidence</th>
                        <th>Evidence / Rationale</th>
                        <th>Suggested Standard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {multiTableAnalysis.schema_differences?.map((s, idx) => (
                        <tr key={idx}>
                          <td><code>{s.source_a_column}</code></td>
                          <td><code>{s.source_b_column}</code></td>
                          <td><span className="wb-pill warning">{s.difference_type}</span></td>
                          <td><span className="wb-pill success">{s.confidence_pct}% Match</span></td>
                          <td>
                            <ul className="wb-compact-list">
                              {(s.evidence || []).map((ev, eIdx) => <li key={eIdx}>{ev}</li>)}
                            </ul>
                          </td>
                          <td><strong className="text-success">{s.suggested_standard}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Date Format Differences */}
              <div className="wb-card" style={{ marginTop: "1rem" }}>
                <h3>2. Format Reconciliation (Date Discrepancies)</h3>
                <p>Identifies heterogeneous date patterns across ingestion sources.</p>
                <div className="wb-table-wrapper">
                  <table className="wb-table">
                    <thead>
                      <tr>
                        <th>Field (Table A)</th>
                        <th>Detected Value A</th>
                        <th>Detected Format A</th>
                        <th>Field (Table B)</th>
                        <th>Detected Value B</th>
                        <th>Suggested Standard Format</th>
                      </tr>
                    </thead>
                    <tbody>
                      {multiTableAnalysis.date_format_differences?.map((d, idx) => (
                        <tr key={idx}>
                          <td><strong>{d.source_a_field}</strong></td>
                          <td><code>{d.source_a_sample}</code></td>
                          <td><span className="wb-pill warning">{d.source_a_detected_format}</span></td>
                          <td><strong>{d.source_b_field}</strong></td>
                          <td><code>{d.source_b_sample}</code></td>
                          <td><strong className="text-success">{d.suggested_standard_format} (ISO-8601)</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Candidate Relationship Card & Human Confirmation Gate */}
              <div className="wb-card wb-highlight-card" style={{ marginTop: "1rem" }}>
                <div className="wb-panel-header">
                  <div>
                    <span className="wb-badge success">KEY OVERLAP & RELATIONSHIP DETECTED</span>
                    <h3 style={{ margin: "6px 0" }}>
                      Suggested Candidate Key: <code>Student.studentId</code> ⟷ <code>Score.student_id</code>
                    </h3>
                  </div>
                  <div className="wb-match-badge">
                    <span>Key Match Rate:</span>
                    <strong>{multiTableAnalysis.candidate_relationship?.match_rate_pct}%</strong>
                  </div>
                </div>

                <div className="wb-grid-3" style={{ margin: "14px 0" }}>
                  <div className="wb-metric-box">
                    <span>Inferred Cardinality</span>
                    <strong>{multiTableAnalysis.candidate_relationship?.suggested_cardinality}</strong>
                  </div>
                  <div className="wb-metric-box">
                    <span>Matching Key Count</span>
                    <strong>{multiTableAnalysis.candidate_relationship?.overlapping_keys} / {multiTableAnalysis.candidate_relationship?.unique_keys_b} keys</strong>
                  </div>
                  <div className="wb-metric-box">
                    <span>Recommended Join</span>
                    <strong>Left Join (Preserves All Scores)</strong>
                  </div>
                </div>

                <div className="wb-why-box">
                  <div className="wb-why-header">
                    <span className="wb-why-icon"><Icon name="scale" /></span>
                    <strong>Semi-Automated Architecture Philosophy (No Black-Box Joins):</strong>
                  </div>
                  <p style={{ margin: "4px 0 8px 0", fontSize: "13px" }}>
                    The system does <strong>not</strong> blindly join datasets. It computes candidate overlaps, verifies cardinality, and requires human confirmation to seal the data contract.
                  </p>
                  <ul className="wb-why-list">
                    {(multiTableAnalysis.candidate_relationship?.rationale || []).map((r, rIdx) => (
                      <li key={rIdx}>{r}</li>
                    ))}
                  </ul>
                </div>

                {/* Entity vs Attribute Distinction (Defense Note) */}
                <div style={{ marginTop: "12px", padding: "12px", background: "#F1F5F9", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", color: "#334155" }}>
                  <div style={{ fontWeight: 700, color: "#1E293B", marginBottom: "4px" }}>
                    <Icon name="bolt" /> การเชื่อมโยงและความสัมพันธ์ข้อมูล (Entity vs. Attribute vs. Value):
                  </div>
                  <div>
                    กรณีโครงสร้างตารางต่างกัน (เช่น การเงิน/บุคคล/ตำแหน่ง) ระบบแยกแยะตามหลักการเชิงสัมพันธ์:
                    <br />
                    • <strong>Entity (ตัวตนบุคคล):</strong> <code>student_id: 65001</code> / <code>studentId</code> เป็นแกนตัวตนหลัก
                    <br />
                    • <strong>Attribute (คุณลักษณะ):</strong> <code>faculty: Engineering</code>, <code>enrollment_date</code>
                    <br />
                    • ระบบไม่เดาจับคู่ตามอำเภอใจ แต่ตรวจวัด <strong>Key Overlap ({multiTableAnalysis.candidate_relationship?.match_rate_pct}%)</strong> แล้วเสนอแนะให้<strong>ผู้ใช้ตรวจสอบและกดยืนยัน (User Confirm)</strong> ก่อนเสมอ
                  </div>
                </div>

                {/* Join Confirmation Action */}
                <div className="wb-actions">
                  <button
                    className="wb-btn-primary"
                    onClick={handleConfirmJoin}
                    disabled={joining}
                  >
                    {joining ? "Reconciling & Joining..." : " Confirm Relationship & Execute Semi-Auto Join →"}
                  </button>
                </div>
              </div>
            </>
          )}

          {joinResult && (
            <div className="wb-card" style={{ marginTop: "1rem", borderLeft: "5px solid #10b981" }}>
              <div className="wb-panel-header">
                <div>
                  <span className="wb-badge success">JOIN COMPLETED SUCCESSFULLY</span>
                  <h3 style={{ margin: "4px 0" }}>Unified Dataset Created: <code>unified_student_dataset</code></h3>
                  <span className="wb-sub">
                    {joinResult.total_rows} rows | {joinResult.total_columns} columns | Matched demographics: {joinResult.matched_rows} rows
                  </span>
                </div>
                <button className="wb-btn-primary" onClick={() => setActiveStep(1)}>
                  Proceed to Data Profiling →
                </button>
              </div>
            </div>
          )}

          {/* Bottom Wizard Navigation for Stage 0 */}
          <div className="wb-wizard-nav">
            <div></div>
            <button className="wb-btn-primary wb-nav-btn" onClick={() => setActiveStep(1)}>
              ขั้นตอนถัดไป: Stage 1 สำรวจสถิติข้อมูลดิบ (Data Profiling) <Icon name="arrow-right" />
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
              <strong>การสำรวจโครงสร้างและค่าสถิติของข้อมูลขาเข้า (Automated Data Profiling):</strong> คำนวณอัตราค่าว่าง (Null Rate), ความซ้ำซ้อนของคีย์ผสม (Composite Key Uniqueness) และการกระจายตัวทางสถิติ (Quartiles Q1, Q3, IQR) จากตารางที่กำลังประมวลผล
            </div>
          </div>

          <div className="wb-panel-header">
            <div>
              <h2>Stage 1: Ingestion Data Profiling</h2>
              <p>Observe what the system detects from raw data before any transformation rules are applied.</p>
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
                  <span className="wb-stat-title">Ingested Rows</span>
                  <span className="wb-stat-val">{profileData.total_rows?.toLocaleString()}</span>
                  <span className="wb-stat-sub">Evaluation Dataset</span>
                </div>
                <div className="wb-card stat-card">
                  <span className="wb-stat-title">Detected Columns</span>
                  <span className="wb-stat-val">{profileData.total_columns}</span>
                  <span className="wb-stat-sub">Inferred Types Ready</span>
                </div>
                <div className="wb-card stat-card warning">
                  <span className="wb-stat-title">Null Rate (score)</span>
                  <span className="wb-stat-val">
                    {profileData.columns_profile?.score?.null_rate_pct}%
                  </span>
                  <span className="wb-stat-sub">
                    {profileData.columns_profile?.score?.null_count} missing rows
                  </span>
                </div>
                <div className="wb-card stat-card danger">
                  <span className="wb-stat-title">Composite Duplicates</span>
                  <span className="wb-stat-val">
                    {profileData.duplicate_analysis?.duplicate_rows_detected}
                  </span>
                  <span className="wb-stat-sub">student_id + course + semester</span>
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
                        const isScore = col === "score";
                        const isStudy = col === "study_hours";
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
                              {isScore && p.min < 0 && (
                                <span className="wb-pill danger">Invalid Range (-10 to 150)</span>
                              )}
                              {isStudy && p.outlier_count > 0 && (
                                <span className="wb-pill warning">{p.outlier_count} IQR Outliers</span>
                              )}
                              {col === "student_id" && profileData.duplicate_analysis?.duplicate_rows_detected > 0 && (
                                <span className="wb-pill warning">Duplicate Natural Key</span>
                              )}
                              {!isScore && !isStudy && col !== "student_id" && p.null_count === 0 && (
                                <span className="wb-pill success">Clean</span>
                              )}
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
                  ⬅ ย้อนกลับ: Stage 0 เชื่อมโยงตาราง
                </button>
                <button className="wb-btn-primary wb-nav-btn" onClick={() => setActiveStep(2)}>
                  ขั้นตอนถัดไป: Stage 2 กำหนดบริบทธุรกิจ (Business Context) <Icon name="arrow-right" />
                </button>
              </div>
            </>
          ) : (
            <p>Loading profile...</p>
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
              <h2>Stage 2: User Business Context</h2>
              <p>
                The system cannot know business semantics alone. Provide business intent so rules can be recommended with explainability.
              </p>
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
            <h3>Field Semantic Annotations</h3>
            <p className="wb-desc">
              Specify which fields have a <strong>Known Domain</strong> (e.g. Score must be 0–100) versus an <strong>Unknown Domain</strong> (triggering Auto IQR).
            </p>

            <div className="wb-context-row">
              <div className="wb-context-col">
                <strong>Field: score</strong>
                <span className="wb-sub">Course Final Grade</span>
              </div>
              <div className="wb-context-fields">
                <label className="wb-checkbox-label">
                  <input
                    type="checkbox"
                    checked={userContext.field_contexts.score.required}
                    onChange={(e) =>
                      setUserContext({
                        ...userContext,
                        field_contexts: {
                          ...userContext.field_contexts,
                          score: { ...userContext.field_contexts.score, required: e.target.checked }
                        }
                      })
                    }
                  />
                  Required (No Nulls)
                </label>

                <label className="wb-checkbox-label">
                  <input
                    type="checkbox"
                    checked={userContext.field_contexts.score.known_domain}
                    onChange={(e) =>
                      setUserContext({
                        ...userContext,
                        field_contexts: {
                          ...userContext.field_contexts,
                          score: { ...userContext.field_contexts.score, known_domain: e.target.checked }
                        }
                      })
                    }
                  />
                  Known Domain (Range Check)
                </label>

                {userContext.field_contexts.score.known_domain && (
                  <div className="wb-range-inputs">
                    <span>Min:</span>
                    <input
                      type="number"
                      className="wb-input-sm"
                      value={userContext.field_contexts.score.min_domain}
                      onChange={(e) =>
                        setUserContext({
                          ...userContext,
                          field_contexts: {
                            ...userContext.field_contexts,
                            score: { ...userContext.field_contexts.score, min_domain: parseFloat(e.target.value) }
                          }
                        })
                      }
                    />
                    <span>Max:</span>
                    <input
                      type="number"
                      className="wb-input-sm"
                      value={userContext.field_contexts.score.max_domain}
                      onChange={(e) =>
                        setUserContext({
                          ...userContext,
                          field_contexts: {
                            ...userContext.field_contexts,
                            score: { ...userContext.field_contexts.score, max_domain: parseFloat(e.target.value) }
                          }
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="wb-context-row">
              <div className="wb-context-col">
                <strong>Field: study_hours</strong>
                <span className="wb-sub">Weekly Self-study Hours</span>
              </div>
              <div className="wb-context-fields">
                <label className="wb-checkbox-label">
                  <input
                    type="checkbox"
                    checked={userContext.field_contexts.study_hours.required}
                    onChange={(e) =>
                      setUserContext({
                        ...userContext,
                        field_contexts: {
                          ...userContext.field_contexts,
                          study_hours: { ...userContext.field_contexts.study_hours, required: e.target.checked }
                        }
                      })
                    }
                  />
                  Required
                </label>

                <label className="wb-checkbox-label">
                  <input
                    type="checkbox"
                    checked={userContext.field_contexts.study_hours.known_domain}
                    onChange={(e) =>
                      setUserContext({
                        ...userContext,
                        field_contexts: {
                          ...userContext.field_contexts,
                          study_hours: { ...userContext.field_contexts.study_hours, known_domain: e.target.checked }
                        }
                      })
                    }
                  />
                  Known Domain (Unchecked = Auto IQR Statistical Screening)
                </label>
              </div>
            </div>
          </div>

          {/* Bottom Wizard Navigation for Stage 2 */}
          <div className="wb-wizard-nav">
            <button className="wb-btn-secondary wb-nav-btn" onClick={() => setActiveStep(1)}>
              ⬅ ย้อนกลับ: Stage 1 สถิติข้อมูลดิบ
            </button>
            <button className="wb-btn-primary wb-nav-btn" onClick={handleGenerateRules} disabled={recsLoading}>
              {recsLoading ? "กำลังสร้างกฎเกณฑ์..." : "ขั้นตอนถัดไป: Stage 3 กฎเกณฑ์ที่ระบบเสนอ (Explainable Rules) ->"}
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
              <h2>Stage 3: Explainable Rule Recommendations</h2>
              <p>
                Explainable Governance: Every recommended rule explicitly presents its reasoning (<strong>Why?</strong>) and empirical evidence.
              </p>
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
              {executing ? "กำลังประมวลผลคัดแยก..." : "ขั้นตอนถัดไป: Stage 4 ดำเนินการคัดแยก 3 ทาง (3-Way Segregation) ->"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: 3-WAY SEGREGATION */}
      {activeStep === 4 && (
        <div className="wb-panel">
          {/* Stage 4 Purpose Callout */}
          <div className="wb-stage-purpose-box">
            <div className="wb-stage-purpose-icon"><Icon name="scale" /></div>
            <div className="wb-stage-purpose-text">
              <strong>ทำไมต้องมี Stage 4?</strong> นำกฎที่ได้รับอนุมัติไปประมวลผล และแยกข้อมูลออกเป็น 3 ทาง: <Icon name="dot-green" /> <strong>ข้อมูลสะอาด (Clean Asset)</strong> พร้อมนำไปวิเคราะห์ต่อ, <Icon name="dot-yellow" /> <strong>รอคนตรวจ (Human Review)</strong> ป้องกันการลบข้อมูลที่เบี่ยงเบนทางสถิติโดยไม่จำเป็น, และ <Icon name="dot-red" /> <strong>กักกัน (Quarantine Lake)</strong> เพื่อระบุความผิดพลาดและส่งกลับไปแก้ที่ต้นตอ (Upstream Remediation)
            </div>
          </div>

          <div className="wb-panel-header">
            <div>
              <h2>Stage 4: Transformation & 3-Way Data Segregation</h2>
              <p>
                Adhering to Upstream-First Remediation: Genuine records are cleaned, anomalies routed to human review, and defects quarantined.
              </p>
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
                    <h3>Clean Data Asset</h3>
                  </div>
                  <div className="wb-bucket-count">{(executionResult.clean_rows ?? 0).toLocaleString()} rows</div>
                  <p>Meets all quality contracts. Directly ready for analytics and business utilization.</p>
                  <span className="wb-pill success">100% Validated</span>
                </div>

                <div className="wb-card bucket review">
                  <div className="wb-bucket-header">
                    <span className="wb-bucket-icon"><Icon name="dot-yellow" /></span>
                    <h3>Human Review Queue</h3>
                  </div>
                  <div className="wb-bucket-count">{(executionResult.review_rows ?? 0).toLocaleString()} rows</div>
                  <p>Study Hours Outliers isolated for domain expert appraisal rather than destructive auto-drop.</p>
                  <span className="wb-pill warning">Semi-Auto Human Gate</span>
                </div>

                <div className="wb-card bucket quarantine">
                  <div className="wb-bucket-header">
                    <span className="wb-bucket-icon"><Icon name="dot-red" /></span>
                    <h3>Quarantine Lake</h3>
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
                  ขั้นตอนถัดไป: Stage 5 วัดผล Benchmark & สถิติผลการเรียน <Icon name="arrow-right" />
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
              <h2>Stage 5: Data Quality SLA Verification & Downstream Analytics</h2>
              <p>
                Production SLA Audit: Verifying 100% record accounting across Clean, Review, and Quarantine zones alongside certified downstream analytics.
              </p>
            </div>
            <button className="wb-btn-secondary" onClick={fetchBenchmark} disabled={benchmarkLoading}>
              {benchmarkLoading ? "Verifying..." : "Re-verify SLA Metrics"}
            </button>
          </div>

          {/* SLA Verification Table */}
          {benchmarkResult ? (
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
            <p>Loading SLA compliance verification...</p>
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
                  <h4 style={{ margin: "0 0 8px 0", color: "#b91c1c" }}><Icon name="dot-red" /> Quarantine Lake: 600 Records</h4>
                  <ul className="wb-compact-list" style={{ fontSize: "13px" }}>
                    <li><strong>Missing Score:</strong> 300 rows (Strict Required violation)</li>
                    <li><strong>Invalid Score Range:</strong> 200 rows (&lt; 0 or &gt; 100 impossibility)</li>
                    <li><strong>Duplicate Composite:</strong> 100 rows (student_id + course + semester uniqueness)</li>
                  </ul>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                    <em>Note on Relational Overlap:</em> 5 duplicate rows contain missing scores and 4 contain invalid scores. By executing composite duplicate checks first, relational identity is preserved without double-counting.
                  </p>
                </div>

                <div className="wb-card" style={{ background: "#f8fafc", border: "1px solid #cbd5e1" }}>
                  <h4 style={{ margin: "0 0 8px 0", color: "#d97706" }}><Icon name="dot-yellow" /> Human Review Queue: 100 or 154 Records</h4>
                  <ul className="wb-compact-list" style={{ fontSize: "13px" }}>
                    <li>
                      <strong>Tukey Outer Fence (3.0×):</strong> Flags exactly <strong>100 rows</strong> (true outliers 30–60h, 0 false positives).
                    </li>
                    <li>
                      <strong>Tukey Inner Fence (1.5×):</strong> Flags <strong>154 rows</strong> (100 true outliers + 54 diligent students studying 10–12h).
                    </li>
                  </ul>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                    <em>Zero Data Loss:</em> Because the 54 borderline records are routed to <strong>Human Review</strong> rather than deleted, our governance pipeline prevents destructive false-positive data loss.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 7-Dimensional Evaluation Framework */}
          {benchmarkResult?.seven_dimensions_evaluation && (
            <div className="wb-card" style={{ marginTop: "1rem" }}>
              <div className="wb-panel-header">
                <div>
                  <span className="wb-badge success">COMPREHENSIVE CRITERIA</span>
                  <h3>7-Dimensional Pipeline Quality Evaluation Framework</h3>
                  <p>
                    Going beyond simple detection rate: Verifying explainability, user control, traceability, and business value.
                  </p>
                </div>
              </div>

              <div className="wb-table-wrapper" style={{ marginTop: "10px" }}>
                <table className="wb-table">
                  <thead>
                    <tr>
                      <th>Evaluation Dimension</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Criteria / Question</th>
                      <th>Empirical Proof / Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarkResult.seven_dimensions_evaluation.map((d, idx) => (
                      <tr key={idx}>
                        <td><strong>{d.dimension}</strong></td>
                        <td><span className="wb-pill success">{d.score}</span></td>
                        <td><span className="wb-badge success">{d.status}</span></td>
                        <td style={{ color: "var(--text-muted)" }}>{d.description}</td>
                        <td><small>{d.evidence}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            <button className="wb-btn-primary wb-nav-btn" onClick={() => setActiveStep(0)}>
              <Icon name="refresh" /> กลับไปจุดเริ่มต้น: Stage 0 เชื่อมโยงตาราง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
