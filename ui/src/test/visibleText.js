const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "INPUT", "TEXTAREA"]);

// Text a user sees on first load: skips closed <details> bodies, hidden nodes,
// unselected <option>s and form field values.
export function visibleText(root) {
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      const t = node.textContent.replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag)) return;
    if (node.hidden || node.getAttribute("aria-hidden") === "true") return;
    if (node.style && node.style.display === "none") return;
    if (tag === "OPTION" && !node.selected) return;
    if (tag === "DETAILS" && !node.open) {
      const summary = Array.from(node.children).find((c) => c.tagName === "SUMMARY");
      if (summary) walk(summary);
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return parts.join(" ");
}

// "ชื่อตาราง (Target Table)" style doubled labels. Code identifiers with "_" do not match.
export const THAI_EN_DOUBLE_LABEL = /[฀-๿][^\n()]{0,40}\(\s*[A-Za-z][A-Za-z0-9 &/.\-]{1,40}\)/g;

export function doubledLabels(text) {
  return text.match(THAI_EN_DOUBLE_LABEL) || [];
}
