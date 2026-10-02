const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

// KPI and axis numbers: 1,234.57 below ten thousand, 12.2K / 1.77M above.
export function formatValue(value, format = "number") {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const text = Math.abs(n) >= 10000 ? compact.format(n) : plain.format(n);
  if (format === "percent") return `${text}%`;
  if (format === "currency") return `฿${text}`;
  return text;
}
