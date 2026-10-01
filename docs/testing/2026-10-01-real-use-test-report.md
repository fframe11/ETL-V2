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
| T2.1 | อัปโหลด CSV -> queued -> SUCCEEDED | PASS | ingest 20261001T124234-aebbeeba, 115s |
| T2.2 | ข้อมูลลง HDFS raw/active/quarantine | FAIL | active+quarantine มีข้อมูล แต่ /data/raw/qa_scores/<id> หายไปหลัง SUCCEEDED: engine ย้ายไป /data/archive/<table>/<id>/ ตามดีไซน์ (ข้อกำหนดของแผนล้าสมัย = D-4) |
| T2.3 | ผลใน ES ตรงจำนวนแถว (1030) | FAIL | F-2: total_records=250 (clean 227, quarantine 23) engine เดา primary_key=student_id แต่ไฟล์มี student_id ไม่ซ้ำ 250 ตัว (key จริงคือ student_id+course+semester = 1000) แถวถูก MERGE ทับกันเงียบๆ ดู t2-pk-collapse.txt |
| T2.4 | ไฟล์ซ้ำ -> duplicate | PASS | HTTP 200, duplicate, ingest id เดิม, spark_triggered=false |
| T2.5 | Excel -> CSV -> SUCCEEDED (200 แถว) | FAIL | แปลง Excel และ run SUCCEEDED ได้ แต่ total_records=153 แทน 200 สาเหตุเดียวกับ F-2 (153 = student_id ไม่ซ้ำใน 200 แถวแรก) |
| T2.6 | input ไม่ดี -> 400 ไม่มีขยะใน HDFS | PASS | ไฟล์ว่าง/../etc/ชื่อมีช่องว่าง = 400 ทั้งหมด, ไม่มีโฟลเดอร์ขยะ |
| T2.7 | ขาดคอลัมน์ primary key -> 400 | PASS | golden_student_scores: missing primary key ['student_id'] |
| T2.8 | e2e_ingest_check (concurrent/dup/queue) | PASS | t2-e2e-ingest-check.txt (PASS 3 ข้อ; สร้างตาราง e2e_ingest_<ts> ที่ไม่ขึ้นต้น qa_ ค้างไว้) |
| T2.9 | service key ingest | PASS | HTTP 202 ไม่มี cookie, ตาราง qa_scores_svc |
| T3.1 | allowlist/SSRF/scheme guard -> 400 | PASS | 5 URL = 400 ทั้งหมด; D-1: โค้ด fail-closed แต่ .env.example/README ยังบอกว่า 'ไม่ตั้งค่า = ยอมทุก host' |
| T3.2 | ingest data.go.th -> SUCCEEDED (50 แถว) | FAIL | queued -> SUCCEEDED ได้ แต่ total_records=11 ไม่ใช่ 50 เพราะ resource นี้มี 11 ระเบียนทั้งหมด (ยืนยันกับ data.go.th total=11; ข้อกำหนดของแผนผิด = D-5, ระบบทำงานถูก) t3-gov-record-count.txt |
| T3.3 | API ซ้ำ -> duplicate | PASS | status=duplicate, ingest id เดิม, spark_triggered=false |
| T4.1 | RDBMS ingest -> SUCCEEDED (500 แถว) | PASS | qa_sales_db total=500 clean=500 score=100, 60s |
| T4.2 | host นอก allowlist / db_type ไม่รองรับ -> 400 | PASS | evil.example 400; mysql 400 'Only postgresql is currently supported' (UI มีตัวเลือก MySQL/SQL Server ให้ตรวจใน T13.3) |
| T4.3 | SQL ไม่ใช่ SELECT แก้ข้อมูลไม่ได้ | PASS | DROP/DELETE/multi-statement 400, SELECT INTO ตอบ 502 (ถูกปฏิเสธ แต่ควรเป็น 4xx); qa_sales ยัง 500 แถว, ไม่มี qa_copy |
| T5.1 | start/status stream | PASS | start 200, status running (elapsed/remaining ถูกต้อง) แล้ว idle เมื่อครบ 40s; topic reddit_raw ถูกสร้าง |
| T5.2 | parquet ใน HDFS + ข้อความใน Kafka | FAIL | Kafka: 25 ข้อความจริงจาก r/python อ่านได้ แต่ HDFS /data/reddit/parquet มี 0 ไฟล์: F-3 Spark เริ่มที่ latest offset (25) หลัง producer ส่งชุดแรกไปแล้ว numInputRows=0 ทุก batch (streaming_job.py ไม่ตั้ง startingOffsets) t5-reddit-stream.txt |
| T5.3 | export/reddit + stop | FAIL | export/reddit และ preview/reddit = 404 (ไม่มี parquet ต่อเนื่องจาก F-3); stop ตอบ 400 'No active streaming job' เพราะสตรีมจบเองแล้ว (ถูกต้อง) |
| T6.1 | อ่าน effective rules + column profile | FAIL | effective rules อ่านได้ แต่ column profile ว่าง: F-4 index sdoqap_dynamic_rules_log ไม่ถูกสร้างหลัง ingest 6 ครั้ง (t6-profiler-empty.txt) |
| T6.2 | แก้กฎ -> บันทึก -> มีผลกับ trust-check; _default ห้ามแก้ | FAIL | PUT 200, เขียนลงไฟล์และ ES ได้, _default 400 แต่ trust-check ยังตอบ quality_threshold=90.0 ไม่ใช่ 97.0: F-5 (t6-trustcheck-threshold.txt) |
| T6.3 | กฎใหม่ถูกใช้ในรอบ retry | FAIL | engine ใช้เกณฑ์ 97.0 จริง (effective_quality_threshold 90.0->97.0) แต่ trust-check ตอบ is_safe_to_consume=True ทั้งที่ score 90.8 < 97: F-5 (API อ่านไฟล์ที่ path /spark/rules_config.json ซึ่งไม่มีใน container) |
| T6.4 | AI proposals generate/approve/reject | PASS | Groq key+model ตั้งไว้, reset 200, list 3 รายการ แต่ is_example=true (ข้อเสนอตายตัวในโค้ด ไม่ได้มาจาก LLM; ไม่มี index sdoqap_ai_rule_proposals), approve/reject 200 และหายจาก pending, id ปลอม 404; F-7: approve ข้อเสนอตัวอย่างตอบ 'approved and merged' แต่ไม่ได้ merge อะไร |
| T6.5 | standardization queue + rollback | PASS | คิวว่าง, id ปลอม approve/reject/override = 404, rollback 200 restored_from backup ล่าสุด (approve/override/reject กับรายการจริงทดสอบที่ T14B.4) |
| T7.1 | list runs + pagination + deep page 400 | PASS | total 285, ขอ size=5 ได้ 5, page=3000 -> 400 |
| T7.2 | run detail / 404 | PASS | state SUCCEEDED, source file, size 54439 ตรงไฟล์, checksum ครบ; ingest ที่ไม่มี 404 |
| T7.3 | retry -> SUCCEEDED (ต้อง login) | PASS | anon 401, หลัง retry state RUNNING แล้ว SUCCEEDED ใน 75s, retry run ที่ไม่มี 404 |
| T7.4 | quality list/by table | PASS | รายการเรียงล่าสุดก่อน (qa_scores, qa_sales_db, qa_gov); /quality/qa_scores มีรอบล่าสุด |
| T7.5 | acknowledge drift | FAIL | F-9: POST /pipeline/acknowledge/does-not-exist ตอบ 200 (คาด 404) และสร้างเอกสารขยะใน sdoqap_acknowledged_runs (ลบแล้ว); กรณี run ที่มี drift จริงทดสอบซ้ำที่ T8.5 |
