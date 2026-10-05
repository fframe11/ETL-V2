import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { Icon } from '../components/UiIcons';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine } from 'recharts';
import { PageHeader, InfoHint } from '../components/ui';
import { formatUsd, formatThbApprox } from '../utils/currency';
import "./Analytics.css";

const ACTION_LABEL = {
  SUMMARY: "สรุป",
  TUNE_OUTLIER_RULE: "ปรับกฎ",
  FIX_SOURCE_NULLS: "แก้ที่ต้นทาง",
  FIX_SOURCE_KEY: "แก้ที่ต้นทาง",
  REVIEW_KEY: "ตรวจคีย์",
  REVIEW_RANGE: "ตรวจช่วงค่า",
  RESTORE_BACKUP: "คืนข้อมูล",
  NOTIFY_DEV: "แจ้งต้นทาง"
};

const STATUS_STYLE = {
  CRITICAL: { background: "#FEF2F2", border: "#FECACA", color: "#B91C1C" },
  OK: { background: "#ECFDF5", border: "#A7F3D0", color: "#047857" },
  RECOMMENDED: { background: "#FFFBEB", border: "#FDE68A", color: "#B45309" }
};

// The API explains the trend in English; show it in Thai.
function trendText(raw) {
  if (!raw) return "";
  const slope = /slope: (-?[\d.]+)/.exec(raw)?.[1];
  const tail = slope ? ` (ความชัน ${slope} ต่อรอบ)` : "";
  if (/^Decline/.test(raw)) return `คะแนนมีแนวโน้มลดลง${tail}`;
  if (/^Stable/.test(raw)) return `คะแนนคงที่หรือดีขึ้น${tail}`;
  return "";
}

function RecCard({ rec }) {
  const style = STATUS_STYLE[rec.status] || { background: "#F8FAFC", border: "#E2E8F0", color: "#475569" };
  return (
    <div
      data-testid="rec-card"
      style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "10px 12px", borderRadius: "8px", background: style.background, border: `1px solid ${style.border}` }}
    >
      <span style={{ fontSize: "10.5px", fontWeight: 800, color: style.color, minWidth: "76px" }}>
        {ACTION_LABEL[rec.action_type] || rec.action_type}
      </span>
      <div style={{ flex: 1, minWidth: "240px" }}>
        <strong style={{ fontSize: "13px", color: "#0F172A" }}>{rec.title}</strong>
        <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#475569", lineHeight: 1.45 }}>{rec.description}</p>
      </div>
      {rec.link && (
        <Link to={rec.link} className="ui-btn ui-btn-secondary" style={{ whiteSpace: "nowrap" }}>ไปตั้งกฎ</Link>
      )}
    </div>
  );
}

export default function Analytics() {
  const [table, setTable] = useState("");
  const [slaTarget, setSlaTarget] = useState(95.0);
  const [clusterSearch, setClusterSearch] = useState("");
  const [actionToast, setActionToast] = useState("");

  const tables = useApi('/analytics/tables', { refreshInterval: 60000 });
  const loaded = useApi('/whitebox/state');
  const tableList = tables.data?.tables || [];

  // Start on the dataset that is loaded now (when it has runs), else the newest table.
  useEffect(() => {
    if (table || tableList.length === 0) return;
    const current = tableList.find((t) => t.name === loaded.data?.dataset_name);
    setTable((current || tableList[0]).name);
  }, [table, tableList, loaded.data]);

  const query = table ? `?table_name=${encodeURIComponent(table)}` : "";
  const projection = useApi(`/analytics/projection${query}`, { refreshInterval: 60000, enabled: Boolean(table) });
  const clustering = useApi(`/analytics/clustering${query}`, { refreshInterval: 60000, enabled: Boolean(table) });
  const recommendations = useApi(`/analytics/recommendations${query}`, { refreshInterval: 60000, enabled: Boolean(table) });
  const impact = useApi('/analytics/impact', { refreshInterval: 60000 });

  const handleRefreshAll = () => {
    tables.refetch();
    projection.refetch();
    clustering.refetch();
    impact.refetch();
    recommendations.refetch();
    setActionToast("โหลดข้อมูลล่าสุดแล้ว");
    setTimeout(() => setActionToast(""), 3000);
  };

  const allRecs = recommendations.data?.recommendations || [];
  const tableRecs = allRecs.filter((r) => r.scope === "table");
  const otherRecs = allRecs.filter((r) => r.scope !== "table");
  const latest = recommendations.data?.latest_run;

  // Forecast points exactly as the server computed them (7 days). Nothing is extended here.
  const projectionData = useMemo(() => {
    const d = projection.data;
    if (!d || !d.projected_scores || d.projected_scores.length === 0) return [];
    return (d.projection_days || []).map((day, i) => {
      const score = d.projected_scores[i];
      if (score == null) return null;
      return {
        day: `วันที่ ${day}`,
        Score: parseFloat(score.toFixed(2)),
        High: d.ci_high?.[i] != null ? parseFloat(d.ci_high[i].toFixed(2)) : null,
        Low: d.ci_low?.[i] != null ? parseFloat(d.ci_low[i].toFixed(2)) : null
      };
    }).filter(Boolean);
  }, [projection.data]);

  const breachDaysCount = useMemo(
    () => projectionData.filter((d) => d.Score < Number(slaTarget || 95)).length,
    [projectionData, slaTarget]
  );

  const yDomain = useMemo(() => {
    if (!projectionData.length) return [0, 100];
    const vals = projectionData.flatMap((d) => [d.Score, d.High, d.Low, Number(slaTarget || 95)]).filter((v) => v != null && !isNaN(v));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.4, 1.5);
    return [parseFloat(Math.max(0, min - pad).toFixed(1)), parseFloat(Math.min(102, max + pad * 0.5).toFixed(1))];
  }, [projectionData, slaTarget]);

  const clusteringData = useMemo(() => {
    const clusters = clustering.data?.clusters;
    if (!clusters) return [];
    const q = clusterSearch.trim().toLowerCase();
    return clusters
      .filter((c) => !q || String(c.label || "").toLowerCase().includes(q) || String(c.pattern || "").toLowerCase().includes(q))
      .slice(0, 12)
      .map((c) => ({ name: c.label || c.source, pattern: c.pattern, count: c.errors_count, pct: c.percentage }));
  }, [clustering.data, clusterSearch]);

  const clusterColors = ['#6C47FF', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];
  const noTables = !tables.loading && tableList.length === 0;
  const runsCount = projection.data?.runs_count ?? 0;

  return (
    <div className="gs-analytics">

      <PageHeader
        pageKey="analytics"
        actions={
          <button type="button" className="ui-btn ui-btn-secondary" onClick={handleRefreshAll}>
            <Icon name="refresh" /> โหลดใหม่
          </button>
        }
      />

      {/* Table and display controls */}
      <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <div style={{ minWidth: '220px' }}>
          <label htmlFor="analytics-table" style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
            ตาราง
          </label>
          <select
            id="analytics-table"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            disabled={tableList.length === 0}
            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', fontWeight: 700, color: '#0F172A', background: '#FFFFFF' }}
          >
            {tableList.length === 0 && <option value="">ยังไม่มีผลรัน</option>}
            {tableList.map((t) => (
              <option key={t.name} value={t.name}>{t.name} ({t.runs} รอบ)</option>
            ))}
          </select>
        </div>

        <div style={{ minWidth: '150px' }}>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
            เป้า SLA (%)
            <InfoHint text="มีผลแค่เส้นอ้างอิงและการนับวันในกราฟพยากรณ์ของหน้านี้ ไม่เปลี่ยนเกณฑ์ที่ระบบใช้ตัดสินผ่านหรือไม่ผ่าน" />
          </label>
          <input
            type="number"
            min="50"
            max="100"
            step="0.5"
            value={slaTarget}
            onChange={(e) => setSlaTarget(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 800, color: '#0F172A' }}
          />
        </div>

        <div style={{ minWidth: '220px', flex: 1 }}>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
            ค้นหาสาเหตุ
          </label>
          <input
            type="text"
            value={clusterSearch}
            onChange={(e) => setClusterSearch(e.target.value)}
            placeholder="ชื่อคอลัมน์หรือสาเหตุ เช่น null"
            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', color: '#0F172A' }}
          />
        </div>
      </div>

      {actionToast && (
        <div style={{ background: '#ECFDF5', border: '1px solid #10B981', color: '#065F46', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700 }}>
          <Icon name="check" /> {actionToast}
        </div>
      )}

      {noTables && (
        <div className="gs-empty">ยังไม่มีผลรันตรวจคุณภาพ นำเข้าไฟล์แล้วรอให้ Pipeline รันเสร็จ</div>
      )}

      {/* 1. Latest run of the chosen table */}
      {latest && (
        <div data-testid="latest-run" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'baseline', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '12px 16px' }}>
          <div>
            <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700 }}>คะแนนรอบล่าสุด</div>
            <strong style={{ fontSize: '1.6rem', color: latest.quality_score >= latest.threshold ? '#047857' : '#B91C1C' }}>
              {Number(latest.quality_score).toFixed(2)}%
            </strong>
          </div>
          <div>
            <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700 }}>เกณฑ์ผ่าน</div>
            <strong style={{ fontSize: '1.1rem' }}>{Number(latest.threshold)}%</strong>
          </div>
          <div>
            <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700 }}>ถูกกักกัน</div>
            <strong style={{ fontSize: '1.1rem' }}>
              {Number(latest.quarantined_records || 0).toLocaleString()} จาก {Number(latest.total_records || 0).toLocaleString()} แถว
            </strong>
          </div>
        </div>
      )}

      {/* 2. What to do, for this table first */}
      {table && (
        <div className="gs-acard">
          <div className="gs-acard-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3>
              ควรทำอะไรกับ {table}
              <InfoHint text="สร้างจากสาเหตุที่ถูกกักกันในรอบล่าสุดของตารางนี้ด้วยกฎที่กำหนดไว้ ไม่ใช่คำแนะนำจากโมเดล AI" />
            </h3>
          </div>
          {recommendations.loading ? (
            <div className="gs-empty">กำลังโหลด...</div>
          ) : recommendations.error ? (
            <div className="gs-toast err">โหลดไม่สำเร็จ</div>
          ) : tableRecs.length === 0 ? (
            <div className="gs-empty">ยังไม่มีผลรันของตารางนี้ จึงยังไม่มีคำแนะนำ</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tableRecs.map((rec) => <RecCard key={rec.id} rec={rec} />)}
            </div>
          )}

          {otherRecs.length > 0 && (
            <details style={{ marginTop: '12px' }}>
              <summary style={{ fontSize: '12px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                แจ้งเตือนของตารางอื่น ({otherRecs.length})
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {otherRecs.map((rec) => <RecCard key={rec.id} rec={rec} />)}
              </div>
            </details>
          )}
        </div>
      )}

      {/* 3. Causes and business estimate */}
      <div className="gs-analytics-grid">
        <div className="gs-acard">
          <div className="gs-acard-head">
            <h3>
              สาเหตุที่ถูกกักกัน{clusterSearch ? ` · "${clusterSearch}"` : ""}
              <InfoHint text="นับจากเหตุผลที่ระบบบันทึกไว้ในรอบล่าสุดของตารางนี้ แถวหนึ่งอาจมีหลายเหตุผล ผลรวมจึงอาจเกินจำนวนแถวที่ถูกกักกัน" />
            </h3>
          </div>

          {!table ? (
            <div className="gs-empty">เลือกตารางเพื่อดูสาเหตุ</div>
          ) : clustering.loading ? (
            <div className="gs-empty">กำลังโหลด...</div>
          ) : clustering.error ? (
            <div className="gs-toast err">โหลดไม่สำเร็จ</div>
          ) : clusteringData.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>{clustering.data?.correlation_analysis}</p>
              <div className="gs-achart-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clusteringData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                    <XAxis type="number" stroke="#64748b" tick={{ fontSize: 9.5 }} />
                    <YAxis type="category" dataKey="name" stroke="#64748b" tick={{ fontSize: 9.5 }} width={150} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {clusteringData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={clusterColors[idx % clusterColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {clusteringData.map((c, i) => (
                  <div key={i} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                    <span style={{ color: clusterColors[i % clusterColors.length], fontWeight: 700 }}>● {c.name}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{c.count.toLocaleString()} รายการ ({c.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="gs-empty">
              {clusterSearch ? `ไม่พบสาเหตุที่ตรงกับ "${clusterSearch}"` : "รอบล่าสุดของตารางนี้ไม่มีแถวที่ถูกกักกัน"}
            </div>
          )}
        </div>

        <div className="gs-acard">
          <div className="gs-acard-head">
            <h3>
              ผลกระทบทางธุรกิจ (ประมาณการ)
              <InfoHint text="คำนวณจากค่าคงที่สมมติ (เช่น ค่าแก้ไข 2 ดอลลาร์ต่อแถว) รวมทุกตาราง ไม่ใช่ต้นทุนจริงของธุรกิจ ใช้ดูลำดับความสำคัญเท่านั้น" />
            </h3>
          </div>

          {impact.loading ? (
            <div className="gs-empty">กำลังโหลด...</div>
          ) : impact.error ? (
            <div className="gs-toast err">โหลดไม่สำเร็จ</div>
          ) : impact.data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="gs-impact-list">
                {(impact.data.kpi_connections || []).map((kpi, i) => (
                  <div key={i} className="gs-impact-item">
                    <span className="gs-impact-name">{kpi.kpi_name}</span>
                    <div className="gs-impact-bar-bg">
                      <div className="gs-impact-bar" style={{ width: `${kpi.impact_pct}%`, background: kpi.status === 'CRITICAL' ? 'var(--accent-red)' : kpi.status === 'WARN' ? 'var(--accent-yellow)' : 'var(--accent-green)' }} />
                    </div>
                    <span className="gs-impact-score" style={{ color: kpi.status === 'CRITICAL' ? 'var(--accent-red)' : 'var(--text-main)' }}>-{kpi.impact_pct}%</span>
                  </div>
                ))}
              </div>

              <div style={{ padding: '16px', background: 'rgba(239,68,68,0.04)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.1)', textAlign: 'center', marginTop: '10px' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>ค่าประมาณจากสูตรสมมติ</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                  {formatUsd(impact.data?.total_financial_impact_usd)}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {formatThbApprox(impact.data?.total_financial_impact_usd)}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 4. Forecast: only when there is enough history */}
      {table && (
        <div className="gs-acard gs-acard-wide">
          <div className="gs-acard-head">
            <h3>พยากรณ์ 7 วัน · เป้า {slaTarget}%</h3>
          </div>

          {projection.loading ? (
            <div className="gs-empty">กำลังคำนวณ...</div>
          ) : projection.error ? (
            <div className="gs-toast err">โหลดไม่สำเร็จ</div>
          ) : projectionData.length === 0 ? (
            <div className="gs-empty">
              ตาราง {table} มีผลรัน {runsCount} รอบ ต้องมีอย่างน้อย 2 รอบจึงพยากรณ์ได้ ส่งไฟล์เข้าตรวจซ้ำเพื่อเริ่มเก็บแนวโน้ม
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ alignSelf: 'flex-start', background: breachDaysCount > 0 ? '#FEF2F2' : '#ECFDF5', border: `1px solid ${breachDaysCount > 0 ? '#FECACA' : '#6EE7B7'}`, padding: '6px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 800, color: breachDaysCount > 0 ? '#B91C1C' : '#047857' }}>
                {breachDaysCount > 0
                  ? `ต่ำกว่าเป้า ${slaTarget}% จำนวน ${breachDaysCount} จาก ${projectionData.length} วัน`
                  : `ไม่ต่ำกว่าเป้า ${slaTarget}% ใน ${projectionData.length} วัน`}
              </div>
              <div className="gs-achart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={projectionData} margin={{ top: 10, right: 20, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="anHigh" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="anLow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-red)" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="var(--accent-red)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 9.5 }} />
                    <YAxis domain={yDomain} stroke="#64748b" tick={{ fontSize: 9.5 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }} />
                    <ReferenceLine y={Number(slaTarget || 95)} stroke="var(--accent-yellow)" strokeDasharray="5 3" label={{ value: `เป้า ${slaTarget}%`, position: 'right', fill: 'var(--accent-yellow)', fontSize: 9 }} />
                    <Area type="monotone" dataKey="High" stroke="var(--accent-green)" fill="url(#anHigh)" strokeWidth={1.5} dot={{ r: 2 }} />
                    <Area type="monotone" dataKey="Low" stroke="var(--accent-red)" fill="url(#anLow)" strokeWidth={1.5} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="Score" stroke="var(--accent-purple)" strokeWidth={2.5} dot={{ r: 3.5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="gs-analytics-kpis">
                <div className="gs-akpi">
                  <span className="gs-akpi-label">
                    ความนิ่งของคะแนน
                    <InfoHint text="100% คือคะแนนแต่ละรอบใกล้เคียงกันมาก ยิ่งต่ำยิ่งแกว่ง" />
                  </span>
                  <span className="gs-akpi-value" style={{ color: 'var(--accent-green)' }}>{projection.data.stability_index}</span>
                </div>
              </div>

              {trendText(projection.data.historical_trend) && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong>แนวโน้มย้อนหลัง:</strong> {trendText(projection.data.historical_trend)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
