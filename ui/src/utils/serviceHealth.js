// Turns /api/v1/services/status into one honest footer line. One offline
// service (e.g. Kafka) is a degraded platform, not an offline API.
export function summarizeServiceHealth({ data, error, loading } = {}) {
  if (loading && !data) return { level: "unknown", text: "กำลังตรวจสอบระบบ…", offline: [] };
  if (error || !data || typeof data !== "object") {
    return { level: "down", text: "เชื่อมต่อ API ไม่ได้", offline: [] };
  }
  const offline = Object.entries(data)
    .filter(([, s]) => s?.status !== "online")
    .map(([name]) => name);
  if (offline.length === 0) return { level: "ok", text: "ระบบปกติ", offline };
  return { level: "degraded", text: `${offline.length} บริการออฟไลน์`, offline };
}
