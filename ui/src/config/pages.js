export const NAV_GROUPS = [
  { key: "start", title: "" },
  { key: "workflow", title: "ขั้นตอนการทำงาน" },
  { key: "monitor", title: "ติดตามและตรวจสอบ" }
];

export const PAGES = [
  { key: "home", path: "/", label: "Home", subtitle: "", group: "start" },
  { key: "guide", path: "/guide", label: "Learn & Architecture", subtitle: "คู่มือการใช้งานและความหมายของพารามิเตอร์", group: "start" },
  { key: "ingestion", path: "/ingestion", label: "Data Ingestion", subtitle: "นำเข้าข้อมูลจากไฟล์ ฐานข้อมูล API หรือ Stream", group: "workflow", step: 1 },
  { key: "rules", path: "/rules", label: "Expectations & Alerts", subtitle: "กำหนดกฎคุณภาพข้อมูลก่อนรัน Pipeline", group: "workflow", step: 2 },
  { key: "pipeline", path: "/pipeline", label: "Jobs & Pipelines", subtitle: "คัดแยกข้อมูลเป็น Clean, Review และ Quarantine", group: "workflow", step: 3 },
  { key: "export", path: "/export", label: "Workspace Exports", subtitle: "ดาวน์โหลดข้อมูลที่ผ่านการคัดกรองแล้ว", group: "workflow", step: 4 },
  { key: "dashboard", path: "/dashboard", label: "Dashboards", subtitle: "ภาพรวมคุณภาพข้อมูลและผลกระทบทางธุรกิจ", group: "monitor" },
  { key: "analytics", path: "/analytics", label: "Query & Metrics", subtitle: "แนวโน้มคุณภาพข้อมูลและคำแนะนำ", group: "monitor" },
  { key: "schema", path: "/schema", label: "Catalog", subtitle: "อนุมัติหรือปฏิเสธการเปลี่ยนโครงสร้างตาราง", group: "monitor" },
  { key: "whitebox", path: "/whitebox", label: "Audit Trail", subtitle: "ดูเหตุผลของระบบทีละขั้น ตั้งแต่สำรวจข้อมูลถึงผลลัพธ์", group: "monitor" }
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
