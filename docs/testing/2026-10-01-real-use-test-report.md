# รายงานทดสอบการใช้งานจริง SDOQAP (2026-10-01)

แผน: `docs/superpowers/plans/2026-10-01-real-use-feature-test.md` · หลักฐาน: `docs/testing/evidence/`

## ผลรายข้อ

| ID | Feature | ผล | หมายเหตุ / หลักฐาน |
|---|---|---|---|
| T0.1 | helper login ใช้งานได้ | PASS | login HTTP 200, /auth/me ได้ admin |
| T0.2 | container + service status | PASS | 16 container healthy/up, 11 service online (t0-status.txt) |
| T0.3 | suites อัตโนมัติ (API 156 / UI 76 / eval 21 / scripts 18 / spark unit 60) | PASS | t0-*.txt; ก่อนเริ่มคืน dirty_dataset.csv จาก zip ทำให้ API test ที่เคยล้ม 6 ตัวผ่าน |
| T1.1 | login ผิด -> 401 | PASS | 401 |
| T1.2 | route ป้องกันปฏิเสธเมื่อไม่มี cookie | PASS | 6 เส้น 401; GET /whitebox/run-all ตอบ 200 ไม่ต้อง login และรัน pipeline ทั้งชุด (Finding R-2) |
| T1.3 | cookie ปลอม -> 401 | PASS | valid 200 / tampered 401 |
| T1.4 | logout ล้าง session | PASS | logout 200, หลังจากนั้น /auth/me 401 |
| T1.5 | webhook secret / service key | PASS | ไม่มี/ผิด secret 401, X-Webhook-Secret และ Bearer 200, ingest ไม่มีคีย์/คีย์ผิด 401 |
| T1.6 | services/status ไม่รั่ว credential | FAIL | F-1: ตอบ URL ของ Elasticsearch ที่มีรหัสผ่านฝังอยู่โดยไม่ต้อง login (t1-status-credential-count.txt = 1) |
