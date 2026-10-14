import React from "react";
import { Link } from "react-router-dom";

export default function AuditProvenanceNotice({ commit = "6c7fe8b", timestamp = null, environment = "Local Isolated Container" }) {
  return (
    <div
      className="dataserve-audit-provenance-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
        padding: "10px 16px",
        marginBottom: "16px",
        background: "rgba(15, 23, 42, 0.04)",
        border: "1px solid rgba(15, 23, 42, 0.12)",
        borderRadius: "8px",
        fontSize: "12px",
        color: "#334155"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: "#059669"
          }}
        />
        <strong style={{ color: "#0F172A" }}>
          Verified Test Results
        </strong>
        <span style={{ color: "#64748B" }}>
          Git Commit: {commit}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ color: "#64748B" }}>
          {environment}
        </span>
        <Link
          to="/execution-results"
          style={{
            color: "#2563EB",
            fontWeight: 600,
            textDecoration: "underline",
            fontSize: "12px"
          }}
        >
          ดู Test Report ฉบับเต็ม
        </Link>
      </div>
    </div>
  );
}
