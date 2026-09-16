import React from 'react';
import './RulesConfig.css';

export default function ConfigGuide() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0 20px', backgroundColor: 'var(--bg-primary)' }}>
    <div style={{ maxWidth: '960px', margin: '20px auto 40px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* === HEADER === */}
      <div className="gs-guide-card" style={{ background: 'linear-gradient(135deg, var(--accent-purple) 0%, #7c3aed 100%)', color: 'white', padding: '28px 32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'white' }}>📖 Platform Configuration Guide</h2>
        <p style={{ fontSize: '13px', margin: '8px 0 0', opacity: 0.9, lineHeight: 1.6, color: 'rgba(255,255,255,0.9)' }}>
          Guidance by Platform, Final Decisions by User — แพลตฟอร์มแนะนำค่าเริ่มต้น ผู้ใช้ตัดสินใจขั้นสุดท้าย
        </p>
        <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '11.5px', lineHeight: 1.6, color: 'rgba(255,255,255,0.95)' }}>
          <strong>Core Philosophy:</strong> "Users do not guess the parameters." — ระบบจะวิเคราะห์ข้อมูล นำวัตถุประสงค์และกฎทางธุรกิจมาพิจารณา จากนั้นจึงแนะนำช่วงค่าเริ่มต้นที่สมเหตุสมผล
        </div>
      </div>

      {/* === PHASE 1 === */}
      <div style={{ marginTop: '10px', paddingBottom: '8px', borderBottom: '2px solid rgba(139, 92, 246, 0.3)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-purple)', margin: 0 }}>Phase 1: Ingestion & Integration</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>การนำเข้าและจัดการโครงสร้างข้อมูล</p>
      </div>
      {/* === SECTION 6: Ingestion Stage === */}
      <div className="gs-guide-card">
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-purple)', marginBottom: '16px', borderBottom: '2px solid var(--accent-purple)', paddingBottom: '8px' }}>
          📥 Ingestion Stage — การนำเข้าข้อมูล
        </h3>
        <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
          รองรับการดึงข้อมูลจากหลากหลายแหล่งเพื่อส่งเข้า HDFS (Data Lake) อย่างปลอดภัย
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>📄</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-blue)' }}>CSV / Batch Upload</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>อัปโหลดไฟล์ตรงเข้าสู่ระบบ เหมาะกับข้อมูลย้อนหลัง</div>
          </div>
          <div style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>🌐</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-purple)' }}>REST API Push</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>ยิงข้อมูลผ่าน API Endpoint เหมาะกับการเชื่อมต่อระบบภายนอก</div>
          </div>
          <div style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', marginBottom: '8px' }}>⚡</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-green)' }}>Kafka Streaming</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>สตรีมมิ่งข้อมูลแบบ Real-time เหมาะสำหรับระบบ IoT/Logs</div>
          </div>
        </div>
      </div>

      {/* === SECTION 7: Schema Drift === */}
      <div className="gs-guide-card">
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-purple)', marginBottom: '16px', borderBottom: '2px solid var(--accent-purple)', paddingBottom: '8px' }}>
          ⚠️ Schema Drift — การจัดการโครงสร้างข้อมูลที่เปลี่ยนไป
        </h3>
        <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
          เมื่อโครงสร้างข้อมูลต้นทางเปลี่ยน (มีคอลัมน์ใหม่ หรือ Data Type เปลี่ยน) ระบบจะดักจับไว้ที่ Schema Drift Hub เพื่อให้ผู้ใช้งานตัดสินใจ
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', padding: '12px', background: '#d1fae5', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.3)' }}>
            <div style={{ fontSize: '16px' }}>✅</div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-green)' }}>Accept (Evolve Schema)</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>ยอมรับโครงสร้างใหม่ คอลัมน์ที่เพิ่มมาใหม่จะถูกบรรจุเข้าสู่ Data Warehouse อย่างเป็นทางการ</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', padding: '12px', background: '#fee2e2', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)' }}>
            <div style={{ fontSize: '16px' }}>❌</div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-red)' }}>Reject (Strict Schema)</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>ปฏิเสธการเปลี่ยนแปลง คอลัมน์ที่เกินมาจะถูกทิ้ง (Drop) เพื่อรักษาความเสถียรของ Pipeline เดิม</div>
            </div>
          </div>
        </div>
      </div>

      {/* === PHASE 2 === */}
      <div style={{ marginTop: '24px', paddingBottom: '8px', borderBottom: '2px solid rgba(139, 92, 246, 0.3)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-purple)', margin: 0 }}>Phase 2: Transformation & Quality Control</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>การประมวลผล ตรวจสอบ และตั้งค่าคุณภาพข้อมูล</p>
      </div>
      {/* === SECTION 2: ระบบ Transform ข้อมูลอย่างไร === */}
      <div className="gs-guide-card">
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-purple)', marginBottom: '16px', borderBottom: '2px solid var(--accent-purple)', paddingBottom: '8px' }}>
          🔄 ระบบ Transform ข้อมูลอย่างไร?
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { step: '1', title: 'ระบบสแกนข้อมูลจริง', icon: '🔍', desc: 'ระบบใช้ Column Profiler คำนวณค่า Null Rate %, Min, Max และ Outliers ให้โดยอัตโนมัติจากชุดข้อมูลจริง', color: 'var(--accent-blue)' },
            { step: '2', title: 'ระบบแนะนำค่าที่เหมาะสม', icon: '🤖', desc: 'ใช้ Domain Presets & AI ช่วยโหลดค่ามาตรฐานลงในฟอร์มให้อัตโนมัติด้วยการคลิกเพียง 1 ครั้ง', color: 'var(--accent-purple)' },
            { step: '3', title: 'ผู้ใช้ยืนยัน / ปรับแต่ง', icon: '✅', desc: 'ผู้ใช้งานตรวจสอบตามบริบททางธุรกิจ ปรับตัวเลขได้ตามต้องการ แล้วกดยืนยันบันทึกได้ทันที โดยไม่ต้องเขียนโค้ด Spark ใหม่', color: 'var(--accent-green)' }
          ].map((item) => (
            <div key={item.step} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div style={{ background: item.color, color: 'white', borderRadius: '50%', minWidth: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800 }}>{item.step}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>{item.icon} {item.title}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '14px', padding: '10px 14px', background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.15)', borderRadius: '8px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
          Data Profiling → Data Purpose → Business Rules → Recommended Range → <strong style={{ color: 'var(--accent-purple)' }}>User Confirmation</strong>
        </div>
      </div>

      {/* === SECTION 1: System Configuration === */}
      <div className="gs-guide-card">
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-purple)', marginBottom: '16px', borderBottom: '2px solid var(--accent-purple)', paddingBottom: '8px' }}>
          ⚙️ System Configuration — การตั้งค่าระบบ
        </h3>

        {/* 1. Target Quality Score */}
        <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>1</span>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>Target Quality Score</h4>
          </div>
          <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, width: '30%', color: 'var(--accent-purple)' }}>หน้าที่</td>
                <td style={{ padding: '8px 0' }}>กำหนดคะแนนรวมขั้นต่ำที่ยอมให้ข้อมูลผ่านเข้าไปยังคลังข้อมูล</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-green)' }}>ระบบช่วยคำนวณ</td>
                <td style={{ padding: '8px 0' }}>มี Profiler คำนวณคะแนนเฉลี่ยย้อนหลัง 15 รอบให้ดูเพื่อเป็นแนวทาง</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-blue)' }}>ผู้ใช้ตัดสินใจ</td>
                <td style={{ padding: '8px 0' }}>เลือกตั้งค่าคะแนนขั้นต่ำ (เช่น 90% หรือ 99%) หากข้อมูลได้คะแนนต่ำกว่าเกณฑ์นี้จะถูกบล็อก</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 2. Null Checks Constraint */}
        <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>2</span>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>Null Checks Constraint</h4>
          </div>
          <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, width: '30%', color: 'var(--accent-purple)' }}>หน้าที่</td>
                <td style={{ padding: '8px 0' }}>จัดการการยอมรับค่าว่าง (Missing Values) ในแต่ละคอลัมน์</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-green)' }}>ระบบช่วยคำนวณ</td>
                <td style={{ padding: '8px 0' }}>คำนวณ Current Null Rate % (อัตราค่าว่างในปัจจุบัน) ของแต่ละคอลัมน์จากข้อมูลจริง</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-blue)' }}>ผู้ใช้ตัดสินใจ</td>
                <td style={{ padding: '8px 0' }}>กำหนดเงื่อนไขว่าคอลัมน์ใดต้องเป็นแบบ Strict (ห้ามมีค่าว่างเด็ดขาด หรือ 0%) หรือยอมรับค่าว่างได้ที่กี่ %</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 3. Outliers IQR Range */}
        <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>3</span>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>Outliers (IQR) Range</h4>
          </div>
          <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, width: '30%', color: 'var(--accent-purple)' }}>หน้าที่</td>
                <td style={{ padding: '8px 0' }}>ดักจับค่าตัวเลขที่สูงหรือต่ำผิดปกติ</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-green)' }}>ระบบช่วยคำนวณ</td>
                <td style={{ padding: '8px 0' }}>สแกนหาช่วงสถิติ Q1, Q3 และคำนวณกรอบ 1.5×IQR</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-blue)' }}>ผู้ใช้ตัดสินใจ</td>
                <td style={{ padding: '8px 0' }}>เลือกว่าจะเปิดหรือปิดการใช้งาน Auto IQR เพื่อกรองค่าที่ผิดปกติทางสถิติ</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 4. Max Freshness Delay */}
        <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>4</span>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>Max Freshness Delay</h4>
          </div>
          <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, width: '30%', color: 'var(--accent-purple)' }}>หน้าที่</td>
                <td style={{ padding: '8px 0' }}>กำหนดความถี่ในการอัปเดตข้อมูลว่าต้องอัปเดตบ่อยแค่ไหน (หน่วยเป็นชั่วโมง)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-green)' }}>ระบบช่วยคำนวณ</td>
                <td style={{ padding: '8px 0' }}>ตรวจสอบ Timestamp ล่าสุดของข้อมูลเทียบกับเวลาปัจจุบัน</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-blue)' }}>ผู้ใช้ตัดสินใจ</td>
                <td style={{ padding: '8px 0' }}>กำหนดระยะเวลาล่าช้าสูงสุดที่รับได้ เช่น 2h สำหรับ IoT หรือ 24h สำหรับร้านค้า</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 5. AI Advisor & Clean */}
        <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ background: 'var(--accent-purple)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>5</span>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>AI Advisor & Clean</h4>
          </div>
          <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, width: '30%', color: 'var(--accent-purple)' }}>หน้าที่</td>
                <td style={{ padding: '8px 0' }}>การแปลงข้อมูลและการจัดมาตรฐานคำศัพท์ (Casting / Mapping)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-green)' }}>ระบบช่วยคำนวณ</td>
                <td style={{ padding: '8px 0' }}>AI จะอ่านข้อความแล้วร่างกฎสำหรับการแปลงข้อมูลให้</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', fontWeight: 600, color: 'var(--accent-blue)' }}>ผู้ใช้ตัดสินใจ</td>
                <td style={{ padding: '8px 0' }}>เลือกว่าจะเปิดหรือปิด AI รวมถึงกดยืนยันเพื่อนำกฎไปใช้งานจริง</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* === SECTION 4: Platform Configuration Guide === */}
      <div className="gs-guide-card">
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-purple)', marginBottom: '16px', borderBottom: '2px solid var(--accent-purple)', paddingBottom: '8px' }}>
          📐 Platform Configuration Guide — คู่มือการตั้งค่า
        </h3>

        {/* Grid of 4 guides */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {/* 1. Null Tolerance */}
          <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>1. Null Tolerance</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>คำถามหลัก: ฟิลด์นี้จำเป็นต้องมีค่าหรือไม่?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#fee2e2', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>0% Strict</span><span>Required / Critical Field</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>1–5%</span><span>Missing บางส่วนพอรับได้</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-primary)', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>{'>'}5%</span><span>ต้องประเมิน Business Impact</span></div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--accent-purple)', fontStyle: 'italic' }}>📌 Score Case → 0% Strict (ID • Score)</div>
          </div>

          {/* 2. Freshness SLA */}
          <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>2. Freshness (SLA)</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>คำถามหลัก: ข้อมูลต้องสดใหม่ระดับใด?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#fee2e2', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>≤ 1h</span><span>Real-time / Critical Ops</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>≤ 24h</span><span>Daily Batch / Report</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-primary)', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>1–7d</span><span>Periodic / Weekly Analytics</span></div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--accent-purple)', fontStyle: 'italic' }}>📌 Score Case → ≤ 24h Delay (Daily Batch)</div>
          </div>

          {/* 3. Quality Target */}
          <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>3. Quality Target</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>คำถามหลัก: ระดับความน่าเชื่อถือของผลลัพธ์?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#d1fae5', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>95–100%</span><span>Official / Critical</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>90–95%</span><span>General Business Use</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-primary)', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>80–90%</span><span>Exploratory / Ad-hoc</span></div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--accent-purple)', fontStyle: 'italic' }}>📌 Score Case → Suggested 95–100%</div>
          </div>

          {/* 4. Schema Guard */}
          <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>4. Schema Guard</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>คำถามหลัก: โครงสร้าง Pipeline เสถียรไหม?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#fee2e2', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>Strict</span><span>ห้ามเปลี่ยน Type / Column</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>Evolution</span><span>ยอมให้เพิ่มฟิลด์ได้</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-primary)', borderRadius: '4px' }}><span style={{ fontWeight: 600 }}>Flexible</span><span>Schema on-read ยืดหยุ่นสูง</span></div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--accent-purple)', fontStyle: 'italic' }}>📌 Score Case → Strict Schema</div>
          </div>
        </div>
      </div>

      {/* === SECTION 5: Domain Rule vs Auto IQR === */}
      <div className="gs-guide-card">
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-purple)', marginBottom: '16px', borderBottom: '2px solid var(--accent-purple)', paddingBottom: '8px' }}>
          📊 Domain Rule vs. Auto IQR
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div style={{ padding: '16px', background: '#d1fae5', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--accent-green)' }}>✅ Known Domain → Range Check First</div>
            <div style={{ fontSize: '11px', lineHeight: 1.6 }}>ใช้เมื่อทราบช่วงค่าชัดเจน เช่น Score (0–100) หรือ GPA (0–4) โดยไม่ต้องพึ่งพาสถิติ IQR</div>
          </div>
          <div style={{ padding: '16px', background: 'rgba(59,130,246,0.06)', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.2)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--accent-blue)' }}>🔍 Unknown Domain → Auto IQR Multiplier</div>
            <div style={{ fontSize: '11px', lineHeight: 1.6 }}>ใช้เมื่อไม่ทราบช่วงค่าที่แน่นอน โดยเลือกปรับตัวคูณ (Multiplier) ตามความไว</div>
          </div>
        </div>
        <table className="gs-governance-table">
          <thead><tr><th>Multiplier</th><th>Sensitivity</th><th>คำอธิบาย</th></tr></thead>
          <tbody>
            <tr><td style={{ fontWeight: 700 }}>1.5×</td><td><span className="gs-badge" style={{ background: '#d1fae5', color: 'var(--accent-green)' }}>Standard</span></td><td>จุดเริ่มต้นทั่วไป (Default) — เหมาะกับข้อมูลส่วนใหญ่</td></tr>
            <tr><td style={{ fontWeight: 700 }}>2.0×</td><td><span className="gs-badge" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--accent-yellow)' }}>More Tolerant</span></td><td>เหมาะสำหรับข้อมูลที่มีความผันผวนตามธรรมชาติ</td></tr>
            <tr><td style={{ fontWeight: 700 }}>3.0×</td><td><span className="gs-badge" style={{ background: '#fee2e2', color: 'var(--accent-red)' }}>Extreme Only</span></td><td>เน้นจับเฉพาะค่าที่หลุดสุดโต่งจริงๆ เท่านั้น</td></tr>
          </tbody>
        </table>
      </div>

            {/* === PHASE 3 === */}
      <div style={{ marginTop: '24px', paddingBottom: '8px', borderBottom: '2px solid rgba(139, 92, 246, 0.3)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-purple)', margin: 0 }}>Phase 3: Example in Action</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>สาธิตตัวอย่างการทำงานของระบบผ่านกรณีศึกษา</p>
      </div>
      {/* === SECTION 3: Case Study === */}
      <div className="gs-guide-card">
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-purple)', marginBottom: '6px', borderBottom: '2px solid var(--accent-purple)', paddingBottom: '8px' }}>
          🎓 Case Study: University Course Score Management
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 16px' }}>จากข้อมูลจริง สู่การปรับแต่งบนแพลตฟอร์มที่ผู้ใช้ยืนยันได้</p>

        {/* Observed Records */}
        <h4 style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>01 — Real Data Input & Profiling</h4>
        <table className="gs-governance-table" style={{ marginBottom: '16px' }}>
          <thead><tr><th>รหัส</th><th>วิชา</th><th>คะแนน</th><th>สถานะ</th></tr></thead>
          <tbody>
            <tr><td className="gs-mono">65001</td><td>Big Data</td><td>85</td><td><span className="gs-badge" style={{ background: '#d1fae5', color: 'var(--accent-green)' }}>Valid</span></td></tr>
            <tr><td className="gs-mono">65002</td><td>Database</td><td>78</td><td><span className="gs-badge" style={{ background: '#d1fae5', color: 'var(--accent-green)' }}>Valid</span></td></tr>
            <tr><td className="gs-mono">65003</td><td>Big Data</td><td style={{ color: 'var(--accent-red)', fontWeight: 700 }}>NULL</td><td><span className="gs-badge" style={{ background: '#fee2e2', color: 'var(--accent-red)' }}>Missing</span></td></tr>
            <tr><td className="gs-mono">65004</td><td>Database</td><td style={{ color: 'var(--accent-red)', fontWeight: 700 }}>150</td><td><span className="gs-badge" style={{ background: '#fee2e2', color: 'var(--accent-red)' }}>Invalid</span></td></tr>
          </tbody>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '6px', color: 'var(--accent-blue)' }}>🔍 Data Layer แสดงให้เห็น</div>
            <ul style={{ fontSize: '11px', margin: 0, paddingLeft: '16px', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              <li><strong>Null Rate:</strong> พบค่าว่าง (Missing) ในบาง Student ID</li>
              <li><strong>Score Range:</strong> ตรวจพบคะแนน 150 (out of range)</li>
              <li><strong>Schema:</strong> 3 Columns, Daily Batch Pipeline</li>
            </ul>
          </div>
          <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '6px', color: 'var(--accent-purple)' }}>💼 Business Context Layer</div>
            <ul style={{ fontSize: '11px', margin: 0, paddingLeft: '16px', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              <li><strong>Purpose:</strong> Official Grade (เกรดอย่างเป็นทางการ)</li>
              <li><strong>Required:</strong> Student ID + Score</li>
              <li><strong>Rule:</strong> ช่วงคะแนนคือ 0–100</li>
              <li><strong>SLA:</strong> Daily Report ภายใน 24h</li>
            </ul>
          </div>
        </div>

        {/* Guided Platform Rules */}
        <h4 style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>02 — Guided Platform Rules Configuration</h4>
        <table className="gs-governance-table">
          <thead><tr><th>Rule</th><th>Business Context</th><th style={{ color: 'var(--accent-purple)' }}>Platform Recommendation</th></tr></thead>
          <tbody>
            <tr><td style={{ fontWeight: 700 }}>Null Check</td><td>Student ID + Score ห้ามว่าง</td><td><span className="gs-badge" style={{ background: '#fee2e2', color: 'var(--accent-red)' }}>Strict (0% Null)</span></td></tr>
            <tr><td style={{ fontWeight: 700 }}>Value Range</td><td>คะแนนสอบ = 0–100</td><td><span className="gs-badge" style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--accent-blue)' }}>Range: 0–100</span></td></tr>
            <tr><td style={{ fontWeight: 700 }}>Freshness</td><td>Daily Batch Report</td><td><span className="gs-badge" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--accent-yellow)' }}>{'Max Delay: < 24h'}</span></td></tr>
            <tr><td style={{ fontWeight: 700 }}>Quality</td><td>Official Grade ระดับมหาวิทยาลัย</td><td><span className="gs-badge" style={{ background: '#d1fae5', color: 'var(--accent-green)' }}>Suggested: 95–100%</span></td></tr>
            <tr><td style={{ fontWeight: 700 }}>Schema</td><td>Data Pipeline ต้องคงที่</td><td><span className="gs-badge" style={{ background: 'rgba(139,92,246,0.08)', color: 'var(--accent-purple)' }}>Strict Schema</span></td></tr>
          </tbody>
        </table>
      </div>

      {/* === PHASE 4 === */}
      <div style={{ marginTop: '24px', paddingBottom: '8px', borderBottom: '2px solid rgba(139, 92, 246, 0.3)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-purple)', margin: 0 }}>Phase 4: Export & Serving</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>การส่งมอบข้อมูลที่สะอาดเพื่อนำไปใช้ประโยชน์</p>
      </div>
      {/* === SECTION 8: Export Hub === */}
      <div className="gs-guide-card">
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-purple)', marginBottom: '16px', borderBottom: '2px solid var(--accent-purple)', paddingBottom: '8px' }}>
          📤 Export Hub — การส่งออกข้อมูลที่สะอาดแล้ว
        </h3>
        <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
          ข้อมูลที่ผ่านการทำความสะอาด (Cleaned Data) และตรวจสอบคุณภาพผ่านเกณฑ์ที่กำหนดแล้ว จะพร้อมให้ Export ไปยังปลายทาง
        </p>
        <table className="gs-governance-table">
          <thead><tr><th>Destination</th><th>Use Case</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td style={{ fontWeight: 700 }}>Elasticsearch</td><td>Log Analysis, Full-text Search, Kibana Dashboard</td><td><span className="gs-badge" style={{ background: '#d1fae5', color: 'var(--accent-green)' }}>Active</span></td></tr>
            <tr><td style={{ fontWeight: 700 }}>PostgreSQL</td><td>Relational Database, Business Application, BI Tools</td><td><span className="gs-badge" style={{ background: '#d1fae5', color: 'var(--accent-green)' }}>Active</span></td></tr>
            <tr><td style={{ fontWeight: 700 }}>CSV / Excel</td><td>Ad-hoc Analysis, Data Science, ส่งมอบไฟล์ให้ทีมงาน</td><td><span className="gs-badge" style={{ background: '#d1fae5', color: 'var(--accent-green)' }}>Active</span></td></tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>
  );
}