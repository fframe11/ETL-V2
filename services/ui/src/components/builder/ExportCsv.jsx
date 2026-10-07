import React, { useEffect, useRef, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";
import { semanticApi } from "../../utils/semanticApi";

// "ส่งออก CSV": the rows the dashboard is computed from right now (the same selections) as a file
// for Excel or Power BI. Personal columns stay out unless the user ticks the box, which appears only
// when the saved column meaning of this dataset hides some; the box clears after every export.
export default function ExportCsv({ table, selections, disabled = false }) {
  const [hidden, setHidden] = useState([]);
  const [includePersonal, setIncludePersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false); // a second click before React has disabled the button
  const generation = useRef(0); // changes with the dataset and on unmount: an older download is dropped

  useEffect(() => {
    let alive = true;
    generation.current += 1;
    running.current = false;
    setHidden([]);
    setIncludePersonal(false);
    setBusy(false);
    setError("");
    semanticApi.get(table)
      .then((view) => { if (alive) setHidden(Array.isArray(view?.hidden_columns) ? view.hidden_columns : []); })
      .catch(() => {}); // without the list the box stays away and personal columns stay out
    return () => { alive = false; generation.current += 1; };
  }, [table]);

  const personal = includePersonal && hidden.length > 0;

  const download = async () => {
    if (running.current) return;
    running.current = true;
    const mine = generation.current;
    setBusy(true);
    setError("");
    try {
      const { blob, filename } = await dashboardsApi.exportCsv(table, selections, personal);
      if (mine !== generation.current) return; // the dataset changed or the page closed: this file is not wanted
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setIncludePersonal(false);
    } catch (e) {
      if (mine === generation.current) setError(e.message);
    } finally {
      if (mine === generation.current) {
        running.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <div className="dbb-export">
      <button type="button" onClick={download} disabled={disabled || busy} aria-busy={busy}>ส่งออก CSV</button>
      {busy && <span className="dbb-muted" aria-live="polite">กำลังเตรียมไฟล์…</span>}
      {hidden.length > 0 && (
        <label className="dbb-check">
          <input type="checkbox" checked={includePersonal} disabled={busy}
            onChange={(e) => setIncludePersonal(e.target.checked)} />
          รวมข้อมูลส่วนบุคคล
        </label>
      )}
      {personal && (
        <p className="dbb-export-warning">
          ไฟล์จะมีข้อมูลส่วนบุคคลจากคอลัมน์ {hidden.join(", ")} เก็บไฟล์ให้ปลอดภัยและอย่าส่งต่อเกินจำเป็น ระบบบันทึกชื่อผู้ส่งออกไว้
        </p>
      )}
      {error && <p role="alert" className="dbb-error-inline">{error}</p>}
    </div>
  );
}
