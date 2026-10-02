import React, { useMemo, useState } from "react";

export function compareCells(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "th");
}

function cell(value) {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return String(value);
}

export default function TableWidget({ widget, data }) {
  const [sort, setSort] = useState(null);
  const columns = data?.columns || widget.columns;
  const rows = useMemo(() => {
    const list = [...(data?.rows || [])];
    if (!sort) return list;
    return list.sort((a, b) => {
      const order = compareCells(a[sort.column], b[sort.column]);
      return a[sort.column] == null || b[sort.column] == null ? order : sort.desc ? -order : order;
    });
  }, [data, sort]);
  const toggle = (column) => setSort((s) => (s?.column === column ? { column, desc: !s.desc } : { column, desc: false }));

  return (
    <div className="dbb-scroll">
      <table className="dbb-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} aria-sort={sort?.column === c ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button type="button" onClick={() => toggle(c)}>
                  {c}{sort?.column === c ? (sort.desc ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c}>{cell(r[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {data?.total_rows > rows.length && (
        <p className="dbb-muted">แสดง {rows.length} จาก {data.total_rows.toLocaleString("en-US")} แถว</p>
      )}
    </div>
  );
}
