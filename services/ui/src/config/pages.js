export const NAV_GROUPS = [
  { key: "start", title: "" },
  { key: "workflow", title: "Data Pipelines" },
  { key: "monitor", title: "Data Quality & Governance" }
];

export const PAGES = [
  { key: "home", path: "/", label: "Home", subtitle: "", group: "start" },
  { key: "guide", path: "/guide", label: "Learn & Architecture", subtitle: "คู่มือระบบและ Architecture Reference", group: "start" },
  { key: "ingestion", path: "/ingestion", label: "Data Ingestion", subtitle: "นำเข้าข้อมูลจาก File, Database, API หรือ Stream", group: "workflow", step: 1 },
  { key: "rules", path: "/rules", label: "Expectations & Alerts", subtitle: "ตั้งค่า Data Quality Rules & Expectations", group: "workflow", step: 2 },
  { key: "pipeline", path: "/pipeline", label: "Jobs & Pipelines", subtitle: "ประมวลผล Pipeline คัดแยก Clean และ Quarantine", group: "workflow", step: 3 },
  { key: "export", path: "/export", label: "Workspace Exports", subtitle: "Export ข้อมูล Clean/Golden สู่ปลายทาง", group: "workflow", step: 4 },
  { key: "dashboard", path: "/dashboard", label: "Dashboards", subtitle: "ภาพรวม Data Quality Metrics และสถิติระบบ", group: "monitor" },
  { key: "builder", path: "/dashboard-builder", label: "Create Dashboard", subtitle: "สร้างแดชบอร์ดฉบับร่างจากข้อมูลที่ผ่านการตรวจคุณภาพ", group: "monitor" },
  { key: "analytics", path: "/analytics", label: "Query & Metrics", subtitle: "วิเคราะห์ DQ Trends และ Data Recommendations", group: "monitor" },
  { key: "schema", path: "/schema", label: "Catalog", subtitle: "Data Catalog โครงสร้างตาราง และ Schema Governance", group: "monitor" },
  { key: "whitebox", path: "/whitebox", label: "Audit Trail", subtitle: "End-to-End Decision Trace และ Audit Trail", group: "monitor" },
  { key: "execution", path: "/execution-results", label: "Execution & Audit", subtitle: "Test Execution Results และ System Verifications", group: "monitor" }
];

export const WORKFLOW_STEPS = PAGES.filter((p) => p.step).sort((a, b) => a.step - b.step);

export function getPage(key) {
  const page = PAGES.find((p) => p.key === key);
  if (!page) throw new Error(`Unknown page key: ${key}`);
  return page;
}

export function nextStep(key) {
  const page = getPage(key);
  if (!page.step) return null;
  return WORKFLOW_STEPS.find((p) => p.step === page.step + 1) || null;
}
