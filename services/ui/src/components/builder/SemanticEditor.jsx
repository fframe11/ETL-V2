import React, { useCallback, useEffect, useRef, useState } from "react";
import { semanticApi } from "../../utils/semanticApi";
import { fromView } from "./semanticModel";
import SemanticStatus from "./SemanticStatus";
import ColumnMetaTable from "./ColumnMetaTable";

// The column meaning (and metrics) of one dataset. `value` lives in DashboardBuilder so unsaved
// edits survive a step change: {table, view, columns, metrics, dirty, conflict, warnings} or null.
// It loads the view itself whenever `value` belongs to another table.
export default function SemanticEditor({ table, profile, value, onChange }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const ready = value?.table === table;
  // Replies that arrive after the editor left (or moved to another table) must not touch state.
  const current = useRef({ alive: true, table });
  current.current.table = table;
  useEffect(() => {
    const state = current.current;
    state.alive = true;
    return () => { state.alive = false; };
  }, []);
  const stale = (forTable) => !current.current.alive || current.current.table !== forTable;

  const load = useCallback(async () => {
    setError("");
    try {
      const next = fromView(table, await semanticApi.get(table));
      if (!stale(table)) onChange(next);
    } catch (e) {
      if (!stale(table)) setError(e.message);
    }
  }, [table, onChange]);

  useEffect(() => {
    if (!ready) load();
  }, [ready, load]);

  if (!ready) {
    return error ? <p role="alert" className="dbb-error">{error}</p> : <p className="dbb-muted">กำลังโหลดความหมายคอลัมน์…</p>;
  }

  const perform = (kind, call) => async () => {
    setBusy(kind);
    setError("");
    try {
      const next = fromView(table, await call());
      if (!stale(table)) onChange(next);
    } catch (e) {
      if (!stale(table)) {
        if (e.status === 409) onChange({ ...value, conflict: true });
        setError(e.message);
      }
    } finally {
      if (!stale(table)) setBusy("");
    }
  };
  const body = { columns: value.columns, metrics: value.metrics };
  const setColumn = (name, meta) => onChange({ ...value, columns: { ...value.columns, [name]: meta }, dirty: true });

  return (
    <div className="dbb-semantic">
      <SemanticStatus
        view={value.view}
        dirty={value.dirty}
        busy={busy}
        onDraft={perform("draft", () => semanticApi.draft(table))}
        onSaveDraft={perform("save", () => semanticApi.saveDraft(table, body))}
        onApprove={perform("approve", () => semanticApi.approve(table, { ...body, base_version: value.view.version }))}
      />
      {error && (
        <p role="alert" className="dbb-error">
          {error}
          {value.conflict && <button type="button" onClick={load}>โหลดใหม่</button>}
        </p>
      )}
      {value.warnings.length > 0 && (
        <details>
          <summary>หมายเหตุ {value.warnings.length} รายการ</summary>
          <ul>{value.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}
      <h3>ความหมายคอลัมน์</h3>
      <ColumnMetaTable profile={profile} view={value.view} columns={value.columns} onChange={setColumn} />
    </div>
  );
}
