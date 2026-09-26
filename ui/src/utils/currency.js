// Shared currency helpers for displaying the system's business-impact
// estimates (see /api/v1/analytics/impact on the backend).
//
// The underlying cost model is USD-denominated by design: its per-unit
// constants ($2/record correction cost, $50 avg transaction value, etc.)
// come from published industry benchmarks (Gartner/IBM COPDQ framework),
// which are only published in USD. There is no Thai-market-specific source
// for these figures, so we do NOT convert the formula's inputs to Baht —
// doing so would invent unsourced "baht constants" with false precision.
//
// Instead, USD stays the primary, computed figure everywhere it's shown,
// and a Baht conversion is added in parentheses as a fixed, approximate,
// display-only reference (not a live FX rate).
export const USD_TO_THB_RATE = 36.5;

export function usdToThb(usd) {
  return Math.round((usd || 0) * USD_TO_THB_RATE);
}

// "$14,277 USD" — the primary figure, unchanged in meaning from the backend.
export function formatUsd(usd) {
  return `$${(usd || 0).toLocaleString()} USD`;
}

// "≈ ฿521,111" — the secondary, approximate reference figure.
export function formatThbApprox(usd) {
  return `≈ ฿${usdToThb(usd).toLocaleString('th-TH')}`;
}

// Compact single-line form for tight spaces (table cells, chips):
// "$14,277 USD (≈ ฿521,111)"
export function formatUsdWithThb(usd) {
  return `${formatUsd(usd)} (${formatThbApprox(usd)})`;
}
