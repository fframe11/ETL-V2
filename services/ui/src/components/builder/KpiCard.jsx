import React from "react";
import { formatValue } from "../../utils/numberFormat";

export default function KpiCard({ widget, data }) {
  const change = data?.change_pct;
  return (
    <div className="dbb-kpi">
      <div className="dbb-kpi-value">{formatValue(data?.value, widget.format)}</div>
      {change != null && (
        <div className={`dbb-kpi-change ${change >= 0 ? "is-up" : "is-down"}`}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% ช่วงล่าสุดเทียบช่วงก่อน
        </div>
      )}
    </div>
  );
}
