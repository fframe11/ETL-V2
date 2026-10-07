const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function money(n, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      notation: Math.abs(n) >= 10000 ? "compact" : "standard",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(n);
  } catch {
    return null; // not a currency code Intl knows: the plain number is shown instead
  }
}

// KPI and axis numbers: 1,234.57 below ten thousand, 12.2K / 1.77M above. Currency shows the
// symbol of its ISO 4217 code ($, ฿, €) and no symbol when the code is missing or unknown.
export function formatValue(value, format = "number", currency = null) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (format === "currency" && currency) {
    const text = money(n, currency);
    if (text) return text;
  }
  const text = Math.abs(n) >= 10000 ? compact.format(n) : plain.format(n);
  return format === "percent" ? `${text}%` : text;
}
