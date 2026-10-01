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
| T8.1 | คอลัมน์ใหม่ -> drift proposal PENDING | PASS | proposal ของ qa_scores ระบุ qa_extra_col, trust-check ตอบ HALT_INGEST pending=1 (t8-proposal.txt) |
| T8.2 | simulate + approve/reject + 404 | PASS | simulate 2 ครั้ง 200, approve 200 (APPROVED), reject 200 (REJECTED), id ปลอม 404 |
| T8.3 | approve แล้ว registry ใน ES เปลี่ยน | PASS | registry ของ qa_scores มี qa_extra_col หลัง approve proposal จริง |
| T8.4 | reject-all / approve-all | SKIP | มี proposal PENDING ของตาราง student_course_scores (ไม่ใช่ของ qa_*) ค้างอยู่ คำสั่งนี้กระทบทุกตาราง จึงไม่รัน |
| T8.5 | acknowledge drift (ทดสอบซ้ำของ T7.5) | PASS | run ที่มี drift จริง: acknowledge 200, pending_schema_proposals=0 |
| T9.1 | catalog + preview raw/active/quarantine | FAIL | catalog 27 ตาราง มี qa_scores; preview raw 200, active 200 แต่ quarantine 500: F-10 ValueError 'Out of range float values are not JSON compliant' (NaN ในแถวที่ถูกกักกัน) t9-quarantine-preview-500.txt |
| T9.2 | preview raw อ่าน landing ล่าสุด (D-3) | PASS | 200 หลังแก้ให้อ่าน /data/archive ด้วย (engine ย้าย raw ไป archive หลัง SUCCEEDED; รอบแรกของ G2 ยังพลาดกรณีนี้ แก้แล้ว commit c2f81e6) |
| T9.3 | export active/quarantine/raw + records จำนวนแถวสอดคล้อง | PASS | active csv 227 = records 227, quarantine csv 50 = 50 (สะสม 23+27 จาก 2 run), raw 1030, limit=5 ได้ 5 แถว (active 227 > clean 223 ของ run ล่าสุดเพราะ MERGE สะสมข้าม run) |
| T9.4 | gold export + 404 | FAIL | daily-quality/error-patterns/financial-impact 200, metric ที่ไม่มี 404 แต่ schema-drift?days=14/30/90 = 500 ข้อความว่าง (ข้อมูลเก่ากว่า 90 วัน; 404 ที่ตั้งใจถูก except Exception กลืนเป็น 500: F-11) days=400 ได้ 200 |
| T9.5 | ลบตาราง qa_* (ต้อง login, ล้าง HDFS) | PASS | anon 401, ลบ 200, ไม่เหลือใน raw/active/quarantine, ..%2Fetc 404; พบ F-12 ระหว่างทดสอบและแก้แล้ว (0889d47): การลบเดิมทิ้ง /data/archive และเอกสารใน sdoqap_runs ทำให้ตารางที่ลบแล้วยัง preview ได้และ ingest ไฟล์เดิมซ้ำไม่ได้ (duplicate) |
| T10.1 | KPI สอดคล้องกับ ES | PASS | records 3,568,892 / คะแนนเฉลี่ย 94.27 / กักกัน 169,385 ตรงกับ aggregation ของ sdoqap_quality_runs (183 docs, 26 ตาราง) ทุกค่า (t10-kpi.json) |
| T10.2 | endpoint analytics/gold/system ตอบ 200 มีข้อมูล | PASS | 14 เส้น 200 ทุกเส้น body ไม่ว่าง (schema-drift 56 bytes = ไม่มีเหตุการณ์ล่าสุด) |
| T10.3 | gold rebuild (ต้อง login, idempotent) | PASS | anon 401, rebuild 200; รอบแรกเพิ่มข้อมูลวันนี้ (daily 37->41, errors 89->246, impact 10->15, drift 2->3) รอบสองจำนวนเท่าเดิมทุก index |
| T10.4 | lineage + inspect node + 404 | FAIL | lineage/ตาราง 404 ถูกต้อง, inspect 200 ทุก node แต่ F-13: sample_data ว่างใน raw/active และ metadata เป็นค่าประมาณจากจำนวนแถว (active '1 files 0.27 MB' แต่ HDFS จริง 12 ไฟล์ 41,846 bytes; raw ถูกระบุเป็น Parquet ทั้งที่เป็น CSV) t10-inspect-node.txt |
| T10.5 | trust-check สอดคล้องกับเกณฑ์ | PASS | ฟิลด์ครบ (is_safe_to_consume, quality_score, quality_threshold, pending_schema_proposals, recommendation) และ is_safe สอดคล้องกับ score>=threshold & pending=0; เกณฑ์ที่ใช้ยังไม่ตามค่ารายตาราง = F-5 (T6.2) |
| T11.1 | ประเมินกับ ground truth (9400/100/600, P/R 100%) | PASS | Clean 9,400 / Review 100 / Quarantine 600, recall และ precision 100% ทุกหมวด (t11-whitebox-eval.txt) |
| T11.2 | profile/state/context | PASS | 200 ทั้งสาม; profile 10,100 แถว 8 คอลัมน์ (score null 305, min -10, max 150); state dataset_name เป็นชื่อเก่า 'student_scores_sample' จากการอัปโหลดครั้งก่อน (stale label) |
| T11.3 | run-all บนตัวอย่าง -> 915/20/95 | PASS | execution_result total 1030, clean 915, review 20, quarantine 95 (t11-runall.txt) |
| T11.4 | รายแถวตรง answer key | PASS | 1030/1030 แถวอยู่โซนที่คาด ผิด 0 (เทียบด้วย dirty_row_id) t11-answer-key-check.txt |
| T11.5 | recommend-rules/benchmark/downstream/AI context | PASS | 200 ทั้งหมด; AI context ใช้ Groq จริง (live=True, engine Groq openai/gpt-oss-120b); F-14: benchmark ตอบ status=PASSED ทั้งที่ recall Missing Score 3.33% เพราะเทียบชุดตัวอย่าง 1030 แถวกับ ground truth ของชุด 10,100 แถว |
| T11.6 | multi-table preview/analyze/join | PASS | preview 2 ตาราง (demographics 9,980 / scores 1,030), analyze ANALYSIS_COMPLETE, join JOIN_COMPLETED 1030 แถว matched 1030 unmatched 0 |
| T12.1 | settings masking + POST (คีย์ปลอมถูกปฏิเสธ, บันทึกซ้ำไม่เปลี่ยนค่า) | PASS | masked ไม่รั่วคีย์เต็ม, anon POST 401, คีย์ปลอม 400 'Invalid API Key' (ไม่ถูกบันทึก), re-save 200 ค่าเดิมครบ; F-15: เมื่อคีย์มาจาก .env การกดบันทึกเขียนเอกสาร ES เป็น key ว่าง/enabled=false แต่ GET ยังแสดง enabled=true จาก env จึงปิดจากหน้า UI ไม่ได้ |
| T12.2 | alert routing ด้วย webhook secret | PASS | payload รูปแบบ Grafana 200, log '[ALERT ROUTER] Routing alert: qa grafana-shape alert', ไม่มี Slack/LINE ตั้งไว้ จึงบันทึกใน log |
| T12.3 | remediation tickets | PASS | อ่านได้ 2 ticket, ticket ปลอม resolve 404 (ไม่ได้ลอง resolve ticket จริง เพื่อไม่แก้ข้อมูลของเจ้าของ) |
| T12.4 | Grafana datasource + alert rules | PASS | datasource elasticsearch, 2 กฎ (Data Quality Score Critical Drop, Data Quarantine Rate High), contact point ใช้ Bearer; ไม่มี dashboard ที่ provision; Grafana ส่ง alert จริงถึง API ด้วย Bearer สำเร็จ (200) ไม่ได้กดปุ่ม Test ใน UI |
| T12.5 | Kibana + ES health | PASS | Kibana /api/status 200; ES cluster yellow (1 node, shard 17 ตัวไม่มี replica ให้วาง) ยอมรับได้ตามแผน |
| T12.6 | n8n webhook -> ingest RDBMS | FAIL | F-16: webhook ตอบ 200 'Workflow was started' (URL จริงคือ /webhook/1/webhooktrigger/ingest ไม่ใช่ /webhook/ingest) แต่ node 'Relay Ingest RDBMS' ล้ม: 'The value in the JSON Body field is not valid JSON' จึงไม่มี run ของ qa_sales_n8n; กำลังทำเป็นงานแยกแล้ว |
| T12.7 | retention cleanup | SKIP | มีเอกสาร quality_runs เก่ากว่า 30 วันอยู่ 35 รายการ ห้ามรันตามแผน รอเจ้าของยืนยัน; หมายเหตุ: n8n 'Schedule Daily Cleanup' 02:00 ทุกวันจะรันเองแล้ว เพราะแก้ให้ส่ง X-Service-Key ถูกต้อง |
| T13.1 | auth redirect/login/logout ใน UI | PASS | /dashboard ก่อน login เด้งไป /login, รหัสผิดขึ้น 'Invalid username or password.', login ถูกเข้า dashboard, logout กลับ /login แล้ว /dashboard เด้งกลับ; console มีแต่ 401 จากช่วงยังไม่ login |
| T13.2 | Home | PASS | AVG 94.3% / 3.6M / quarantine 4.746% ตรงกับ KPI API (169,385/3,568,892), 11 service ONLINE; F-17: ป้าย LIVE INGESTION CHANNELS ไม่ตามสถานะจริง (Reddit ขึ้น INGESTING ทั้งที่ idle) |
| T13.3 | Ingestion 4 แหล่ง + error ที่อ่านเข้าใจ | FAIL | แท็บไฟล์อัปโหลดได้และแสดงโปรไฟล์ถูก (13 แถว) แต่ F-20: ไม่มี Spark run และเขียนทับ dirty_dataset.csv (10,100->13 แถว; คืนแล้ว); F-19: แท็บฐานข้อมูล/API/Stream เป็นตัวเชื่อมจำลองบอกชัดว่า 'โหมดสาธิต' จึง ingest จริงจาก UI ไม่ได้ (MySQL ไม่แจ้ง error แต่ตรวจชุดที่โหลดไว้แทน) t13-ui-upload-effects.txt |
| T13.4 | Rules | PASS | เลือก qa_scores แก้ Base Target 90->93 ขึ้นกล่องยืนยันพร้อมสรุปการเปลี่ยน กด Confirm แล้ว GET /rules/qa_scores ตอบ base_value 93 ตรงกัน; Model Selector แสดง openai/gpt-oss-120b; ไม่ได้ทดสอบ YAML Export และ Upstream Remediation ผ่านหน้าจอ |
| T13.5 | Pipeline | PASS | รายการ run มี run จาก Task 2-4 (SUCCESS/QUARANTINED) และ Quality Audit Logs, ตัวกรองตารางทำงาน; F-18: คอลัมน์ Duration เป็น '-' ทุกแถว; ไม่ได้ทดสอบ pagination และปุ่ม Retry ผ่านหน้าจอ (ทดสอบที่ T7) |
| T13.6 | Exports | PASS | เลือก layer Raw/Active/Quarantine/Reddit และตารางได้, preview Raw ของ qa_scores แสดง 10 แถว+คอลัมน์ qa_extra_col, โซน clean/review/quarantine 9,400/100/600 พร้อมคำเตือน pending drift; ไม่ได้ดาวน์โหลดไฟล์ผ่านเบราว์เซอร์ (ใช้ผล T9); quarantine preview พังตาม F-10 |
| T13.7 | Dashboards | FAIL | การ์ดตรงกับ API (health 94.3%, quarantined 169,385, COPDQ $50,873) แต่ F-23: ตัวกรอง Time และ Business Area ไม่เปลี่ยนตัวเลขใดๆ (มีแค่ Severity ที่กรอง incident 2->0); F-22: breakdown missing/duplicate/invalid = 0% ทั้งที่กักกัน 169,385 แถว |
| T13.8 | Analytics | FAIL | หน้าโหลดและ Stability Index 100% สอดคล้อง API แต่ F-21: รูปแบบข้อผิดพลาดเกือบทั้งหมดป้าย 'Unknown' (API clustering ส่ง source=Unknown); ไม่ได้ทดสอบสลับช่วง 7/14/30 วัน |
| T13.9 | Catalog | PASS | แสดง proposal ที่ค้างจริง 1 รายการ (student_course_scores gpa_weighted) ตรงกับ API, มีปุ่มอนุมัติ/ปฏิเสธและช่องตั้งค่า PRIMARY KEY/PARTITION DATE; ไม่ได้กดอนุมัติ/ปฏิเสธ proposal จริงของตารางอื่น |
| T13.10 | Audit Trail | PASS | โหลดครบขั้น 0-5 ตัวเลข multi-table (9,980 / 10,100 แถว, key match 99.8%) ตรงกับ T11; ไม่ได้ทดสอบ Human Review Queue |
| T13.11 | Guide + responsive | SKIP | /guide และ /guideline โหลดเนื้อหาได้; responsive วัดไม่ได้เพราะ pane เบราว์เซอร์ไม่ได้แสดง (innerWidth=0) ไม่ขอลงผลที่ไม่ได้ตรวจ |
| T14.1 | Spark worker ล่ม -> สถานะชัดเจน, retry ได้ | PASS | ระหว่าง worker หยุด run ค้าง RUNNING ไม่หายเงียบ (error=None) และ Spark Worker ขึ้น offline; หลัง worker กลับ run ไปต่อเองจน SUCCEEDED (110s) ไม่ต้อง retry |
| T14.2 | Postgres ล่ม -> error อ่านเข้าใจ ไม่มีขยะ | PASS | 502 'PostgreSQL fetch failed: could not translate host name' ไม่มี traceback, ไม่มีโฟลเดอร์ qa_resil_db ใน /data/raw และไม่มีเอกสาร run ค้าง |
| T14.3 | restart api แล้ว nginx กลับมาเอง | PASS | กลับมา 200 ผ่าน nginx ภายใน ~10s โดยไม่แตะ nginx; ทั้ง 16 container healthy (รวม ollama) |
| T14.4 | scale 10k | PASS | bench_10000 SUCCEEDED 86.3s (end-to-end 126s) เทียบค่าเดิม 66.2s = 1.3x (<2x), 10,000 แถว/กักกัน 630 ตรงค่าเดิม; หมายเหตุ F-24: สคริปต์มี UnicodeDecodeError (cp874) จากเธรดอ่าน output บนคอนโซลไทย ไม่กระทบผล; รันแล้วคืนไฟล์ที่ track (d-scale.json, bench_10000.json, schema_registry.json) ด้วย git checkout (t14-scale-10000*.{txt,json}) |
| T14B.1 | เส้นนอก /api/ (/, /health, /healthz) | PASS | GET / 200, GET /health 200, POST /health 200, GET /healthz 200 (ยิงที่พอร์ต API ตรง) |
| T14B.2 | pipeline run detail + 404 | PASS | keys is_acknowledged/quality_audits/run_details/schema_drift_alerts, table qa_scores, audits=1; run ที่ไม่มี 404 |
| T14B.3 | schema proposals create | PASS | POST /schema/proposals/create 200 ได้ id, reject 200; (list หลัง reject ครั้งแรกยังเห็นรายการเดิมชั่วคราวเพราะ ES ยังไม่ refresh) |
| T14B.3b | schema proposals approve-all / reject-all | SKIP | มี proposal PENDING ของ student_course_scores (ไม่ใช่ qa_*) ค้างอยู่ คำสั่งนี้กระทบทุกตาราง จึงไม่รัน (approve-all เรียกแบบไม่ login ได้ 401 เท่านั้น) |
| T14B.4 | standardization approve/reject/override กับรายการจริง | PASS | ใส่ 3 รายการใน sdoqap_unmapped_terms: approve/reject/override 200 ทั้งหมด, mapping ถูกเขียนลง registry, ทำซ้ำ 400, ลบรายการทดสอบแล้ว |
| T14B.5 | whitebox profile/upload, preview-zone, state | PASS | profile/upload 1030 แถว 6 คอลัมน์, preview-zone ทั้ง 4 โซน (10100/9400/100/600), search ไม่เจอ 0 แถว, Tukey 1.5 -> review 154 แล้วคืน 3.0 -> 100 |
| T14B.6 | whitebox execute, ingest-source, AI context | PASS | execute ด้วยบริบทเริ่มต้น (5 กฎ) ได้ 9,400/100/600 ตรงกับ ground truth (ส่ง '{}' ได้แค่ 3 กฎ -> 9,900/100/100 ตามที่ API ออกแบบ), execute ไม่มี rules 422, ingest-source ตอบ simulated=true rows=10100, AI context POST 200; คืนชุดข้อมูลเดิมแล้ว |
| T14B.7 | เรียกครบทุกเส้น API (route_coverage) | PASS | routes=94 OK=88 REACHED=3 AUTH_ONLY=2 UNTESTED=1; 6 เส้นที่ไม่ OK อธิบายได้ทั้งหมด: reject-all(ไม่ได้เรียก)/approve-all(401) และ system/cleanup(401) = SKIP ที่มีเหตุผล (T8.4/T12.7); export/reddit 404 และ reddit/stop 400 = ผลต่อเนื่องจาก F-3/สตรีมจบเอง; remediations/{id}/resolve 404 = ไม่ได้แก้ ticket จริงของเจ้าของ (route-coverage.md) |

## สรุป

รวม 88 ข้อ: **PASS 66 · FAIL 18 · SKIP 4**

- สภาพแวดล้อม: 2026-10-01, stack ทั้ง 16 container (`COMPOSE_PROFILES=streaming,ai,tools`), ทดสอบก่อน commit `50d3959`
- ผลที่ FAIL ส่วนใหญ่ **ไม่ใช่ความล้มเหลวของระบบทั้งหมด** แต่แบ่งเป็น 3 กลุ่ม: (ก) บั๊กจริงของระบบ (ตาราง Findings F-*), (ข) ข้อกำหนดของแผนที่ไม่ตรงกับพฤติกรรมที่ออกแบบไว้ (D-4, D-5: ลงเป็น FAIL ตามกฎ "ห้ามแก้ Expected ให้ตรงผลจริง"), (ค) ผลต่อเนื่องจากข้อเดียวกัน (F-2 ทำให้ T2.3, T2.5 ล้มพร้อมกัน; F-5 ทำให้ T6.2, T6.3 ล้มพร้อมกัน)
- SKIP 4 ข้อ มีเหตุผลทุกข้อ: `approve-all`/`reject-all` (T8.4, T14B.3b) กระทบ proposal ของตารางอื่นที่ไม่ใช่ `qa_*`; retention cleanup (T12.7) เพราะมีข้อมูลเก่ากว่า 30 วัน; responsive (T13.11) เพราะ pane เบราว์เซอร์ไม่ได้แสดง วัดขนาดไม่ได้
- ประตู coverage: เรียกครบ **94/94 เส้น API** ที่ระบบมี (88 เส้นสำเร็จ, 6 เส้นอธิบายได้ทั้งหมด) ดู `docs/testing/evidence/route-coverage.md`

## แก้ไขระหว่างการทดสอบ (commit แล้ว)

| ที่พบ | แก้ |
|---|---|
| หน้า Export แท็บ Gold เรียก `/gold/schema-drift` ที่ไม่มี | เพิ่ม alias (G1) |
| preview/download ของ raw layer 404 กับตารางที่ ingest ผ่าน API | อ่าน landing ล่าสุดจาก `/data/raw` และ `/data/archive` (G2) |
| n8n/Grafana เรียก API โดยไม่มีคีย์ | ส่ง `X-Service-Key` / `X-Webhook-Secret` / `Authorization: Bearer` (G3-G5) |
| คีย์ Groq ที่บันทึกในหน้า Rules ไม่ถูกใช้ที่ AI context | อ่านจาก ES ก่อน env (G6) |
| โมเดล `llama-3.3-70b-versatile` ไม่มีบน Groq แล้ว | ค่าเริ่มต้นเป็น `openai/gpt-oss-120b` ทั้งโค้ด UI, rules_config และ ES registry |
| F-12: ลบตารางแล้วเหลือ `/data/archive` และ `sdoqap_runs` ทำให้ตารางที่ลบยัง preview ได้ และ ingest ไฟล์เดิมซ้ำไม่ได้ (duplicate) | การลบล้างทั้งสองที่ |

## Findings (แก้แล้ว: F-1, R-2, F-5, F-10, F-11, F-2, F-14, F-20, F-3, F-4, F-8 นอกนั้นยังไม่ได้แก้)

ระดับ: **สูง** = ข้อมูลหาย/ผลผิด/ความปลอดภัย · **กลาง** = ฟีเจอร์ใช้ไม่ได้หรือแสดงผลผิด · **ต่ำ** = เล็กน้อย/เอกสาร

| ID | ระดับ | พบที่ | รายละเอียด | หลักฐาน |
|---|---|---|---|---|
| F-1 | สูง (ความปลอดภัย) · **แก้แล้ว** | T1.6 | `GET /api/v1/services/status` ไม่ต้อง login และคืน URL ของ Elasticsearch พร้อมรหัสผ่านฝังอยู่ | t1-status-credential-count.txt |
| R-2 | สูง (ความปลอดภัย) · **แก้แล้ว** | T1.2 | `GET /api/v1/whitebox/run-all` ไม่ต้อง login แต่รัน pipeline ทั้งชุดและเขียนไฟล์ผลลัพธ์ (ฝั่ง POST ต้อง login) | ผล T1.2 |
| F-2 | สูง (ข้อมูลหาย) · **แก้แล้ว** | T2.3, T2.5 | engine เดา primary key เป็น `student_id` ทั้งที่คีย์จริงคือ `student_id+course+semester` แถว 1030 ถูก MERGE เหลือ 250 โดยไม่เตือน (Excel 200 -> 153) | t2-pk-collapse.txt |
| F-5 | สูง (ผลผิด) · **แก้แล้ว** | T6.2, T6.3 | trust-check อ่านเกณฑ์จาก `/spark/rules_config.json` ซึ่งไม่มีใน container จึงใช้ 90.0 เสมอ ตอบ "ปลอดภัย" ทั้งที่เกณฑ์รายตารางที่ engine ใช้จริงคือ 97 | t6-trustcheck-threshold.txt |
| F-20 | สูง (ข้อมูลหาย) · **แก้แล้ว** | T13.3 | UI อัปโหลดไฟล์เข้า `/whitebox/upload-csv` เท่านั้น ไม่มี Spark run และไฟล์ที่มีคอลัมน์นักศึกษาจะเขียนทับ `dirty_dataset.csv` (ชุดประเมินที่ใช้เป็นเกณฑ์) 10,100 -> 13 แถว | t13-ui-upload-effects.txt |
| F-10 | สูง · **แก้แล้ว** | T9.1 | preview ของ layer `quarantine` ตอบ 500 (`Out of range float values are not JSON compliant`) เมื่อมี NaN ในแถวที่ถูกกักกัน ซึ่งเป็นกรณีปกติ | t9-quarantine-preview-500.txt |
| F-3 | กลาง · **แก้แล้ว** | T5.2, T5.3 | สตรีม Reddit: Kafka ได้ข้อมูลแต่ Spark เริ่มที่ latest offset หลัง producer ส่งชุดแรกแล้ว จึงไม่มี Parquet และ export/reddit เป็น 404 | t5-reddit-stream.txt |
| F-4 | กลาง · **แก้แล้ว** | T6.1 | หน้า Column Profiler ว่างทุกตาราง เพราะ index `sdoqap_dynamic_rules_log` ไม่เคยถูกสร้าง | t6-profiler-empty.txt |
| F-11 | กลาง · **แก้แล้ว** | T9.4 | `/export/gold/<metric>` ตอบ 500 (ข้อความว่าง) แทน 404 เมื่อไม่มีข้อมูลในช่วงวัน เพราะ HTTPException ถูก `except Exception` กลืน | ผล T9.4 |
| F-13 | กลาง | T10.4 | `/lineage/inspect/.../<node>` ตอบค่าประมาณ (ไฟล์/ขนาดคำนวณจากจำนวนแถว, ระบุ raw เป็น Parquet) และไม่มีตัวอย่างแถวใน raw/active | t10-inspect-node.txt |
| F-16 | กลาง | T12.6 | n8n 2.27 ปฏิเสธ `jsonBody` ของ 5 node (Relay Ingest API/RDBMS, Send Failure Alert, Route Remediation/Quality Alert) ว่าไม่ใช่ JSON: ingest ผ่าน webhook และ alert จาก n8n ไม่ทำงาน (กำลังทำเป็นงานแยก) | T12.6 |
| F-19 | กลาง | T13.3 | แท็บ Database/API/Stream ใน UI เป็นตัวเชื่อมจำลอง (ขึ้น 'โหมดสาธิต') เรียก ingest จริงจาก UI ไม่ได้ | t13-ui-notes.txt |
| F-22 | กลาง | T13.7 | `/executive/overview` ส่ง missing/duplicate/invalid pct = 0.0 ทั้งที่กักกัน 169,385 แถว | t13-ui-notes.txt |
| F-23 | กลาง | T13.7 | ตัวกรอง Time และ Business Area บน Dashboard ไม่เปลี่ยนตัวเลขใดๆ | t13-ui-notes.txt |
| F-8 | กลาง · **แก้แล้ว** | T6 | `PUT /rules/<table>` และการลบตารางเขียน `rules_config.json` ใหม่ทั้งไฟล์จาก ES registry: คอมเมนต์หาย, ค่าที่แก้ในไฟล์ย้อนกลับ, ตารางอื่นโผล่เพิ่ม (ไฟล์กับ ES เป็นสองแหล่งความจริงที่ไม่ตรงกัน) | ผล T6 |
| F-14 | กลาง · **แก้แล้ว** | T11.5 | `/whitebox/benchmark` ตอบ `status: PASSED` ทั้งที่ recall ของ Missing Score เหลือ 3.33% เมื่อชุดข้อมูลที่โหลดไม่ใช่ชุดที่ตรงกับ ground truth | ผล T11.5 |
| F-6 | กลาง | T6.4 | `POST /rules/ai-proposals/reset` ('Generate') ไม่เรียก LLM คืนข้อเสนอตัวอย่างที่เขียนตายตัวในโค้ด (`is_example: true`) ส่วน advisor จริงไม่เคยสร้าง index `sdoqap_ai_rule_proposals` | ผล T6.4 |
| F-7 | ต่ำ | T6.4 | approve ข้อเสนอตัวอย่างตอบ "approved and merged" แต่ไม่ได้ merge อะไร | ผล T6.4 |
| F-9 | ต่ำ | T7.5 | `POST /pipeline/acknowledge/<run ที่ไม่มี>` ตอบ 200 และสร้างเอกสารขยะใน `sdoqap_acknowledged_runs` (คาด 404) | ผล T7.5 |
| F-15 | ต่ำ | T12.1 | เมื่อคีย์ Groq มาจาก `.env` การกดบันทึกในหน้า Rules เขียนเอกสารเป็น key ว่าง/disabled แต่ GET ยังแสดง enabled จาก env จึงปิดจาก UI ไม่ได้ | ผล T12.1 |
| F-17 | ต่ำ | T13.2 | ป้าย LIVE INGESTION CHANNELS ไม่ตามสถานะจริง (Reddit ขึ้น INGESTING ทั้งที่ idle) | t13-ui-notes.txt |
| F-18 | ต่ำ | T13.5 | คอลัมน์ Duration ในประวัติ run แสดง '-' ทุกแถว | t13-ui-notes.txt |
| F-21 | ต่ำ | T13.8 | Analytics 'รูปแบบข้อผิดพลาด' ป้ายเป็น 'Unknown' เกือบทั้งหมด | t13-ui-notes.txt |
| F-24 | ต่ำ | T14.4 | `run_scale_benchmark.py` มี UnicodeDecodeError (cp874) จากเธรดอ่าน output บนคอนโซลภาษาไทย ไม่กระทบผล | t14-scale-10000.txt |
| T4-note | ต่ำ | T4.3 | `SELECT * INTO` ตอบ 502 (ถูกฐานข้อมูลปฏิเสธ) ควรเป็น 4xx | ผล T4.3 |
| D-1 | ต่ำ (เอกสาร) | T3.1 | `.env.example`/README บอกว่า API host ใดก็ได้ถ้าไม่ตั้ง `API_INGEST_ALLOWED_HOSTS` แต่โค้ด fail-closed | `services/api/app/api/ingest_guards.py` |
| D-4 | ต่ำ (แผน) | T2.2 | แผนคาดว่าไฟล์ raw อยู่ที่ `/data/raw/<table>/<id>` หลัง SUCCEEDED แต่ engine ย้ายไป `/data/archive` ตามดีไซน์ | ผล T2.2 |
| D-5 | ต่ำ (แผน) | T3.2 | แผนคาดว่า data.go.th ได้ 50 แถว แต่ชุดข้อมูลนั้นมี 11 ระเบียนทั้งหมด (ยืนยันกับต้นทาง) | t3-gov-record-count.txt |

ข้อที่แผนคาดว่าจะพบแต่ **ไม่พบ** (ไม่ลงเป็น Finding): R-1 (`/standardize/rollback` ตอบ 500 เมื่อไม่มี backup) เพราะตอนทดสอบมี backup อยู่จึงตอบ 200

## ของที่ค้างหลังการทดสอบ (ตั้งใจเก็บไว้)

- Kafka topic `reddit_raw` ที่สร้างตอนทดสอบสตรีม
- ตาราง/ข้อมูลของ `qa_*` และ `e2e_ingest_1790859593` **ลบหมดแล้ว** (HDFS, Elasticsearch ทุก index, Postgres) ตารางเดิมของเจ้าของไม่ถูกแตะ ยกเว้น `bench_10000` ที่สคริปต์ scale สร้างซ้ำตามออกแบบ
- n8n `Schedule Daily Cleanup` 02:00 จะรันเองแล้ว (แก้ให้ส่งคีย์ถูกต้อง) และจะลบเอกสาร ES ที่เก่ากว่า 30 วัน (35 รายการใน `sdoqap_quality_runs` ตอนทดสอบ) กับไฟล์ HDFS เก่า ถ้าไม่ต้องการให้ปิดสวิตช์ใน n8n ก่อน

## หมายเหตุหลังแก้ F-2 / F-20

- ตัวเลขที่คาดของ T2.3 เปลี่ยนจาก 1,030 เป็น **1,000** (1,030 แถวมี 30 แถวซ้ำ student_id+course+semester ที่ตั้งใจใส่ไว้ และถูกรวมตาม primary key) และ T2.5 (Excel 200 แถว) จะได้ตามจำนวน key ที่ไม่ซ้ำจริงของ 200 แถวนั้น
- หลังอัปโหลดไฟล์จากหน้า Ingestion เอนจิน Audit Trail จะทำงานกับไฟล์นั้นต่อ (บันทึกข้ามการรีสตาร์ท) ถ้าต้องการกลับไปชุดประเมิน ใช้ `POST /api/v1/whitebox/state` ด้วย `{"dataset_source":"evaluation"}` (ยังไม่มีปุ่มบนหน้าจอ)
- F-3: สตรีม Reddit อ่านจาก earliest เมื่อยังไม่มี checkpoint (ทดสอบ: Kafka 56 ข้อความ = Elasticsearch 56 เอกสาร และรอบสองต่อจากจุดเดิมไม่ซ้ำ) ผลข้างเคียงจากการทดสอบ: มี index `reddit` ใน Elasticsearch และไฟล์ Parquet ของ r/python ใน HDFS แล้ว (ข้อมูลโพสต์สาธารณะจริง)
- F-4: Column Profiler อ่านจาก quality run ล่าสุด (engine เพิ่ม `null_profile` ในทุก run) ตารางที่ ingest ก่อนการแก้นี้จะมีเฉพาะช่วงค่า IQR จนกว่าจะ ingest/retry ใหม่
- F-8: การบันทึกกฎ (PUT /rules, อนุมัติข้อเสนอ AI, มาตรฐานข้อมูล, ลบตาราง) อัปเดตเฉพาะตารางที่เปลี่ยนทั้งในไฟล์และ Elasticsearch (rollback ยังเขียนทั้งไฟล์) พบบั๊กซ่อนอยู่ด้วย: การลบตารางไม่เคยลบบล็อกออกจาก `rules_config.json` (ลบเอกสารใน ES ก่อนแล้วโหลดจาก ES จึงไม่เจอ) แก้แล้ว และ normalize ไฟล์ให้ตรงรูปแบบที่ API เขียน (ข้อมูลเหมือนเดิม)
