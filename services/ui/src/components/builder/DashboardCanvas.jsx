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
  const filtersList = Array.isArray(spec?.filters) ? spec.filters : [];
  const filterColumns = new Set(filtersList.filter((f) => f && f.type === "select").map((f) => f.column));
  const labels = data?.column_labels || {}; // display names from the semantic layer
  const drills = Object.entries(selections || {}).filter(([column, sel]) => !filterColumns.has(column) && sel?.values?.length);
  // A bar or slice of a date column is a time bucket ("2025-03-01" = March), so the server needs the grain.
  const drill = (column, value, grain) =>
    onSelectionsChange?.({ ...(selections || {}), [column]: grain ? { values: [value], grain } : { values: [value] } });
  const clear = (column) => {
    const next = { ...(selections || {}) };
    delete next[column];
    onSelectionsChange?.(next);
  };

  const widgetsList = Array.isArray(spec?.widgets) ? spec.widgets : [];

  return (
    <div className={`dbb-canvas${busy ? " is-busy" : ""}`} aria-busy={busy}>
      <header className="dbb-canvas-head">
        <h2>{spec?.title || "แดชบอร์ด"}</h2>
        {spec?.description && <p>{spec.description}</p>}
      </header>
      {filtersList.length > 0 && (
        <FilterBar filters={filtersList} options={data?.filter_options || {}} selections={selections} onChange={onSelectionsChange} />
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
          {data?.rows_after_filter != null && (
            <p className="dbb-muted">
              {Number(data.rows_after_filter).toLocaleString("en-US")} จาก {Number(data.rows_total ?? data.rows_after_filter).toLocaleString("en-US")} แถว
            </p>
          )}
          {tools}
        </div>
      )}
      <div className="dbb-grid">
        {widgetsList.map((w, idx) => {
          const layout = w?.layout || { x: (idx % 2) * 6, y: Math.floor(idx / 2) * 4, w: 6, h: 4 };
          return (
            <article
              key={w?.id || `w-${idx}`}
              className={`dbb-cell dbb-cell-${w?.type || "kpi"}`}
              aria-label={w?.title || "Widget"}
              style={{
                "--x": (layout.x ?? 0) + 1,
                "--y": (layout.y ?? 0) + 1,
                "--w": layout.w ?? 6,
                "--h": layout.h ?? 4
              }}
            >
              <h3 className="dbb-cell-title">{w?.title || ""}</h3>
              <WidgetBody widget={w} data={data?.widgets?.[w?.id]} onDrill={drill} labels={labels} />
            </article>
          );
        })}
      </div>
    </div>
  );
}
