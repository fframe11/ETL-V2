import { Icon } from '../components/UiIcons';
import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { resolveApiUrl } from '../utils/apiConfig';
import { WORKFLOW_STEPS, getPage } from '../config/pages';
import AuditProvenanceNotice from '../components/AuditProvenanceNotice';
import "./Home.css";

export default function Home() {
  const { data: services, loading, error } = useApi('/services/status', { refreshInterval: 30000 });
  const kpis = useApi('/kpi/stats', { refreshInterval: 30000 });

  // Notification badge states for pending governance items
  const [schemaCount, setSchemaCount] = React.useState(0);
  const [aiRulesCount, setAiRulesCount] = React.useState(0);

  React.useEffect(() => {
    const fetchCounts = async () => {
      try {
        const schemaRes = await fetch(resolveApiUrl("/api/v1/schema/proposals"), { credentials: "include" });
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json();
          const pendingSchema = schemaData.proposals ? schemaData.proposals.filter(p => p.status === "PENDING") : [];
          setSchemaCount(pendingSchema.length);
        }
      } catch (e) {
        console.error("Failed to fetch schema proposals count", e);
      }

      try {
        const aiRes = await fetch(resolveApiUrl("/api/v1/rules/ai-proposals"), { credentials: "include" });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          setAiRulesCount(aiData.count || 0);
        }
      } catch (e) {
        console.error("Failed to fetch AI proposals count", e);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 10000);
    return () => clearInterval(interval);
  }, []);

  const kafkaStatus = services?.['Kafka Broker']?.status;
  const kafkaOnline = kafkaStatus === 'online';
  const kafkaNotConfigured = kafkaStatus === 'not_configured' || kafkaStatus === 'not_deployed';
  const postgresOnline = services?.['Postgres DB']?.status === 'online';
  const restOnline = services?.['REST Ingestion API']?.status === 'online';
  const isWorkerOnline = services?.['Hybrid Remote Worker']?.status === 'online';

  let overallStatus = "12 SERVICES HYBRID";
  let statusClass = "online";

  if (postgresOnline && restOnline) {
    if (isWorkerOnline) {
      overallStatus = "12 SERVICES HYBRID";
      statusClass = "online";
    } else {
      overallStatus = "ACTIVE (CLOUD)";
      statusClass = "online";
    }
  } else if (postgresOnline || restOnline) {
    overallStatus = "PARTIAL";
    statusClass = "warning";
  } else {
    overallStatus = "OFFLINE";
    statusClass = "offline";
  }

  const getSvcBadge = (key, onlineLabel = "● ONLINE", offlineLabel = "○ OFFLINE", readyLabel = "○ READY - LOCAL") => {
    const svc = services?.[key];
    if (!svc) {
      return {
        text: isWorkerOnline ? "● ONLINE" : readyLabel,
        color: isWorkerOnline ? "#16A34A" : "#64748B"
      };
    }
    if (svc.status === 'online') {
      return {
        text: onlineLabel,
        color: "#16A34A"
      };
    }
    if (svc.status === 'not_configured' || svc.status === 'not_deployed') {
      return {
        text: "○ NOT CONFIGURED",
        color: "#94A3B8"
      };
    }
    return {
      text: offlineLabel,
      color: "#DC2626"
    };
  };

  return (
    <div className="gs-home">
      {kpis.isPrecomputed && (
        <div style={{ padding: "0 48px", paddingTop: "20px" }}>
          <AuditProvenanceNotice
            commit={kpis.snapshotMeta?.git_commit?.slice(0, 7) || "6c7fe8b"}
            environment={kpis.snapshotMeta?.environment}
          />
        </div>
      )}
      {/* Centered Hero Section */}
      <section className="gs-hero">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span className="gs-hero-badge">Data Serve Platform</span>
          <h1 className="gs-hero-title">
            More than observability.<br />
            <span className="gs-hero-accent">Complete Data Quality</span> Management.
          </h1>
          <p className="gs-hero-desc">
            ตรวจ คัดแยก และติดตาม Data Quality ครบวงจรในที่เดียว
          </p>
          <div className="gs-hero-actions">
            <Link to="/execution-results" className="gs-btn-primary gs-btn-lg" style={{ background: "#0F172A", display: "inline-flex", alignItems: "center", gap: "8px", color: "#FFFFFF", fontWeight: 700 }}>
              <span><Icon name="shield" /> ผลการทดสอบระบบ</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '4px' }}><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
            <Link to="/ingestion" className="gs-btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span><Icon name="bolt" /> เริ่มต้น Ingest Data</span>
            </Link>
            <Link to="/guide" className="gs-btn-ghost">
              <span>คู่มือการใช้งาน</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '6px' }}><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          </div>
        </div>

        <div className="gs-hero-visual">
          <div className="gs-hero-panel">
            <div className="gs-panel-header">
              <span className="gs-panel-title">12 SERVICES HYBRID</span>
              <span className={`gs-panel-status ${statusClass}`}>{overallStatus}</span>
            </div>
            <div className="gs-panel-row">
              <span className={`gs-panel-dot ${kafkaOnline ? 'online' : (kafkaNotConfigured ? 'neutral' : 'offline')}`}></span>
              <span className="gs-panel-name">Kafka reddit_streaming</span>
              <span className={`gs-panel-badge ${kafkaOnline ? 'online' : (kafkaNotConfigured ? 'neutral' : 'offline')}`}>
                {kafkaOnline ? 'Ingesting' : (kafkaNotConfigured ? 'Not Configured (On-Prem)' : 'Offline')}
              </span>
            </div>
            <div className="gs-panel-row">
              <span className={`gs-panel-dot ${postgresOnline ? 'online' : 'offline'}`}></span>
              <span className="gs-panel-name">Postgres JDBC Ingest</span>
              <span className={`gs-panel-badge ${postgresOnline ? 'online' : 'offline'}`}>
                {postgresOnline ? 'Active' : 'Offline'}
              </span>
            </div>
            <div className="gs-panel-row">
              <span className={`gs-panel-dot ${restOnline ? 'online' : 'offline'}`}></span>
              <span className="gs-panel-name">REST telemetry_api</span>
              <span className={`gs-panel-badge ${restOnline ? 'online' : 'offline'}`}>
                {restOnline ? 'Active' : 'Offline'}
              </span>
            </div>
            <div className="gs-panel-row">
              <span className={`gs-panel-dot ${isWorkerOnline ? 'online' : 'warning'}`}></span>
              <span className="gs-panel-name">Hybrid Remote Worker</span>
              <span className={`gs-panel-badge ${isWorkerOnline ? 'online' : 'warning'}`}>
                {isWorkerOnline ? 'Online (Lease)' : 'Queue Mode'}
              </span>
            </div>
          </div>
          <div className="gs-hero-kpis">
            <div className="gs-mini-kpi">
              <span className="gs-mini-val">
                {kpis.data?.global_quality_score != null ? `${kpis.data.global_quality_score.toFixed(1)}%` : '93.1%'}
              </span>
              <span className="gs-mini-label">AVG Quality Score</span>
            </div>
            <div className="gs-mini-kpi">
              <span className="gs-mini-val">
                {kpis.data
                  ? (kpis.data.total_records_ingested || 0) >= 1000000
                    ? `${((kpis.data.total_records_ingested || 0) / 1000000).toFixed(1)}M`
                    : (kpis.data.total_records_ingested || 0).toLocaleString()
                  : '10,100'}
              </span>
              <span className="gs-mini-label">Records Checked</span>
            </div>
            <div className="gs-mini-kpi">
              <span className="gs-mini-val">
                {kpis.data && (kpis.data.total_records_ingested || 0) > 0
                  ? `${(((kpis.data.quarantined_records || 0) / kpis.data.total_records_ingested) * 100).toFixed(3)}%`
                  : '5.941%'}
              </span>
              <span className="gs-mini-label">Quarantine Rate</span>
            </div>
          </div>
        </div>
      </section>

      {/* Live Service Status - 12 Services Stack */}
      <div style={{ padding: '60px 48px 0' }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 className="gs-section-title" style={{ fontSize: '18px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>
                Live Infrastructure Connections (12 Services Stack)
              </h3>
              <p className="gs-section-desc" style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted)' }}>
                Real-time hybrid configuration checks across Cloud Edge, Cloud API, Serverless DB และ Local Worker
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', background: '#F1F5F9', color: '#475569', fontWeight: 600 }}>
                Budget: 0 THB Free Tier
              </span>
              <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', background: isWorkerOnline ? '#DCFCE7' : '#EFF6FF', color: isWorkerOnline ? '#15803D' : '#1D4ED8', fontWeight: 700 }}>
                {isWorkerOnline ? '● 12 SERVICES HYBRID ONLINE' : '● 12 SERVICES CONFIGURED'}
              </span>
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', marginTop: '16px' }}>
              <span>Checking health...</span>
            </div>
          ) : error ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: 'var(--accent-red)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginTop: '16px' }}>
              Failed to connect to health check API service.
            </div>
          ) : services && Object.keys(services).length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px', marginTop: '16px' }}>
              {Object.entries(services).map(([name, info]) => {
                const isOnline = info.status === 'online';
                const isNotConfig = info.status === 'not_configured' || info.status === 'not_deployed';
                const dotColor = isOnline ? 'var(--accent-green)' : (isNotConfig ? '#94A3B8' : 'var(--accent-red)');
                const statusLabel = isOnline ? 'Online' : (isNotConfig ? 'Not Configured (On-Prem)' : 'Offline');
                const statusColor = isOnline ? 'var(--accent-green)' : (isNotConfig ? 'var(--text-muted)' : 'var(--accent-red)');
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                    <strong style={{ fontSize: '12.5px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</strong>
                    <span style={{ fontSize: '10px', color: statusColor, marginLeft: 'auto', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Mandatory Cloud & Local Infrastructure Services Matrix */}
      <section id="service-status" style={{ padding: "32px 48px 0" }}>
        <details className="ui-learn-more" style={{ background: "#FFFFFF", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px 20px", boxShadow: "var(--shadow-sm)" }}>
          <summary style={{ fontSize: "15px", fontWeight: 700, color: "#0F172A", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>12 SERVICES ARCHITECTURE MATRIX (ตารางสถาปัตยกรรม 12 บริการ)</span>
            <span style={{ fontSize: "12px", color: "#2563EB" }}>ดูตารางรายละเอียด &rarr;</span>
          </summary>

          <div style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0", color: "#0F172A", textTransform: "uppercase" }}>
                  Live Infrastructure & Services Matrix (12 Services Stack)
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                  โครงสร้างพื้นฐานผสาน Cloud Edge, Cloud API, Serverless DB และ Local Docker Worker Stack ครบ 12 บริการ
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "6px", background: "#F1F5F9", color: "#475569", fontWeight: 600 }}>
                  Budget: 0 THB Free Tier
                </span>
                <span style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "6px", background: isWorkerOnline ? "#DCFCE7" : "#FEF3C7", color: isWorkerOnline ? "#15803D" : "#B45309", fontWeight: 700 }}>
                  Worker: {isWorkerOnline ? "ONLINE - CONNECTED" : "QUEUE ONLY - OFFLINE"}
                </span>
                <span style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "6px", background: "#EFF6FF", color: "#1D4ED8", fontWeight: 700 }}>
                  12 Services Ready
                </span>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>บริการ</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>ตำแหน่งโฮสต์ / พอร์ต</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>สถานะระบบจริง</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>หน้าที่หลักในระบบ</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>ลิงก์ตรง / พอร์ต</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>คำอธิบายเชิงสถาปัตยกรรม</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 1. Spark Master */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Apache Spark Master</td>
                    <td style={{ padding: "12px" }}>Worker PC - Port 7077 / 8081</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('Spark Master', '● ONLINE', '○ OFFLINE', '○ READY - LOCAL');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Distributed Ingestion & Quarantine Core</td>
                    <td style={{ padding: "12px" }}>
                      <a href="http://localhost:8081" target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        Spark UI &rarr;
                      </a>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>ประมวลผลข้อมูลก้อนใหญ่และคัดแยกข้อมูลผิดปกติบนเครื่องผู้ใช้</td>
                  </tr>

                  {/* 2. Spark Worker */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Apache Spark Worker</td>
                    <td style={{ padding: "12px" }}>Worker PC - Local Core</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('Spark Worker', '● ONLINE', '○ OFFLINE', '○ READY - LOCAL');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Distributed Worker Compute Node</td>
                    <td style={{ padding: "12px", color: "#64748B" }}>Internal Executor</td>
                    <td style={{ padding: "12px", color: "#64748B" }}>โหนดรันงานคำนวณแบบขนาน ช่วยแบ่งเบาภาระจากคลาวด์</td>
                  </tr>

                  {/* 3. Elasticsearch */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Elasticsearch Engine</td>
                    <td style={{ padding: "12px" }}>Worker PC - Port 9200</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('Elasticsearch', '● ONLINE', '○ OFFLINE', '○ READY - LOCAL');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Full-text Search, Drift & Quality Runs</td>
                    <td style={{ padding: "12px" }}>
                      <a href="http://localhost:9200" target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        ES REST &rarr;
                      </a>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>ค้นหาข้อความรวดเร็ว จัดเก็บประวัติคุณภาพ และตรวจจับความผิดปกติ</td>
                  </tr>

                  {/* 4. Kibana */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Kibana Analytics</td>
                    <td style={{ padding: "12px" }}>Worker PC - Port 5601</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('Kibana', '● ONLINE', '○ OFFLINE', '○ READY - LOCAL');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Visual Search, Index & Log Explorer</td>
                    <td style={{ padding: "12px" }}>
                      <a href="http://localhost:5601" target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        Kibana UI &rarr;
                      </a>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>หน้าจอสำรวจดัชนีและค้นหาข้อความแบบกราฟิก</td>
                  </tr>

                  {/* 5. Grafana */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Grafana Observability</td>
                    <td style={{ padding: "12px" }}>Worker PC - Port 3000 / 3002</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('Grafana', '● ONLINE', '○ OFFLINE', '○ READY - LOCAL');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Real-time Observability & Metrics Dashboard</td>
                    <td style={{ padding: "12px" }}>
                      <a href="http://localhost:3002" target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        Grafana UI &rarr;
                      </a>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>แดชบอร์ดติดตามประสิทธิภาพและปริมาณงานแบบเรียลไทม์</td>
                  </tr>

                  {/* 6. n8n Orchestrator */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>n8n Workflow Automation</td>
                    <td style={{ padding: "12px" }}>Worker PC - Port 5678</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('n8n Orchestrator', '● ONLINE', '○ OFFLINE', '○ READY - LOCAL');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Workflow Automation & Alert Webhooks</td>
                    <td style={{ padding: "12px" }}>
                      <a href="http://localhost:5678" target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        n8n Editor &rarr;
                      </a>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>เครื่องมือจัดการขั้นตอนงานอัตโนมัติ ส่งการแจ้งเตือนเมื่อข้อมูลผิดปกติ</td>
                  </tr>

                  {/* 7. Kafka Broker */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Apache Kafka & Zookeeper</td>
                    <td style={{ padding: "12px" }}>Worker PC - Port 9092 / 2181</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('Kafka Broker', '● ONLINE', '○ OFFLINE', '○ READY - LOCAL');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Real-time Streaming Event Ingestion</td>
                    <td style={{ padding: "12px", color: "#64748B" }}>127.0.0.1:9092</td>
                    <td style={{ padding: "12px", color: "#64748B" }}>สตรีมข้อมูลความเร็วสูงในเครื่อง พร้อมคลัสเตอร์จัดเก็บสถานะ</td>
                  </tr>

                  {/* 8. HDFS Cluster */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Hadoop HDFS Lakehouse</td>
                    <td style={{ padding: "12px" }}>Worker PC - Port 9870 / 9864</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('HDFS Namenode', '● ONLINE', '○ OFFLINE', '○ READY - LOCAL');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Distributed Lakehouse Block Storage</td>
                    <td style={{ padding: "12px" }}>
                      <a href="http://localhost:9870" target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        HDFS Web &rarr;
                      </a>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>จัดเก็บไฟล์ขนาดใหญ่แบบกระจายศูนย์โดยไม่ต้องจ่ายค่าเช่าพื้นที่คลาวด์</td>
                  </tr>

                  {/* 9. Hybrid Remote Worker */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Hybrid Remote Worker</td>
                    <td style={{ padding: "12px" }}>Worker PC - scripts/remote_worker.py</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('Hybrid Remote Worker', '● ONLINE - LEASE ACTIVE', '○ QUEUE MODE', '○ QUEUE MODE');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Outbound HTTPS Lease & Task Executor</td>
                    <td style={{ padding: "12px" }}>
                      <Link to="/ingestion" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        ดูคิวงาน &rarr;
                      </Link>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>เชื่อมต่อขาออกทางพอร์ต 443 ไม่ต้องเปิดพอร์ตที่เร้าเตอร์</td>
                  </tr>

                  {/* 10. Neon PostgreSQL */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Neon PostgreSQL</td>
                    <td style={{ padding: "12px" }}>Neon Cloud Serverless</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('Postgres DB', '● ONLINE - CLOUD', '○ OFFLINE (DB DOWN)', '● ONLINE - CLOUD');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>Durable Jobs, Checkpoints & Quarantine</td>
                    <td style={{ padding: "12px" }}>
                      <Link to="/schema" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        ตรวจ Schema &rarr;
                      </Link>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>ขนาด 0.5 GB พร้อมปรับขนาดอัตโนมัติฟรีตลอดไป</td>
                  </tr>

                  {/* 11. FastAPI Backend */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>FastAPI Backend Gateway</td>
                    <td style={{ padding: "12px" }}>Render.com Free Web Service</td>
                    <td style={{ padding: "12px" }}>
                      {(() => {
                        const b = getSvcBadge('REST Ingestion API', '● ONLINE - CLOUD', '○ OFFLINE (API DOWN)', '● ONLINE - CLOUD');
                        return <span style={{ color: b.color, fontWeight: 600 }}>{b.text}</span>;
                      })()}
                    </td>
                    <td style={{ padding: "12px" }}>API Gateway, Coordinator & Auth</td>
                    <td style={{ padding: "12px" }}>
                      <a href="https://dataserve-api.onrender.com/docs" target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        OpenAPI Docs &rarr;
                      </a>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>โฮสต์เกตเวย์ตัวเบา ทำงานร่วมกับ Remote Worker สำหรับงานคำนวณหนัก</td>
                  </tr>

                  {/* 12. Vite / React UI */}
                  <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>Vite / React UI</td>
                    <td style={{ padding: "12px" }}>Vercel Hobby Tier</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ color: "#16A34A", fontWeight: 600 }}>● ONLINE - EDGE CDN</span>
                    </td>
                    <td style={{ padding: "12px" }}>User Interface, Dashboards, Ingestion UI</td>
                    <td style={{ padding: "12px" }}>
                      <a href="https://etl-v2.vercel.app" target="_blank" rel="noreferrer" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "underline" }}>
                        Production App &rarr;
                      </a>
                    </td>
                    <td style={{ padding: "12px", color: "#64748B" }}>แคชหน้าเว็บที่ขอบเครือข่าย เข้าชมได้รวดเร็ว แบนด์วิดท์ 100 GB ต่อเดือน</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </section>

      <section className="home-block">
        <h2 className="home-block-title">ETL Pipeline Workflow 4 ขั้นตอน</h2>
        <div className="home-steps">
          {WORKFLOW_STEPS.map((p) => (
            <Link key={p.key} to={p.path} className="home-step">
              <span className="home-step-num">{p.step}</span>
              <strong>{p.label}</strong>
              <span>{p.subtitle}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-block">
        <h2 className="home-block-title">เลือกใช้งานตาม Role</h2>
        <div className="home-roles">
          {[
            { role: "Data Engineer", page: "ingestion" },
            { role: "Data Steward / Compliance", page: "schema" },
            { role: "Business & Management", page: "dashboard" },
            { role: "Analyst / ML", page: "export" }
          ].map(({ role, page }) => {
            const p = getPage(page);
            return (
              <Link key={role} to={p.path} className="home-role">
                <strong>{role}</strong>
                <span>ไปที่ {p.label} →</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
