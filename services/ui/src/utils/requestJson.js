import { friendlyApiError } from "./apiError";
import { resolveApiUrl } from "./apiConfig";

// fetch for this app's API: sends the session cookie, goes to /login on 401 and throws an Error a
// user can read when the call fails. The HTTP status stays on error.status (0 when the server was
// not reached).
async function send(url, { method = "GET", body, headers: customHeaders } = {}) {
  const token = typeof window !== "undefined" ? (sessionStorage.getItem("sdoqap_token") || localStorage.getItem("sdoqap_token")) : null;
  const headers = { ...(customHeaders || {}) };
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const options = { method, credentials: "same-origin", headers };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    const targetUrl = resolveApiUrl(url);
    res = await fetch(targetUrl, options);
  } catch {
    const error = new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
    error.status = 0;
    throw error;
  }
  const isDemo = typeof window !== "undefined" && (
    localStorage.getItem("dataserve_demo_mode") === "true" ||
    localStorage.getItem("sdoqap_demo_mode") === "true" ||
    localStorage.getItem("sdoqap_static_demo") === "true"
  );
  if (res.status === 401 && window.location.pathname !== "/login" && !isDemo) {
    window.location.href = "/login";
  }
  return res;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function failure(res, data) {
  const detail = typeof data.detail === "string" ? data.detail : "";
  const error = new Error(friendlyApiError(detail, `คำขอล้มเหลว (HTTP ${res.status})`));
  error.status = res.status;
  return error;
}

// fetch + JSON.
export async function requestJson(url, options) {
  const isDemo = typeof window !== "undefined" && (
    localStorage.getItem("dataserve_demo_mode") === "true" ||
    localStorage.getItem("sdoqap_demo_mode") === "true" ||
    localStorage.getItem("sdoqap_static_demo") === "true"
  );
  let res;
  let data = {};
  try {
    res = await send(url, options);
    data = await readJson(res);
  } catch (err) {
    if (isDemo) {
      res = { ok: false, status: err.status || 0 };
    } else {
      throw err;
    }
  }
  if (!res.ok) {
    if ((res.status === 0 || res.status === 401 || res.status === 404 || res.status >= 500) && isDemo) {
      if (url.includes("/preview")) {
        const isSales = url.includes("sales_records");
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
      if (url.includes("/dashboards/datasets") || url.includes("/datasets")) {
        return {
          datasets: [
            {
              table_name: "student_course_scores",
              row_count: 9400,
              columns_count: 8,
              last_updated: "2026-10-10T12:00:00Z",
              kinds_count: { numeric: 4, text: 3, date: 1 }
            },
            {
              table_name: "sales_records",
              row_count: 1,
              columns_count: 6,
              last_updated: "2026-10-10T12:00:00Z",
              kinds_count: { numeric: 3, text: 2, date: 1 }
            }
          ]
        };
      }
      if (url.includes("/dashboards/generate") || url.includes("/generate")) {
        let reqBody = {};
        try {
          reqBody = options?.body ? (typeof options.body === "string" ? JSON.parse(options.body) : options.body) : {};
        } catch {}
        const ctx = (reqBody.context || "").trim();
        if (ctx.length < 5 || /^\d+$/.test(ctx.replace(/\s+/g, ""))) {
          const err = new Error("ความต้องการวิเคราะห์ต้องมีความหมาย ไม่สามารถระบุเฉพาะตัวเลขล้วนได้ (HTTP 422)");
          err.status = 422;
          throw err;
        }
        const letters = ctx.match(/[a-zA-Z\u0E00-\u0E7F]/g) || [];
        if (letters.length < 3) {
          const err = new Error("กรุณาระบุความต้องการวิเคราะห์ที่สื่อความหมายชัดเจน (HTTP 422)");
          err.status = 422;
          throw err;
        }
        const isSalesReq = (reqBody.table_name === "sales_records") || /sales|ขาย|ยอดขาย|profit|กำไร/i.test(ctx);
        if (isSalesReq) {
          return {
            engine: "demo",
            model: "demo-static-engine",
            warnings: ["รันในโหมดสาธิต (Demo Mode): จำลองการทำงานเพื่อการนำเสนอ"],
            spec: {
              title: "Sales Volume & Performance Analytics",
              description: "วิเคราะห์ยอดขาย ผลกำไร ปริมาณคำสั่งซื้อ และเสถียรภาพคุณภาพข้อมูล",
              audience: "business",
              insights: "ภาพรวมยอดขายเติบโตต่อเนื่องในกลุ่ม Electronics (650K ฿) คิดเป็น 52.2% ของพอร์ตโฟลิโอ โดยช่องทาง Online Store สร้างกำไรสูงสุด ขณะที่อัตรากักกันข้อมูล (DQ Quarantine Rate) อยู่ที่ 0.05% ซึ่งต่ำกว่าเกณฑ์ควบคุมคุณภาพอย่างมีนัยสำคัญ",
              filters: [
                { id: "f1", type: "select", column: "product_category", label: "หมวดหมู่สินค้า" },
                { id: "f2", type: "select", column: "sales_channel", label: "ช่องทางจำหน่าย" },
                { id: "f3", type: "select", column: "region", label: "ภูมิภาค" }
              ],
              widgets: [
                { id: "w1", type: "kpi", title: "ยอดขายรวม (Gross Revenue)", metric: { agg: "sum", column: "sales_amount" }, format: "currency", layout: { x: 0, y: 0, w: 3, h: 2 } },
                { id: "w2", type: "kpi", title: "กำไรสุทธิ (Net Profit)", metric: { agg: "sum", column: "profit" }, format: "currency", layout: { x: 3, y: 0, w: 3, h: 2 } },
                { id: "w3", type: "kpi", title: "ปริมาณคำสั่งซื้อ (Order Volume)", metric: { agg: "count", column: null }, format: "number", layout: { x: 6, y: 0, w: 3, h: 2 } },
                { id: "w4", type: "kpi", title: "อัตราข้อมูลกักกัน (DQ Quarantine Rate)", metric: { agg: "avg", column: "quarantine_rate" }, format: "percent", higher_is_better: false, layout: { x: 9, y: 0, w: 3, h: 2 } },
                { id: "w5", type: "area", title: "แนวโน้มยอดขายรายเดือน (Monthly Revenue Trend)", x: "order_date", metric: { agg: "sum", column: "sales_amount" }, time_grain: "month", layout: { x: 0, y: 2, w: 6, h: 4 } },
                { id: "w6", type: "bar", title: "ยอดขายตามหมวดหมู่สินค้า (Revenue by Category)", x: "product_category", metric: { agg: "sum", column: "sales_amount" }, sort: "desc", limit: 10, layout: { x: 6, y: 2, w: 6, h: 4 } },
                { id: "w7", type: "donut", title: "สัดส่วนยอดขายตามช่องทางจำหน่าย (Sales Channel Share)", x: "sales_channel", metric: { agg: "sum", column: "sales_amount" }, layout: { x: 0, y: 6, w: 4, h: 4 } },
                { id: "w8", type: "table", title: "รายการธุรกรรมและสถานะตรวจสอบคุณภาพ (Audit Transaction Log)", columns: ["order_id", "order_date", "product_category", "sales_channel", "sales_amount", "profit", "dq_status"], limit: 20, layout: { x: 4, y: 6, w: 8, h: 4 } }
              ]
            },
            data: {
              rows_total: 15420,
              rows_after_filter: 15420,
              column_labels: {},
              filter_options: {
                product_category: { values: ["Electronics", "Appliances", "Furniture", "Office Supplies"] },
                sales_channel: { values: ["Online Store", "Retail", "Wholesale", "Enterprise Direct"] },
                region: { values: ["Bangkok & Vicinity", "Central", "North", "Northeast", "South"] }
              },
              widgets: {
                w1: { value: 1245000, change_pct: 12.8 },
                w2: { value: 324500, change_pct: 18.4 },
                w3: { value: 15420, change_pct: 6.5 },
                w4: { value: 0.05, change_pct: -0.02 },
                w5: { rows: [{ x: "2026-01", value: 165000 }, { x: "2026-02", value: 182000 }, { x: "2026-03", value: 210000 }, { x: "2026-04", value: 198000 }, { x: "2026-05", value: 235000 }, { x: "2026-06", value: 255000 }], series: ["value"] },
                w6: { rows: [{ x: "Electronics", value: 650000 }, { x: "Appliances", value: 320000 }, { x: "Furniture", value: 175000 }, { x: "Office Supplies", value: 100000 }], series: ["value"] },
                w7: { rows: [{ x: "Online Store", value: 560000 }, { x: "Retail", value: 375000 }, { x: "Wholesale", value: 190000 }, { x: "Enterprise Direct", value: 120000 }], series: ["value"] },
                w8: {
                  columns: ["order_id", "order_date", "product_category", "sales_channel", "sales_amount", "profit", "dq_status"],
                  rows: [
                    { order_id: "SO-2026-001", order_date: "2026-06-12", product_category: "Electronics", sales_channel: "Online Store", sales_amount: 34500, profit: 9200, dq_status: "PASSED" },
                    { order_id: "SO-2026-002", order_date: "2026-06-12", product_category: "Appliances", sales_channel: "Retail", sales_amount: 18900, profit: 4700, dq_status: "PASSED" },
                    { order_id: "SO-2026-003", order_date: "2026-06-11", product_category: "Electronics", sales_channel: "Enterprise Direct", sales_amount: 125000, profit: 38000, dq_status: "PASSED" },
                    { order_id: "SO-2026-004", order_date: "2026-06-11", product_category: "Furniture", sales_channel: "Wholesale", sales_amount: 42000, profit: 11500, dq_status: "PASSED" },
                    { order_id: "SO-2026-005", order_date: "2026-06-10", product_category: "Office Supplies", sales_channel: "Online Store", sales_amount: 8600, profit: 2400, dq_status: "PASSED" }
                  ]
                }
              }
            }
          };
        }
        return {
          engine: "demo",
          model: "demo-static-engine",
          warnings: ["รันในโหมดสาธิต (Demo Mode): จำลองการทำงานเพื่อการนำเสนอ"],
          spec: {
            title: "Student Course Evaluation Dashboard",
            description: "สรุปคะแนนเฉลี่ย ความสัมพันธ์ชั่วโมงเรียน และการกระจายตัวของระดับผลการเรียน",
            audience: "business",
            insights: "คะแนนเฉลี่ยรวมระดับสถาบันอยู่ที่ 78.4 โดยวิชา Machine Learning มีผลสัมฤทธิ์สูงสุด (91.5) และอัตราผ่านเกณฑ์รวมแตะ 94.2% ทั้งนี้ตรวจพบนักศึกษากลุ่มเฝ้าระวัง 136 คน (ชั่วโมงเรียนเฉลี่ยต่ำกว่า 3.5 ชม./สัปดาห์) ซึ่งมีค่าสัมประสิทธิ์สัมพันธ์โดยตรงกับระดับคะแนน",
            filters: [
              { id: "f1", column: "course", label: "รายวิชา", type: "select" },
              { id: "f2", column: "semester", label: "ภาคการศึกษา", type: "select" },
              { id: "f3", column: "faculty", label: "คณะ", type: "select" }
            ],
            widgets: [
              { id: "w1", type: "kpi", title: "คะแนนเฉลี่ยรวม (Overall Score)", metric: { agg: "avg", column: "score" }, format: "number", layout: { x: 0, y: 0, w: 3, h: 2 } },
              { id: "w2", type: "kpi", title: "จำนวนนักศึกษา (Enrolled Students)", metric: { agg: "count_distinct", column: "student_id" }, format: "number", layout: { x: 3, y: 0, w: 3, h: 2 } },
              { id: "w3", type: "kpi", title: "อัตราการผ่านเกณฑ์ (Pass Rate)", metric: { agg: "avg", column: "pass_rate" }, format: "percent", layout: { x: 6, y: 0, w: 3, h: 2 } },
              { id: "w4", type: "kpi", title: "ชั่วโมงเรียนเฉลี่ย (Study Hours/Wk)", metric: { agg: "avg", column: "study_hours" }, format: "number", layout: { x: 9, y: 0, w: 3, h: 2 } },
              { id: "w5", type: "bar", title: "คะแนนเฉลี่ยจำแนกตามรายวิชา (Mean Score by Course)", x: "course", metric: { agg: "avg", column: "score" }, sort: "desc", limit: 10, layout: { x: 0, y: 2, w: 6, h: 4 } },
              { id: "w6", type: "line", title: "แนวโน้มชั่วโมงเรียนกับผลสัมฤทธิ์รายสัปดาห์ (Study Hours Trend)", x: "week", metric: { agg: "avg", column: "study_hours" }, time_grain: "week", layout: { x: 6, y: 2, w: 6, h: 4 } },
              { id: "w7", type: "donut", title: "สัดส่วนระดับผลการเรียน (Grade Distribution)", x: "grade_tier", metric: { agg: "count", column: null }, layout: { x: 0, y: 6, w: 4, h: 4 } },
              { id: "w8", type: "table", title: "ข้อมูลนักศึกษาและผลการประเมินความเสี่ยง (Student Academic Records)", columns: ["student_id", "course", "score", "study_hours", "semester", "academic_status"], limit: 20, layout: { x: 4, y: 6, w: 8, h: 4 } }
            ]
          },
          data: {
            rows_total: 9400,
            rows_after_filter: 9400,
            column_labels: {},
            filter_options: {
              course: { values: ["Python Programming", "Data Warehouse", "Database Systems", "Machine Learning"] },
              semester: { values: ["1/2026", "2/2026"] },
              faculty: { values: ["วิศวกรรมศาสตร์", "วิทยาการคอมพิวเตอร์", "เทคโนโลยีสารสนเทศ"] }
            },
            widgets: {
              w1: { value: 78.4, change_pct: 3.2 },
              w2: { value: 2350, change_pct: 5.8 },
              w3: { value: 94.2, change_pct: 2.1 },
              w4: { value: 4.8, change_pct: 8.5 },
              w5: { rows: [{ x: "Machine Learning", value: 91.5 }, { x: "Data Warehouse", value: 81.4 }, { x: "Python Programming", value: 78.2 }, { x: "Database Systems", value: 75.6 }], series: ["value"] },
              w6: { rows: [{ x: "W1", value: 3.8 }, { x: "W2", value: 4.2 }, { x: "W3", value: 4.5 }, { x: "W4", value: 4.9 }, { x: "W5", value: 5.3 }, { x: "W6", value: 5.6 }], series: ["value"] },
              w7: { rows: [{ x: "Grade A (80-100)", value: 658 }, { x: "Grade B (70-79)", value: 987 }, { x: "Grade C (60-69)", value: 517 }, { x: "Grade D/F (<60)", value: 188 }], series: ["value"] },
              w8: {
                columns: ["student_id", "course", "score", "study_hours", "semester", "academic_status"],
                rows: [
                  { student_id: "65001", course: "Machine Learning", score: 94.5, study_hours: 6.5, semester: "1/2026", academic_status: "EXCELLENT" },
                  { student_id: "65002", course: "Data Warehouse", score: 88.0, study_hours: 6.0, semester: "1/2026", academic_status: "GOOD" },
                  { student_id: "65003", course: "Python Programming", score: 78.5, study_hours: 4.5, semester: "1/2026", academic_status: "NORMAL" },
                  { student_id: "65004", course: "Database Systems", score: 72.0, study_hours: 3.5, semester: "1/2026", academic_status: "NORMAL" },
                  { student_id: "65005", course: "Database Systems", score: 58.0, study_hours: 2.0, semester: "1/2026", academic_status: "AT RISK" }
                ]
              }
            }
          }
        };
      }
      if (url.includes("/dashboards/saved") || url.includes("/saved")) {
        const method = (options?.method || "GET").toUpperCase();
        if (method === "POST") {
          let body = {};
          try { body = options?.body ? JSON.parse(options.body) : {}; } catch {}
          const newDoc = {
            id: `dash_${Date.now()}`,
            name: body.name || "Custom Dashboard",
            table_name: body.table_name || "student_course_scores",
            description: body.description || "",
            audience: body.audience || "business",
            spec: body.spec || {},
            refinements: body.refinements || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          try {
            const stored = JSON.parse(localStorage.getItem("sdoqap_demo_saved_dashboards") || "[]");
            stored.unshift(newDoc);
            localStorage.setItem("sdoqap_demo_saved_dashboards", JSON.stringify(stored));
          } catch {}
          return newDoc;
        }
        if (method === "DELETE") {
          const savedMatch = url.match(/\/saved\/([^/?#]+)/);
          const delId = savedMatch ? savedMatch[1] : null;
          if (delId) {
            try {
              const stored = JSON.parse(localStorage.getItem("sdoqap_demo_saved_dashboards") || "[]");
              localStorage.setItem("sdoqap_demo_saved_dashboards", JSON.stringify(stored.filter(d => d.id !== delId)));
            } catch {}
          }
          return { status: "deleted", id: delId };
        }
        const savedMatch = url.match(/\/saved\/([^/?#]+)/);
        if (savedMatch && savedMatch[1] !== "saved") {
          const sId = savedMatch[1];
          try {
            const stored = JSON.parse(localStorage.getItem("sdoqap_demo_saved_dashboards") || "[]");
            const found = stored.find(d => d.id === sId);
            if (found) return found;
          } catch {}
          if (sId === "dash_sales_vol") {
            return {
              id: sId,
              name: "Sales Volume & Ingestion Trend",
              table_name: "sales_records",
              description: "วิเคราะห์แนวโน้มยอดขาย ผลกำไร และเสถียรภาพการนำเข้าข้อมูล (Sell-In vs Sell-Out)",
              audience: "business",
              spec: {
                title: "Sales Volume & Ingestion Trend",
                description: "วิเคราะห์ยอดขาย ผลกำไร อัตรากักกันข้อมูล และการกระจายตัวตามช่องทางจำหน่าย",
                insights: "ภาพรวมยอดขายเติบโตต่อเนื่องในกลุ่ม Electronics (650K ฿) คิดเป็น 52.2% ของพอร์ตโฟลิโอ โดยช่องทาง Online Store สร้างกำไรสูงสุด ขณะที่อัตรากักกันข้อมูล (DQ Quarantine Rate) อยู่ที่ 0.05% ซึ่งต่ำกว่าเกณฑ์ควบคุมคุณภาพอย่างมีนัยสำคัญ",
                filters: [
                  { id: "f1", type: "select", column: "product_category", label: "หมวดหมู่สินค้า" },
                  { id: "f2", type: "select", column: "sales_channel", label: "ช่องทางจำหน่าย" },
                  { id: "f3", type: "select", column: "region", label: "ภูมิภาค" }
                ],
                widgets: [
                  { id: "w1", title: "ยอดขายรวม (Gross Revenue)", type: "kpi", metric: { agg: "sum", column: "sales_amount" }, format: "currency", layout: { x: 0, y: 0, w: 3, h: 2 } },
                  { id: "w2", title: "กำไรสุทธิ (Net Profit)", type: "kpi", metric: { agg: "sum", column: "profit" }, format: "currency", layout: { x: 3, y: 0, w: 3, h: 2 } },
                  { id: "w3", title: "ปริมาณคำสั่งซื้อ (Order Volume)", type: "kpi", metric: { agg: "count", column: null }, format: "number", layout: { x: 6, y: 0, w: 3, h: 2 } },
                  { id: "w4", title: "อัตราข้อมูลกักกัน (DQ Quarantine Rate)", type: "kpi", metric: { agg: "avg", column: "quarantine_rate" }, format: "percent", higher_is_better: false, layout: { x: 9, y: 0, w: 3, h: 2 } },
                  { id: "w5", title: "แนวโน้มยอดขายรายเดือน (Monthly Revenue Trend)", type: "area", x: "order_date", metric: { agg: "sum", column: "sales_amount" }, time_grain: "month", layout: { x: 0, y: 2, w: 6, h: 4 } },
                  { id: "w6", title: "ยอดขายตามหมวดหมู่สินค้า (Revenue by Category)", type: "bar", x: "product_category", metric: { agg: "sum", column: "sales_amount" }, sort: "desc", layout: { x: 6, y: 2, w: 6, h: 4 } },
                  { id: "w7", title: "สัดส่วนยอดขายตามช่องทางจำหน่าย (Sales Channel Share)", type: "donut", x: "sales_channel", metric: { agg: "sum", column: "sales_amount" }, layout: { x: 0, y: 6, w: 4, h: 4 } },
                  { id: "w8", title: "รายการธุรกรรมและสถานะตรวจสอบคุณภาพ (Audit Transaction Log)", type: "table", columns: ["order_id", "order_date", "product_category", "sales_channel", "sales_amount", "profit", "dq_status"], layout: { x: 4, y: 6, w: 8, h: 4 } }
                ]
              },
              refinements: []
            };
          }
          return {
            id: sId,
            name: "Executive Student Quality Cockpit",
            table_name: "student_course_scores",
            description: "ศูนย์บัญชาการข้อมูลผลสัมฤทธิ์ทางการศึกษา การเฝ้าระวังอัตราผ่านเกณฑ์ และการตรวจประเมินคุณภาพข้อมูลรายวิชา",
            audience: "executive",
            spec: {
              title: "Executive Student Quality Cockpit",
              description: "สรุปคะแนนเฉลี่ย ความสัมพันธ์ชั่วโมงเรียน และการกระจายตัวของระดับผลการเรียน",
              insights: "คะแนนเฉลี่ยรวมระดับสถาบันอยู่ที่ 78.4 โดยวิชา Machine Learning มีผลสัมฤทธิ์สูงสุด (91.5) และอัตราผ่านเกณฑ์รวมแตะ 94.2% ทั้งนี้ตรวจพบนักศึกษากลุ่มเฝ้าระวัง 136 คน (ชั่วโมงเรียนเฉลี่ยต่ำกว่า 3.5 ชม./สัปดาห์) ซึ่งมีค่าสัมประสิทธิ์สัมพันธ์โดยตรงกับระดับคะแนน",
              filters: [
                { id: "f1", type: "select", column: "course", label: "รายวิชา" },
                { id: "f2", type: "select", column: "semester", label: "ภาคการศึกษา" },
                { id: "f3", type: "select", column: "faculty", label: "คณะ" }
              ],
              widgets: [
                { id: "w1", title: "คะแนนเฉลี่ยรวม (Overall Score)", type: "kpi", metric: { agg: "avg", column: "score" }, format: "number", layout: { x: 0, y: 0, w: 3, h: 2 } },
                { id: "w2", title: "จำนวนนักศึกษา (Enrolled Students)", type: "kpi", metric: { agg: "count_distinct", column: "student_id" }, format: "number", layout: { x: 3, y: 0, w: 3, h: 2 } },
                { id: "w3", title: "อัตราการผ่านเกณฑ์ (Pass Rate)", type: "kpi", metric: { agg: "avg", column: "pass_rate" }, format: "percent", layout: { x: 6, y: 0, w: 3, h: 2 } },
                { id: "w4", title: "ชั่วโมงเรียนเฉลี่ย (Study Hours/Wk)", type: "kpi", metric: { agg: "avg", column: "study_hours" }, format: "number", layout: { x: 9, y: 0, w: 3, h: 2 } },
                { id: "w5", title: "คะแนนเฉลี่ยจำแนกตามรายวิชา (Mean Score by Course)", type: "bar", x: "course", metric: { agg: "avg", column: "score" }, sort: "desc", layout: { x: 0, y: 2, w: 6, h: 4 } },
                { id: "w6", title: "แนวโน้มชั่วโมงเรียนกับผลสัมฤทธิ์รายสัปดาห์ (Study Hours Trend)", type: "line", x: "week", metric: { agg: "avg", column: "study_hours" }, time_grain: "week", layout: { x: 6, y: 2, w: 6, h: 4 } },
                { id: "w7", title: "สัดส่วนระดับผลการเรียน (Grade Distribution)", type: "donut", x: "grade_tier", metric: { agg: "count", column: null }, layout: { x: 0, y: 6, w: 4, h: 4 } },
                { id: "w8", title: "ข้อมูลนักศึกษาและผลการประเมินความเสี่ยง (Student Academic Records)", type: "table", columns: ["student_id", "course", "score", "study_hours", "semester", "academic_status"], layout: { x: 4, y: 6, w: 8, h: 4 } }
              ]
            },
            refinements: []
          };
        }
        let customSaved = [];
        try {
          customSaved = JSON.parse(localStorage.getItem("sdoqap_demo_saved_dashboards") || "[]");
        } catch {}
        const defaultList = [
          {
            id: "dash_student_dq",
            name: "Executive Student Quality Cockpit",
            table_name: "student_course_scores",
            widget_count: 8,
            updated_at: "2026-10-10T12:00:00Z",
            description: "รายงานสรุปความสมบูรณ์ของข้อมูลคะแนนนักศึกษาและการประเมินความเสี่ยงเกรดเฉลี่ย"
          },
          {
            id: "dash_sales_vol",
            name: "Sales Volume & Ingestion Trend",
            table_name: "sales_records",
            widget_count: 8,
            updated_at: "2026-10-10T11:30:00Z",
            description: "วิเคราะห์แนวโน้มยอดขายและเปรียบเทียบปริมาณข้อมูล Sell-In vs Sell-Out"
          }
        ];
        return {
          dashboards: [
            ...customSaved.map(d => ({
              id: d.id,
              name: d.name,
              table_name: d.table_name,
              widget_count: d.spec?.widgets?.length || 0,
              updated_at: d.updated_at,
              description: d.description
            })),
            ...defaultList
          ]
        };
      }
      if (url.includes("/render")) {
        const reqBody = options?.body || {};
        const isSales = (reqBody.table_name === "sales_records") || (reqBody.spec?.title?.includes("Sales"));
        if (isSales) {
          const baseSpec = reqBody.spec?.widgets?.length >= 8 ? reqBody.spec : {
            title: "Sales Volume & Ingestion Trend",
            description: "วิเคราะห์ยอดขาย ผลกำไร อัตรากักกันข้อมูล และการกระจายตัวตามช่องทางจำหน่าย",
            insights: "ภาพรวมยอดขายเติบโตต่อเนื่องในกลุ่ม Electronics (650K ฿) คิดเป็น 52.2% ของพอร์ตโฟลิโอ โดยช่องทาง Online Store สร้างกำไรสูงสุด ขณะที่อัตรากักกันข้อมูล (DQ Quarantine Rate) อยู่ที่ 0.05% ซึ่งต่ำกว่าเกณฑ์ควบคุมคุณภาพอย่างมีนัยสำคัญ",
            filters: [
              { id: "f1", type: "select", column: "product_category", label: "หมวดหมู่สินค้า" },
              { id: "f2", type: "select", column: "sales_channel", label: "ช่องทางจำหน่าย" },
              { id: "f3", type: "select", column: "region", label: "ภูมิภาค" }
            ],
            widgets: [
              { id: "w1", type: "kpi", title: "ยอดขายรวม (Gross Revenue)", metric: { agg: "sum", column: "sales_amount" }, format: "currency", layout: { x: 0, y: 0, w: 3, h: 2 } },
              { id: "w2", type: "kpi", title: "กำไรสุทธิ (Net Profit)", metric: { agg: "sum", column: "profit" }, format: "currency", layout: { x: 3, y: 0, w: 3, h: 2 } },
              { id: "w3", type: "kpi", title: "ปริมาณคำสั่งซื้อ (Order Volume)", metric: { agg: "count", column: null }, format: "number", layout: { x: 6, y: 0, w: 3, h: 2 } },
              { id: "w4", type: "kpi", title: "อัตราข้อมูลกักกัน (DQ Quarantine Rate)", metric: { agg: "avg", column: "quarantine_rate" }, format: "percent", higher_is_better: false, layout: { x: 9, y: 0, w: 3, h: 2 } },
              { id: "w5", type: "area", title: "แนวโน้มยอดขายรายเดือน (Monthly Revenue Trend)", x: "order_date", metric: { agg: "sum", column: "sales_amount" }, time_grain: "month", layout: { x: 0, y: 2, w: 6, h: 4 } },
              { id: "w6", type: "bar", title: "ยอดขายตามหมวดหมู่สินค้า (Revenue by Category)", x: "product_category", metric: { agg: "sum", column: "sales_amount" }, sort: "desc", limit: 10, layout: { x: 6, y: 2, w: 6, h: 4 } },
              { id: "w7", type: "donut", title: "สัดส่วนยอดขายตามช่องทางจำหน่าย (Sales Channel Share)", x: "sales_channel", metric: { agg: "sum", column: "sales_amount" }, layout: { x: 0, y: 6, w: 4, h: 4 } },
              { id: "w8", type: "table", title: "รายการธุรกรรมและสถานะตรวจสอบคุณภาพ (Audit Transaction Log)", columns: ["order_id", "order_date", "product_category", "sales_channel", "sales_amount", "profit", "dq_status"], limit: 20, layout: { x: 4, y: 6, w: 8, h: 4 } }
            ]
          };
          return {
            spec: baseSpec,
            data: {
              rows_total: 15420,
              rows_after_filter: 15420,
              column_labels: {},
              filter_options: {
                product_category: { values: ["Electronics", "Appliances", "Furniture", "Office Supplies"] },
                sales_channel: { values: ["Online Store", "Retail", "Wholesale", "Enterprise Direct"] },
                region: { values: ["Bangkok & Vicinity", "Central", "North", "Northeast", "South"] }
              },
              widgets: {
                w1: { value: 1245000, change_pct: 12.8 },
                w2: { value: 324500, change_pct: 18.4 },
                w3: { value: 15420, change_pct: 6.5 },
                w4: { value: 0.05, change_pct: -0.02 },
                w5: { rows: [{ x: "2026-01", value: 165000 }, { x: "2026-02", value: 182000 }, { x: "2026-03", value: 210000 }, { x: "2026-04", value: 198000 }, { x: "2026-05", value: 235000 }, { x: "2026-06", value: 255000 }], series: ["value"] },
                w6: { rows: [{ x: "Electronics", value: 650000 }, { x: "Appliances", value: 320000 }, { x: "Furniture", value: 175000 }, { x: "Office Supplies", value: 100000 }], series: ["value"] },
                w7: { rows: [{ x: "Online Store", value: 560000 }, { x: "Retail", value: 375000 }, { x: "Wholesale", value: 190000 }, { x: "Enterprise Direct", value: 120000 }], series: ["value"] },
                w8: {
                  columns: ["order_id", "order_date", "product_category", "sales_channel", "sales_amount", "profit", "dq_status"],
                  rows: [
                    { order_id: "SO-2026-001", order_date: "2026-06-12", product_category: "Electronics", sales_channel: "Online Store", sales_amount: 34500, profit: 9200, dq_status: "PASSED" },
                    { order_id: "SO-2026-002", order_date: "2026-06-12", product_category: "Appliances", sales_channel: "Retail", sales_amount: 18900, profit: 4700, dq_status: "PASSED" },
                    { order_id: "SO-2026-003", order_date: "2026-06-11", product_category: "Electronics", sales_channel: "Enterprise Direct", sales_amount: 125000, profit: 38000, dq_status: "PASSED" },
                    { order_id: "SO-2026-004", order_date: "2026-06-11", product_category: "Furniture", sales_channel: "Wholesale", sales_amount: 42000, profit: 11500, dq_status: "PASSED" },
                    { order_id: "SO-2026-005", order_date: "2026-06-10", product_category: "Office Supplies", sales_channel: "Online Store", sales_amount: 8600, profit: 2400, dq_status: "PASSED" }
                  ]
                }
              }
            },
            warnings: []
          };
        }
        const baseSpec = reqBody.spec?.widgets?.length >= 8 ? reqBody.spec : {
          title: "Executive Student Quality Cockpit",
          description: "สรุปคะแนนเฉลี่ย ความสัมพันธ์ชั่วโมงเรียน และการกระจายตัวของระดับผลการเรียน",
          insights: "คะแนนเฉลี่ยรวมระดับสถาบันอยู่ที่ 78.4 โดยวิชา Machine Learning มีผลสัมฤทธิ์สูงสุด (91.5) และอัตราผ่านเกณฑ์รวมแตะ 94.2% ทั้งนี้ตรวจพบนักศึกษากลุ่มเฝ้าระวัง 136 คน (ชั่วโมงเรียนเฉลี่ยต่ำกว่า 3.5 ชม./สัปดาห์) ซึ่งมีค่าสัมประสิทธิ์สัมพันธ์โดยตรงกับระดับคะแนน",
          filters: [
            { id: "f1", type: "select", column: "course", label: "รายวิชา" },
            { id: "f2", type: "select", column: "semester", label: "ภาคการศึกษา" },
            { id: "f3", type: "select", column: "faculty", label: "คณะ" }
          ],
          widgets: [
            { id: "w1", type: "kpi", title: "คะแนนเฉลี่ยรวม (Overall Score)", metric: { agg: "avg", column: "score" }, format: "number", layout: { x: 0, y: 0, w: 3, h: 2 } },
            { id: "w2", type: "kpi", title: "จำนวนนักศึกษา (Enrolled Students)", metric: { agg: "count_distinct", column: "student_id" }, format: "number", layout: { x: 3, y: 0, w: 3, h: 2 } },
            { id: "w3", type: "kpi", title: "อัตราการผ่านเกณฑ์ (Pass Rate)", metric: { agg: "avg", column: "pass_rate" }, format: "percent", layout: { x: 6, y: 0, w: 3, h: 2 } },
            { id: "w4", type: "kpi", title: "ชั่วโมงเรียนเฉลี่ย (Study Hours/Wk)", metric: { agg: "avg", column: "study_hours" }, format: "number", layout: { x: 9, y: 0, w: 3, h: 2 } },
            { id: "w5", type: "bar", title: "คะแนนเฉลี่ยจำแนกตามรายวิชา (Mean Score by Course)", x: "course", metric: { agg: "avg", column: "score" }, sort: "desc", limit: 10, layout: { x: 0, y: 2, w: 6, h: 4 } },
            { id: "w6", type: "line", title: "แนวโน้มชั่วโมงเรียนกับผลสัมฤทธิ์รายสัปดาห์ (Study Hours Trend)", x: "week", metric: { agg: "avg", column: "study_hours" }, time_grain: "week", layout: { x: 6, y: 2, w: 6, h: 4 } },
            { id: "w7", type: "donut", title: "สัดส่วนระดับผลการเรียน (Grade Distribution)", x: "grade_tier", metric: { agg: "count", column: null }, layout: { x: 0, y: 6, w: 4, h: 4 } },
            { id: "w8", type: "table", title: "ข้อมูลนักศึกษาและผลการประเมินความเสี่ยง (Student Academic Records)", columns: ["student_id", "course", "score", "study_hours", "semester", "academic_status"], limit: 20, layout: { x: 4, y: 6, w: 8, h: 4 } }
          ]
        };
        return {
          spec: baseSpec,
          data: {
            rows_total: 9400,
            rows_after_filter: 9400,
            column_labels: {},
            filter_options: {
              course: { values: ["Python Programming", "Data Warehouse", "Database Systems", "Machine Learning"] },
              semester: { values: ["1/2026", "2/2026"] },
              faculty: { values: ["วิศวกรรมศาสตร์", "วิทยาการคอมพิวเตอร์", "เทคโนโลยีสารสนเทศ"] }
            },
            widgets: {
              w1: { value: 78.4, change_pct: 3.2 },
              w2: { value: 2350, change_pct: 5.8 },
              w3: { value: 94.2, change_pct: 2.1 },
              w4: { value: 4.8, change_pct: 8.5 },
              w5: { rows: [{ x: "Machine Learning", value: 91.5 }, { x: "Data Warehouse", value: 81.4 }, { x: "Python Programming", value: 78.2 }, { x: "Database Systems", value: 75.6 }], series: ["value"] },
              w6: { rows: [{ x: "W1", value: 3.8 }, { x: "W2", value: 4.2 }, { x: "W3", value: 4.5 }, { x: "W4", value: 4.9 }, { x: "W5", value: 5.3 }, { x: "W6", value: 5.6 }], series: ["value"] },
              w7: { rows: [{ x: "Grade A (80-100)", value: 658 }, { x: "Grade B (70-79)", value: 987 }, { x: "Grade C (60-69)", value: 517 }, { x: "Grade D/F (<60)", value: 188 }], series: ["value"] },
              w8: {
                columns: ["student_id", "course", "score", "study_hours", "semester", "academic_status"],
                rows: [
                  { student_id: "65001", course: "Machine Learning", score: 94.5, study_hours: 6.5, semester: "1/2026", academic_status: "EXCELLENT" },
                  { student_id: "65002", course: "Data Warehouse", score: 88.0, study_hours: 6.0, semester: "1/2026", academic_status: "GOOD" },
                  { student_id: "65003", course: "Python Programming", score: 78.5, study_hours: 4.5, semester: "1/2026", academic_status: "NORMAL" },
                  { student_id: "65004", course: "Database Systems", score: 72.0, study_hours: 3.5, semester: "1/2026", academic_status: "NORMAL" },
                  { student_id: "65005", course: "Database Systems", score: 58.0, study_hours: 2.0, semester: "1/2026", academic_status: "AT RISK" }
                ]
              }
            }
          },
          warnings: []
        };
      }
      if (url.includes("/suggestions")) {
        return {
          suggestions: [
            {
              id: "sug_overview",
              title: "สรุปภาพรวมคะแนนเฉลี่ย",
              description: "แสดงแนวโน้มคะแนนเฉลี่ยจำแนกตามภาควิชา",
              type: "bar"
            }
          ]
        };
      }
      if (url.includes("/semantic")) {
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
    }
    throw failure(res, data);
  }
  return data;
}

// The file name in a Content-Disposition header: RFC 6266 filename* (UTF-8, percent-encoded) first,
// then a quoted filename (which may hold ";"), then a bare one. "" when there is none.
function filenameFrom(disposition) {
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(disposition);
  if (star) {
    try { return decodeURIComponent(star[1].trim()); } catch { /* malformed escape: fall through */ }
  }
  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(disposition);
  if (quoted) return quoted[1].replace(/\\(.)/g, "$1");
  const bare = /filename\s*=\s*([^;]+)/i.exec(disposition);
  return bare ? bare[1].trim() : "";
}

// A file to download, such as a CSV: the same cookie, 401 and error handling as requestJson, but it
// resolves to { blob, filename }. The name comes from the server's Content-Disposition, else fallbackName.
export async function requestFile(url, options, fallbackName = "download") {
  const res = await send(url, options);
  if (!res.ok) throw failure(res, await readJson(res));
  const disposition = res.headers?.get?.("Content-Disposition") || "";
  const filename = filenameFrom(disposition).replace(/[\\/]/g, "_") || fallbackName;
  let blob;
  try {
    blob = await res.blob();
  } catch { // the connection broke while the file was arriving: the browser's own text is English
    const e = new Error("ดาวน์โหลดไฟล์ไม่ครบ กรุณาลองใหม่");
    e.status = 0;
    throw e;
  }
  return { blob, filename };
}
