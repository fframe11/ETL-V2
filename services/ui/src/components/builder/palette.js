// Categorical series colours, blue/purple first like the Databricks reference.
// Series i gets SERIES_COLORS[i]; the folded "others" series is always grey.
// Checked with the dataviz skill's validate_palette.js (light surface): lightness band,
// chroma floor and normal-vision floor pass; adjacent CVD separation passes with the legend
// every multi-series chart carries; contrast vs surface is a WARN (legend + table view cover it).
export const SERIES_COLORS = ["#2a78d6", "#4a3aa7", "#eb6834", "#1baf7a", "#e87ba4", "#eda100", "#008300", "#e34948"];
export const OTHER_COLOR = "#A3ACB9";

export function colorFor(name, index, otherLabel) {
  return name === otherLabel ? OTHER_COLOR : SERIES_COLORS[index % SERIES_COLORS.length];
}
