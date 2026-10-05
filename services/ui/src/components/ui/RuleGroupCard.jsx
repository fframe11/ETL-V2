import React from "react";
import TileCard from "./TileCard";

const ACTION_BADGE = {
  quarantine: { label: "กักกัน", background: "#FEE2E2", color: "#B91C1C" },
  review: { label: "ส่ง Review", background: "#FEF3C7", color: "#B45309" }
};

const badgeStyle = (action) => ({
  fontSize: "10px",
  padding: "1px 5px",
  borderRadius: "3px",
  flexShrink: 0,
  background: (ACTION_BADGE[action] || ACTION_BADGE.review).background,
  color: (ACTION_BADGE[action] || ACTION_BADGE.review).color
});

/**
 * One card for the same kind of rule on many columns (null checks, ranges, outliers).
 * entries: [{ r, idx }] where idx is the rule's position in the full rule list.
 * renderRowExtra(r, idx): optional per-column controls shown next to the column name.
 * headerSlot: optional controls that apply to every column (e.g. one multiplier for all).
 */
export default function RuleGroupCard({
  category,
  title,
  subtitleLabel,
  gradient,
  iconName,
  entries,
  onToggleOne,
  onToggleAll,
  renderRowExtra = null,
  headerSlot = null
}) {
  const total = entries.length;
  const activeCount = entries.filter(({ r }) => r.accepted !== false).length;
  const quarantineCount = entries.filter(({ r }) => r.action === "quarantine").length;
  const reviewCount = entries.filter(({ r }) => r.action === "review").length;

  return (
    <TileCard
      category={category}
      title={title}
      subtitle={`${subtitleLabel} · ใช้งาน ${activeCount} จาก ${total} คอลัมน์`}
      percent={null}
      gradient={gradient}
      iconName={iconName}
      selected={activeCount > 0}
      footerSlot={
        <div>
          <div style={{ display: "flex", alignItems: "center", fontSize: "11.5px", marginBottom: "6px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: 600, color: "#0F172A" }}>
              <input
                type="checkbox"
                aria-label="ใช้งานทุกคอลัมน์"
                checked={activeCount === total}
                ref={(el) => { if (el) el.indeterminate = activeCount > 0 && activeCount < total; }}
                onChange={(e) => onToggleAll(e.target.checked)}
              />
              <span>
                ใช้งานทุกคอลัมน์
                {quarantineCount > 0 && <span style={{ ...badgeStyle("quarantine"), marginLeft: "6px" }}>กักกัน {quarantineCount}</span>}
                {reviewCount > 0 && <span style={{ ...badgeStyle("review"), marginLeft: "6px" }}>ส่ง Review {reviewCount}</span>}
              </span>
            </label>
          </div>
          {headerSlot}
          <details>
            <summary style={{ fontSize: "11px", fontWeight: 600, color: "#2272B4", cursor: "pointer", userSelect: "none" }}>
              เลือกรายคอลัมน์
            </summary>
            <ul style={{ margin: "8px 0 0 0", padding: 0, listStyle: "none", maxHeight: "200px", overflowY: "auto", fontSize: "11.5px" }}>
              {entries.map(({ r, idx }) => (
                <li key={idx} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "2px 0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", minWidth: 0, flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={r.accepted !== false}
                      onChange={(e) => onToggleOne(idx, e.target.checked)}
                    />
                    <code style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.field}</code>
                  </label>
                  {renderRowExtra && renderRowExtra(r, idx)}
                  <span style={badgeStyle(r.action)}>{(ACTION_BADGE[r.action] || ACTION_BADGE.review).label}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      }
    />
  );
}
