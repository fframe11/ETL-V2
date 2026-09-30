// Absolute server paths like /app/output/x.csv or C:\data\x.csv. A slash
// inside a URL ("https://api.x/v1") is not preceded by space/quote/start,
// so URLs are left alone.
const SERVER_PATH = /(^|[\s"'(])(\/[\w.-]+){2,}|[A-Za-z]:\\/;

// Turns a backend `detail` into something a user can act on.
export function friendlyApiError(detail, fallback) {
  if (typeof detail !== "string" || !detail.trim()) return fallback;
  if (/dataset not found/i.test(detail)) {
    return 'ยังไม่มีข้อมูลในระบบ กรุณานำเข้าไฟล์ในแท็บ "ไฟล์" ก่อน';
  }
  if (SERVER_PATH.test(detail)) return fallback;
  return detail;
}
