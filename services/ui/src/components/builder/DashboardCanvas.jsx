import React from "react";
import KpiCard from "./KpiCard";
import ChartWidget from "./ChartWidget";
import TableWidget from "./TableWidget";
import FilterBar from "./FilterBar";

function WidgetBody({ widget, data, onDrill, labels }) {
  if (data?.error) return <p className="dbb-error-inline">{data.error}</p>;
  if (widget.type === "kpi") return <KpiCard widget={widget} data={data} />;
  if (widget.type === "table") return <TableWidget widget={widget} data={data} labels={labels} />;
  return <ChartWidget widget={widget} data={data} onDrill={onDrill} />;
}

// `tools` (optional) is drawn beside the row count, e.g. the CSV export of the filtered rows.
export default function DashboardCanvas({ spec, data, selections = {}, onSelectionsChange, busy = false, tools = null }) {
  // Only a select control shows a `values` selection; a date range control cannot, so a
  // drill value on a date column needs its own chip.
  const filterColumns = new Set(spec.filters.filter((f) => f.type === "select").map((f) => f.column));
  const labels = data?.column_labels || {}; // display names from the semantic layer
  const drills = Object.entries(selections).filter(([column, sel]) => !filterColumns.has(column) && sel?.values?.length);
  // A bar or slice of a date column is a time bucket ("2025-03-01" = March), so the server needs the grain.
  const drill = (column, value, grain) =>
    onSelectionsChange({ ...selections, [column]: grain ? { values: [value], grain } : { values: [value] } });
  const clear = (column) => {
    const next = { ...selections };
    delete next[column];
    onSelectionsChange(next);
  };

  return (
    <div className={`dbb-canvas${busy ? " is-busy" : ""}`} aria-busy={busy}>
      <header className="dbb-canvas-head">
        <h2>{spec.title}</h2>
        {spec.description && <p>{spec.description}</p>}
      </header>
      {spec.filters.length > 0 && (
        <FilterBar filters={spec.filters} options={data?.filter_options || {}} selections={selections} onChange={onSelectionsChange} />
      )}
      {drills.length > 0 && (
        <div className="dbb-drills" aria-label="ตัวกรองจากการคลิกกราฟ">
          {drills.map(([column, sel]) => (
            <button type="button" key={column} className="dbb-chip is-active" onClick={() => clear(column)} aria-label={`ล้างตัวกรอง ${labels[column] || column}`}>
              {labels[column] || column}: {sel.values[0]} ×
            </button>
          ))}
        </div>
      )}
      {(data || tools) && (
        <div className="dbb-canvas-bar">
          {data && (
            <p className="dbb-muted">
              {data.rows_after_filter.toLocaleString("en-US")} จาก {data.rows_total.toLocaleString("en-US")} แถว
            </p>
          )}
          {tools}
        </div>
      )}
      <div className="dbb-grid">
        {spec.widgets.map((w) => (
          <article
            key={w.id}
            className={`dbb-cell dbb-cell-${w.type}`}
            aria-label={w.title}
            style={{ "--x": w.layout.x + 1, "--y": w.layout.y + 1, "--w": w.layout.w, "--h": w.layout.h }}
          >
            <h3 className="dbb-cell-title">{w.title}</h3>
            <WidgetBody widget={w} data={data?.widgets?.[w.id]} onDrill={drill} labels={labels} />
          </article>
        ))}
      </div>
    </div>
  );
}
