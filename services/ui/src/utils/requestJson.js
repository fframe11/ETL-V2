import { friendlyApiError } from "./apiError";

// fetch + JSON for this app's API: sends the session cookie, goes to /login on 401 and throws an
// Error a user can read. The HTTP status stays on error.status (0 when the server was not reached).
export async function requestJson(url, { method = "GET", body } = {}) {
  const options = { method, credentials: "same-origin" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    const error = new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
    error.status = 0;
    throw error;
  }
  if (res.status === 401 && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "";
    const error = new Error(friendlyApiError(detail, `คำขอล้มเหลว (HTTP ${res.status})`));
    error.status = res.status;
    throw error;
  }
  return data;
}
