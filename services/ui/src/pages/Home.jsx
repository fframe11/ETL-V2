import { Icon } from '../components/UiIcons';
import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { WORKFLOW_STEPS, getPage } from '../config/pages';
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
        const schemaRes = await fetch("/api/v1/schema/proposals");
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json();
          const pendingSchema = schemaData.proposals ? schemaData.proposals.filter(p => p.status === "PENDING") : [];
          setSchemaCount(pendingSchema.length);
        }
      } catch (e) {
        console.error("Failed to fetch schema proposals count", e);
      }

      try {
        const aiRes = await fetch("/api/v1/rules/ai-proposals");
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

  const kafkaOnline = services?.['Kafka Broker']?.status === 'online';
  const postgresOnline = services?.['Postgres DB']?.status === 'online';
  const restOnline = services?.['REST Ingestion API']?.status === 'online';

  let overallStatus = "OFFLINE";
  let statusClass = "offline";

  if (kafkaOnline && postgresOnline && restOnline) {
    overallStatus = "ACTIVE";
    statusClass = "online";
  } else if (kafkaOnline || postgresOnline || restOnline) {
    overallStatus = "PARTIAL";
    statusClass = "warning";
  }

  return (
    <div className="gs-home">
      {/* Centered Hero Section */}
      <section className="gs-hero">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span className="gs-hero-badge">SDOQAP Observability Platform</span>
          <h1 className="gs-hero-title">
            More than observability.<br />
            <span className="gs-hero-accent">Complete Data Quality</span> Management.
          </h1>
          <p className="gs-hero-desc">
            ตรวจ คัดแยก และติดตามคุณภาพข้อมูลในที่เดียว
          </p>
          <div className="gs-hero-actions">
            <Link to="/ingestion" className="gs-btn-primary gs-btn-lg" style={{ background: "#2563EB", display: "inline-flex", alignItems: "center", gap: "8px", color: "#FFFFFF", fontWeight: 700 }}>
              <span><Icon name="bolt" /> เริ่มนำเข้าข้อมูล</span>
            </Link>
            <Link to="/guide" className="gs-btn-ghost">
              <span>อ่านคู่มือ</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '6px' }}><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          </div>
        </div>

        <div className="gs-hero-visual">
          <div className="gs-hero-panel">
            <div className="gs-panel-header">
              <span className="gs-panel-title">LIVE INGESTION CHANNELS</span>
              <span className={`gs-panel-status ${statusClass}`}>{overallStatus}</span>
            </div>
            <div className="gs-panel-row">
              <span className={`gs-panel-dot ${services?.['Kafka Broker']?.status === 'online' ? 'online' : 'offline'}`}></span>
              <span className="gs-panel-name">Kafka reddit_streaming</span>
              <span className={`gs-panel-badge ${services?.['Kafka Broker']?.status === 'online' ? 'online' : 'offline'}`}>
                {services?.['Kafka Broker']?.status === 'online' ? 'Ingesting' : 'Offline'}
              </span>
            </div>
            <div className="gs-panel-row">
              <span className={`gs-panel-dot ${services?.['Postgres DB']?.status === 'online' ? 'online' : 'offline'}`}></span>
              <span className="gs-panel-name">Postgres JDBC Ingest</span>
              <span className={`gs-panel-badge ${services?.['Postgres DB']?.status === 'online' ? 'online' : 'offline'}`}>
                {services?.['Postgres DB']?.status === 'online' ? 'Idle' : 'Offline'}
              </span>
            </div>
            <div className="gs-panel-row">
              <span className={`gs-panel-dot ${services?.['REST Ingestion API']?.status === 'online' ? 'online' : 'offline'}`}></span>
              <span className="gs-panel-name">REST telemetry_api</span>
              <span className={`gs-panel-badge ${services?.['REST Ingestion API']?.status === 'online' ? 'online' : 'offline'}`}>
                {services?.['REST Ingestion API']?.status === 'online' ? 'Active' : 'Offline'}
              </span>
            </div>
          </div>
          <div className="gs-hero-kpis">
            <div className="gs-mini-kpi">
              <span className="gs-mini-val">
                {kpis.data?.global_quality_score != null ? `${kpis.data.global_quality_score.toFixed(1)}%` : '---'}
              </span>
              <span className="gs-mini-label">AVG Quality Score</span>
            </div>
            <div className="gs-mini-kpi">
              <span className="gs-mini-val">
                {kpis.data
                  ? (kpis.data.total_records_ingested || 0) >= 1000000
                    ? `${((kpis.data.total_records_ingested || 0) / 1000000).toFixed(1)}M`
                    : (kpis.data.total_records_ingested || 0).toLocaleString()
                  : '---'}
              </span>
              <span className="gs-mini-label">Records Checked</span>
            </div>
            <div className="gs-mini-kpi">
              <span className="gs-mini-val">
                {kpis.data && (kpis.data.total_records_ingested || 0) > 0
                  ? `${(((kpis.data.quarantined_records || 0) / kpis.data.total_records_ingested) * 100).toFixed(3)}%`
                  : '0.000%'}
              </span>
              <span className="gs-mini-label">Quarantine Rate</span>
            </div>
          </div>
        </div>
      </section>


      {/* Live Service Status */}
      <div style={{ padding: '60px 48px 0' }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 className="gs-section-title" style={{ fontSize: '18px', margin: '0 0 6px 0', textTransform: 'uppercase' }}>Live Infrastructure Connections</h3>
          <p className="gs-section-desc" style={{ margin: '0 0 20px 0', fontSize: '12.5px', color: 'var(--text-muted)' }}>Real-time service nodes configuration checks</p>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
              <span>Checking health...</span>
            </div>
          ) : error ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: 'var(--accent-red)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>
              Failed to connect to health check API service.
            </div>
          ) : services ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
              {Object.entries(services).map(([name, info]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: info.status === 'online' ? 'var(--accent-green)' : 'var(--accent-red)' }} />
                  <strong style={{ fontSize: '12.5px', textTransform: 'capitalize', color: 'var(--text-main)' }}>{name}</strong>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{info.status}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <section className="home-block">
        <h2 className="home-block-title">4 ขั้นตอน</h2>
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
        <h2 className="home-block-title">เริ่มจากบทบาทของคุณ</h2>
        <div className="home-roles">
          {[
            { role: "Data Engineer", page: "ingestion" },
            { role: "Data Steward / Compliance", page: "schema" },
            { role: "ผู้บริหาร", page: "dashboard" },
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
