import React from "react";

export default function FilterBar({ filters, options, selections, onChange }) {
  const set = (column, selection) => {
    const next = { ...selections };
    if (selection) next[column] = selection;
    else delete next[column];
    onChange(next);
  };

  return (
    <div className="dbb-filters" role="group" aria-label="ตัวกรอง">
      {filters.map((f) => {
        const current = selections[f.column] || {};
        const opt = options[f.column] || {};
        if (f.type === "date_range") {
          const update = (key, value) => {
            const selection = { ...current };
            if (value) selection[key] = value;
            else delete selection[key];
            set(f.column, selection.from || selection.to ? selection : null);
          };
          return (
            <fieldset key={f.id} className="dbb-filter">
              <legend>{f.label}</legend>
              <div>
                <input type="date" aria-label={`${f.label} ตั้งแต่`} min={opt.min || undefined} max={opt.max || undefined}
                  value={current.from || ""} onChange={(e) => update("from", e.target.value)} />
                <input type="date" aria-label={`${f.label} ถึง`} min={opt.min || undefined} max={opt.max || undefined}
                  value={current.to || ""} onChange={(e) => update("to", e.target.value)} />
              </div>
            </fieldset>
          );
        }
        const id = `dbb-filter-${f.id}`;
        return (
          <div key={f.id} className="dbb-filter">
            <label htmlFor={id}>{f.label}</label>
            <select id={id} value={current.values?.[0] ?? ""}
              onChange={(e) => set(f.column, e.target.value ? { values: [e.target.value] } : null)}>
              <option value="">ทั้งหมด</option>
              {(opt.values || []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}
