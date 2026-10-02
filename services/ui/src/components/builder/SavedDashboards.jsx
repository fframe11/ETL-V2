import React, { useEffect, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";
import { formatDate } from "./DatasetPicker";

export default function SavedDashboards({ onOpen, onDeleted }) {
  const [items, setItems] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState("");

  const load = () => dashboardsApi.listSaved()
    .then((res) => setItems(res.dashboards || []))
    .catch((e) => { setError(e.message); setItems([]); });

  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    try {
      await dashboardsApi.deleteSaved(id);
      onDeleted?.(id);
      setConfirmId(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (items === null) return null;
  return (
    <section className="dbb-saved" aria-label="แดชบอร์ดที่บันทึกไว้">
      <h3>แดชบอร์ดที่บันทึกไว้</h3>
      {error && <p role="alert" className="dbb-error">{error}</p>}
      {items.length === 0 ? (
        <p className="dbb-muted">ยังไม่มีแดชบอร์ดที่บันทึกไว้</p>
      ) : (
        <ul>
          {items.map((d) => (
            <li key={d.id}>
              <div>
                <strong>{d.name}</strong>
                <span className="dbb-muted"> · {d.table_name} · {d.widget_count} วิดเจ็ต · {formatDate(d.updated_at)}</span>
                {d.description && <p>{d.description}</p>}
              </div>
              <div className="dbb-actions">
                <button type="button" aria-label={`เปิด ${d.name}`} onClick={() => onOpen(d.id)}>เปิด</button>
                {confirmId === d.id ? (
                  <>
                    <button type="button" className="dbb-btn-danger" aria-label={`ยืนยันลบ ${d.name}`} onClick={() => remove(d.id)}>ยืนยันลบ</button>
                    <button type="button" onClick={() => setConfirmId(null)}>ยกเลิก</button>
                  </>
                ) : (
                  <button type="button" aria-label={`ลบ ${d.name}`} onClick={() => setConfirmId(d.id)}>ลบ</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
