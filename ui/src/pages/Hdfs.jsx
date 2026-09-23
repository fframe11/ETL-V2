import React from "react";
import { Icon } from "../components/UiIcons";

export default function Hdfs() {
  const hdfsPort = "9870";
  const hdfsUrl = `http://${window.location.hostname}:${hdfsPort}`;

  return (
    <div className="page-container">
      <div className="service-page">
        <div className="service-icon-large card-icon amber" style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="box" size={36} style={{ marginRight: 0 }} />
        </div>
        <h1>HDFS UI</h1>
        <p className="service-desc">
          HDFS NameNode UI — จัดการไฟล์บน Hadoop Distributed File System, ดู storage usage, ตรวจสอบสถานะ DataNode และ block reports
        </p>
        <div className="service-url"><Icon name="globe" size={14} /> {hdfsUrl}</div>
        <a
          href={hdfsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          <Icon name="arrow-right" size={14} /> เปิด HDFS UI
        </a>
      </div>
    </div>
  );
}
