import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, LearnMore } from '../components/ui';
import { PAGES, WORKFLOW_STEPS } from '../config/pages';
import './RulesConfig.css';
import './ConfigGuide.css';

// --- Enterprise SVG Icons ---
const Icons = {
  BookOpen: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  Sliders: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  Layers: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  ShieldCheck: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  Database: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  CheckCircle: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Cpu: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  Compass: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  UploadCloud: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      <polyline points="16 16 12 12 8 16" />
    </svg>
  ),
  DownloadCloud: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 17 12 21 16 17" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      <polyline points="8 17 12 21 16 17" />
    </svg>
  ),
  Activity: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
};

export default function ConfigGuide() {
  const [activeTab, setActiveTab] = useState('parameters');

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0 24px', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '1080px', margin: '24px auto 60px', display: 'flex', flexDirection: 'column', gap: '20px' }}>


        <PageHeader pageKey="guide" />

        <LearnMore summary="หลักการ: แก้ปัญหาที่ต้นน้ำ">
          ระบบสแกนสถิติข้อมูลให้ก่อน แสดงหลักฐานความผิดปกติ แล้วให้คุณเป็นผู้ยืนยันกฎ ข้อมูลเสียถูกแจ้งกลับไปแก้ที่ระบบต้นทาง
        </LearnMore>

        <div className="gs-guide-steps">
          {WORKFLOW_STEPS.map((p) => (
            <Link key={p.key} to={p.path} className="gs-guide-step">
              <span className="gs-guide-step-num">ขั้นที่ {p.step}</span>
              <strong>{p.label}</strong>
              <span>{p.subtitle}</span>
            </Link>
          ))}
        </div>

        {/* === SECTION SELECTOR TABS === */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          {[
            { id: 'parameters', label: 'พารามิเตอร์', icon: <Icons.Sliders /> },
            { id: 'navigation', label: 'แต่ละหน้า', icon: <Icons.Compass /> },
            { id: 'lifecycle', label: 'สถาปัตยกรรม', icon: <Icons.Layers /> },
            { id: 'casestudy', label: 'กรณีศึกษา', icon: <Icons.ShieldCheck /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: activeTab === tab.id ? '1px solid var(--accent-purple)' : '1px solid transparent',
                background: activeTab === tab.id ? 'rgba(108, 71, 255, 0.1)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent-purple)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: PARAMETERS CONFIGURATION                                           */}
        {/* ========================================================================= */}
        {activeTab === 'parameters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="gs-guide-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '2px solid var(--border-color)', paddingBottom: '10px' }}>
                <Icons.Sliders />
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  พารามิเตอร์ของกฎ
                </h2>
              </div>

              {/* 1. Target Quality Score */}
              <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>RULE 01</span>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Target Quality Score (quality_score_threshold)</h3>
                  </div>
                  <span className="gs-badge" style={{ background: 'rgba(108,71,255,0.1)', color: 'var(--accent-purple)' }}>Circuit Breaker</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>กำหนดคะแนนชี้วัดขั้นต่ำของชุดข้อมูล หากคะแนนของแบตช์ต่ำกว่าเกณฑ์ ระบบจะทำการกักกันทันที</p>
                <LearnMore summary="รายละเอียดและค่าแนะนำ">
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 0', width: '25%', fontWeight: 600, color: 'var(--text-muted)' }}>พารามิเตอร์ย่อย</td>
                      <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                        <code className="gs-mono">base_value</code> (คะแนนเป้าหมาย เช่น 90.0), <code className="gs-mono">min_value</code> (ขอบเขตต่ำสุดที่ยอมรับได้ เช่น 70.0), <code className="gs-mono">adjustment_window_runs</code> (จำนวนรอบที่ใช้คำนวณค่าเฉลี่ย เช่น 15)
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-purple)' }}>การวิเคราะห์อัตโนมัติ</td>
                      <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>ระบบ Profiler คำนวณ Historical Moving Average จาก 15 แบตช์ล่าสุด เพื่อแนะนำค่าฐานที่เหมาะสมโดยไม่ต้องเดาตัวเลข</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <strong>เกณฑ์แนะนำตามการใช้งาน:</strong>
                  <span style={{ marginLeft: '8px', color: 'var(--accent-green)' }}>95.0% - 100.0%</span> สำหรับรายงานการเงินและคะแนนประเมินอย่างเป็นทางการ |
                  <span style={{ marginLeft: '8px', color: 'var(--accent-blue)' }}>90.0% - 94.9%</span> สำหรับการประมวลผลทางธุรกิจทั่วไป |
                  <span style={{ marginLeft: '8px', color: 'var(--accent-yellow)' }}>80.0% - 89.9%</span> สำหรับข้อมูลสถิติ/การสำรวจเบื้องต้น
                </div>
                </LearnMore>
              </div>

              {/* 2. Primary Key & Null Checks */}
              <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>RULE 02</span>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Primary Key & Null Checks (null_primary_key, null_checks)</h3>
                  </div>
                  <span className="gs-badge" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)' }}>Integrity Guard</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>ตรวจสอบการขาดหายไปของข้อมูล ป้องกันการนำข้อมูลไม่สมบูรณ์เข้าสู่คลังข้อมูลกลาง</p>
                <LearnMore summary="รายละเอียดและค่าแนะนำ">
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 0', width: '25%', fontWeight: 600, color: 'var(--text-muted)' }}>พารามิเตอร์ย่อย</td>
                      <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                        <code className="gs-mono">null_primary_key: strict</code> (ห้ามว่าง 0% เด็ดขาด), <code className="gs-mono">default_tolerance</code>, <code className="gs-mono">column_overrides</code>
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-purple)' }}>การวิเคราะห์อัตโนมัติ</td>
                      <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>คำนวณ Current Null Rate % รายคอลัมน์จากตารางขาเข้า และแจ้งเตือนทันทีหากฟิลด์สำคัญมีค่าว่างเกินกำหนด</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <strong>ข้อกำหนดมาตรฐาน:</strong> คอลัมน์ระบุตัวตน (Identifier เช่น <code className="gs-mono">student_id</code>, <code className="gs-mono">transaction_id</code>) ต้องกำหนดเป็น <strong style={{ color: 'var(--accent-red)' }}>Strict 0% Null</strong> เสมอ ส่วนคอลัมน์ประกอบสามารถกำหนด Tolerance ได้ตามสัญญาข้อมูล (Data Contract)
                </div>
                </LearnMore>
              </div>

              {/* 3. Value Range & Outlier IQR */}
              <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>RULE 03</span>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Value Range & Statistical Outlier (value_range, iqr)</h3>
                  </div>
                  <span className="gs-badge" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)' }}>Statistical Boundary</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>ตรวจจับค่าผิดปกติทางสถิติและค่าที่อยู่นอกขอบเขตเกณฑ์ทางธุรกิจ</p>
                <LearnMore summary="รายละเอียดและค่าแนะนำ">
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 0', width: '25%', fontWeight: 600, color: 'var(--text-muted)' }}>พารามิเตอร์ย่อย</td>
                      <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                        <code className="gs-mono">mode: auto/manual</code>, <code className="gs-mono">method: iqr</code>, <code className="gs-mono">iqr_multiplier</code> (1.5, 2.0, 2.5, 3.0)
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-purple)' }}>หลักการทำงาน</td>
                      <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                        คำนวณ Quartile [Q1, Q3] และสร้างกรอบตรวจสอบ: <code className="gs-mono">[Q1 - (k × IQR), Q3 + (k × IQR)]</code> เพื่อคัดกรองเรคคอร์ดที่หลุดช่วงออกจากชุดข้อมูลหลัก
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '11px', borderLeft: '2px solid var(--accent-green)' }}>
                    <strong>1.5× (Standard)</strong><br />
                    <span style={{ color: 'var(--text-muted)' }}>ข้อมูลกระจายตัวแบบปกติ</span>
                  </div>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '11px', borderLeft: '2px solid var(--accent-blue)' }}>
                    <strong>2.0–2.5× (Tolerant)</strong><br />
                    <span style={{ color: 'var(--text-muted)' }}>ตัวแปรผันผวนสูง</span>
                  </div>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '11px', borderLeft: '2px solid var(--accent-red)' }}>
                    <strong>3.0× (Extreme)</strong><br />
                    <span style={{ color: 'var(--text-muted)' }}>ดักจับข้อผิดพลาดร้ายแรง</span>
                  </div>
                </div>
                </LearnMore>
              </div>

              {/* 4. Freshness SLA */}
              <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>RULE 04</span>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>Data Freshness & Latency SLA (freshness_threshold_hours)</h3>
                  </div>
                  <span className="gs-badge" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--accent-yellow)' }}>SLA Compliance</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>ตรวจสอบความสดใหม่ของข้อมูล โดยเทียบเวลาประมวลผลปัจจุบันกับ Event Timestamp ล่าสุด</p>
                <LearnMore summary="รายละเอียดและค่าแนะนำ">
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 0', width: '25%', fontWeight: 600, color: 'var(--text-muted)' }}>พารามิเตอร์ย่อย</td>
                      <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                        <code className="gs-mono">base_value</code> (จำนวนชั่วโมงสูงสุดที่รับได้), <code className="gs-mono">mode: adaptive/strict</code>, <code className="gs-mono">learn_from_history</code>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <strong>แนวทาง SLA รายรูปแบบข้อมูล:</strong>
                  <span style={{ marginLeft: '8px', color: 'var(--accent-blue)' }}>≤ 1–2 ชม.</span> Real-time |
                  <span style={{ marginLeft: '8px', color: 'var(--accent-purple)' }}>≤ 24 ชม.</span> Daily Batch |
                  <span style={{ marginLeft: '8px', color: 'var(--accent-muted)' }}>≤ 168 ชม.</span> Weekly
                </div>
                </LearnMore>
              </div>

              {/* 5. AI Remediation Engine */}
              <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>RULE 05</span>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>AI Remediation & Adaptive Rules (ai_advisor, remediation_rules)</h3>
                  </div>
                  <span className="gs-badge" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--accent-green)' }}>Intelligent Automation</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>วิเคราะห์แพทเทิร์นของข้อมูลที่มีปัญหาใน Quarantine และนำเสนอวิธีทำความสะอาดพร้อมคำสั่งแก้ไขอัตโนมัติ</p>
                <LearnMore summary="รายละเอียดและค่าแนะนำ">
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 0', width: '25%', fontWeight: 600, color: 'var(--text-muted)' }}>พารามิเตอร์ย่อย</td>
                      <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                        <code className="gs-mono">enabled: true/false</code>, <code className="gs-mono">trigger: on_anomaly</code>, <code className="gs-mono">confidence_threshold: 0.70</code>
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--text-muted)' }}>ประเภทการซ่อมแซม</td>
                      <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--accent-blue)' }}>fillna</strong> (แทนที่ค่าว่าง) และ <strong style={{ color: 'var(--accent-purple)' }}>calculate</strong> (คำนวณอนุมานจากคอลัมน์ที่สัมพันธ์กัน)
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <strong>นโยบายความปลอดภัย:</strong> ข้อเสนอจาก AI ทุกรายการต้องรอผู้ดูแลระบบกด Approve ในหน้า Expectations & Alerts ก่อนเสมอ
                </div>
                </LearnMore>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PLATFORM MODULES & PAGES NAVIGATION                                */}
        {/* ========================================================================= */}
        {activeTab === 'navigation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="gs-guide-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '2px solid var(--border-color)', paddingBottom: '10px' }}>
                <Icons.Compass />
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  แต่ละหน้าทำอะไร
                </h2>
              </div>

              <ul className="gs-guide-pages">
                {PAGES.filter((p) => p.key !== 'home').map((p) => (
                  <li key={p.key}>
                    <Link to={p.path}><strong>{p.label}</strong></Link>
                    <span>{p.subtitle}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: END-TO-END DATA LIFECYCLE                                          */}
        {/* ========================================================================= */}
        {activeTab === 'lifecycle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="gs-guide-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '2px solid var(--border-color)', paddingBottom: '10px' }}>
                <Icons.Layers />
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  End-to-End Data Pipeline Architecture
                </h2>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
                การเดินทางของข้อมูลผ่าน 4 ขั้นตอนการกำกับดูแลตามสถาปัตยกรรม Upstream-First Resilience:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  {
                    step: 'PHASE 1',
                    title: 'Ingestion & Data Lake Landing',
                    badge: 'Landing Zone',
                    color: 'var(--accent-blue)',
                    desc: 'ข้อมูลจากแหล่งต้นทางถูกนำเข้าและจัดเก็บในรูปแบบ Parquet บน HDFS Landing Zone พร้อมบันทึก Metadata เวลานำเข้าและแหล่งที่มา',
                    tech: 'FastAPI Ingestion -> HDFS /data/landing/ -> Metadata Registry'
                  },
                  {
                    step: 'PHASE 2',
                    title: 'Schema Drift & Contract Verification',
                    badge: 'Contract Gate',
                    color: 'var(--accent-yellow)',
                    desc: 'ตรวจสอบโครงสร้างคอลัมน์และชนิดข้อมูลเทียบกับ Data Contract หากพบการเปลี่ยนแปลงจะแจ้งเตือนที่ Schema Drift Hub เพื่อให้ผู้ดูแลอนุมัติ',
                    tech: 'Schema Registry Diff -> Drift Alert -> Governance Approval'
                  },
                  {
                    step: 'PHASE 3',
                    title: 'Spark Quality Audit & 3-Way Routing',
                    badge: 'Processing Engine',
                    color: 'var(--accent-purple)',
                    desc: 'ประมวลผลกฎคุณภาพข้อมูล (Range, Null, Composite Key, Tukey IQR) และคัดแยกเรคคอร์ดออกเป็น Clean Asset, Review Queue และ Quarantine Lake',
                    tech: 'PySpark Engine -> Active Rules Config -> 3-Zone Segregation'
                  },
                  {
                    step: 'PHASE 4',
                    title: 'Serving Layer & Upstream Remediation',
                    badge: 'Gold & Feedback Loop',
                    color: 'var(--accent-green)',
                    desc: 'ส่งมอบข้อมูลสะอาดเข้าสู่ PostgreSQL/Elasticsearch สำหรับใช้งาน และส่งใบแจ้งซ่อมพร้อม Root Cause Log กลับไปยังทีมผู้ดูแลระบบต้นทาง',
                    tech: 'Gold Layer Serving + Export Hub CSV + Upstream Remediation Ticket'
                  }
                ].map((phase, i) => (
                  <div key={i} style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', borderLeft: `4px solid ${phase.color}`, borderTop: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: phase.color }}>{phase.step}</span>
                        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>{phase.title}</h3>
                      </div>
                      <span className="gs-badge" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>{phase.badge}</span>
                    </div>
                    <LearnMore summary="รายละเอียด">
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 8px' }}>{phase.desc}</p>
                      <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '6px 10px', borderRadius: '6px' }}>
                        {phase.tech}
                      </div>
                    </LearnMore>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: CASE STUDY REFERENCE                                               */}
        {/* ========================================================================= */}
        {activeTab === 'casestudy' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="gs-guide-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '2px solid var(--border-color)', paddingBottom: '10px' }}>
                <Icons.ShieldCheck />
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  Production Data Governance & 3-Zone Routing Policy
                </h2>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
                มาตรฐานการคัดแยกข้อมูลผ่านด่านตรวจสอบ 3 ชั้น และการแมปเกณฑ์คุณภาพข้อมูลเข้ากับพารามิเตอร์ของระบบในสภาพแวดล้อมการผลิต:
              </p>

              {/* Mapped Rules Configuration */}
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
                  ตารางมาตรฐานการบังคับใช้กฎและการคัดแยกโซนข้อมูล (Business & Technical Policy Mapping)
                </h3>
                <table className="gs-governance-table">
                  <thead>
                    <tr>
                      <th>Rule Category</th>
                      <th>Business Requirement</th>
                      <th>Platform Parameter Setting</th>
                      <th>ผลลัพธ์การกำกับดูแล</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Identifier Integrity</td>
                      <td>รหัสนักศึกษาและรหัสวิชาต้องห้ามว่าง</td>
                      <td><code className="gs-mono">null_primary_key: strict</code></td>
                      <td>กักกันเรคคอร์ดทันทีหาก ID ขาดหาย</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Score Bound</td>
                      <td>คะแนนเต็มวิชาการคือ 0 ถึง 100 คะแนน</td>
                      <td><code className="gs-mono">value_range: min=0.0, max=100.0</code></td>
                      <td>ปฏิเสธคะแนนที่ติดลบหรือเกิน 100 คะแนน</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Outlier Multiplier</td>
                      <td>ชั่วโมงเรียนอาจมีความยืดหยุ่นสูง</td>
                      <td><code className="gs-mono">study_hours: iqr_multiplier=2.5</code></td>
                      <td>เพิ่มเพดานรองรับความผันผวนของพฤติกรรมผู้เรียน</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Batch Freshness</td>
                      <td>รายงานคะแนนตัดเกรดประจำวัน</td>
                      <td><code className="gs-mono">freshness_threshold_hours: 24</code></td>
                      <td>แจ้งเตือน SLA ทันทีหากข้อมูลไม่อัปเดตใน 1 วัน</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>AI Imputation</td>
                      <td>คำนวณคะแนนทดแทนกรณีขาดสอบ</td>
                      <td><code className="gs-mono">calculate: study_hours * 1.5</code></td>
                      <td>เสนอสูตรคำนวณให้ผู้ดูแลอนุมัติก่อนบันทึก</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
