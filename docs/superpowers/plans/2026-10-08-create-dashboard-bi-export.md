# Create Dashboard BI Export Implementation Plan (ระยะ 6: ส่งออกข้อมูลที่กรองแล้วเป็น CSV)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มปุ่ม "ส่งออก CSV" ในขั้นแดชบอร์ดของ Create Dashboard ที่ดาวน์โหลดแถวข้อมูลชุดเดียวกับที่แดชบอร์ดใช้คำนวณอยู่ตอนนี้ (หลังตัวกรองและการคลิกกราฟ) เป็นไฟล์ CSV แบบ UTF-8 มี BOM ให้ทีม BI ทำต่อใน Excel หรือ Power BI โดยคอลัมน์ข้อมูลส่วนบุคคลไม่อยู่ในไฟล์เว้นแต่ผู้ใช้ติ๊กเลือกเอง และทุกครั้งที่ติ๊กมี log

**Architecture:** ฝั่ง API เพิ่มโมดูลฟังก์ชันล้วน `dashboard_export.py` (จัดรูปค่า กัน CSV injection ตั้งหัวคอลัมน์ ตั้งชื่อไฟล์ และเขียน CSV ทีละ 10,000 แถว) แล้วเพิ่ม `POST /api/v1/dashboards/export` ใน `dashboards.py` ที่อ่าน semantic view ครั้งเดียวผ่าน `_dataset_with_view` (แยกออกมาจาก `_dataset` เดิม) กรองแถวด้วย `apply_filters` ตัวเดียวกับ `/render` และตอบเป็น `StreamingResponse` ฝั่ง UI เพิ่ม `requestFile` ข้าง `requestJson` (cookie, 401, ข้อความ error เดียวกัน) และคอมโพเนนต์ `ExportCsv.jsx` ที่วางข้างบรรทัด "X จาก Y แถว" ของ `DashboardCanvas`

**Tech Stack:** FastAPI 0.100 + pandas (container `sdoqap-api` Python 3.10 pandas 2.3; เครื่อง dev Python 3.14 pandas 3.0, โค้ดในแผนรันผ่านบนเครื่อง dev แล้ว), module `csv` ของ Python, pytest; React 18 + Vitest 2 + Testing Library; Git Bash บน Windows

**Spec:** [`docs/create-dashboard-improvement-proposal.md`](../../create-dashboard-improvement-proposal.md) หัวข้อ 7 แถว "6. ต่อกับเครื่องมือ BI" ขอบเขตที่เจ้าของระบบเลือกแล้ว (ส่งออกแถวข้อมูลที่กรองแล้วเป็น CSV เท่านั้น ไม่ส่งออก spec หรือ data dictionary) และคำตัดสินของเจ้าของระบบอยู่ในหัวข้อ "คำตัดสินของเจ้าของระบบ" และ "คำตัดสินที่ทำระหว่างเขียนแผน" ด้านล่าง เอกสารประกอบ: `docs/ui-analysis/06-create-dashboard.md`, แผนระยะ 5 `docs/superpowers/plans/2026-10-07-create-dashboard-semantic-layer.md` (ที่มาของ semantic view และการซ่อนคอลัมน์ส่วนบุคคล)

## คำตัดสินของเจ้าของระบบ (ผูกมัด)

1. **ส่งออกอะไร:** แถวของชุดข้อมูล "หลัง" ตัวกรองที่เลือกอยู่บนแดชบอร์ด (แถวชุดเดียวกับที่แดชบอร์ดคำนวณ) เป็นตาราง ให้ทีม BI ทำต่อใน Power BI หรือ Excel หัวคอลัมน์ใช้ชื่อที่แสดงจาก Semantic Layer ถ้ามี ไม่มีใช้ชื่อคอลัมน์ ชื่อซ้ำต้องทำให้ไม่ซ้ำ ไม่ใช่การส่งออก spec/JSON ของแดชบอร์ด และไม่ใช่ data dictionary
2. **ข้อมูลส่วนบุคคล:** คอลัมน์ที่ติดส่วนบุคคล (ถูก semantic layer ซ่อน) ไม่อยู่ในไฟล์โดยค่าเริ่มต้น ผู้ใช้ที่ login เลือกเอาออกมาได้ด้วยช่องติ๊กที่ขึ้นเฉพาะเมื่อชุดข้อมูลมีคอลัมน์ที่ซ่อน มีคำเตือนภาษาไทยชัดเจน ค่าเริ่มต้นไม่ติ๊ก ไม่มีระบบ role (ผู้ใช้ที่ login ทุกคนเลือกได้) ทุกการส่งออกที่ `include_personal=true` ต้องมี log (ผู้ใช้ ตาราง จำนวนแถว ห้ามมีค่า) และคอลัมน์ที่ซ่อนต้องยังซ่อนในทุกที่อื่น
3. **รูปแบบ:** CSV เท่านั้น UTF-8 มี BOM (Excel เปิดภาษาไทยได้) quoting ตาม RFC 4180 `Content-Disposition` แบบ attachment ชื่อ `<table>_<YYYYMMDD>.csv` (ชื่อตารางผ่านการทำความสะอาด) media type `text/csv`

## คำตัดสินที่ทำระหว่างเขียนแผน (ผู้ควบคุมโปรดยืนยัน)

1. **Endpoint:** `POST /api/v1/dashboards/export` body `{"table_name": str, "selections": object = {}, "include_personal": bool = false}` อยู่ใน router เดิมของ `dashboards.py` จึงต้อง login เหมือนทุกเส้น (ไม่ login ได้ 401) ใช้ POST เพราะ selections อาจยาว ชุดข้อมูลไม่มีได้ 404 จากตัวโหลดเดิม `selections` ที่ไม่ใช่ object ได้ 422 จาก pydantic เหมือน `/render` ส่วนรายการตัวกรองที่รูปร่างผิดหรืออ้างคอลัมน์ที่ไม่มีถูกข้ามเงียบๆ เหมือน `/render` (`apply_filters` ข้ามอยู่แล้ว `/render` ไม่เคยตอบ 422 กับกรณีนี้)
2. **ไม่ส่ง spec มาด้วย:** แถวที่ส่งออก = `apply_filters(df, selections, kinds ของ profile หลังซ่อนคอลัมน์)` ซึ่งเท่ากับตัวแปร `filtered` ใน `compute_dashboard` ทุกประการ จำนวนแถวในไฟล์จึงเท่ากับ `rows_after_filter` บนจอเสมอ ตัวกรองที่ประกาศใน spec ไม่มีผล (ตัวกรองจากการคลิกกราฟบนคอลัมน์ที่ไม่มีใน `spec.filters` ก็นับใน `rows_after_filter` เหมือนกัน) คอลัมน์ของตัวกรองต้องมีใน profile ที่มองเห็น ตัวกรองบนคอลัมน์ที่ซ่อนถูกข้ามแม้ `include_personal=true` เหมือน `/render`
3. **ตัวกรองมาจากไหนใน UI:** state `selections` ของ `DashboardBuilder.jsx` (ก้อนเดียวกับที่ส่งให้ `/render`) ปุ่มกดไม่ได้ระหว่าง `busy === "render"` จึงไม่เคยส่งออกตัวกรองที่ตัวเลขบนจอยังไม่ตาม (ถ้า render ล้ม `selections` ถูกคืนเป็นค่าที่แสดงอยู่ตามโค้ดเดิม)
4. **คอลัมน์และลำดับ:** ทุกคอลัมน์ของ profile เต็ม (หลัง `prepare_frame` ตัดคอลัมน์เทคนิค `run_id`, `ingest_id`, `__index_level_0__`) เรียงตาม profile ตัดคอลัมน์ใน `view["hidden_columns"]` เว้นแต่ `include_personal=true` ซึ่งคืนคอลัมน์ที่ซ่อนกลับที่ตำแหน่งเดิม
5. **หัวคอลัมน์:** `view["effective"]["columns"][name]["label"]` ถ้าไม่ว่าง ไม่งั้นชื่อคอลัมน์ กติกาชื่อซ้ำ: คอลัมน์ที่ label ชนกันได้ ` [ชื่อคอลัมน์]` ต่อท้าย (เช่น `ยอดขาย [Net_Sales]`) ยกเว้นคอลัมน์ที่ label คือชื่อของตัวเอง ถ้ายังชนอีก (กรณีพิเศษ) ต่อท้าย ` (2)`, ` (3)` ตามลำดับ หัวคอลัมน์ผ่านการกัน CSV injection เหมือนเซลล์ข้อความ
6. **Stream และเพดานแถว:** ตอบเป็น `StreamingResponse` ที่ generator เขียนทีละ `CHUNK_ROWS = 10_000` แถว และเพดาน `MAX_EXPORT_ROWS = 1_000_000` แถวหลังกรอง ตรวจก่อนเริ่ม stream เกินได้ 413 ข้อความไทย "ข้อมูลหลังกรองมี N แถว เกินที่ส่งออกได้ 1,000,000 แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่" เหตุผลเรื่องหน่วยความจำ (วัดจริงตอนเขียนแผน: 1,000,000 แถว x 15 คอลัมน์ = ไฟล์ 181 MB ใช้ 23 วินาที): เฟรมอยู่ใน `_FRAME_CACHE` อยู่แล้ว การกรองคัดลอกแถวไม่เกินขนาดเฟรมหนึ่งครั้ง ส่วนข้อความ CSV ถ้าสร้างทั้งไฟล์ในหน่วยความจำจะเป็น str 181 MB บวก bytes อีก 181 MB ต่อคำขอ ขณะที่แบบ stream ถือแค่ทีละชิ้น (ชิ้นใหญ่สุดที่วัดได้ 1.8 MB) และไบต์แรกออกทันที ซึ่งสำคัญเพราะ nginx ของ UI ตั้ง `proxy_read_timeout 30s` (`services/ui/nginx.conf`) การสร้างไฟล์ใหญ่ทั้งก้อนก่อนตอบจะโดนตัดที่ 30 วินาที เพดาน 1,000,000 ต่ำกว่า 1,048,576 แถวที่ Excel เปิดได้ต่อชีต ไฟล์ที่ยาวกว่านั้น Excel จะตัดทิ้งโดยไม่บอก เพดานเป็นค่าคงที่ที่มีชื่อ และเทสต์ใช้ `monkeypatch` ตั้งเป็น 3
7. **กัน CSV injection:** เซลล์ข้อความ (และหัวคอลัมน์) ที่ขึ้นต้นด้วย `=`, `+`, `-`, `@`, tab หรือ CR ถูกเติม `'` ข้างหน้า ยกเว้นเซลล์ที่ทั้งเซลล์เป็นตัวเลขล้วน (`[+-]?ตัวเลข[.ตัวเลข][e±ตัวเลข]` เช่น `-12.5`, `+66`, `-1e3`) ซึ่งไม่ใช่สูตรและต้องยังเป็นตัวเลข คอลัมน์ชนิดตัวเลขไม่ผ่านตัวกันนี้เลย ค่าติดลบจึงเป็นตัวเลขเสมอ ข้อแลกเปลี่ยน: `'` ที่เติมจะเห็นใน Excel และ Power BI (เป็นวิธีที่ OWASP แนะนำ เลือกแทน tab เพราะ tab ทำให้ค่าหน้าตาเปลี่ยนโดยมองไม่เห็น)
8. **รูปแบบค่า:** ว่าง/NaN/None/NaT เป็นช่องว่าง; ตัวเลขทศนิยมเขียนแบบไม่มีเลขยกกำลัง (`np.format_float_positional`: `1e16` เป็น `10000000000000000`, `3.0` เป็น `3`, `0.1+0.2` เป็น `0.30000000000000004`); `inf` เป็นช่องว่าง; จำนวนเต็มเป็นตัวเลขตรงๆ; boolean เป็น `TRUE`/`FALSE` (ตัวสะกดของ Excel, Power BI อ่านได้); คอลัมน์วันที่ที่ทุกค่าเป็นเที่ยงคืนเขียน `YYYY-MM-DD` ไม่งั้น `YYYY-MM-DD HH:MM:SS` (ISO 8601 คั่นด้วยช่องว่าง เพราะ Excel ไม่รู้จักตัว `T` ตอนเปิด CSV) ตัดสินจากทั้งคอลัมน์ครั้งเดียว ทุกชิ้นของไฟล์จึงรูปแบบเดียวกัน เวลาเป็นเวลา UTC แบบไม่มีโซน (เหมือนที่ `prepare_frame` เก็บ); คอลัมน์ชนิดผสม (object) จัดรูปตามชนิดของแต่ละค่า; ข้อความที่ไม่ใช่ตัวเลขผ่านตัวกัน injection
9. **ชื่อไฟล์:** `<ชื่อตาราง>_<YYYYMMDD>.csv` แทนอักขระที่ไม่ใช่ `A-Z a-z 0-9 _ -` ด้วย `_` ตัด `_` หัวท้าย ว่างใช้ `dataset` วันที่ตามเวลาไทย (UTC+7 แบบ offset คงที่ เพราะไทยไม่มี daylight saving และไม่ต้องพึ่ง tzdata บน Windows) ชุดข้อมูล `_quality_runs` ได้ `quality_runs_<วันที่>.csv` (ชื่อตารางผ่าน `validate_table_name` มาก่อนแล้ว การทำความสะอาดเป็นชั้นกันซ้ำ) header เป็น `attachment; filename="<ชื่อ>"`
10. **Media type** `text/csv; charset=utf-8` และ BOM อยู่ในเนื้อไฟล์ ไม่ลอก `charset=utf-8-sig` ของ `data_export.py` เพราะไม่ใช่ชื่อ charset ที่จดทะเบียน (ใช้รูปแบบ BOM เดียวกับ `prepare_df_for_export` คือ `utf-8-sig`)
11. **`include_personal` เป็น `StrictBool`:** รับเฉพาะ JSON `true`/`false` สตริง `"true"`, `"yes"` หรือเลข `1` ได้ 422 กันข้อมูลส่วนบุคคลหลุดจาก client ที่ส่งค่าผิดชนิด
12. **Log:** ไฟล์ที่มีคอลัมน์ส่วนบุคคลเขียน `logger.warning("Dashboard CSV export with personal columns: user=%s table=%s rows=%d columns=%s", ...)` (ชื่อคอลัมน์ไม่ใช่ค่าในเซลล์ ช่วยตรวจย้อนว่าออกไปคอลัมน์ไหน) การส่งออกอื่นทุกครั้งเขียน `logger.info(... include_personal=%s)` รวมกรณีติ๊กแต่ชุดข้อมูลไม่มีคอลัมน์ซ่อน log อยู่ใน `docker logs sdoqap-api` เพราะ `main.py` ตั้ง `LOG_LEVEL` เริ่มต้น `INFO`
13. **อ่าน view ครั้งเดียวและไม่เรียก AI:** แยก `_dataset_with_view(table_name) -> (df, profile เต็ม, view)` ออกจาก `_dataset` (ซึ่งเรียกตัวใหม่แล้ว `apply_to_profile` เหมือนเดิม) เส้นอื่นทำงานเหมือนเดิมทุกอย่าง เส้น export เรียก `load_view` หนึ่งครั้ง ไม่เรียก Groq (มีเทสต์นับ)
14. **ช่องติ๊กรู้ได้อย่างไรว่ามีคอลัมน์ซ่อน:** `ExportCsv` เรียก `GET /api/v1/semantic/{table}` (เส้นเดิม ไม่เพิ่ม route) เมื่อขั้นแดชบอร์ดเปิดหรือเปลี่ยนตาราง แล้วใช้ `hidden_columns` ซึ่งมาจาก `semantic.load_view` ตัวเดียวกับที่ export ใช้ ("view ที่บันทึกไว้" ไม่ใช่การแก้ที่ยังไม่บันทึก) ถ้าอ่านไม่ได้ ช่องติ๊กไม่ขึ้นและไฟล์ไม่มีคอลัมน์ส่วนบุคคล (ปลอดภัยไว้ก่อน) ช่องติ๊กกลับเป็นไม่ติ๊กหลังส่งออกสำเร็จทุกครั้ง (เลือกใหม่ทุกไฟล์)
15. **ตำแหน่งปุ่ม:** `DashboardCanvas` รับ prop ใหม่ `tools` วาดในแถว `.dbb-canvas-bar` ข้างบรรทัด "X จาก Y แถว" (ใต้ตัวกรอง) `DashboardBuilder` ส่ง `<ExportCsv table selections disabled />` เข้าไป ระหว่างทำงานปุ่มกดไม่ได้ (`aria-busy`) และขึ้น "กำลังเตรียมไฟล์…" แบบ `aria-live="polite"` ไม่ใช้ `role="status"` เพราะเทสต์เดิมหา `getByRole("status")` ของ EngineNote ในขั้นเดียวกัน ข้อความ error ใช้ `role="alert"` ในกล่องของปุ่มเอง กันกดซ้ำด้วยทั้ง `disabled` และ `useRef`
16. **ตัวช่วยดาวน์โหลด:** เพิ่ม `requestFile` ใน `utils/requestJson.js` ที่ใช้ฟังก์ชัน `send` ร่วมกับ `requestJson` (cookie `same-origin`, 401 ไป `/login`, `friendlyApiError`) แล้วบันทึกไฟล์ด้วย `createObjectURL` + `<a download>` + `revokeObjectURL` แบบเดียวกับ `pages/DataExport.jsx` ชื่อไฟล์อ่านจาก `Content-Disposition` (same-origin อ่าน header ได้) ไม่มีใช้ `<table>.csv` และ `mockFetchByUrl` ใน `src/test/renderPage.jsx` รับ `headers` และ `blob` เพิ่ม (route เดิมไม่ได้รับผล ไม่มีโค้ดเดิมอ่าน `res.headers`)
17. **Text budget:** ตรวจแล้ว `src/test/textBudget.test.jsx` วัด 10 หน้า (home, guide, ingestion, rules, pipeline, export, schema, whitebox, analytics, dashboard) ไม่มีหน้า DashboardBuilder และทุกหน้าถูกวัดตอนยังไม่มีข้อมูล ข้อความใหม่ของแผนนี้จึงไม่กระทบ budget ไม่ต้องแก้ `text-budget.json`
18. **เอกสาร:** แก้ `docs/ui-analysis/06-create-dashboard.md` และ `docs/create-dashboard-improvement-proposal.md` (หัวข้อ 7 แถวระยะ 6, คำถามกรรมการเรื่อง Power BI, ภาคผนวก "มีแล้ว" และ "ยังไม่มี") ทดสอบกับระบบจริงทำโดยผู้ควบคุมหลัง merge (Task 5 ส่วน B)

**ไม่ทำในแผนนี้:** ส่งออก spec หรือ data dictionary, ไฟล์ .xlsx, การเชื่อม Power BI แบบสด, ระบบ role/สิทธิ์, การปิดบังข้อมูลส่วนบุคคลในหน้า Data Export (ดู "ข้อจำกัดที่รู้" ท้ายแผน)

## Global Constraints

- ทำใน worktree branch `feat/bi-export` เท่านั้น: `C:\ETL\.claude\worktrees\bi-export` (Git Bash: `/c/ETL/.claude/worktrees/bi-export`) ห้ามแตะไฟล์ใน `C:\ETL` โดยตรง
- Commit message แบบ conventional (`feat(dashboard): ...`, `feat(ui): ...`, `docs(dashboard): ...`) **ไม่ใส่ attribution line ใดๆ** (ไม่มี `Co-Authored-By`, ไม่มี `Generated with`)
- ห้าม push
- ห้ามรันคำสั่ง docker ใน Task 1 ถึง 5 ส่วน A (Task 5 ส่วน B เป็นของผู้ควบคุม)
- stage เฉพาะไฟล์ที่ Task ระบุ ห้ามใช้ `git add -A`, `git add .` หรือ `git commit -a` (ห้าม stage `services/ui/node_modules` ซึ่งเป็น junction)
- **คำสั่งทดสอบ** (Git Bash, path เต็มเสมอ เพราะ cwd ถูกรีเซ็ตทุกคำสั่ง):
  - API ไฟล์เดียว: `cd /c/ETL/.claude/worktrees/bi-export/services/api && python -m pytest tests/<ไฟล์> -q -p no:cacheprovider`
  - API ทั้งชุด: `cd /c/ETL/.claude/worktrees/bi-export/services/api && python -m pytest tests -q -p no:cacheprovider`
  - UI: `cd /c/ETL/.claude/worktrees/bi-export/services/ui && npx vitest run <ไฟล์>` (ทั้งชุด: `npx vitest run`)
- **ตัวเลขอ้างอิง (วัดจริงตอนเขียนแผนบน a6981ac):** API 653 ผ่าน + 9 ล้มที่รู้อยู่แล้ว ทั้งหมดใน `tests/test_whitebox_engine.py` (`test_profiling_engine`, `test_explainable_rules_generation`, `test_pipeline_execution_and_segregation`, `test_ground_truth_benchmark_100_percent_recall`, `test_multi_table_preview`, `test_multi_table_analysis_schema_and_key_matching`, `test_multi_table_join_execution_and_schema_standardization`, `test_app_path_keeps_student_benchmark_split`, `test_gate_split_counts_quarantined_duplicates_in_gate2`) เพราะข้อมูล evaluation ที่ git ไม่ติดตามไม่อยู่ใน worktree ล้มนอกจาก 9 ตัวนี้ = ความผิดของงาน หลัง Task 1: 669, Task 2: 686 ผ่าน (+ 9 ล้มเดิม) UI เริ่ม 287 ผ่าน (29 ไฟล์); หลัง Task 3: 291, Task 4: 300 (30 ไฟล์)
- **ตั้งค่า worktree (ทำแล้วตอนเขียนแผน ตรวจซ้ำได้):** worktree ไม่มี `node_modules` UI ต้องมี junction `services/ui/node_modules` ชี้ไป `C:\ETL\services\ui\node_modules` ตรวจด้วย `ls /c/ETL/.claude/worktrees/bi-export/services/ui/node_modules/vitest` ถ้าไม่มีให้สร้างใน PowerShell: `New-Item -ItemType Junction -Path C:\ETL\.claude\worktrees\bi-export\services\ui\node_modules -Target C:\ETL\services\ui\node_modules` (git ไม่ติดตาม `node_modules/`)
- **Line ending:** `services/api/app/api/dashboard_compute.py` และ `dashboard_data.py` เป็น **CRLF** แผนนี้ไม่แก้สองไฟล์นี้ (ใช้แค่ import) ถ้าจำเป็นต้องแตะให้ใช้ Edit tool เท่านั้นและตรวจ `git ls-files --eol <ไฟล์>` ไฟล์อื่นที่แผนนี้แตะเป็น LF ทั้งหมด ไฟล์ใหม่สร้างด้วย Write tool (LF) หลังแก้ให้ดู `git diff --stat` ว่าจำนวนบรรทัดตรงกับที่ Task บอก ไม่ใช่ทั้งไฟล์
- Python บนเครื่องนี้ใช้ encoding เริ่มต้น cp874 สคริปต์ใดที่เปิดไฟล์ไทยต้องใส่ `encoding="utf-8"` (และ `PYTHONIOENCODING=utf-8` ถ้าพิมพ์ไทยหรือ emoji ออกจอ) ห้ามเขียนทับไฟล์เดิมด้วยสคริปต์ Python แบบ text mode
- **ข้อความบนหน้าจอ (กติกาของโปรเจกต์):** ภาษาไทย ห้ามมี em dash `—` หรือ en dash `–` ในข้อความ UI ใดๆ ห้าม emoji ปุ่มใช้คำ 1 ถึง 3 คำ ห้ามเขียนคู่ภาษาในวงเล็บแบบ `ไทย (English)` ในข้อความเดียว
- **ห้ามมีกุ้งหรือปู (`กุ้ง`, `ปู`) ใน fixture, mock, seed หรือข้อมูลทดสอบใดๆ** (เจ้าของระบบแพ้อาหารทะเลรุนแรง) fixture ในแผนนี้ใช้ยอดขาย ภูมิภาค และชื่อคนสมมติ
- **Text budget:** `src/test/textBudget.test.jsx` + `text-budget.json` ไม่มีหน้า DashboardBuilder (ตรวจแล้ว) ห้ามเพิ่มข้อความใหม่ในหน้าที่อยู่ใน budget
- **ความเป็นส่วนตัว:** คอลัมน์ส่วนบุคคลออกจาก API ได้เฉพาะเมื่อ `include_personal` เป็น JSON `true` และทุกครั้งต้องมี `logger.warning` (ผู้ใช้ ตาราง จำนวนแถว ชื่อคอลัมน์ ห้ามมีค่าในเซลล์) คอลัมน์ที่ซ่อนต้องยังซ่อนในทุกเส้นเดิม (`dashboards._dataset`, `semantic.load_view`, `semantic_layer.apply_to_profile` / `resolve` ห้ามเปลี่ยนพฤติกรรม)
- เทสต์ UI ใช้ `mockFetchByUrl` (`services/ui/src/test/renderPage.jsx`) จับ URL แบบ "มีสตริงนี้อยู่" และ route แรกที่ตรงชนะ **route ที่ยาวกว่าต้องมาก่อนเสมอ** (route `/dashboards/export` ไม่ชนกับ route เดิมใดใน `builderRoutes`)
- **เทสต์เดิมที่แผนนี้แก้:** ไม่มีการแก้ assertion เดิม มีแต่เพิ่มเทสต์ท้ายไฟล์ `test_route_contract.py` (เพิ่ม 1 บรรทัดใน `CALLS`), `requestJson.test.js` (แก้บรรทัด import 1 บรรทัด), `dashboardsApi.test.js`, `DashboardCanvas.test.jsx`, `DashboardBuilder.test.jsx` และ `mockFetchByUrl` ที่รับ option เพิ่ม ถ้าเทสต์เดิมล้มให้หยุดและรายงาน ห้ามแก้เทสต์เดิมให้ผ่าน

## รูปแบบข้อมูลที่ทุก Task ใช้ร่วมกัน

- **profile** (`dashboard_data.load_active_dataset(table) -> (df, profile)`): `{"rows", "column_count", "missing_cells", "kind_counts", "columns": [{"name", "kind": "numeric"|"categorical"|"date"|"text", ...}]}` ลำดับ `columns` = ลำดับคอลัมน์ของ `df`
- **view** (`semantic.load_view(table, profile, es)`): ใช้ `view["hidden_columns"]` (list ชื่อคอลัมน์ส่วนบุคคล) และ `view["effective"]["columns"][name]["label"]` (สตริง อาจว่าง)
- **profile ที่มองเห็น** (`semantic_layer.apply_to_profile(profile, view)`): ตัดคอลัมน์ใน `hidden_columns` ออก
- **selections** (เหมือน `/render`): `{column: {"values": [label, ...], "grain"?: "day"|"week"|"month"|"quarter"|"year"} | {"from"?: "YYYY-MM-DD", "to"?: "YYYY-MM-DD"}}` ตีความด้วย `dashboard_compute.apply_filters(df, selections, kinds)` ที่ข้ามคอลัมน์ที่ไม่อยู่ใน `kinds` และรายการที่ไม่ใช่ dict

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| Create `services/api/app/api/dashboard_export.py` | ฟังก์ชันล้วน: จัดรูปค่า กัน CSV injection หัวคอลัมน์ ชื่อไฟล์ เขียน CSV เป็นชิ้น | 1 |
| Create `services/api/tests/test_dashboard_export.py` | เทสต์ตัวเขียน CSV | 1 |
| Modify `services/api/app/api/dashboards.py` (LF) | `_dataset_with_view`, `ExportPayload`, `POST /export` | 2 |
| Create `services/api/tests/test_dashboards_export.py` | เทสต์ endpoint: login, ความเป็นส่วนตัว, log, เพดาน, 404/422, อ่าน view ครั้งเดียว | 2 |
| Modify `services/api/tests/test_route_contract.py` | เพิ่มเส้นที่ UI เรียก | 2 |
| Modify `services/ui/src/utils/requestJson.js` (+test), `utils/dashboardsApi.js` (+test), `test/renderPage.jsx` | `requestFile`, `dashboardsApi.exportCsv`, mock รับ headers/blob | 3 |
| Create `services/ui/src/components/builder/ExportCsv.jsx` (+test) | ปุ่ม ช่องติ๊ก คำเตือน สถานะ และการบันทึกไฟล์ | 4 |
| Modify `services/ui/src/components/builder/DashboardCanvas.jsx` (+test), `pages/DashboardBuilder.jsx` (+test), `pages/DashboardBuilder.css` | ช่อง `tools` ข้างจำนวนแถว ต่อ ExportCsv เข้าขั้นแดชบอร์ด สไตล์ | 4 |
| Modify `docs/ui-analysis/06-create-dashboard.md`, `docs/create-dashboard-improvement-proposal.md` | เอกสาร + ทดสอบกับระบบจริง | 5 |

---

### Task 1: ตัวเขียน CSV (`dashboard_export.py`)

**Files:**
- Create: `services/api/app/api/dashboard_export.py`
- Test: `services/api/tests/test_dashboard_export.py`

**Interfaces:**
- Consumes: ไม่มี import จากโมดูลอื่นในโปรเจกต์ (ใช้ `csv`, `io`, `math`, `re`, `collections.Counter`, `datetime`, `numpy`, `pandas`)
- Produces (Task 2 ใช้):
  - ค่าคงที่ `BOM = "\ufeff"`, `MAX_EXPORT_ROWS = 1_000_000`, `CHUNK_ROWS = 10_000`, `BANGKOK = timezone(timedelta(hours=7))`
  - `safe_text(text: str) -> str`
  - `cell(value) -> str` (ค่าเดียวของคอลัมน์ชนิดผสม)
  - `column_formatter(series: pd.Series) -> Callable[[Any], str]`
  - `header_labels(names: list[str], labels: dict[str, str | None]) -> list[str]`
  - `export_filename(table_name: str, day: datetime.date) -> str`
  - `csv_chunks(df: pd.DataFrame, columns: list[str], headers: list[str], chunk_rows: int = CHUNK_ROWS) -> Iterator[bytes]` ชิ้นแรกคือ BOM + แถวหัว แล้วชิ้นละ `chunk_rows` แถว เขียนเฉพาะ `columns` ตามลำดับ บรรทัดจบด้วย CRLF

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_dashboard_export.py`:

```python
"""The CSV writer of the dashboard export (dashboard_export.py): a UTF-8 BOM for Excel, RFC 4180
quoting, plain values a BI tool can type, and no cell a spreadsheet would run as a formula."""
import csv
import io
import os
import sys
from datetime import date

import numpy as np
import pandas as pd

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.dashboard_export import (  # noqa: E402
    BOM, CHUNK_ROWS, MAX_EXPORT_ROWS, csv_chunks, export_filename, header_labels, safe_text)


def written(df, columns=None, headers=None, chunk_rows=CHUNK_ROWS):
    columns = list(df.columns) if columns is None else columns
    headers = columns if headers is None else headers
    return b"".join(csv_chunks(df, columns, headers, chunk_rows)).decode("utf-8")


def rows_of(text):
    assert text.startswith(BOM)
    return list(csv.reader(io.StringIO(text[len(BOM):], newline="")))


def column(values, dtype=None):
    """The cells of a one-column export, without the header."""
    return [r[0] for r in rows_of(written(pd.DataFrame({"c": pd.Series(values, dtype=dtype)})))[1:]]


def test_the_file_has_a_bom_crlf_rows_and_thai_text():
    df = pd.DataFrame({"ภูมิภาค": ["เหนือ", "ใต้"], "amount": [1.5, 2.0]})
    raw = b"".join(csv_chunks(df, ["ภูมิภาค", "amount"], ["ภูมิภาค", "ยอดขาย"]))
    assert raw.startswith(b"\xef\xbb\xbf")
    assert raw.decode("utf-8") == "\ufeffภูมิภาค,ยอดขาย\r\nเหนือ,1.5\r\nใต้,2\r\n"


def test_commas_quotes_and_line_breaks_are_quoted_as_rfc_4180_says():
    values = ["a,b", 'say "hi"', "two\nlines", "plain"]
    text = written(pd.DataFrame({"c": values}))
    assert '"say ""hi"""' in text and '"a,b"' in text
    assert [r[0] for r in rows_of(text)[1:]] == values


def test_cells_a_spreadsheet_would_run_get_an_apostrophe():
    values = ["=SUM(A1:A2)", "+1+1", "-2+3", "@cmd", "\tx", "\rx", "-", "safe", "a=b"]
    assert column(values) == ["'=SUM(A1:A2)", "'+1+1", "'-2+3", "'@cmd", "'\tx", "'\rx", "'-", "safe", "a=b"]


def test_negative_numbers_stay_numbers():
    assert column([-5.0, -0.25, 3.0]) == ["-5", "-0.25", "3"]
    assert column([-7, None], dtype="Int64") == ["-7", ""]
    # a text column holding plain numbers keeps them as numbers too
    assert column(["-12.5", "+66", "-1e3", "+66 81 234 5678"]) == ["-12.5", "+66", "-1e3", "'+66 81 234 5678"]


def test_numbers_are_written_without_an_exponent_and_missing_values_are_empty():
    assert column([1e16, 1.5e-7, 0.1 + 0.2, np.nan, np.inf, -np.inf]) == [
        "10000000000000000", "0.00000015", "0.30000000000000004", "", "", ""]
    assert column([None, "x"]) == ["", "x"]


def test_booleans_are_true_and_false():
    assert column([True, False]) == ["TRUE", "FALSE"]
    assert column([True, None], dtype="boolean") == ["TRUE", ""]


def test_dates_are_iso_and_a_column_of_midnights_has_no_time():
    days = pd.to_datetime(pd.Series(["2025-01-05", None, "2025-02-28"]))
    assert column(days) == ["2025-01-05", "", "2025-02-28"]
    moments = pd.to_datetime(pd.Series(["2025-01-05 10:30:00", "2025-01-06 00:00:00"]))
    assert column(moments) == ["2025-01-05 10:30:00", "2025-01-06 00:00:00"]


def test_a_column_is_written_the_same_way_in_every_chunk():
    moments = pd.to_datetime(pd.Series(["2025-01-05", "2025-01-06", "2025-01-07 08:15:00"]), format="mixed")
    text = written(pd.DataFrame({"t": moments}), chunk_rows=1)
    assert [r[0] for r in rows_of(text)[1:]] == ["2025-01-05 00:00:00", "2025-01-06 00:00:00", "2025-01-07 08:15:00"]


def test_a_mixed_column_writes_each_value_by_its_type():
    values = [1, 2.5, True, None, pd.Timestamp("2025-01-05 08:00"), date(2025, 1, 6), "=x"]
    assert column(values, dtype="object") == ["1", "2.5", "TRUE", "", "2025-01-05 08:00:00", "2025-01-06", "'=x"]


def test_long_exports_are_streamed_in_chunks():
    df = pd.DataFrame({"n": [float(i) for i in range(25)]})
    pieces = list(csv_chunks(df, ["n"], ["n"], chunk_rows=10))
    assert len(pieces) == 4  # the header, then 10 + 10 + 5 rows
    rows = rows_of(b"".join(pieces).decode("utf-8"))
    assert rows[0] == ["n"] and len(rows) == 26 and rows[-1] == ["24"]


def test_only_the_named_columns_are_written_in_the_given_order():
    df = pd.DataFrame({"a": [1.5], "secret": ["Ann"], "b": ["x"]})
    text = written(df, ["b", "a"], ["B", "A"])
    assert rows_of(text) == [["B", "A"], ["x", "1.5"]]
    assert "Ann" not in text


def test_a_header_a_spreadsheet_would_run_is_neutralised():
    text = written(pd.DataFrame({"c": [1.5]}), ["c"], ['=HYPERLINK("http://x")'])
    assert rows_of(text)[0] == ['\'=HYPERLINK("http://x")']


def test_headers_use_the_label_and_tell_shared_labels_apart():
    names = ["Total_Sales", "Net_Sales", "Region", "Order_ID"]
    labels = {"Total_Sales": "ยอดขาย", "Net_Sales": "ยอดขาย", "Region": "", "Order_ID": None}
    assert header_labels(names, labels) == ["ยอดขาย [Total_Sales]", "ยอดขาย [Net_Sales]", "Region", "Order_ID"]
    # a label equal to another column's name: the column that owns the name keeps it
    assert header_labels(["Region", "Area"], {"Region": "", "Area": "Region"}) == ["Region", "Region [Area]"]
    # a clash the brackets cannot settle gets a number
    assert header_labels(["A", "B", "C"], {"A": "X [B]", "B": "X", "C": "X"}) == ["X [B]", "X [B] (2)", "X [C]"]


def test_safe_text_leaves_ordinary_text_alone():
    assert safe_text("ยอดขาย") == "ยอดขาย" and safe_text("") == ""


def test_the_file_name_is_the_table_and_the_day():
    assert export_filename("global_ecommerce_sales", date(2026, 10, 8)) == "global_ecommerce_sales_20261008.csv"
    assert export_filename("_quality_runs", date(2026, 10, 8)) == "quality_runs_20261008.csv"
    assert export_filename('bad name/../x"', date(2026, 1, 2)) == "bad_name_x_20260102.csv"
    assert export_filename("ยอดขาย", date(2026, 1, 2)) == "dataset_20260102.csv"


def test_the_row_cap_stays_below_what_excel_can_open():
    assert MAX_EXPORT_ROWS < 1_048_576
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/api && python -m pytest tests/test_dashboard_export.py -q -p no:cacheprovider`
Expected: FAIL ตอน collect: `ModuleNotFoundError: No module named 'app.api.dashboard_export'` (`1 error`)

- [ ] **Step 3: เขียนโมดูล**

สร้าง `services/api/app/api/dashboard_export.py`:

```python
"""CSV export of the rows a dashboard is computed from, for the BI team (Excel, Power BI).

Pure functions, no I/O: dashboards.export_dashboard_rows picks the rows and the columns and
streams what csv_chunks yields. The file is UTF-8 with a BOM (so Excel reads Thai), rows end
in CRLF and the csv module quotes fields as RFC 4180 describes."""
import csv
import io
import math
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

BOM = "\ufeff"
# Excel opens at most 1,048,576 rows per sheet; a longer file would be cut off without a word.
MAX_EXPORT_ROWS = 1_000_000
CHUNK_ROWS = 10_000  # rows written per piece of the streamed response
BANGKOK = timezone(timedelta(hours=7))  # the day in the file name; Thailand has no daylight saving time
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")
_PLAIN_NUMBER = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")
_UNSAFE_NAME = re.compile(r"[^A-Za-z0-9_-]+")
_NESTED = (list, tuple, dict, set, np.ndarray)


def safe_text(text: str) -> str:
    """Text a spreadsheet shows instead of running: a leading = + - @ tab or CR gets an
    apostrophe in front (CSV injection), except a plain number such as -12.5, which is
    never a formula and must stay a number."""
    if text.startswith(_FORMULA_START) and not _PLAIN_NUMBER.fullmatch(text):
        return "'" + text
    return text


def _missing(value) -> bool:
    if isinstance(value, _NESTED):
        return False
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def _number(value) -> str:
    """Digits without an exponent: 1e16 is 10000000000000000 and 3.0 is 3; inf is empty."""
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    number = float(value)
    if not math.isfinite(number):
        return ""
    return np.format_float_positional(number, trim="-")


def cell(value) -> str:
    """One value of a column whose values have mixed types (object dtype)."""
    if _missing(value):
        return ""
    if isinstance(value, (bool, np.bool_)):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float, np.integer, np.floating)):
        return _number(value)
    if isinstance(value, (datetime, np.datetime64)):
        return pd.Timestamp(value).isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, bytes):
        value = value.decode("utf-8", "replace")
    return safe_text(str(value))


def column_formatter(series: pd.Series):
    """The function that writes one value of this column, chosen once from the whole column
    so every chunk of a long export writes it the same way. A date column whose values all
    fall at midnight is written as days (2025-01-05), otherwise as day and time."""
    if pd.api.types.is_bool_dtype(series):
        return lambda v: "" if _missing(v) else ("TRUE" if v else "FALSE")
    if pd.api.types.is_datetime64_any_dtype(series):
        values = series.dropna()
        if (values == values.dt.normalize()).all():
            return lambda v: "" if _missing(v) else v.date().isoformat()
        return lambda v: "" if _missing(v) else v.isoformat(sep=" ")
    if pd.api.types.is_numeric_dtype(series):
        return lambda v: "" if _missing(v) else _number(v)
    return cell


def header_labels(names, labels) -> list:
    """The header row: each column's display label, else its name. Columns that share a label
    are told apart by their name in brackets ("ยอดขาย [Net_Sales]"), except a column whose
    label is its own name; a clash that is still left gets " (2)", " (3)", ..."""
    first = [labels.get(name) or name for name in names]
    counts = Counter(first)
    out, used = [], set()
    for name, label in zip(names, first):
        text = f"{label} [{name}]" if counts[label] > 1 and label != name else label
        candidate, n = text, 2
        while candidate in used:
            candidate, n = f"{text} ({n})", n + 1
        used.add(candidate)
        out.append(candidate)
    return out


def export_filename(table_name: str, day: date) -> str:
    """<table>_<YYYYMMDD>.csv; anything but letters, digits, _ and - in the name becomes _."""
    base = _UNSAFE_NAME.sub("_", table_name).strip("_") or "dataset"
    return f"{base}_{day:%Y%m%d}.csv"


def _drain(buffer: io.StringIO) -> bytes:
    text = buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)
    return text.encode("utf-8")


def csv_chunks(df: pd.DataFrame, columns, headers, chunk_rows: int = CHUNK_ROWS):
    """The CSV file as pieces of bytes: the BOM and the header row, then chunk_rows rows at a
    time, so a long export never holds the whole file in memory. Only `columns` are written,
    in that order, under `headers`."""
    formatters = [column_formatter(df[c]) for c in columns]
    buffer = io.StringIO()
    buffer.write(BOM)
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow([safe_text(str(h)) for h in headers])
    yield _drain(buffer)
    for start in range(0, len(df), chunk_rows):
        part = df.iloc[start:start + chunk_rows]
        cells = [[fmt(v) for v in part[c]] for c, fmt in zip(columns, formatters)]
        writer.writerows(zip(*cells))
        yield _drain(buffer)
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/api && python -m pytest tests/test_dashboard_export.py -q -p no:cacheprovider`
Expected: `16 passed`

- [ ] **Step 5: รัน API ทั้งชุด**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/api && python -m pytest tests -q -p no:cacheprovider`
Expected: `9 failed, 669 passed` (9 ตัวที่ล้มคือรายการใน Global Constraints เท่านั้น)

- [ ] **Step 6: Commit**

```bash
cd /c/ETL/.claude/worktrees/bi-export && git add services/api/app/api/dashboard_export.py services/api/tests/test_dashboard_export.py && git commit -m "feat(dashboard): add a CSV writer for exporting dashboard rows to BI tools"
```

---

### Task 2: `POST /api/v1/dashboards/export` พร้อมการซ่อนข้อมูลส่วนบุคคลและเพดานแถว

**Files:**
- Modify: `services/api/app/api/dashboards.py` (LF; 6 จุดแก้ ตามขั้นที่ 3)
- Create: `services/api/tests/test_dashboards_export.py`
- Modify: `services/api/tests/test_route_contract.py` (เพิ่ม 1 บรรทัดใน `CALLS`)

**Interfaces:**
- Consumes: จาก Task 1 `dashboard_export.MAX_EXPORT_ROWS`, `BANGKOK`, `header_labels(names, labels)`, `export_filename(table_name, day)`, `csv_chunks(df, columns, headers)`; โค้ดเดิม `dashboard_compute.apply_filters(df, selections, kinds) -> DataFrame`, `semantic.load_view(table_name, profile, es) -> view`, `semantic_layer.apply_to_profile(profile, view) -> profile`, `dashboard_data.load_active_dataset(table_name) -> (df, profile)`, `auth.require_session(request) -> username`
- Produces (Task 3 และ 4 ใช้):
  - `POST /api/v1/dashboards/export` body `{"table_name": str, "selections": object (ค่าเริ่มต้น {}), "include_personal": JSON boolean (ค่าเริ่มต้น false)}`
  - 200: body เป็น CSV (ขึ้นต้นด้วย BOM) header `content-type: text/csv; charset=utf-8`, `content-disposition: attachment; filename="<ตาราง>_<YYYYMMDD>.csv"`
  - 401 ไม่ login; 404 ชุดข้อมูลไม่มี (detail จากตัวโหลด); 413 `{"detail": "ข้อมูลหลังกรองมี {n:,} แถว เกินที่ส่งออกได้ {cap:,} แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่"}`; 422 body ผิดชนิด หรือ `{"detail": "ไม่มีคอลัมน์ที่ส่งออกได้ ทุกคอลัมน์เป็นข้อมูลส่วนบุคคล"}`
  - `dashboards._dataset_with_view(table_name) -> (df, profile เต็ม, view)` และ `dashboards._dataset(table_name)` คืนค่าเหมือนเดิม `(df, profile ที่มองเห็น, metrics)`
  - `dashboards.ExportPayload`, `dashboards.export_dashboard_rows(payload, user)`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_dashboards_export.py`:

```python
"""POST /api/v1/dashboards/export: the rows the dashboard is computed from, as a CSV file for the
BI team. Personal columns stay out unless the user asks for them, and every such export is logged."""
import csv
import io
import logging
import os
import re
import sys

import pandas as pd
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_export, dashboard_llm, dashboards, semantic  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

DF, PROFILE = dashboard_data.prepare_frame(pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Region": ["N", "S", "N", "E"],
    "Total_Sales": [100.0, 200.5, -49.5, 150.0], "Profit": [10.0, 50.5, -4.5, 45.0],
    "Customer_Name": ["Ann", "Bob", "Cid", "Dee"]}))
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
SPEC = {"filters": [{"column": "Region"}], "widgets": [{"id": "c", "type": "kpi", "metric": {"agg": "count", "column": None}}]}
NORTH = {"Region": {"values": ["N"]}}


def store(es, columns):
    doc = {"table_name": "sales", "draft": None, "history": [],
           "approved": {"columns": columns, "metrics": [], "version": 1}}
    es.index(semantic.SEMANTIC_INDEX, "sales", semantic.encode_doc(doc))


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    store(fake, {"Total_Sales": USD})
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client(logged_in=True):
    app = FastAPI()
    app.include_router(dashboards.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


def export(**body):
    return client().post("/api/v1/dashboards/export", json={"table_name": "sales", **body})


def rows_of(res):
    text = res.content.decode("utf-8")
    assert text.startswith("\ufeff")
    return list(csv.reader(io.StringIO(text[1:], newline="")))


def test_the_export_needs_a_login(es):
    res = client(logged_in=False).post("/api/v1/dashboards/export", json={"table_name": "sales"})
    assert res.status_code == 401


def test_the_filtered_rows_are_a_csv_file_without_personal_columns(es):
    res = export(selections=NORTH)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert re.fullmatch(r'attachment; filename="sales_\d{8}\.csv"', res.headers["content-disposition"])
    assert rows_of(res) == [["Order_ID", "Region", "ยอดขาย", "Profit"],
                            ["o1", "N", "100", "10"], ["o3", "N", "-49.5", "-4.5"]]
    assert "Customer_Name" not in res.text and "Ann" not in res.text


def test_the_file_has_the_rows_the_dashboard_counts(es):
    rendered = client().post("/api/v1/dashboards/render",
                             json={"table_name": "sales", "spec": SPEC, "selections": NORTH}).json()
    assert len(rows_of(export(selections=NORTH))) - 1 == rendered["data"]["rows_after_filter"] == 2


def test_personal_columns_come_out_only_when_asked_and_the_export_is_logged(es, caplog):
    caplog.set_level(logging.INFO, logger="app.api.dashboards")
    res = export(selections=NORTH, include_personal=True)
    assert res.status_code == 200
    rows = rows_of(res)
    assert rows[0] == ["Order_ID", "Region", "ยอดขาย", "Profit", "Customer_Name"]
    assert [r[-1] for r in rows[1:]] == ["Ann", "Cid"]
    (record,) = [r for r in caplog.records if r.levelno == logging.WARNING]
    message = record.getMessage()
    assert "user=tester" in message and "table=sales" in message and "rows=2" in message
    assert "Customer_Name" in message and "Ann" not in message and "Cid" not in message


def test_an_export_without_personal_columns_is_logged_as_info(es, caplog):
    caplog.set_level(logging.INFO, logger="app.api.dashboards")
    export()
    assert [r.levelno for r in caplog.records if "Dashboard CSV export" in r.getMessage()] == [logging.INFO]


@pytest.mark.parametrize("value", ["true", "yes", 1])
def test_only_a_json_true_lets_personal_columns_out(es, value):
    assert export(include_personal=value).status_code == 422


def test_a_selection_on_a_hidden_column_is_ignored_as_render_ignores_it(es):
    personal = {"Customer_Name": {"values": ["Ann"]}}
    assert len(rows_of(export(selections=personal))) - 1 == 4
    assert len(rows_of(export(selections=personal, include_personal=True))) - 1 == 4


def test_malformed_selections_are_ignored_and_a_non_object_is_a_422(es):
    assert len(rows_of(export(selections={"Region": "N", "Nope": {"values": ["x"]}}))) - 1 == 4
    assert export(selections=["Region"]).status_code == 422


def test_a_column_the_approved_meaning_marks_personal_stays_out(es):
    store(es, {"Total_Sales": USD, "Region": {**USD, "role": "dimension", "label": "ภาค", "unit": None,
                                               "currency": None, "default_agg": None, "pii": True}})
    assert rows_of(export())[0] == ["Order_ID", "ยอดขาย", "Profit"]


def test_without_elasticsearch_the_name_rules_still_hide_personal_columns(es, monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)
    assert rows_of(export())[0] == ["Order_ID", "Region", "Total_Sales", "Profit"]


def test_a_filtered_result_above_the_cap_is_refused_with_a_thai_message(es, monkeypatch):
    monkeypatch.setattr(dashboard_export, "MAX_EXPORT_ROWS", 3)
    res = export()
    assert res.status_code == 413
    assert res.json()["detail"] == "ข้อมูลหลังกรองมี 4 แถว เกินที่ส่งออกได้ 3 แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่"
    assert export(selections=NORTH).status_code == 200


def test_an_unknown_dataset_is_a_404(es, monkeypatch):
    def missing(name):
        raise HTTPException(status_code=404, detail=f"ไม่พบชุดข้อมูล {name}")
    monkeypatch.setattr(dashboard_data, "load_active_dataset", missing)
    res = export()
    assert res.status_code == 404 and res.json()["detail"] == "ไม่พบชุดข้อมูล sales"


def test_a_dataset_with_only_personal_columns_has_nothing_to_export(es, monkeypatch):
    only = dashboard_data.prepare_frame(pd.DataFrame({"Customer_Name": ["Ann", "Bob"]}))
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: only)
    res = export()
    assert res.status_code == 422 and res.json()["detail"] == "ไม่มีคอลัมน์ที่ส่งออกได้ ทุกคอลัมน์เป็นข้อมูลส่วนบุคคล"
    assert rows_of(export(include_personal=True)) == [["Customer_Name"], ["Ann"], ["Bob"]]


def test_one_export_reads_the_semantic_view_once_and_never_calls_the_ai(es, monkeypatch):
    calls = []
    real = semantic.load_view

    def counting(*args):
        calls.append(args[0])
        return real(*args)

    def never(*args, **kwargs):
        raise AssertionError("the export must not call the AI")
    monkeypatch.setattr(semantic, "load_view", counting)
    monkeypatch.setattr(dashboard_llm, "call_groq", never)
    assert export(selections=NORTH, include_personal=True).status_code == 200
    assert calls == ["sales"]
```

ใน `services/api/tests/test_route_contract.py` ใช้ Edit tool แทนบรรทัดนี้ (พบครั้งเดียว):

```python
    same("POST", "/api/v1/dashboards/render"),
```

ด้วย:

```python
    same("POST", "/api/v1/dashboards/render"),
    same("POST", "/api/v1/dashboards/export"),
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/api && python -m pytest tests/test_dashboards_export.py tests/test_route_contract.py -q -p no:cacheprovider`
Expected: `17 failed, 95 passed` (ทุกเทสต์ใน `test_dashboards_export.py` ล้มเพราะยังไม่มี route จึงได้ `404 Not Found`; ใน contract ล้ม `test_caller_path_resolves_to_its_route[POST-/api/v1/dashboards/export-/api/v1/dashboards/export]`)

- [ ] **Step 3: แก้ `services/api/app/api/dashboards.py`** (Edit tool ทีละจุด ข้อความ "ก่อน" ทุกจุดพบในไฟล์ครั้งเดียวพอดี)

(ก) docstring บนสุด แทน:

```python
"""Create Dashboard tab: list the Quality-Gate-passed datasets, preview one, let the LLM
draft a dashboard spec from the user's request, recompute it for the viewer's filters
and refine it with follow-up instructions and save it (ES index sdoqap_dashboards)."""
```

ด้วย:

```python
"""Create Dashboard tab: list the Quality-Gate-passed datasets, preview one, let the LLM
draft a dashboard spec from the user's request, recompute it for the viewer's filters,
export the filtered rows as CSV for the BI team, refine it with follow-up instructions
and save it (ES index sdoqap_dashboards)."""
```

(ข) import แทน:

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import dashboard_data, dashboard_llm, dashboard_suggest, semantic, semantic_layer
```

ด้วย:

```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, StrictBool

from . import dashboard_data, dashboard_export, dashboard_llm, dashboard_suggest, semantic, semantic_layer
```

(ค) แทน:

```python
from .dashboard_compute import compute_dashboard
```

ด้วย:

```python
from .dashboard_compute import apply_filters, compute_dashboard
```

(ง) แทน:

```python
class SavePayload(BaseModel):
```

ด้วย:

```python
class ExportPayload(BaseModel):
    table_name: str
    selections: Dict[str, Any] = Field(default_factory=dict)
    include_personal: StrictBool = False  # only a JSON true lets personal columns out


class SavePayload(BaseModel):
```

(จ) แทนฟังก์ชัน `_dataset` ทั้งฟังก์ชัน:

```python
def _dataset(table_name):
    """(DataFrame, profile without the hidden personal columns and with each column's meaning,
    usable metric definitions). The semantic view is read once per request; without
    Elasticsearch it is the rule guess, which still hides columns whose names look personal."""
    df, profile = dashboard_data.load_active_dataset(table_name)
    view = semantic.load_view(table_name, profile, _es_or_none())
    return df, semantic_layer.apply_to_profile(profile, view), view["effective"]["metrics"]
```

ด้วย:

```python
def _dataset_with_view(table_name):
    """(DataFrame, full profile, semantic view). The view is read once per request; without
    Elasticsearch it is the rule guess, which still hides columns whose names look personal."""
    df, profile = dashboard_data.load_active_dataset(table_name)
    return df, profile, semantic.load_view(table_name, profile, _es_or_none())


def _dataset(table_name):
    """(DataFrame, profile without the hidden personal columns and with each column's meaning,
    usable metric definitions)."""
    df, profile, view = _dataset_with_view(table_name)
    return df, semantic_layer.apply_to_profile(profile, view), view["effective"]["metrics"]
```

(ฉ) เพิ่ม route ต่อจาก `render_dashboard` โดยแทน:

```python
def _summary(doc):
```

ด้วย:

```python
@router.post("/export")
def export_dashboard_rows(payload: ExportPayload, user: str = Depends(require_session)):
    """The rows the dashboard is computed from (the same selections as /render) as a CSV file
    for Excel or Power BI. Columns the semantic view hides as personal stay out unless
    include_personal is true, and a selection on a hidden column is ignored as /render ignores it."""
    df, profile, view = _dataset_with_view(payload.table_name)
    visible = semantic_layer.apply_to_profile(profile, view)
    rows = apply_filters(df, payload.selections, {c["name"]: c["kind"] for c in visible["columns"]})
    hidden = set(view["hidden_columns"])
    columns = [c["name"] for c in profile["columns"] if payload.include_personal or c["name"] not in hidden]
    if not columns:
        raise HTTPException(status_code=422, detail="ไม่มีคอลัมน์ที่ส่งออกได้ ทุกคอลัมน์เป็นข้อมูลส่วนบุคคล")
    cap = dashboard_export.MAX_EXPORT_ROWS
    if len(rows) > cap:
        raise HTTPException(status_code=413, detail=(
            f"ข้อมูลหลังกรองมี {len(rows):,} แถว เกินที่ส่งออกได้ {cap:,} แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่"))
    meaning = view["effective"]["columns"]
    headers = dashboard_export.header_labels(columns, {n: (meaning.get(n) or {}).get("label") for n in columns})
    personal = [c for c in columns if c in hidden]
    if personal:  # who took personal data out, from which table and how many rows; never the values
        logger.warning("Dashboard CSV export with personal columns: user=%s table=%s rows=%d columns=%s",
                       user, payload.table_name, len(rows), ",".join(personal))
    else:
        logger.info("Dashboard CSV export: user=%s table=%s rows=%d include_personal=%s",
                    user, payload.table_name, len(rows), payload.include_personal)
    filename = dashboard_export.export_filename(payload.table_name, datetime.now(dashboard_export.BANGKOK).date())
    return StreamingResponse(dashboard_export.csv_chunks(rows, columns, headers), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def _summary(doc):
```

หมายเหตุสำหรับ executor: `MAX_EXPORT_ROWS` ต้องอ่านผ่าน `dashboard_export.MAX_EXPORT_ROWS` ตอนเรียก (ห้าม `from .dashboard_export import MAX_EXPORT_ROWS`) เพราะเทสต์เพดานแทนค่าที่ตัวโมดูลด้วย `monkeypatch` ส่วน `datetime` มีอยู่แล้วจากบรรทัดเดิม `from datetime import datetime, timezone` ไม่ต้อง import เพิ่ม

- [ ] **Step 4: รันเทสต์ให้ผ่าน และเทสต์ dashboards เดิม**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/api && python -m pytest tests/test_dashboards_export.py tests/test_route_contract.py tests/test_dashboards_api.py tests/test_dashboards_semantic.py -q -p no:cacheprovider`
Expected: `150 passed`

- [ ] **Step 5: รัน API ทั้งชุด และตรวจขนาด diff**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/api && python -m pytest tests -q -p no:cacheprovider`
Expected: `9 failed, 686 passed` (9 ตัวเดิมเท่านั้น)

Run: `cd /c/ETL/.claude/worktrees/bi-export && git diff --numstat`
Expected: `52 9 services/api/app/api/dashboards.py` และ `1 0 services/api/tests/test_route_contract.py` (ไฟล์ใหม่ยังไม่ถูก track จึงไม่อยู่ในรายการ)

- [ ] **Step 6: Commit**

```bash
cd /c/ETL/.claude/worktrees/bi-export && git add services/api/app/api/dashboards.py services/api/tests/test_dashboards_export.py services/api/tests/test_route_contract.py && git commit -m "feat(dashboard): export the filtered dashboard rows as CSV without personal columns by default"
```

---

### Task 3: ตัวช่วยดาวน์โหลดไฟล์ (`requestFile`) และ `dashboardsApi.exportCsv`

**Files:**
- Modify: `services/ui/src/utils/requestJson.js` (เขียนทับทั้งไฟล์ด้วย Write tool หลังอ่านแล้ว; LF)
- Modify: `services/ui/src/utils/requestJson.test.js`
- Modify: `services/ui/src/utils/dashboardsApi.js`
- Modify: `services/ui/src/utils/dashboardsApi.test.js`
- Modify: `services/ui/src/test/renderPage.jsx`

**Interfaces:**
- Consumes: `POST /api/v1/dashboards/export` ของ Task 2 (body `{table_name, selections, include_personal}`, ตอบ CSV + `Content-Disposition`, error เป็น `{"detail": "..."}`); `friendlyApiError(detail, fallback)` ใน `utils/apiError.js` (โค้ดเดิม)
- Produces (Task 4 ใช้):
  - `requestJson(url, options?) -> Promise<object>` พฤติกรรมเดิมทุกอย่าง
  - `requestFile(url: string, options?: { method?: string, body?: any }, fallbackName = "download") -> Promise<{ blob: Blob, filename: string }>` ล้มแล้ว throw `Error` ที่ `message` เป็นข้อความที่ผู้ใช้อ่านได้และ `status` เป็นรหัส HTTP (0 เมื่อต่อเซิร์ฟเวอร์ไม่ได้) และ 401 พาไป `/login` เหมือน `requestJson`
  - `dashboardsApi.exportCsv(table_name: string, selections: object, include_personal: boolean) -> Promise<{ blob, filename }>` (ชื่อสำรอง `${table_name}.csv`)
  - `mockFetchByUrl(routes)` รับ `[[urlSubstring, { status, body, headers, blob }]]` ตอบ `headers` เป็น `Headers` และ `blob()` คืน `blob` ที่ให้มา (ไม่ให้คือ `new Blob()` เหมือนเดิม)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม และให้ mock ตอบ header ได้**

(ก) `services/ui/src/test/renderPage.jsx` ใช้ Edit tool แทน:

```jsx
// routes: [[urlSubstring, { status, body }], ...]; first match wins.
export function mockFetchByUrl(routes) {
  const fn = vi.fn(async (url) => {
    const hit = routes.find(([part]) => String(url).includes(part));
    const status = hit?.[1]?.status ?? 200;
    const body = hit?.[1]?.body ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      blob: async () => new Blob()
    };
```

ด้วย:

```jsx
// routes: [[urlSubstring, { status, body, headers, blob }], ...]; first match wins.
export function mockFetchByUrl(routes) {
  const fn = vi.fn(async (url) => {
    const hit = routes.find(([part]) => String(url).includes(part));
    const status = hit?.[1]?.status ?? 200;
    const body = hit?.[1]?.body ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(hit?.[1]?.headers ?? {}),
      json: async () => body,
      text: async () => JSON.stringify(body),
      blob: async () => hit?.[1]?.blob ?? new Blob()
    };
```

(ข) `services/ui/src/utils/requestJson.test.js` แทนบรรทัด import:

```js
import { requestJson } from "./requestJson";
```

ด้วย:

```js
import { requestFile, requestJson } from "./requestJson";
```

แล้วเพิ่มท้ายไฟล์ โดยแทน:

```js
  expect(error.message).toBe("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
  expect(error.status).toBe(0);
});
```

ด้วย:

```js
  expect(error.message).toBe("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
  expect(error.status).toBe(0);
});

const CSV_FILE = { headers: { "Content-Disposition": 'attachment; filename="sales_20261008.csv"' } };

it("downloads a file under the name the server gives", async () => {
  const blob = new Blob(["\ufeffregion\r\nNorth\r\n"], { type: "text/csv" });
  const fetchMock = mockFetchByUrl([["/x", { ...CSV_FILE, blob }]]);
  const file = await requestFile("/api/v1/x", { method: "POST", body: { a: 1 } }, "sales.csv");
  expect(file).toEqual({ blob, filename: "sales_20261008.csv" });
  const [, options] = fetchMock.mock.calls[0];
  expect(options.credentials).toBe("same-origin");
  expect(JSON.parse(options.body)).toEqual({ a: 1 });
});

it("names a downloaded file itself when the server does not", async () => {
  mockFetchByUrl([["/x", {}]]);
  expect((await requestFile("/api/v1/x", {}, "sales.csv")).filename).toBe("sales.csv");
});

it("turns a failed download into the server's message", async () => {
  const detail = "ข้อมูลหลังกรองมี 4 แถว เกินที่ส่งออกได้ 3 แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่";
  mockFetchByUrl([["/x", { status: 413, body: { detail } }]]);
  const error = await requestFile("/api/v1/x").catch((e) => e);
  expect(error.status).toBe(413);
  expect(error.message).toBe(detail);
});
```

(ค) `services/ui/src/utils/dashboardsApi.test.js` เพิ่มท้ายไฟล์ โดยแทน:

```js
  await expect(dashboardsApi.createSaved({})).rejects.toThrow("บันทึกไม่ได้ในตอนนี้");
});
```

ด้วย:

```js
  await expect(dashboardsApi.createSaved({})).rejects.toThrow("บันทึกไม่ได้ในตอนนี้");
});

it("asks for the CSV of the rows the filters select", async () => {
  const fetchMock = mockFetchByUrl([["/dashboards/export",
    { headers: { "Content-Disposition": 'attachment; filename="sales_20261008.csv"' } }]]);
  const file = await dashboardsApi.exportCsv("sales", { region: { values: ["North"] } }, false);
  expect(file.filename).toBe("sales_20261008.csv");
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/dashboards/export");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({ table_name: "sales", selections: { region: { values: ["North"] } }, include_personal: false });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/ui && npx vitest run src/utils/requestJson.test.js src/utils/dashboardsApi.test.js`
Expected: `4 failed | 8 passed (12)` ด้วย `TypeError: requestFile is not a function` (3 ตัว) และ `TypeError: dashboardsApi.exportCsv is not a function`

- [ ] **Step 3: เขียน `requestFile` และ `exportCsv`**

(ก) เขียนทับ `services/ui/src/utils/requestJson.js` ทั้งไฟล์ (Read ก่อนแล้วใช้ Write tool):

```js
import { friendlyApiError } from "./apiError";

// fetch for this app's API: sends the session cookie, goes to /login on 401 and throws an Error a
// user can read when the call fails. The HTTP status stays on error.status (0 when the server was
// not reached).
async function send(url, { method = "GET", body } = {}) {
  const options = { method, credentials: "same-origin" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    const error = new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
    error.status = 0;
    throw error;
  }
  if (res.status === 401 && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  return res;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function failure(res, data) {
  const detail = typeof data.detail === "string" ? data.detail : "";
  const error = new Error(friendlyApiError(detail, `คำขอล้มเหลว (HTTP ${res.status})`));
  error.status = res.status;
  return error;
}

// fetch + JSON.
export async function requestJson(url, options) {
  const res = await send(url, options);
  const data = await readJson(res);
  if (!res.ok) throw failure(res, data);
  return data;
}

// A file to download, such as a CSV: the same cookie, 401 and error handling as requestJson, but it
// resolves to { blob, filename }. The name comes from the server's Content-Disposition, else fallbackName.
export async function requestFile(url, options, fallbackName = "download") {
  const res = await send(url, options);
  if (!res.ok) throw failure(res, await readJson(res));
  const disposition = res.headers?.get?.("Content-Disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await res.blob(), filename: match ? match[1] : fallbackName };
}
```

(ข) `services/ui/src/utils/dashboardsApi.js` แทน:

```js
import { requestJson } from "./requestJson";
```

ด้วย:

```js
import { requestFile, requestJson } from "./requestJson";
```

และแทน:

```js
  render: (table_name, spec, selections) => request("/render", { method: "POST", body: { table_name, spec, selections } }),
```

ด้วย:

```js
  render: (table_name, spec, selections) => request("/render", { method: "POST", body: { table_name, spec, selections } }),
  // The rows the dashboard is computed from, as a CSV file: resolves to { blob, filename }.
  exportCsv: (table_name, selections, include_personal) =>
    requestFile(`${BASE}/export`, { method: "POST", body: { table_name, selections, include_personal } }, `${table_name}.csv`),
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/ui && npx vitest run src/utils/requestJson.test.js src/utils/dashboardsApi.test.js`
Expected: `12 passed (12)`

- [ ] **Step 5: รัน UI ทั้งชุด และตรวจขนาด diff**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/ui && npx vitest run`
Expected: `Test Files 29 passed (29)`, `Tests 291 passed (291)`

Run: `cd /c/ETL/.claude/worktrees/bi-export && git diff --numstat`
Expected: `3 2 services/ui/src/test/renderPage.jsx`, `4 1 services/ui/src/utils/dashboardsApi.js`, `11 0 services/ui/src/utils/dashboardsApi.test.js`, `34 12 services/ui/src/utils/requestJson.js`, `26 1 services/ui/src/utils/requestJson.test.js`

- [ ] **Step 6: Commit**

```bash
cd /c/ETL/.claude/worktrees/bi-export && git add services/ui/src/utils/requestJson.js services/ui/src/utils/requestJson.test.js services/ui/src/utils/dashboardsApi.js services/ui/src/utils/dashboardsApi.test.js services/ui/src/test/renderPage.jsx && git commit -m "feat(ui): add a file download helper that shares the API session and error handling"
```

---

### Task 4: ปุ่ม "ส่งออก CSV" และช่องติ๊กข้อมูลส่วนบุคคลในขั้นแดชบอร์ด

**Files:**
- Create: `services/ui/src/components/builder/ExportCsv.jsx`
- Create: `services/ui/src/components/builder/ExportCsv.test.jsx`
- Modify: `services/ui/src/components/builder/DashboardCanvas.jsx`
- Modify: `services/ui/src/components/builder/DashboardCanvas.test.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.test.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.css`

**Interfaces:**
- Consumes: จาก Task 3 `dashboardsApi.exportCsv(table_name, selections, include_personal) -> Promise<{blob, filename}>` และ `mockFetchByUrl` ที่รับ `headers`; โค้ดเดิม `semanticApi.get(table) -> Promise<view>` (ใช้ `view.hidden_columns`), `SEMANTIC_VIEW` ใน `src/test/dashboardFixtures.js` (`hidden_columns: []`), helper ในเทสต์เดิมของ `DashboardBuilder.test.jsx`: `generateDashboard(extra)`, `callTo(part, method)`, `settle()`, `openDashboard()`, `filterRegion(value)`, `answer(respond, ...args)`, `rendered(rowsAfterFilter)`
- Produces:
  - `export default function ExportCsv({ table: string, selections: object, disabled?: boolean })`
  - `DashboardCanvas` prop ใหม่ `tools` (React node, ค่าเริ่มต้น `null`) วาดใน `<div className="dbb-canvas-bar">` ข้างบรรทัด "X จาก Y แถว"
  - ข้อความบนจอ: ปุ่ม "ส่งออก CSV", ช่องติ๊ก "รวมข้อมูลส่วนบุคคล", สถานะ "กำลังเตรียมไฟล์…", คำเตือน "ไฟล์จะมีข้อมูลส่วนบุคคลจากคอลัมน์ {ชื่อคอลัมน์คั่นด้วย , } เก็บไฟล์ให้ปลอดภัยและอย่าส่งต่อเกินจำเป็น ระบบบันทึกชื่อผู้ส่งออกไว้"
  - CSS class `.dbb-canvas-bar`, `.dbb-export`, `.dbb-export-warning`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

(ก) สร้าง `services/ui/src/components/builder/ExportCsv.test.jsx`:

```jsx
import React from "react";
import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ExportCsv from "./ExportCsv";
import { mockFetchByUrl } from "../../test/renderPage";
import { SEMANTIC_VIEW } from "../../test/dashboardFixtures";

const FILE = { headers: { "Content-Disposition": 'attachment; filename="sales_20261008.csv"' } };
const NORTH = { region: { values: ["North"] } };
const PERSONAL = { ...SEMANTIC_VIEW, hidden_columns: ["Customer_Name"] };
const WARNING = "ไฟล์จะมีข้อมูลส่วนบุคคลจากคอลัมน์ Customer_Name เก็บไฟล์ให้ปลอดภัยและอย่าส่งต่อเกินจำเป็น ระบบบันทึกชื่อผู้ส่งออกไว้";

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

let saved; // the file names the page asked the browser to save
beforeEach(() => {
  saved = [];
  window.URL.createObjectURL = vi.fn(() => "blob:x");
  window.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function save() { saved.push(this.download); });
});

async function mount(routes, props = {}) {
  const fetchMock = mockFetchByUrl(routes);
  await act(async () => { render(<ExportCsv table="sales" selections={NORTH} {...props} />); });
  await settle();
  return fetchMock;
}

const exportCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => String(url).includes("/dashboards/export"));
const clickExport = () => act(async () => { fireEvent.click(screen.getByRole("button", { name: "ส่งออก CSV" })); });

it("downloads the rows the filters select, without personal columns", async () => {
  const fetchMock = await mount([["/dashboards/export", FILE], ["/semantic/sales", { body: SEMANTIC_VIEW }]]);
  expect(screen.queryByLabelText("รวมข้อมูลส่วนบุคคล")).toBeNull(); // nothing is hidden in this dataset
  await clickExport();
  await settle();
  expect(JSON.parse(exportCalls(fetchMock)[0][1].body)).toEqual({ table_name: "sales", selections: NORTH, include_personal: false });
  expect(saved).toEqual(["sales_20261008.csv"]);
  expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
});

it("offers personal columns only when the saved meaning hides some, unticked and with a warning", async () => {
  const fetchMock = await mount([["/dashboards/export", FILE], ["/semantic/sales", { body: PERSONAL }]]);
  const box = screen.getByLabelText("รวมข้อมูลส่วนบุคคล");
  expect(box).not.toBeChecked();
  expect(screen.queryByText(WARNING)).toBeNull();
  fireEvent.click(box);
  expect(screen.getByText(WARNING)).toBeInTheDocument();
  await clickExport();
  await settle();
  expect(JSON.parse(exportCalls(fetchMock)[0][1].body).include_personal).toBe(true);
  // the next export starts without personal data again: each one is a new choice
  expect(screen.getByLabelText("รวมข้อมูลส่วนบุคคล")).not.toBeChecked();
});

it("keeps the box away when the column meaning cannot be read", async () => {
  const fetchMock = await mount([["/dashboards/export", FILE], ["/semantic/sales", { status: 503, body: { detail: "Elasticsearch service is offline" } }]]);
  expect(screen.queryByLabelText("รวมข้อมูลส่วนบุคคล")).toBeNull();
  await clickExport();
  await settle();
  expect(JSON.parse(exportCalls(fetchMock)[0][1].body).include_personal).toBe(false);
});

it("makes one file per click and shows that it is working", async () => {
  let finish;
  const answer = (body, headers = {}) => ({ ok: true, status: 200, headers: new Headers(headers),
    json: async () => body, text: async () => JSON.stringify(body), blob: async () => new Blob() });
  const fetchMock = vi.fn((url) => (String(url).includes("/dashboards/export")
    ? new Promise((resolve) => { finish = () => resolve(answer({}, FILE.headers)); })
    : Promise.resolve(answer(SEMANTIC_VIEW))));
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => { render(<ExportCsv table="sales" selections={{}} />); });
  const button = screen.getByRole("button", { name: "ส่งออก CSV" });
  fireEvent.click(button);
  fireEvent.click(button);
  await settle();
  expect(button).toBeDisabled();
  expect(screen.getByText("กำลังเตรียมไฟล์…")).toBeInTheDocument();
  await act(async () => { finish(); });
  await settle();
  expect(exportCalls(fetchMock)).toHaveLength(1);
  expect(button).toBeEnabled();
  expect(screen.queryByText("กำลังเตรียมไฟล์…")).toBeNull();
  expect(saved).toEqual(["sales_20261008.csv"]);
});

it("says why the export failed and lets the user try again", async () => {
  const detail = "ข้อมูลหลังกรองมี 1,200,000 แถว เกินที่ส่งออกได้ 1,000,000 แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่";
  await mount([["/dashboards/export", { status: 413, body: { detail } }], ["/semantic/sales", { body: SEMANTIC_VIEW }]]);
  await clickExport();
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent(detail);
  expect(screen.getByRole("button", { name: "ส่งออก CSV" })).toBeEnabled();
  expect(saved).toEqual([]);
});

it("cannot export while the dashboard is being recomputed", async () => {
  await mount([["/semantic/sales", { body: SEMANTIC_VIEW }]], { disabled: true });
  expect(screen.getByRole("button", { name: "ส่งออก CSV" })).toBeDisabled();
});
```

(ข) `services/ui/src/components/builder/DashboardCanvas.test.jsx` เพิ่มท้ายไฟล์ โดยแทน:

```jsx
  expect(screen.getByRole("button", { name: "ล้างตัวกรอง กลุ่มลูกค้า" })).toHaveTextContent("กลุ่มลูกค้า: A");
});
```

ด้วย:

```jsx
  expect(screen.getByRole("button", { name: "ล้างตัวกรอง กลุ่มลูกค้า" })).toHaveTextContent("กลุ่มลูกค้า: A");
});

it("shows the export tools beside the row count", () => {
  draw({ tools: <button type="button">ส่งออก CSV</button> });
  const bar = screen.getByText("6 จาก 6 แถว").closest(".dbb-canvas-bar");
  expect(within(bar).getByRole("button", { name: "ส่งออก CSV" })).toBeInTheDocument();
});
```

(ค) `services/ui/src/pages/DashboardBuilder.test.jsx` เพิ่มท้ายไฟล์ โดยแทน 3 บรรทัดสุดท้ายของไฟล์:

```jsx
  // the late reply did not even replace the state: the orders editor never had to reload
  expect(fetch.mock.calls.filter(([u]) => String(u).includes("/semantic/orders"))).toHaveLength(1);
});
```

ด้วย:

```jsx
  // the late reply did not even replace the state: the orders editor never had to reload
  expect(fetch.mock.calls.filter(([u]) => String(u).includes("/semantic/orders"))).toHaveLength(1);
});

// --- CSV export of the filtered rows ---------------------------------------------------------------
const EXPORT_FILE = ["/dashboards/export", { headers: { "Content-Disposition": 'attachment; filename="sales_20261008.csv"' } }];

it("exports the rows the current filters select", async () => {
  window.URL.createObjectURL = vi.fn(() => "blob:x");
  window.URL.revokeObjectURL = vi.fn();
  const save = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await generateDashboard([EXPORT_FILE]);
  fireEvent.change(screen.getByLabelText("ภูมิภาค"), { target: { value: "North" } });
  await settle();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ส่งออก CSV" })); });
  await settle();
  expect(JSON.parse(callTo("/dashboards/export")[1].body)).toEqual(
    { table_name: "sales", selections: { region: { values: ["North"] } }, include_personal: false });
  expect(save).toHaveBeenCalledTimes(1);
});

it("does not export while a filter is still being recomputed", async () => {
  const pending = await openDashboard();
  const button = screen.getByRole("button", { name: "ส่งออก CSV" });
  expect(button).toBeEnabled();
  filterRegion("North");
  expect(button).toBeDisabled();
  await answer(pending.render[0], rendered(2));
  expect(button).toBeEnabled();
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/ui && npx vitest run src/components/builder/ExportCsv.test.jsx src/components/builder/DashboardCanvas.test.jsx src/pages/DashboardBuilder.test.jsx`
Expected: `FAIL src/components/builder/ExportCsv.test.jsx` (import `./ExportCsv` ไม่พบ) และ `3 failed`: "shows the export tools beside the row count", "exports the rows the current filters select", "does not export while a filter is still being recomputed" (หาปุ่ม "ส่งออก CSV" ไม่เจอ) เทสต์เดิมใน 2 ไฟล์นั้นผ่านหมด

- [ ] **Step 3: สร้าง `ExportCsv.jsx`**

สร้าง `services/ui/src/components/builder/ExportCsv.jsx`:

```jsx
import React, { useEffect, useRef, useState } from "react";
import { dashboardsApi } from "../../utils/dashboardsApi";
import { semanticApi } from "../../utils/semanticApi";

// "ส่งออก CSV": the rows the dashboard is computed from right now (the same selections) as a file
// for Excel or Power BI. Personal columns stay out unless the user ticks the box, which appears only
// when the saved column meaning of this dataset hides some; the box clears after every export.
export default function ExportCsv({ table, selections, disabled = false }) {
  const [hidden, setHidden] = useState([]);
  const [includePersonal, setIncludePersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false); // a second click before React has disabled the button

  useEffect(() => {
    let alive = true;
    setHidden([]);
    setIncludePersonal(false);
    setError("");
    semanticApi.get(table)
      .then((view) => { if (alive) setHidden(Array.isArray(view?.hidden_columns) ? view.hidden_columns : []); })
      .catch(() => {}); // without the list the box stays away and personal columns stay out
    return () => { alive = false; };
  }, [table]);

  const personal = includePersonal && hidden.length > 0;

  const download = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const { blob, filename } = await dashboardsApi.exportCsv(table, selections, personal);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setIncludePersonal(false);
    } catch (e) {
      setError(e.message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="dbb-export">
      <button type="button" onClick={download} disabled={disabled || busy} aria-busy={busy}>ส่งออก CSV</button>
      {busy && <span className="dbb-muted" aria-live="polite">กำลังเตรียมไฟล์…</span>}
      {hidden.length > 0 && (
        <label className="dbb-check">
          <input type="checkbox" checked={includePersonal} disabled={busy}
            onChange={(e) => setIncludePersonal(e.target.checked)} />
          รวมข้อมูลส่วนบุคคล
        </label>
      )}
      {personal && (
        <p className="dbb-export-warning">
          ไฟล์จะมีข้อมูลส่วนบุคคลจากคอลัมน์ {hidden.join(", ")} เก็บไฟล์ให้ปลอดภัยและอย่าส่งต่อเกินจำเป็น ระบบบันทึกชื่อผู้ส่งออกไว้
        </p>
      )}
      {error && <p role="alert" className="dbb-error-inline">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: เพิ่มช่อง `tools` ใน `DashboardCanvas.jsx`**

ใน `services/ui/src/components/builder/DashboardCanvas.jsx` แทน:

```jsx
export default function DashboardCanvas({ spec, data, selections = {}, onSelectionsChange, busy = false }) {
```

ด้วย:

```jsx
// `tools` (optional) is drawn beside the row count, e.g. the CSV export of the filtered rows.
export default function DashboardCanvas({ spec, data, selections = {}, onSelectionsChange, busy = false, tools = null }) {
```

และแทน:

```jsx
      {data && (
        <p className="dbb-muted">
          {data.rows_after_filter.toLocaleString("en-US")} จาก {data.rows_total.toLocaleString("en-US")} แถว
        </p>
      )}
```

ด้วย:

```jsx
      {(data || tools) && (
        <div className="dbb-canvas-bar">
          {data && (
            <p className="dbb-muted">
              {data.rows_after_filter.toLocaleString("en-US")} จาก {data.rows_total.toLocaleString("en-US")} แถว
            </p>
          )}
          {tools}
        </div>
      )}
```

- [ ] **Step 5: ต่อ ExportCsv เข้าขั้นแดชบอร์ด และเพิ่มสไตล์**

(ก) `services/ui/src/pages/DashboardBuilder.jsx` แทน:

```jsx
import DashboardCanvas from "../components/builder/DashboardCanvas";
```

ด้วย:

```jsx
import DashboardCanvas from "../components/builder/DashboardCanvas";
import ExportCsv from "../components/builder/ExportCsv";
```

และแทน:

```jsx
            <DashboardCanvas spec={draft.spec} data={draft.data} selections={selections}
              onSelectionsChange={changeSelections} busy={busy === "render"} />
```

ด้วย:

```jsx
            <DashboardCanvas spec={draft.spec} data={draft.data} selections={selections}
              onSelectionsChange={changeSelections} busy={busy === "render"}
              tools={<ExportCsv table={dataset.name} selections={selections} disabled={busy === "render"} />} />
```

(ข) `services/ui/src/pages/DashboardBuilder.css` แทน:

```css
.dbb-drills { display: flex; flex-wrap: wrap; gap: 6px; }
```

ด้วย:

```css
.dbb-drills { display: flex; flex-wrap: wrap; gap: 6px; }
.dbb-canvas-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; min-height: 32px; }
.dbb-export { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; font-size: 13px; }
.dbb-export button {
  padding: 5px 12px; border: 1px solid var(--dbb-border); border-radius: 6px; background: var(--dbb-surface);
  color: var(--dbb-ink); font-size: 13px; cursor: pointer; transition: background-color 0.15s;
}
.dbb-export button:hover:not(:disabled) { background: var(--dbb-primary-soft); }
.dbb-export button:focus-visible { outline: 2px solid var(--dbb-primary); outline-offset: 2px; }
.dbb-export button:disabled { cursor: not-allowed; opacity: 0.5; }
.dbb-export-warning { flex-basis: 100%; margin: 0; padding: 6px 10px; border: 1px solid #fedf89; border-radius: 6px; background: #fffaeb; color: #8a5a00; font-size: 12px; }
.dbb-export .dbb-error-inline { flex-basis: 100%; margin: 0; text-align: right; }
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/ui && npx vitest run src/components/builder/ExportCsv.test.jsx src/components/builder/DashboardCanvas.test.jsx src/pages/DashboardBuilder.test.jsx`
Expected: `90 passed (90)`

- [ ] **Step 7: รัน UI ทั้งชุด ตรวจข้อความ และขนาด diff**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/ui && npx vitest run`
Expected: `Test Files 30 passed (30)`, `Tests 300 passed (300)` (รวม `src/test/textBudget.test.jsx` ที่ไม่เปลี่ยน)

Run: `cd /c/ETL/.claude/worktrees/bi-export && grep -nE "—|–|กุ้ง|ปู" services/ui/src/components/builder/ExportCsv.jsx services/ui/src/components/builder/ExportCsv.test.jsx; echo "exit=$?"`
Expected: ไม่มีบรรทัดใดพิมพ์ออกมา และ `exit=1`

Run: `cd /c/ETL/.claude/worktrees/bi-export && git diff --numstat`
Expected: `11 5 services/ui/src/components/builder/DashboardCanvas.jsx`, `6 0 services/ui/src/components/builder/DashboardCanvas.test.jsx`, `11 0 services/ui/src/pages/DashboardBuilder.css`, `3 1 services/ui/src/pages/DashboardBuilder.jsx`, `27 0 services/ui/src/pages/DashboardBuilder.test.jsx`

- [ ] **Step 8: Commit**

```bash
cd /c/ETL/.claude/worktrees/bi-export && git add services/ui/src/components/builder/ExportCsv.jsx services/ui/src/components/builder/ExportCsv.test.jsx services/ui/src/components/builder/DashboardCanvas.jsx services/ui/src/components/builder/DashboardCanvas.test.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx services/ui/src/pages/DashboardBuilder.css && git commit -m "feat(dashboard): add the CSV export button and the personal-data choice to the dashboard step"
```

---

### Task 5: เอกสาร และทดสอบกับระบบจริง

**Files:**
- Modify: `docs/ui-analysis/06-create-dashboard.md` (LF)
- Modify: `docs/create-dashboard-improvement-proposal.md` (LF)

**Interfaces:**
- Consumes: ผลของ Task 1 ถึง 4 (ชื่อ route, ชื่อฟังก์ชัน, ข้อความบนจอ, เพดาน 1,000,000 แถว)
- Produces: เอกสารที่ตรงกับพฤติกรรมจริง และหลักฐานจากระบบจริง (ส่วน B)

**ส่วน A (executor):** แก้เอกสารด้วย Edit tool เท่านั้น ข้อความ "ก่อน" ทุกจุดพบในไฟล์ครั้งเดียวพอดี (ตรวจแล้วตอนเขียนแผน) คงข้อความอื่นทั้งหมด **ห้ามรันคำสั่ง docker**

- [ ] **Step 1: อัปเดต `docs/ui-analysis/06-create-dashboard.md`**

(ก) ตารางภาพรวม แทนแถว:

```markdown
| `DashboardCanvas.jsx`, `ChartWidget.jsx`, `KpiCard.jsx`, `TableWidget.jsx`, `FilterBar.jsx` | `POST /render` (ทุกครั้งที่กรอง/คลิกกราฟ) | `render_dashboard` `dashboards.py:108-112` | ไม่เก็บ (คำนวณใหม่ทุกครั้ง) |
```

ด้วย:

```markdown
| `DashboardCanvas.jsx`, `ChartWidget.jsx`, `KpiCard.jsx`, `TableWidget.jsx`, `FilterBar.jsx` | `POST /render` (ทุกครั้งที่กรอง/คลิกกราฟ) | `render_dashboard` `dashboards.py:108-112` | ไม่เก็บ (คำนวณใหม่ทุกครั้ง) |
| `ExportCsv.jsx` (ข้างบรรทัด "X จาก Y แถว" ในขั้นแดชบอร์ด) | `POST /export` (ผ่าน `dashboardsApi.exportCsv` -> `requestFile` ใน `utils/requestJson.js`) และ `GET /api/v1/semantic/{table}` (อ่าน `hidden_columns` เพื่อตัดสินว่าจะแสดงช่องติ๊กหรือไม่) | `export_dashboard_rows` (`dashboards.py`) -> `dashboard_compute.apply_filters` -> `dashboard_export.csv_chunks` | ไม่เก็บ (สร้างไฟล์ใหม่ทุกครั้งแบบ stream) มีแค่ log ของ API |
```

(ข) ส่วนที่ 5.2 ต่อจาก bullet "X จาก Y แถว" แทน:

```markdown
(4) 🟡 `len(df หลังกรอง)` / `len(df)`
```

ด้วย:

```markdown
(4) 🟡 `len(df หลังกรอง)` / `len(df)`
- **[ปุ่ม "ส่งออก CSV"]** -> (1) ดาวน์โหลดแถวข้อมูลที่แดชบอร์ดใช้คำนวณอยู่ตอนนี้ (ตัวกรองและการคลิกกราฟชุดเดียวกับบรรทัด "X จาก Y แถว" จำนวนแถวในไฟล์จึงเท่ากับ X) ให้ทีม BI ทำต่อใน Excel หรือ Power BI ระหว่างทำงานปุ่มกดไม่ได้และขึ้น "กำลังเตรียมไฟล์…" และกดไม่ได้ระหว่างแดชบอร์ดกำลังคำนวณตัวกรองใหม่ (2) ไฟล์ `<ตาราง>_<YYYYMMDD>.csv` (วันที่ตามเวลาไทย) UTF-8 มี BOM ให้ Excel อ่านภาษาไทยได้ หัวคอลัมน์ใช้ชื่อที่แสดงจาก semantic layer (ชื่อที่ซ้ำกันต่อท้ายด้วย `[ชื่อคอลัมน์]`) เรียงคอลัมน์ตามตาราง วันที่เป็น `YYYY-MM-DD` หรือ `YYYY-MM-DD HH:MM:SS` ตัวเลขไม่มีรูปแบบยกกำลัง ค่าว่างเป็นช่องว่าง ค่าจริงเท็จเป็น `TRUE`/`FALSE` (3) `ExportCsv.jsx` -> `POST /api/v1/dashboards/export` body `{table_name, selections, include_personal}` -> `export_dashboard_rows` อ่าน semantic view ครั้งเดียว กรองด้วย `apply_filters` ตัวเดียวกับ `/render` แล้วเขียนด้วย `dashboard_export.csv_chunks` ทีละ 10,000 แถวแบบ stream (4) 🟢 แถวจริงจาก active layer
  - เซลล์ข้อความที่ขึ้นต้นด้วย `=`, `+`, `-`, `@`, tab หรือ CR ถูกเติม `'` ข้างหน้า กันสูตรทำงานเมื่อเปิดใน Excel (CSV injection) ยกเว้นเซลล์ที่เป็นตัวเลขล้วน เช่น `-12.5` คอลัมน์ตัวเลขไม่ถูกเติมเลย
  - เกิน 1,000,000 แถวหลังกรอง (`MAX_EXPORT_ROWS` ใน `dashboard_export.py` ต่ำกว่าเพดาน 1,048,576 แถวต่อชีตของ Excel) ตอบ 413 "ข้อมูลหลังกรองมี ... แถว เกินที่ส่งออกได้ 1,000,000 แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่" ข้อความ error แสดงใต้ปุ่ม
- **[ช่องติ๊ก "รวมข้อมูลส่วนบุคคล"]** -> (1) ติ๊กแล้วไฟล์ถัดไปมีคอลัมน์ส่วนบุคคลด้วย ขึ้นเฉพาะเมื่อความหมายคอลัมน์ที่บันทึกไว้ซ่อนบางคอลัมน์ ค่าเริ่มต้นไม่ติ๊ก และกลับเป็นไม่ติ๊กหลังส่งออกสำเร็จทุกครั้ง (2) เมื่อติ๊กขึ้นคำเตือนว่าไฟล์จะมีข้อมูลส่วนบุคคลจากคอลัมน์ใด และระบบบันทึกชื่อผู้ส่งออก (3) อ่าน `hidden_columns` จาก `GET /api/v1/semantic/{table}` (อ่านไม่ได้ ช่องติ๊กไม่ขึ้น) API รับเฉพาะ JSON `true` (`StrictBool` ค่าอื่นได้ 422) ผู้ใช้ที่ login ทุกคนเลือกได้เพราะยังไม่มีระบบ role ทุกครั้งที่ไฟล์มีคอลัมน์ส่วนบุคคล API เขียน log ระดับ WARNING `Dashboard CSV export with personal columns: user=... table=... rows=... columns=...` (ไม่มีค่าในเซลล์) การส่งออกอื่นเขียน log ระดับ INFO (4) 🟢
```

(ค) ข้อสังเกตข้อ 5 ต่อจาก bullet เรื่อง Spark แทน:

```markdown
   - Spark และ Gold ยังไม่อ่าน semantic layer (ไม่ปิดบังข้อมูลส่วนบุคคลตอน export และไม่คำนวณ metric ล่วงหน้า) ใช้เฉพาะหน้า Create Dashboard
```

ด้วย:

```markdown
   - Spark และ Gold ยังไม่อ่าน semantic layer (ไม่ปิดบังข้อมูลส่วนบุคคลตอน export และไม่คำนวณ metric ล่วงหน้า) ใช้เฉพาะหน้า Create Dashboard
   - การส่งออก CSV ของหน้านี้ (`POST /export`) ใช้ view เดียวกับแดชบอร์ด คอลัมน์ส่วนบุคคลไม่อยู่ในไฟล์เว้นแต่ผู้ใช้ติ๊ก "รวมข้อมูลส่วนบุคคล" และตัวกรองที่อ้างคอลัมน์ซ่อนถูกข้ามเหมือน `/render` แต่หน้า Data Export (`GET /api/v1/export/active/{table}` ใน `data_export.py`) ยังส่งออกทุกคอลัมน์รวมคอลัมน์ส่วนบุคคล และไม่ต้อง login (ตรวจจากโค้ด ณ 2026-10-08) ข้อมูลส่วนบุคคลจึงยังออกทางนั้นได้
```

(ง) Flow ข้อ 7 แทน:

```markdown
7. กรอง/คลิกกราฟ (drill-down) -> `POST /render` (ไม่ใช้ AI คำนวณใหม่ด้วย pandas ตามตัวกรอง)
```

ด้วย:

```markdown
7. กรอง/คลิกกราฟ (drill-down) -> `POST /render` (ไม่ใช้ AI คำนวณใหม่ด้วย pandas ตามตัวกรอง)
   - กด "ส่งออก CSV" -> `POST /export` ด้วยตัวกรองชุดเดียวกัน -> ได้ไฟล์ CSV ของแถวหลังกรอง (ไม่ใช้ AI ไม่มีคอลัมน์ส่วนบุคคลถ้าไม่ติ๊ก)
```

(จ) สรุปท้ายหน้า แทน:

```markdown
กรอง/คลิกกราฟเพื่อเจาะลึก สั่ง AI ปรับแก้
```

ด้วย:

```markdown
กรอง/คลิกกราฟเพื่อเจาะลึก ส่งออกแถวที่กรองแล้วเป็นไฟล์ CSV สั่ง AI ปรับแก้
```

- [ ] **Step 2: อัปเดต `docs/create-dashboard-improvement-proposal.md`**

(ก) หัวข้อ 7 แทนแถว:

```markdown
| 6. ต่อกับเครื่องมือ BI | ส่งออก spec หรือข้อมูลที่กรองแล้ว | กลาง | เปลี่ยนจากคู่แข่งเป็นส่วนเสริมของทีม BI |
```

ด้วย:

```markdown
| 6. ต่อกับเครื่องมือ BI (ทำแล้ว 2026-10-08) | ส่งออกแถวข้อมูลที่กรองแล้วเป็น CSV (UTF-8 มี BOM) ให้ทีม BI ทำต่อใน Excel หรือ Power BI คอลัมน์ส่วนบุคคลออกเฉพาะเมื่อผู้ใช้ติ๊กเลือกและมี log ทุกครั้ง (เจ้าของระบบเลือกไม่ส่งออก spec หรือ data dictionary) | กลาง | เปลี่ยนจากคู่แข่งเป็นส่วนเสริมของทีม BI |
```

(ข) ท้ายหัวข้อ 7 (ก่อนหัวข้อ 8) แทน:

```markdown
---

## 8. คำถามที่กรรมการอาจถาม
```

ด้วย:

```markdown
**ระยะ 6 ทำแล้ว (2026-10-08)** ตามแผน `docs/superpowers/plans/2026-10-08-create-dashboard-bi-export.md`: ปุ่ม "ส่งออก CSV" ในขั้นแดชบอร์ดส่งแถวชุดเดียวกับที่แดชบอร์ดคำนวณ (`POST /api/v1/dashboards/export`, `dashboard_export.py`) หัวคอลัมน์ใช้ชื่อที่แสดงจาก Semantic Layer กันสูตรใน Excel (CSV injection) และส่งออกได้ไม่เกิน 1,000,000 แถวหลังกรอง

---

## 8. คำถามที่กรรมการอาจถาม
```

(ค) คำถามกรรมการ แทน:

```markdown
(ข้อเสนอระยะ 6 จะทำให้ส่งต่อให้ BI ได้)
```

ด้วย:

```markdown
(ระยะ 6 ทำแล้ว: ส่งแถวที่กรองแล้วเป็นไฟล์ CSV ให้ทีม BI ทำต่อใน Power BI หรือ Excel)
```

(ง) ภาคผนวก "มีแล้ว" ต่อท้ายบรรทัด แทน:

```markdown
และ ES ล่มได้ 503
```

ด้วย:

```markdown
และ ES ล่มได้ 503 | ส่งออกแถวที่กรองแล้วเป็น CSV จากขั้นแดชบอร์ด (`POST /api/v1/dashboards/export`, `dashboard_export.py`: UTF-8 มี BOM, หัวคอลัมน์จากชื่อที่แสดง, กัน CSV injection, ไม่เกิน 1,000,000 แถว, คอลัมน์ส่วนบุคคลออกเฉพาะเมื่อผู้ใช้ติ๊กและมี log ทุกครั้ง) (ระยะ 6)
```

(จ) ภาคผนวก "ยังไม่มี" แทน:

```markdown
| การค้นหา Insight | การส่งออกไปเครื่องมือ BI
```

ด้วย:

```markdown
| การค้นหา Insight | การส่งออก spec แดชบอร์ดหรือ data dictionary ไปเครื่องมือ BI และการเชื่อม Power BI แบบสด (ระยะ 6 ส่งออกเฉพาะแถวข้อมูลเป็นไฟล์ CSV) | ไฟล์ส่งออกเกิน 1,000,000 แถว | การซ่อนข้อมูลส่วนบุคคลและการบังคับ login ในหน้า Data Export (`/api/v1/export/*` ยังส่งออกทุกคอลัมน์)
```

- [ ] **Step 3: ตรวจเอกสาร**

Run: `cd /c/ETL/.claude/worktrees/bi-export && git diff --numstat docs/ && grep -c "ส่งออก CSV" docs/ui-analysis/06-create-dashboard.md && grep -c "ทำแล้ว 2026-10-08" docs/create-dashboard-improvement-proposal.md`
Expected: `6 4 docs/create-dashboard-improvement-proposal.md` และ `8 1 docs/ui-analysis/06-create-dashboard.md` แล้ว `3` และ `1` (ตรวจด้วยการแก้สำเนาตอนเขียนแผน)

- [ ] **Step 4: รันเทสต์ทั้งสองฝั่งอีกครั้ง**

Run: `cd /c/ETL/.claude/worktrees/bi-export/services/api && python -m pytest tests -q -p no:cacheprovider` แล้ว `cd /c/ETL/.claude/worktrees/bi-export/services/ui && npx vitest run`
Expected: API `9 failed, 686 passed` (9 ตัวเดิมใน `tests/test_whitebox_engine.py`); UI `Tests 300 passed (300)`

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/bi-export && git add docs/ui-analysis/06-create-dashboard.md docs/create-dashboard-improvement-proposal.md && git commit -m "docs(dashboard): describe the CSV export of filtered rows (phase 6)"
```

**ส่วน B (ผู้ควบคุม หลัง merge branch เข้า working tree หลัก `C:\ETL`):** ถ้าขั้นใดไม่ผ่าน ให้หยุดและรายงานพร้อม log ห้ามแก้โค้ดในส่วนนี้ ชุดข้อมูลที่ใช้คือ `global_ecommerce_sales` (จากแผนระยะ 5: 2,000 แถว 15 คอลัมน์ `Order_ID, Order_Date, Customer_Name, Customer_Segment, Country, Region, Product_Category, Product_Name, Quantity, Unit_Price, Discount_Percent, Total_Sales, Shipping_Cost, Profit, Payment_Method` และ `Customer_Name` เป็นคอลัมน์ส่วนบุคคล)

- [ ] **Step 6: รันเทสต์ใน working tree หลักแล้ว build**

Run: `cd /c/ETL/services/api && python -m pytest tests -q -p no:cacheprovider` (คาด 695 ผ่าน = 686 + 9 ตัวที่ล้มเฉพาะใน worktree) และ `cd /c/ETL/services/ui && npx vitest run` (300) แล้ว `cd /c/ETL && docker compose up -d --build api ui`
Expected: container `sdoqap-api` และ `sdoqap-ui` healthy; `curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"table_name":"global_ecommerce_sales"}' http://localhost/api/v1/dashboards/export` ได้ `401`

- [ ] **Step 7: ส่งออกผ่าน container (สร้าง session token ใน container เอง ไม่ต้องใช้รหัสผ่าน)**

Run:

```bash
docker exec -i sdoqap-api python - <<'EOF'
import csv, io, requests
from app.api.auth import SESSION_COOKIE_NAME, create_session_token
from app.api import dashboard_data
base = "http://localhost:8000/api/v1/dashboards"
jar = {SESSION_COOKIE_NAME: create_session_token("controller")}
table = "global_ecommerce_sales"
df, _ = dashboard_data.load_active_dataset(table)
names = set(df["Customer_Name"].dropna().astype(str))
region = sorted(df["Region"].dropna().astype(str).unique())[0]
sel = {"Region": {"values": [region]}}
spec = {"filters": [{"column": "Region"}], "widgets": [{"id": "c", "type": "kpi", "metric": {"agg": "count", "column": None}}]}
shown = requests.post(base + "/render", json={"table_name": table, "spec": spec, "selections": sel}, cookies=jar, timeout=60).json()["data"]["rows_after_filter"]

def export(**extra):
    r = requests.post(base + "/export", json={"table_name": table, "selections": sel, **extra}, cookies=jar, timeout=120)
    return r, list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"), newline="")))

r, rows = export()
print("status", r.status_code, r.headers["content-type"], r.headers["content-disposition"])
print("bom", r.content[:3] == b"\xef\xbb\xbf")
print("header", rows[0])
print("rows", len(rows) - 1, "dashboard", shown)
print("names_in_default_file", sum(c in names for row in rows[1:] for c in row))
print("negative_numbers_with_apostrophe", sum(c.startswith("'-") and c[2:].replace(".", "", 1).isdigit() for row in rows[1:] for c in row))
r2, rows2 = export(include_personal=True)
print("status_personal", r2.status_code, "extra_columns", [h for h in rows2[0] if h not in rows[0]])
print("names_in_personal_file", sum(c in names for row in rows2[1:] for c in row))
EOF
```

Expected: `status 200 text/csv; charset=utf-8 attachment; filename="global_ecommerce_sales_<วันนี้ YYYYMMDD>.csv"`; `bom True`; `header` มี 14 คอลัมน์ (15 ลบ `Customer_Name` ถ้าความหมายที่บันทึกไว้ซ่อนแค่คอลัมน์นี้; ถ้าซ่อนมากกว่านั้นให้บันทึกรายชื่อไว้ในรายงาน) ไม่มี `Customer_Name` หรือชื่อที่แสดงของมัน และใช้ชื่อที่แสดงจาก semantic layer ที่บันทึกไว้; `rows N dashboard N` (สองตัวเลขเท่ากัน); `names_in_default_file 0`; `negative_numbers_with_apostrophe 0`; `status_personal 200 extra_columns [<หัวคอลัมน์ของ Customer_Name>]` (หนึ่งคอลัมน์); `names_in_personal_file` เท่ากับจำนวนแถว N (หรือน้อยกว่าเท่าจำนวนค่าว่าง)

- [ ] **Step 8: ตรวจ log**

Run: `docker logs sdoqap-api --since 10m 2>&1 | grep "Dashboard CSV export"`
Expected: บรรทัด `INFO:app.api.dashboards:Dashboard CSV export: user=controller table=global_ecommerce_sales rows=N include_personal=False` และ `WARNING:app.api.dashboards:Dashboard CSV export with personal columns: user=controller table=global_ecommerce_sales rows=N columns=Customer_Name` ไม่มีชื่อลูกค้าคนใดใน log

- [ ] **Step 9: เดิน flow ใน browser** (ผู้ใช้ login เอง ห้ามพิมพ์รหัสผ่านแทน)

เปิด `http://localhost/dashboard-builder` แล้วทำและตรวจตามลำดับ:

1. เลือก `global_ecommerce_sales` สร้างแดชบอร์ด (หรือเปิดแดชบอร์ดที่บันทึกไว้ของชุดนี้)
2. ในขั้นแดชบอร์ด ปุ่ม "ส่งออก CSV" อยู่ข้างบรรทัด "X จาก 2,000 แถว" และมีช่องติ๊ก "รวมข้อมูลส่วนบุคคล" ที่ยังไม่ติ๊ก
3. เลือกตัวกรองหนึ่งค่า (หรือคลิกแท่งกราฟ) จดตัวเลข X แล้วกด "ส่งออก CSV" ได้ไฟล์ `global_ecommerce_sales_<วันนี้>.csv`
4. เปิดไฟล์ใน Excel: หัวคอลัมน์ภาษาไทยอ่านได้ไม่เพี้ยน จำนวนแถวข้อมูลเท่ากับ X ไม่มีคอลัมน์ชื่อลูกค้า ค่า Profit ติดลบเป็นตัวเลข (ชิดขวา รวมได้)
5. ติ๊ก "รวมข้อมูลส่วนบุคคล" คำเตือน "ไฟล์จะมีข้อมูลส่วนบุคคลจากคอลัมน์ Customer_Name ..." ขึ้น กด "ส่งออก CSV" ไฟล์ใหม่มีคอลัมน์ชื่อลูกค้า และช่องติ๊กกลับเป็นไม่ติ๊ก
6. ถ่าย screenshot แถวปุ่มก่อนและหลังติ๊กให้ผู้ใช้ดูในแชต (ไม่ commit รูป ไม่ส่งไฟล์ CSV ที่มีข้อมูลส่วนบุคคลออกนอกเครื่อง และลบไฟล์นั้นหลังตรวจ)

---

## Self-Review

**1. ครอบคลุมความต้องการ (ความต้องการ -> Task):**

| ความต้องการ | Task |
|---|---|
| ส่งออกแถว "หลังตัวกรอง" ชุดเดียวกับที่แดชบอร์ดคำนวณ (`apply_filters` ตัวเดียวกัน จำนวนแถวเท่า `rows_after_filter`) | 2 (เทสต์ `test_the_file_has_the_rows_the_dashboard_counts`), 4 (ส่ง `selections` ของหน้า), 5B ข้อ 7 |
| เป็นตาราง ให้ Power BI / Excel ทำต่อ ไม่ใช่ spec หรือ data dictionary | 1, 2 |
| หัวคอลัมน์ใช้ label จาก semantic layer ไม่มีใช้ชื่อคอลัมน์ ชื่อซ้ำทำให้ไม่ซ้ำ (กติกาเขียนไว้) | 1 (`header_labels`), 2 (อ่าน `view["effective"]["columns"]`) |
| คอลัมน์ส่วนบุคคลไม่อยู่ในไฟล์โดยค่าเริ่มต้น | 2 (หลายเทสต์ รวมกรณีไม่มี ES และฉบับอนุมัติ), 4 |
| ช่องติ๊กขึ้นเฉพาะเมื่อมีคอลัมน์ซ่อน คำเตือนไทย ค่าเริ่มต้นไม่ติ๊ก ผู้ใช้ที่ login ทุกคนเลือกได้ | 4 (`ExportCsv` + 3 เทสต์), 2 (router ต้อง login) |
| ทุกครั้งที่ include_personal มี log (ผู้ใช้ ตาราง จำนวนแถว ไม่มีค่า) | 2 (`test_personal_columns_come_out_only_when_asked_and_the_export_is_logged`), 5B ข้อ 8 |
| คอลัมน์ซ่อนยังซ่อนในทุกที่อื่น | 2 (`_dataset` คืนค่าเดิม เทสต์ dashboards เดิมทั้งหมดผ่าน), Global Constraints |
| CSV UTF-8 มี BOM, RFC 4180, `Content-Disposition` `<table>_<YYYYMMDD>.csv` ทำความสะอาดชื่อ, `text/csv` | 1, 2, 5B ข้อ 7 |
| endpoint, POST, login, 404, 422 | 2 (คำตัดสินข้อ 1) |
| ตัวกรองมาจากไหน, ตัวกรองบนคอลัมน์ซ่อนถูกข้าม, spec ไม่มีผล | 2, 4 (คำตัดสินข้อ 2, 3) |
| stream หรือในหน่วยความจำ + เพดานแถวที่มีชื่อ + เทสต์ด้วยเพดานเล็ก | 1, 2 (คำตัดสินข้อ 6, `monkeypatch` เป็น 3) |
| กัน CSV injection โดยตัวเลขติดลบยังเป็นตัวเลข | 1 (`test_cells_a_spreadsheet_would_run_get_an_apostrophe`, `test_negative_numbers_stay_numbers`), 2 (`-49.5` ในไฟล์), 5B ข้อ 7 |
| รูปแบบค่า (วันที่ ISO, ว่าง, ไม่มีเลขยกกำลัง, boolean) และลำดับคอลัมน์ตาม profile | 1, 2 |
| ไม่เรียก Groq และอ่าน view ครั้งเดียวต่อคำขอ | 2 (`test_one_export_reads_the_semantic_view_once_and_never_calls_the_ai`) |
| ข้อความ error ภาษาไทย | 2 (413, 422), 4 (แสดงใต้ปุ่ม) |
| UI: ปุ่ม "ส่งออก CSV" ใกล้ตัวกรอง, ช่องติ๊ก, ดาวน์โหลดผ่าน helper ที่ส่ง cookie และจัดการ 401, busy/disabled, error, ไม่กดซ้ำ | 3, 4 |
| เอกสาร (หัวข้อ 7 ระยะ 6, ภาคผนวก "ยังไม่มี", ui-analysis) | 5 ส่วน A |
| ตรวจกับระบบจริง (rebuild, ส่งออกผ่าน container, Customer_Name ไม่มี/มี, BOM, จำนวนแถวเท่าแดชบอร์ด) | 5 ส่วน B |

**2. Placeholder scan:** ไม่มี TBD, TODO หรือ "ทำแบบเดียวกับ Task N" ทุกขั้นที่แก้โค้ดมีโค้ดเต็มหรือข้อความก่อน/หลังที่ตรงกับไฟล์จริง ข้อความ "ก่อน" ทุกจุดตรวจด้วยสคริปต์แล้วว่าพบในไฟล์ปัจจุบัน (a6981ac) ครั้งเดียวพอดี โค้ดและเทสต์ทั้งหมดของ Task 1 ถึง 4 รันจริงตามลำดับบนสำเนาของ worktree ก่อนเขียนแผน: Task 1 ล้มด้วย `ModuleNotFoundError` แล้ว 16 ผ่าน; Task 2 ล้ม 17 แล้ว 150 ผ่าน (4 ไฟล์) และทั้งชุด 686 ผ่าน + 9 ล้มเดิม; Task 3 ล้ม 4 แล้ว 12 ผ่าน และทั้งชุด 291; Task 4 ล้ม 3 + ไฟล์ใหม่ import ไม่ได้ แล้ว 90 ผ่าน และทั้งชุด 300 (30 ไฟล์) ตัวเลข diff ใน Step ตรวจขนาดมาจาก `git diff --numstat` ของสำเนานั้น

**3. ความสอดคล้องของชื่อข้าม Task:**
- API: `BOM`, `MAX_EXPORT_ROWS`, `CHUNK_ROWS`, `BANGKOK`, `safe_text`, `cell`, `column_formatter`, `header_labels`, `export_filename`, `csv_chunks` (1) -> `_dataset_with_view`, `_dataset`, `ExportPayload`, `export_dashboard_rows`, route `POST /api/v1/dashboards/export` (2)
- UI: `requestFile(url, options, fallbackName)`, `dashboardsApi.exportCsv(table_name, selections, include_personal)`, `mockFetchByUrl` option `headers`/`blob` (3) -> `ExportCsv({table, selections, disabled})`, `DashboardCanvas tools`, `.dbb-canvas-bar`, `.dbb-export`, `.dbb-export-warning` (4)
- ข้อความที่เทสต์ข้าม Task ใช้: "ส่งออก CSV", "รวมข้อมูลส่วนบุคคล", "กำลังเตรียมไฟล์…", คำเตือน "ไฟล์จะมีข้อมูลส่วนบุคคลจากคอลัมน์ ... ระบบบันทึกชื่อผู้ส่งออกไว้", 413 "ข้อมูลหลังกรองมี ... แถว เกินที่ส่งออกได้ ... แถว กรุณาเพิ่มตัวกรองแล้วลองใหม่", 422 "ไม่มีคอลัมน์ที่ส่งออกได้ ทุกคอลัมน์เป็นข้อมูลส่วนบุคคล" ตรงกันระหว่างโค้ดและเทสต์ และไม่มี em dash, en dash, emoji หรือคู่ภาษาในวงเล็บ

**ข้อจำกัดที่รู้:**
- หน้า Data Export (`services/api/app/api/data_export.py`: `GET /api/v1/export/active/{table}`, `/quarantine/{table}`, `/raw/{table}`, `/preview/{layer}/{table}`) ไม่ต้อง login และส่งออกทุกคอลัมน์รวมคอลัมน์ส่วนบุคคล จึงขัดกับ "คอลัมน์ที่ซ่อนต้องยังซ่อนในทุกที่อื่น" มาตั้งแต่ก่อนแผนนี้ อยู่นอกขอบเขต (บันทึกไว้ในเอกสารทั้งสองไฟล์ใน Task 5) ควรเป็นงานแยก
- ตัวอย่าง 20 แถวในขั้น "ดูข้อมูล" ยังแสดงทุกคอลัมน์ตามคำตัดสินข้อ 3 ของระยะ 5 (ผู้ใช้ที่ login เห็นได้อยู่แล้ว)
- ไฟล์ทั้งก้อนอยู่ในหน่วยความจำของ browser ตอนดาวน์โหลดแบบ fetch + blob (ประมาณ 180 MB ที่ 1,000,000 แถว x 15 คอลัมน์) ฝั่ง API ใช้เวลาประมาณ 23 วินาทีต่อ 1,000,000 แถว (วัดบนเครื่อง dev) ระหว่างนั้นปุ่มขึ้น "กำลังเตรียมไฟล์…"
- `'` ที่เติมกัน CSV injection มองเห็นได้ใน Excel และ Power BI สำหรับข้อความที่ขึ้นต้นด้วย `=`, `+`, `-`, `@` (เช่นเบอร์โทร `+66 81 ...`)
- log ของการส่งออกอยู่ใน stdout ของ container (`docker logs`) ยังไม่ได้เก็บลง Elasticsearch เป็น audit trail ถาวร
