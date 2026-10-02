import React from "react";
import KpiCard from "./KpiCard";
import ChartWidget from "./ChartWidget";
import TableWidget from "./TableWidget";
import FilterBar from "./FilterBar";

function WidgetBody({ widget, data, onDrill }) {
  if (data?.error) return <p className="dbb-error-inline">{data.error}</p>;
  if (widget.type === "kpi") return <KpiCard widget={widget} data={data} />;
  if (widget.type === "table") return <TableWidget widget={widget} data={data} />;
  return <ChartWidget widget={widget} data={data} onDrill={onDrill} />;
}

export default function DashboardCanvas({ spec, data, selections = {}, onSelectionsChange, busy = false }) {
  const filterColumns = new Set(spec.filters.map((f) => f.column));
  const drills = Object.entries(selections).filter(([column, sel]) => !filterColumns.has(column) && sel?.values?.length);
  const drill = (column, value) => onSelectionsChange({ ...selections, [column]: { values: [value] } });
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
            <button type="button" key={column} className="dbb-chip is-active" onClick={() => clear(column)} aria-label={`ล้างตัวกรอง ${column}`}>
              {column}: {sel.values[0]} ×
            </button>
          ))}
        </div>
      )}
      {data && (
        <p className="dbb-muted">
          {data.rows_after_filter.toLocaleString("en-US")} จาก {data.rows_total.toLocaleString("en-US")} แถว
        </p>
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
            <WidgetBody widget={w} data={data?.widgets?.[w.id]} onDrill={drill} />
          </article>
        ))}
      </div>
    </div>
  );
}
