import React from "react";
import { Icon } from "../components/UiIcons";

export default function Kibana() {
  const kibanaPort = "5601";
  const kibanaUrl = `http://${window.location.hostname}:${kibanaPort}`;

  return (
    <div className="page-container">
      <div className="service-page">
        <div className="service-icon-large card-icon cyan" style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="search" size={36} style={{ marginRight: 0 }} />
        </div>
        <h1>Kibana</h1>
        <p className="service-desc">
          Kibana ใช้สำหรับ Log Analytics — ค้นหา, วิเคราะห์, และ visualize log จาก Elasticsearch เพื่อ debug และ monitor ระบบ
        </p>
        <div className="service-url"><Icon name="globe" size={14} /> {kibanaUrl}</div>
        <a
          href={kibanaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          <Icon name="arrow-right" size={14} /> เปิด Kibana
        </a>
      </div>
    </div>
  );
}
