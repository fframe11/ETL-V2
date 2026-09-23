import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "./UiIcons";

const JOURNEY_STEPS = [
  {
    stepNum: 0,
    tag: "Learn",
    title: "Architecture",
    path: "/guide"
  },
  {
    stepNum: 1,
    tag: "Data Ingestion",
    title: "Bronze Ingestion",
    path: "/ingestion"
  },
  {
    stepNum: 2,
    tag: "Catalog",
    title: "Expectations & Rules",
    path: "/rules"
  },
  {
    stepNum: 3,
    tag: "Jobs & Pipelines",
    title: "Silver Pipeline",
    path: "/pipeline"
  },
  {
    stepNum: 4,
    tag: "Workspace",
    title: "Gold Exports",
    path: "/export"
  },
  {
    stepNum: 5,
    tag: "SQL",
    title: "Dashboards",
    path: "/dashboard"
  }
];

/**
 * Reusable Databricks 3-Element Course/Tile Card (Matches Databricks "Learn" & "Add Data" UI)
 * Anatomy:
 *  1. Gradient Thumbnail Header Block (108px) with centered 38x38 icon frame
 *  2. 3-line bottom text (Category, Bold Title, 1-line Subtitle)
 *  3. Circular SVG percentage ring in bottom-right corner
 */
export function DatabricksTileCard({
  category = "Data engineer",
  title = "Build a data pipeline",
  subtitle = "Create and manage pipelines end-to-end.",
  percent = 100,
  gradient = "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
  iconName = "pipeline",
  selected = false,
  onClick = null,
  footerSlot = null
}) {
  const safePct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safePct / 100) * circumference;

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? "#F8FAFC" : "#FFFFFF",
        border: selected ? "1.5px solid #2272B4" : "1px solid #CBD5E1",
        borderRadius: "6px",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s ease",
        boxShadow: selected ? "0 0 0 2px rgba(34,114,180,0.1)" : "0 1px 2px rgba(15,23,42,0.02)"
      }}
    >
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "5px",
                background: gradient,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                fontSize: "13px",
                flexShrink: 0
              }}
            >
              <Icon name={iconName} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "10px", color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {category}
              </div>
              <div style={{ fontSize: "13px", color: "#0F172A", fontWeight: 700, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {title}
              </div>
            </div>
          </div>

          {/* Compact Circular Ring */}
          <div style={{ position: "relative", width: "30px", height: "30px", flexShrink: 0 }} title={`${safePct}%`}>
            <svg width="30" height="30" viewBox="0 0 30 30">
              <circle cx="15" cy="15" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="2.5" />
              <circle
                cx="15"
                cy="15"
                r={radius}
                fill="none"
                stroke="#2272B4"
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 15 15)"
              />
            </svg>
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "8.5px",
                fontWeight: 700,
                color: "#334155"
              }}
            >
              {safePct}%
            </span>
          </div>
        </div>

        {subtitle && (
          <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {subtitle}
          </div>
        )}
      </div>

      {footerSlot && (
        <div style={{ marginTop: "8px", paddingTop: "6px", borderTop: "1px solid #F1F5F9" }} onClick={(e) => e.stopPropagation()}>
          {footerSlot}
        </div>
      )}
    </div>
  );
}

export default function WorkflowJourneyBar() {
  return null;
}
