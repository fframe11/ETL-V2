import { it, expect } from "vitest";
import { describeChanges } from "./RefinePanel";

it("lists every kind of change in plain words", () => {
  expect(describeChanges({ added: ["ยอดขายรายเดือน"], removed: ["ตารางเก่า"], changed: ["ตามภูมิภาค"], layout_changed: true,
    filters_added: ["province"], filters_removed: [] })).toEqual([
    "เพิ่ม: ยอดขายรายเดือน", "แก้ไข: ตามภูมิภาค", "ลบ: ตารางเก่า", "เพิ่มตัวกรอง: province", "จัดตำแหน่งใหม่"]);
});

it("says so when the AI changed nothing", () => {
  expect(describeChanges({ added: [], removed: [], changed: [], layout_changed: false, filters_added: [], filters_removed: [] }))
    .toEqual(["AI ไม่ได้เปลี่ยนอะไร"]);
});
