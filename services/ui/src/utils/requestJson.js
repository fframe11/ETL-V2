import { friendlyApiError } from "./apiError";

// fetch for this app's API: sends the session cookie, goes to /login on 401 and throws an Error a
// user can read when the call fails. The HTTP status stays on error.status (0 when the server was
// not reached).
async function send(url, { method = "GET", body } = {}) {
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
  const res = await send(url, options);
  const data = await readJson(res);
  if (!res.ok) throw failure(res, data);
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
  return { blob: await res.blob(), filename };
}
