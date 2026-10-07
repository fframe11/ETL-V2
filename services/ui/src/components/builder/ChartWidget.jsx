import React from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import { formatValue } from "../../utils/numberFormat";
import { colorFor } from "./palette";

export const OTHER_LABEL = "อื่นๆ";
const DRILLABLE = new Set(["bar", "pie", "donut"]);
const AXIS_TICK = { fontSize: 11, fill: "#64748B" };

// The category a viewer clicked on a bar or a pie slice; null for the folded "others".
export function drillValue(entry) {
  const value = entry?.payload?.x ?? entry?.x ?? entry?.name;
  return value === undefined || value === null || value === OTHER_LABEL ? null : String(value);
}

export default function ChartWidget({ widget, data, onDrill }) {
  const rows = data?.rows || [];
  if (rows.length === 0) return <p className="dbb-muted">ไม่มีข้อมูลตามตัวกรอง</p>;
  const fmt = (v) => formatValue(v, widget.format, widget.currency);
  const series = data.series || ["value"];
  const seriesName = (s) => (s === "value" ? widget.title : s);
  const legend = series.length > 1;
  const drill = DRILLABLE.has(widget.type) && onDrill
    ? (entry) => { const v = drillValue(entry); if (v !== null) onDrill(widget.x, v, widget.time_grain); }
    : undefined;
  const cursor = drill ? "pointer" : undefined;

  let chart;
  if (widget.type === "pie" || widget.type === "donut") {
    chart = (
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="x" innerRadius={widget.type === "donut" ? "55%" : 0} outerRadius="85%" onClick={drill} cursor={cursor}>
          {rows.map((r, i) => <Cell key={String(r.x)} fill={colorFor(r.x, i, OTHER_LABEL)} />)}
        </Pie>
        <Tooltip formatter={(v) => fmt(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    );
  } else if (widget.type === "bar") {
    chart = (
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="x" tick={AXIS_TICK} />
        <YAxis tickFormatter={fmt} tick={AXIS_TICK} width={56} />
        <Tooltip formatter={(v) => fmt(v)} />
        {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Bar key={s} dataKey={s} name={seriesName(s)} fill={colorFor(s, i, OTHER_LABEL)} stackId={widget.stacked ? "stack" : undefined}
            radius={widget.stacked ? 0 : [3, 3, 0, 0]} onClick={drill} cursor={cursor} />
        ))}
      </BarChart>
    );
  } else if (widget.type === "area") {
    chart = (
      <AreaChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="x" tick={AXIS_TICK} />
        <YAxis tickFormatter={fmt} tick={AXIS_TICK} width={56} />
        <Tooltip formatter={(v) => fmt(v)} />
        {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Area key={s} type="monotone" dataKey={s} name={seriesName(s)} stroke={colorFor(s, i, OTHER_LABEL)} fill={colorFor(s, i, OTHER_LABEL)}
            fillOpacity={0.35} stackId={widget.stacked ? "stack" : undefined} />
        ))}
      </AreaChart>
    );
  } else {
    chart = (
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="x" tick={AXIS_TICK} />
        <YAxis tickFormatter={fmt} tick={AXIS_TICK} width={56} />
        <Tooltip formatter={(v) => fmt(v)} />
        {legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Line key={s} type="monotone" dataKey={s} name={seriesName(s)} stroke={colorFor(s, i, OTHER_LABEL)} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    );
  }
  return (
    <div className="dbb-chart">
      <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
    </div>
  );
}
