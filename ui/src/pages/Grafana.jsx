import React from "react";
import { Icon } from "../components/UiIcons";

export default function Grafana() {
  const grafanaPort = "3002";
  const grafanaUrl = `http://${window.location.hostname}:${grafanaPort}`;

  return (
    <div className="page-container">
      <div className="service-page">
        <div className="service-icon-large card-icon emerald" style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="chart" size={36} style={{ marginRight: 0 }} />
        </div>
        <h1>Grafana</h1>
        <p className="service-desc">
          Grafana ใช้สำหรับ Monitoring & Visualization — ดู metrics, สร้าง dashboard, ตั้ง alert rule, และตรวจสอบ system health แบบ real-time
        </p>
        <div className="service-url"><Icon name="globe" size={14} /> {grafanaUrl}</div>
        <a
          href={grafanaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          <Icon name="arrow-right" size={14} /> เปิด Grafana
        </a>
      </div>
    </div>
  );
}
