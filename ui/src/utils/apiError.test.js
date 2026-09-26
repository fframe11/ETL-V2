import { it, expect } from "vitest";
import { friendlyApiError } from "./apiError";

const FALLBACK = "เชื่อมต่อแหล่งข้อมูลไม่สำเร็จ (HTTP 404)";

it("explains a missing dataset as a next step", () => {
  const msg = friendlyApiError("Dirty dataset not found at /app/student_course_score_evaluation_dataset/dirty_dataset.csv", FALLBACK);
  expect(msg).toBe('ยังไม่มีข้อมูลในระบบ กรุณานำเข้าไฟล์ในแท็บ "ไฟล์" ก่อน');
});

it("hides messages that expose server file paths", () => {
  expect(friendlyApiError("Failed reading /app/output/x_uploaded.csv", FALLBACK)).toBe(FALLBACK);
  expect(friendlyApiError("Failed reading C:\\data\\x.csv", FALLBACK)).toBe(FALLBACK);
});

it("keeps readable messages, including ones that contain a URL", () => {
  expect(friendlyApiError("ไม่สามารถอ่านไฟล์ CSV ได้: bad header", FALLBACK)).toBe("ไม่สามารถอ่านไฟล์ CSV ได้: bad header");
  expect(friendlyApiError("Host 'https://api.x/v1' is not in the allowlist.", FALLBACK)).toBe("Host 'https://api.x/v1' is not in the allowlist.");
});

it("falls back when detail is missing or not a string (FastAPI validation lists)", () => {
  expect(friendlyApiError(undefined, FALLBACK)).toBe(FALLBACK);
  expect(friendlyApiError([{ loc: ["body"], msg: "field required" }], FALLBACK)).toBe(FALLBACK);
});
