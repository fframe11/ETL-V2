// What to tell the user after a remediation ticket is resolved. The ticket always closes, but
// reprocessing may not have started: say so instead of showing plain success.
export function resolveToast(res, ticketId) {
  if (res && res.spark_triggered === false) {
    const reason = res.trigger_error ? `: ${res.trigger_error}` : '';
    return {
      type: 'warning',
      message: `ปิดตั๋ว ${ticketId} แล้ว แต่ยังไม่ได้เริ่มประมวลผลตารางใหม่${reason} สั่งประมวลผลซ้ำที่หน้า Pipeline`,
    };
  }
  return { type: 'success', message: res?.message || `Ticket ${ticketId} marked as Resolved.` };
}
