import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl, resolveApiUrl, checkInitialDemoMode } from "../utils/apiConfig";

const API_BASE = "/api/v1";

let _snapshotPromise = null;
let _snapshotData = null;

let _isStaticDemo = checkInitialDemoMode();

export function isStaticDemoMode() {
  return _isStaticDemo;
}

export function setStaticDemoMode(val) {
  _isStaticDemo = Boolean(val);
  if (typeof window !== "undefined") {
    if (_isStaticDemo) {
      localStorage.setItem("dataserve_static_demo", "true");
      localStorage.setItem("dataserve_demo_mode", "true");
      localStorage.setItem("dataserve_demo_mode", "true");
    } else {
      localStorage.removeItem("dataserve_static_demo");
      localStorage.removeItem("dataserve_demo_mode");
      localStorage.removeItem("dataserve_demo_mode");
    }
  }
}

export async function getPrecomputedSnapshot() {
  if (_snapshotData) return _snapshotData;
  if (!_snapshotPromise) {
    _snapshotPromise = fetch("/data/execution_results_snapshot.json")
      .then(async (res) => {
        if (!res.ok) return null;
        const json = await res.json();
        _snapshotData = json;
        return json;
      })
      .catch(() => null);
  }
  return _snapshotPromise;
}

export function resolveSnapshotForEndpoint(endpoint, snapshot) {
  if (!snapshot || !endpoint) return null;
  const cleanEp = endpoint.split("?")[0].replace(/^\/api\/v1/, "");

  if (cleanEp === "/kpi/stats") {
    return snapshot.kpi_stats || null;
  }
  if (cleanEp === "/executive/overview") {
    return snapshot.executive_overview || null;
  }
  if (cleanEp === "/anomaly/sources") {
    return snapshot.anomaly_sources || {
      timestamps: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"],
      anomaly: { source: "student_course_scores", time: "10:00", score: 93.07, reason: "Missing Values & Range Outliers" },
      series: {
        student_course_scores: [98.2, 97.5, 93.07, 93.07, 94.0, 94.2, 94.2],
        sales_records: [99.5, 99.2, 99.0, 99.1, 98.8, 99.4, 99.5]
      }
    };
  }
  if (cleanEp === "/system/activity") {
    return snapshot.system_activity || [];
  }
  if (cleanEp === "/system/remediations") {
    return snapshot.system_remediations || { tickets: [] };
  }
  if (cleanEp === "/pipeline") {
    return snapshot.pipeline_runs || [];
  }
  if (cleanEp === "/quality") {
    return snapshot.quality_runs || [];
  }
  if (cleanEp === "/whitebox/state") {
    return snapshot.whitebox_state || null;
  }
  if (cleanEp === "/whitebox/benchmark") {
    return snapshot.ground_truth_benchmark || null;
  }
  if (cleanEp === "/whitebox/ai-context-explanations") {
    return snapshot.whitebox_ai_context || { dataset_name: "student_course_scores", explanations: [] };
  }
  if (cleanEp === "/whitebox/profile") {
    return snapshot.whitebox_profile || null;
  }
  if (cleanEp === "/whitebox/multi-table/tables") {
    return snapshot.whitebox_multi_table?.tables ? { tables: snapshot.whitebox_multi_table.tables } : null;
  }
  if (cleanEp === "/schema/tables") {
    return snapshot.schema_catalog || null;
  }
  if (cleanEp === "/schema/proposals") {
    return snapshot.schema_proposals || { count: 1, proposals: [] };
  }
  if (cleanEp === "/rules/ai-proposals") {
    return snapshot.rules_proposals || { count: 1, proposals: [] };
  }
  if (cleanEp === "/analytics/tables") {
    return {
      tables: snapshot.downstream_analytics?.tables_list || [
        { name: "student_course_scores", runs: 12, latest_score: 93.07, latest_at: "2026-10-10T09:53:55Z" },
        { name: "sales_records", runs: 8, latest_score: 98.5, latest_at: "2026-10-10T09:50:00Z" }
      ]
    };
  }
  if (cleanEp === "/analytics/projection") {
    return snapshot.downstream_analytics?.projection || null;
  }
  if (cleanEp === "/analytics/clustering") {
    return snapshot.downstream_analytics?.clustering || null;
  }
  if (cleanEp === "/analytics/recommendations") {
    return snapshot.downstream_analytics?.recommendations || null;
  }
  if (cleanEp === "/analytics/impact") {
    return snapshot.downstream_analytics?.impact || null;
  }
  if (cleanEp === "/analytics/sell-in-out") {
    return snapshot.downstream_analytics?.sell_in_out || null;
  }
  if (cleanEp === "/services/status") {
    return snapshot.services_status || null;
  }
  if (cleanEp === "/export/tables") {
    return snapshot.export_catalog || null;
  }
  if (cleanEp.includes("/preview")) {
    const isSales = cleanEp.includes("sales_records");
    if (isSales) {
      return {
        table_name: "sales_records",
        profile: {
          rows: 1,
          column_count: 7,
          missing_cells: 0,
          kind_counts: { numeric: 3, categorical: 2, datetime: 1, text: 1 },
          has_limited_rows: true,
          row_warning: "ชุดข้อมูล sales_records มีเพียง 1 แถว จึงแสดงแนวโน้มหรือการกระจายตัวได้ไม่สมบูรณ์",
          columns: [
            { name: "order_id", kind: "categorical", dtype: "text", missing: 0, missing_pct: 0, distinct: 1 },
            { name: "product_category", kind: "categorical", dtype: "text", missing: 0, missing_pct: 0, distinct: 1 },
            { name: "sales_amount", kind: "numeric", dtype: "numeric", missing: 0, missing_pct: 0, distinct: 1 },
            { name: "profit", kind: "numeric", dtype: "numeric", missing: 0, missing_pct: 0, distinct: 1 },
            { name: "quantity", kind: "numeric", dtype: "integer", missing: 0, missing_pct: 0, distinct: 1 },
            { name: "order_date", kind: "datetime", dtype: "timestamp", missing: 0, missing_pct: 0, distinct: 1 },
            { name: "customer_name", kind: "text", dtype: "text", missing: 0, missing_pct: 0, distinct: 1 }
          ]
        },
        sample: [
          {
            order_id: "ORD-9901",
            product_category: "Office Supplies",
            sales_amount: 1420.50,
            profit: 310.20,
            quantity: 4,
            order_date: "2026-10-10 09:53:00",
            customer_name: "Tech Corp Thailand"
          }
        ]
      };
    }
    return {
      table_name: "student_course_scores",
      profile: {
        rows: 9400,
        column_count: 8,
        missing_cells: 14,
        kind_counts: { numeric: 3, categorical: 4, datetime: 1 },
        has_limited_rows: false,
        columns: [
          { name: "student_id", kind: "categorical", dtype: "text", missing: 0, missing_pct: 0, distinct: 2350 },
          { name: "course", kind: "categorical", dtype: "text", missing: 0, missing_pct: 0, distinct: 4 },
          { name: "score", kind: "numeric", dtype: "numeric", missing: 0, missing_pct: 0, distinct: 85 },
          { name: "semester", kind: "categorical", dtype: "text", missing: 0, missing_pct: 0, distinct: 2 },
          { name: "study_hours", kind: "numeric", dtype: "numeric", missing: 0, missing_pct: 0, distinct: 12 },
          { name: "faculty", kind: "categorical", dtype: "text", missing: 0, missing_pct: 0, distinct: 3 },
          { name: "gpa_prior", kind: "numeric", dtype: "numeric", missing: 14, missing_pct: 0.15, distinct: 120 },
          { name: "exam_date", kind: "datetime", dtype: "timestamp", missing: 0, missing_pct: 0, distinct: 10 }
        ]
      },
      sample: [
        { student_id: "65001", course: "Python Programming", score: 78.5, semester: "1/2026", study_hours: 4.5, faculty: "Engineering", gpa_prior: 3.25, exam_date: "2026-10-01" },
        { student_id: "65002", course: "Data Warehouse", score: 88.0, semester: "1/2026", study_hours: 6.0, faculty: "Information Technology", gpa_prior: 3.70, exam_date: "2026-10-02" },
        { student_id: "65003", course: "Database Systems", score: 72.0, semester: "1/2026", study_hours: 3.5, faculty: "Computer Science", gpa_prior: 2.85, exam_date: "2026-10-01" },
        { student_id: "65004", course: "Machine Learning", score: 91.5, semester: "2/2026", study_hours: 7.0, faculty: "Engineering", gpa_prior: 3.90, exam_date: "2026-10-03" },
        { student_id: "65005", course: "Data Warehouse", score: 84.0, semester: "2/2026", study_hours: 5.5, faculty: "Information Technology", gpa_prior: 3.40, exam_date: "2026-10-02" }
      ]
    };
  }
  if (cleanEp === "/dashboards/datasets" || cleanEp === "/dashboards/datasets/") {
    return snapshot.datasets_catalog || null;
  }
  if (cleanEp.startsWith("/semantic")) {
    return {
      table_name: "student_course_scores",
      status: "approved",
      pending_draft: false,
      version: 1,
      effective: {
        columns: {
          student_id: { role: "identifier", label: "รหัสนักศึกษา", pii: false },
          course: { role: "dimension", label: "รายวิชา", pii: false },
          score: { role: "measure", label: "คะแนนสอบ", unit: "number", default_agg: "avg", pii: false },
          semester: { role: "dimension", label: "ภาคการศึกษา", pii: false },
          study_hours: { role: "measure", label: "ชั่วโมงเรียน", unit: "number", default_agg: "avg", pii: false },
          faculty: { role: "dimension", label: "คณะ", pii: false },
          gpa_prior: { role: "measure", label: "GPA ก่อนหน้า", unit: "number", default_agg: "avg", pii: false },
          exam_date: { role: "time", label: "วันสอบ", pii: false }
        },
        metrics: [
          { id: "avg_score", label: "คะแนนเฉลี่ย", type: "simple", measure: { agg: "avg", column: "score" }, format: "number", higher_is_better: true },
          { id: "student_count", label: "จำนวนนักศึกษา", type: "simple", measure: { agg: "count_distinct", column: "student_id" }, format: "number", higher_is_better: true }
        ]
      },
      draft: null,
      approved: null,
      drift: { new_columns: [], missing_columns: [] },
      invalid_metrics: [],
      hidden_columns: [],
      metric_values: {},
      history: [],
      warnings: []
    };
  }
  if (cleanEp.startsWith("/dashboards/saved")) {
    return { dashboards: snapshot.saved_dashboards || [] };
  }
  return null;
}

export function useApi(endpoint, options = {}) {
  const { refreshInterval = 0, enabled = true } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPrecomputed, setIsPrecomputed] = useState(false);
  const [snapshotMeta, setSnapshotMeta] = useState(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for live database responses

    try {
      const fullUrl = resolveApiUrl(`${API_BASE}${endpoint}`);
      const token = typeof window !== "undefined" ? (sessionStorage.getItem("sdoqap_token") || localStorage.getItem("sdoqap_token")) : null;
      const headers = { "Cache-Control": "no-cache" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["X-Session-Token"] = token;
      }
      const res = await fetch(fullUrl, {
        signal: controller.signal,
        credentials: "include",
        cache: "no-cache",
        headers
      });
      clearTimeout(timeoutId);

      const contentType = res.headers?.get("content-type") || "";
      if (res.ok && (!contentType || contentType.includes("application/json"))) {
        const json = await res.json();
        setData(json);
        setIsPrecomputed(false);
        setSnapshotMeta(null);
        setError(null);
        return json;
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[useApi] Live API fetch error on ${endpoint}:`, err);
      setError(err.name === "AbortError" ? "Backend timeout (cold start)" : err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [endpoint, enabled]);

  useEffect(() => {
    fetchData();
    if (refreshInterval > 0 && !_isStaticDemo) {
      const id = setInterval(fetchData, refreshInterval);
      return () => clearInterval(id);
    }
  }, [fetchData, refreshInterval]);

  return { data, loading, error, isPrecomputed, snapshotMeta, refetch: fetchData };
}

export async function postApi(endpoint, body = null, method = "POST") {
  if (_isStaticDemo) {
    throw new Error(`โหมดทดลองใช้งานออฟไลน์ (Static Demo): ไม่สามารถประมวลผลคำสั่ง ${method} ${endpoint} ได้ ข้อมูลที่แสดงเป็นผลลัพธ์จากการรันจริงที่บันทึกไว้แล้ว`);
  }

  const token = typeof window !== "undefined" ? (sessionStorage.getItem("sdoqap_token") || localStorage.getItem("sdoqap_token")) : null;
  const options = {
    method,
    credentials: "include",
    headers: {}
  };
  if (token) {
    options.headers["Authorization"] = `Bearer ${token}`;
    options.headers["X-Session-Token"] = token;
  }
  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const fullUrl = resolveApiUrl(`${API_BASE}${endpoint}`);
  try {
    const res = await fetch(fullUrl, options);
    if (res.status === 401 && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `คำขอล้มเหลว (HTTP ${res.status})`);
    }
    return res.json();
  } catch (err) {
    throw new Error(err.message || `คำขอล้มเหลว (${method} ${endpoint})`);
  }
}
