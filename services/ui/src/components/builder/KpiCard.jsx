import React from "react";
import { formatValue } from "../../utils/numberFormat";

export default function KpiCard({ widget, data }) {
  const change = data?.change_pct;
  // a fall is good news when lower is better (costs, returns): the colour follows the metric
  const good = widget.higher_is_better === false ? change <= 0 : change >= 0;
  return (
    <div className="dbb-kpi">
      <div className="dbb-kpi-value">{formatValue(data?.value, widget.format, widget.currency)}</div>
      {change != null && (
        <div className={`dbb-kpi-change ${good ? "is-good" : "is-bad"}`}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% ช่วงล่าสุดเทียบช่วงก่อน
        </div>
      )}
    </div>
  );
}
