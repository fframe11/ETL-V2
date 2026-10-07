# Create Dashboard Semantic Layer Implementation Plan (ระยะ 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้แต่ละชุดข้อมูลมีความหมายของคอลัมน์ (บทบาท ชื่อที่แสดง หน่วย สกุลเงิน ข้อมูลส่วนบุคคล) และนิยาม metric กลางที่ AI ร่างและคนอนุมัติ แล้วให้ Create Dashboard ทุกเส้นทาง (สร้าง ปรับ วาด บันทึก คำแนะนำ และ AI) ใช้ความหมายนี้ แสดงหน่วยถูก ทำ KPI อัตราส่วนได้ และไม่ให้คอลัมน์ข้อมูลส่วนบุคคลถึง LLM หรือขึ้นบนแดชบอร์ด

**Architecture:** ฝั่ง API เพิ่มโมดูลฟังก์ชันล้วน `semantic_layer.py` (กฎเดาจากชื่อคอลัมน์ ตัวตรวจแบบ whitelist และการประกอบ "view" ที่รวมสถานะ drift และคอลัมน์ที่ต้องซ่อน) `semantic_llm.py` (ให้ Groq ร่าง) และ router `semantic.py` ที่เก็บเอกสารใน ES index `sdoqap_semantic_layer` แล้ว `dashboards.py` อ่าน view ครั้งเดียวต่อคำขอผ่าน `_dataset()` ตัดคอลัมน์ที่ซ่อนออกจาก profile ด้วย `apply_to_profile` ก่อนส่งต่อให้ `validate_spec`, `compute_dashboard` (ที่คำนวณ metric แบบ where/ratio ได้), พรอมต์ของ AI และกฎคำแนะนำ ฝั่ง UI เพิ่มตัวแก้ความหมายคอลัมน์และแผง metric ในขั้น "ดูข้อมูล" และแสดงตัวเลขตามรหัสสกุลเงิน

**Tech Stack:** FastAPI 0.100 + pandas 2.3 (container `sdoqap-api` Python 3.10, เครื่อง dev Python 3.14), Elasticsearch 8, Groq ผ่าน `requests`, pytest; React 18 + Vitest 2 + Testing Library; Git Bash บน Windows

**Spec:** [`docs/superpowers/specs/2026-10-02-semantic-layer-design.md`](../specs/2026-10-02-semantic-layer-design.md) (แหล่งความจริงของพฤติกรรม) แผนนี้แทนแผนเดิม `docs/superpowers/plans/2026-10-02-semantic-layer.md` ที่เขียนไว้ก่อนโค้ด Create Dashboard เปลี่ยน (ใช้โค้ดของโมดูลใหม่จากแผนเดิมเกือบทั้งหมด แต่ทุกจุดที่แก้ไฟล์เดิมเขียนใหม่ตามโค้ดปัจจุบัน และตรวจรันจริงแล้วทั้งชุดก่อนเขียนแผน) เอกสารประกอบ: `docs/create-dashboard-improvement-proposal.md` (หัวข้อ 3 และ 7: เมื่อทำ Semantic Layer แล้วให้กฎคำแนะนำใช้ role/label แทนการเดาจากชื่อ)

## คำตัดสินที่ทำระหว่างเขียนแผน (ผู้ควบคุมโปรดยืนยัน)

spec ไม่ได้ระบุ หรือโค้ดปัจจุบันต่างจากสิ่งที่ spec สมมติไว้ แผนนี้เลือกดังนี้:

1. **พารามิเตอร์ `metrics=None` แทน `semantic=None`** ใน `validate_spec(raw, profile, metrics=None)` และ `compute_dashboard(df, spec, profile, selections=None, metrics=None)` (spec 11.1 และ 11.2 เขียน `semantic=None`) เพราะความหมายของคอลัมน์ติดมากับ profile แล้วผ่าน `apply_to_profile` สิ่งที่ยังขาดมีแค่รายการนิยาม metric (`view["effective"]["metrics"]`)
2. **อ่าน semantic view ครั้งเดียวต่อคำขอ** ใน `dashboards._dataset()` (ES 2 ครั้ง: `indices.exists` + `search`) ทุกเส้นที่ใช้ profile: `generate`, `refine`, `render`, `POST/PUT /saved`, `GET /datasets/{t}/suggestions`, `POST /suggest-changes`, `POST /rank-suggestions`
3. **ตัวอย่าง 20 แถว (`GET /datasets/{t}/preview`) ไม่ซ่อนอะไร** แสดงทุกคอลัมน์และทุกค่าเหมือนเดิม แล้ว UI ติดป้าย "ส่วนบุคคล" ที่หัวคอลัมน์ใน `hidden_columns` ตาม spec 12 ตรงตัว (spec 11.4 ซ่อนจาก "แดชบอร์ด" และ LLM) ตัวอย่างนี้มีไว้ให้ผู้ใช้ที่ login ตรวจข้อมูลก่อนอนุมัติ และไม่เคยถูกส่งให้ Groq
4. **`GET /saved/{id}` คืนสเปกที่เก็บไว้ตามเดิม ไม่ตรวจซ้ำ** (ไม่ต้องโหลดชุดข้อมูลทั้งก้อนแค่เพื่อเปิด) หน้า UI เปิดแดชบอร์ดที่บันทึกไว้ด้วย `POST /render` เสมอ ซึ่งตรวจซ้ำกับ semantic view ปัจจุบันและตอนนี้คืน `warnings` ที่ UI แสดงใน "หมายเหตุ" ส่วน `POST/PUT /saved` ตรวจกับ semantic view ก่อนเก็บ วิดเจ็ตที่อ้างคอลัมน์ซ่อนจึงไม่ถูกเก็บ
5. **`metric_values` คำนวณเฉพาะใน `/api/v1/semantic/*`** จากเฟรมที่แคชไว้ทั้งชุด (ไม่เกิน 20 metric คำนวณด้วย pandas ตรงๆ) เส้นของแดชบอร์ดไม่คำนวณ เพราะไม่ได้แสดง
6. **วิดเจ็ต `count`, `count_distinct`, `count_missing` ได้ `format: "number"` เสมอ** แม้ไม่มี semantic (spec 11.1 ให้ count เป็น number ส่วน "currency" บนการนับเป็นค่าที่ LLM ใส่ผิดอยู่แล้ว)
7. **หน่วย `percent` ได้ `format: "percent"` เมื่อ agg ไม่ใช่ `sum`** (ผลรวมของเปอร์เซ็นต์ไม่ใช่เปอร์เซ็นต์) หน่วยอื่นที่ไม่ใช่ currency ได้ `number`
8. **`is_identifier` คง heuristic เดิม (จำนวนเต็มที่ค่าไม่ซ้ำเกือบทุกแถว หรือ 9 หลักขึ้นไป) และเพิ่ม `role == "identifier"`** ไม่ให้ role อื่นลบล้าง heuristic เพราะ heuristic นี้กันไม่ให้ค่า min/max ที่เป็นเลขบัตร/เบอร์จริงหลุดไปในพรอมต์ ผลคือคอลัมน์ที่อนุมัติเป็น measure แต่หน้าตาเหมือนรหัส ยังไม่ถูกเสนอเป็นตัววัดในคำแนะนำ (แต่ยังสร้างวิดเจ็ตได้ `validate_spec` บล็อกเฉพาะ role identifier)
9. **กฎคำแนะนำเปลี่ยนน้อยที่สุด:** ตัด role `identifier` ออกจากทุกกลุ่ม ตัวเลขที่ role ไม่ใช่ `measure` ไม่ถูกเสนอเป็นตัววัด และใช้ `default_agg` แทนการเดา sum/avg จากชื่อ การเลือก "ตัววัดหลัก" ยังใช้คำในชื่อ (`_hint_rank`) เหมือนเดิม ข้อความคำแนะนำยังมีชื่อคอลัมน์จริง (ตัวตรวจการเรียบเรียงของ AI ต้องใช้) ไม่แทนด้วย label
10. **ES ล่มระหว่างสร้างแดชบอร์ด:** view มีสถานะ `unavailable` และ `effective` มาจากร่างแบบกฎ (spec 9 และ 11.4) แดชบอร์ดแบบกฎจึงขึ้น KPI จาก metric ของกฎ (`row_count`, `total_<คอลัมน์เงิน>`) ก่อน
11. **ชุดข้อมูล `_quality_runs`** ใช้ index เดียวกันเหมือนตารางอื่น (spec 4.3) id เอกสารคือ `_quality_runs`
12. **ป้าย "ส่วนบุคคล" ในตัวอย่างข้อมูลใช้ `view.hidden_columns` ที่บันทึกแล้ว** ไม่เปลี่ยนตามช่องติ๊กที่ยังไม่บันทึก
13. **spec 11.5 "ชื่อ series ใช้ column_labels":** ชื่อ series ของกราฟคือค่าของหมวดหมู่ (หรือชื่อวิดเจ็ตเมื่อมี series เดียว) ไม่ใช่ชื่อคอลัมน์ แผนนี้จึงใช้ `column_labels` กับหัวตาราง ชิปตัวกรองจากการคลิกกราฟ และใช้ label ฝั่งเซิร์ฟเวอร์กับชื่อวิดเจ็ตเริ่มต้นและชื่อตัวกรองเริ่มต้น
14. **ฟอร์ม metric มีช่อง "รหัส" (ไม่บังคับ)** ว่างไว้ให้เซิร์ฟเวอร์สร้างจาก label (spec 12 "id สร้างจาก label ได้") label ภาษาไทยล้วนได้ id `metric`, `metric_2`, ...
15. **การร่างด้วย AI ลองซ้ำเฉพาะเมื่อคำตอบแรกกลับมาภายใน `RETRY_BUDGET_S` (25 วินาที)** เหมือนการสร้างแดชบอร์ด เพราะ proxy หน้า (`infra/nginx/nginx.conf`) ตัดคำขอที่ 60 วินาที และ Groq มี timeout 20 วินาทีต่อครั้ง
16. **พรอมต์ร่าง semantic ส่ง `hint_pii` ด้วย** (spec 6 "hint จากร่างแบบกฎ (role, pii)" แผนเดิมส่งแค่ role)
17. **ตารางในแดชบอร์ด:** คอลัมน์ที่สเปกขอแต่ไม่อยู่ใน profile (รวมคอลัมน์ที่ถูกซ่อน) ตอนนี้ขึ้น warning (spec 11.4) เดิมตัดเงียบๆ
18. **ทดสอบกับระบบจริงทำโดยผู้ควบคุมหลัง merge** (Task 13 ส่วน B) เหมือนแผนระยะก่อน executor ของแต่ละ Task ห้ามรัน docker
19. **เอกสาร:** แก้ `docs/ui-analysis/06-create-dashboard.md` และภาคผนวกของ `docs/create-dashboard-improvement-proposal.md` (แผนเดิมแก้ `README.md` แผนนี้ไม่แก้)
20. **em dash เดิม `—`** ที่ `formatValue` คืนเมื่อไม่มีค่า (มีเทสต์ล็อกไว้) และใน `TableWidget`, `DatasetPicker` เป็นของเดิม อยู่นอกขอบเขต แผนนี้ไม่แตะ และโค้ดใหม่ไม่เพิ่ม em dash หรือ en dash

**ไม่ทำในแผนนี้ (spec หัวข้อ 3 และ 15):** Spark อ่าน semantic layer, Gold/data mart, สูตรอิสระ, metric ข้ามชุดข้อมูล, ระบบสิทธิ์, แท็บแก้ไขในหน้า Catalog

## Global Constraints

- ทำใน worktree `C:\ETL\.claude\worktrees\semantic-layer` (Git Bash: `/c/ETL/.claude/worktrees/semantic-layer`) บน branch `feat/semantic-layer` ห้ามแตะไฟล์ใน `C:\ETL` โดยตรง ห้าม commit ลง `main` หรือ `feat/generic-profiling-rule-engine` ห้าม push
- Commit message แบบ conventional (`feat(semantic): ...`, `feat(dashboard): ...`, `docs(dashboard): ...`) **ไม่ใส่ attribution line ใดๆ** (ไม่มี `Co-Authored-By`, ไม่มี `Generated with`)
- stage เฉพาะไฟล์ที่ Task ระบุ ห้ามใช้ `git add -A`, `git add .` หรือ `git commit -a`
- **Line ending:** `services/api/app/api/dashboard_compute.py` และ `dashboard_data.py` เป็น **CRLF** ไฟล์อื่นที่แผนนี้แตะเป็น LF (ตรวจด้วย `git ls-files --eol <ไฟล์>`) แก้ไฟล์เดิมด้วย Edit tool เท่านั้น ห้ามเขียนทับทั้งไฟล์ด้วยสคริปต์ Python แบบ text mode (Windows จะเปลี่ยน line ending ทั้งไฟล์ และ Python บนเครื่องนี้ใช้ encoding เริ่มต้น cp874 ซึ่งอ่านไฟล์ไทย UTF-8 ไม่ได้) หลังแก้ให้ดู `git diff --stat` ว่าจำนวนบรรทัดเท่าที่ Task บอก ไม่ใช่ทั้งไฟล์ ไฟล์ใหม่สร้างด้วย Write tool (LF)
- **ความเป็นส่วนตัว (spec 1, 6, 11.3, 11.4):** พรอมต์ที่ส่ง Groq ทั้งของ semantic และของแดชบอร์ด (สร้าง ปรับ เรียบเรียงคำแนะนำ) ห้ามมีค่าในเซลล์ และห้ามมีชื่อคอลัมน์ที่อยู่ใน `hidden_columns` คอลัมน์ซ่อนต้องถูกตัดออกจาก profile ก่อนถึงกฎคำแนะนำ พรอมต์ และ `validate_spec` เทสต์ต้องพิสูจน์ด้วยค่าที่รู้ว่าไม่ควรหลุด
- **การซ่อน pii (spec 8 ข้อ 5):** คอลัมน์ที่อยู่ในฉบับอนุมัติใช้ `pii` ของฉบับอนุมัติ คอลัมน์ที่ไม่อยู่ในฉบับอนุมัติซ่อนเมื่อร่างหรือกฎชื่อคอลัมน์บอก pii ES ล่มก็ยังซ่อนตามกฎชื่อคอลัมน์
- ห้ามรันสูตรหรือ expression ที่มาจาก LLM หรือ browser ทุกอย่างผ่าน `validate_semantic()` หรือ `validate_spec()`
- AI ถูกเรียกเฉพาะเมื่อผู้ใช้กดปุ่ม ("ให้ AI ร่าง", "สร้างแดชบอร์ดด้วย AI", "ปรับแดชบอร์ด", "เรียบเรียงด้วย AI") ไม่เรียกอัตโนมัติตอนเปิดขั้น
- คีย์ Groq ให้เจ้าของระบบใส่เอง ห้ามพิมพ์ คัดลอก หรือแสดงค่าคีย์
- ทุก route ใหม่ต้อง login (`require_session` ระดับ router เหมือน `dashboards.py`)
- **ข้อความบนหน้าจอ (กติกาของโปรเจกต์):** เป็นภาษาไทย (ยกเว้นชื่อเฉพาะ ชื่อคอลัมน์ และคำว่า metric/AI) ห้ามมี em dash `—` หรือ en dash `–` ห้าม emoji ปุ่มใช้คำสั้น 1 ถึง 3 คำ ห้ามเขียนคู่ภาษาในวงเล็บแบบ `ไทย (English)` ในข้อความเดียว
- **ห้ามมีกุ้งหรือปูในข้อมูลทดสอบ fixture mock หรือ seed ใดๆ** (ผู้ใช้แพ้อาหารทะเลรุนแรง) fixture ในแผนนี้ใช้ยอดขาย ภูมิภาค และชื่อคนสมมติ
- **เทสต์เดิมที่แผนนี้ตั้งใจแก้ (ห้ามแก้เทสต์อื่นให้ผ่าน ถ้าล้มให้หยุดและรายงาน):**
  - `services/ui/src/utils/numberFormat.test.js` เทสต์ "formats currency and percent" (คาด `฿21.9K`) แทนด้วยเทสต์ตามรหัสสกุลเงิน เพราะ spec 11.5 เปลี่ยน `currency` จาก "ใส่ ฿ เสมอ" เป็น "สัญลักษณ์ตามรหัส ไม่มีรหัสไม่ใส่สัญลักษณ์" (Task 9)
  - `services/ui/src/components/builder/DashboardCanvas.test.jsx`: `"฿1.77M"` สองที่เป็น `"$1.77M"` และ class `is-down` เป็น `is-bad` เพราะสี KPI ตัดสินด้วย `higher_is_better` (spec 11.5) และ `services/ui/src/test/dashboardFixtures.js` วิดเจ็ต `w1` ได้ `currency: "USD", higher_is_better: true` (Task 9)
  - `services/ui/src/pages/DashboardBuilder.test.jsx`: `builderRoutes` เพิ่ม route `/semantic/sales` เพราะขั้น "ดูข้อมูล" โหลดความหมายคอลัมน์แล้ว (Task 12) เทสต์ "previews the chosen dataset" ที่หา `"1 (16.67%)"` ผ่านโดยไม่แก้ เพราะตัวเลขนี้ย้ายไปอยู่ในตารางความหมายคอลัมน์
  - `services/api/tests/test_dashboards_api.py` fixture `dataset` และ `services/api/tests/test_dashboard_quality_dataset.py` เทสต์ `test_a_data_quality_dashboard_can_be_generated_and_computed` เพิ่มการแทน `dashboards._es_or_none` (กันเทสต์ไปอ่าน ES จริงบนเครื่องที่เปิด stack อยู่) และ `services/api/tests/test_route_contract.py` เพิ่ม 4 เส้นของ semantic (Task 5, 8)
- **ตั้งค่า worktree ครั้งแรก (ทำแล้วตอนเขียนแผน ตรวจซ้ำได้):** UI ต้องมี junction `services/ui/node_modules` ชี้ไปที่ `C:\ETL\services\ui\node_modules` ตรวจด้วย `ls /c/ETL/.claude/worktrees/semantic-layer/services/ui/node_modules/vitest` ถ้าไม่มีให้สร้างใน PowerShell: `New-Item -ItemType Junction -Path C:\ETL\.claude\worktrees\semantic-layer\services\ui\node_modules -Target C:\ETL\services\ui\node_modules` (git ไม่ติดตาม `node_modules/` อยู่แล้ว)
- **คำสั่งทดสอบ** (Git Bash, path เต็มเสมอ เพราะ cwd ถูกรีเซ็ตทุกคำสั่ง):
  - API ไฟล์เดียว: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/<ไฟล์> -q -p no:cacheprovider`
  - API ทั้งชุด: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests -q -p no:cacheprovider`
  - UI: `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run <ไฟล์หรือโฟลเดอร์>` (ทั้งชุด: `npx vitest run`)
  - **ใน worktree เทสต์ API ทั้งชุดล้ม 9 ตัวเสมอ** ทั้งหมดอยู่ใน `tests/test_whitebox_engine.py` (`test_profiling_engine`, `test_explainable_rules_generation`, `test_pipeline_execution_and_segregation`, `test_ground_truth_benchmark_100_percent_recall`, `test_multi_table_preview`, `test_multi_table_analysis_schema_and_key_matching`, `test_multi_table_join_execution_and_schema_standardization`, `test_app_path_keeps_student_benchmark_split`, `test_gate_split_counts_quarantined_duplicates_in_gate2`) เพราะไฟล์ `data/evaluation/student_course_score_evaluation_dataset/dirty_dataset.csv` ที่ git ไม่ติดตามไม่อยู่ใน worktree ถือเป็นเรื่องสภาพแวดล้อม ล้มนอกจาก 9 ตัวนี้ = ความผิดของงาน
  - ตัวเลขอ้างอิง (ตรวจตอนเขียนแผน): API เริ่มที่ 450 ผ่าน + 9 ล้ม; หลัง Task 1: 479, Task 2: 488, Task 3: 500, Task 4: 506, Task 5: 520, Task 6: 530, Task 7: 538, Task 8: 550 ผ่าน (+ 9 ล้มเดิม) UI เริ่มที่ 229 ผ่าน; หลัง Task 9: 233, Task 10: 250, Task 11: 261, Task 12: 264
  - เทสต์ UI ใช้ `mockFetchByUrl` (`services/ui/src/test/renderPage.jsx`) จับ URL แบบ "มีสตริงนี้อยู่" และ route แรกที่ตรงชนะ **route ที่ยาวกว่าต้องมาก่อนเสมอ** เช่น `/semantic/sales/draft` ก่อน `/semantic/sales`
- **ห้ามรันคำสั่ง docker ใน Task 1 ถึง 13 ส่วน A** (Task 13 ส่วน B เป็นของผู้ควบคุมหลัง merge)

## รูปแบบข้อมูลที่ทุก Task ใช้ร่วมกัน

- **profile** (จาก `dashboard_data.prepare_frame` / `load_active_dataset`): `{"rows", "column_count", "missing_cells", "kind_counts": {kind: n}, "columns": [{"name", "kind": "numeric"|"categorical"|"date"|"text", "dtype", "missing", "missing_pct", "distinct", "min"?, "max"?, "mean"?}]}`
- **meta ของคอลัมน์**: `{"role", "label", "description", "unit", "currency", "duration_unit", "default_agg", "pii"}` (spec 4.1)
- **metric**: `{"id", "label", "description", "type": "simple"|"ratio", "measure" | ("numerator", "denominator"), "format", "currency", "higher_is_better"}` แต่ละส่วนคือ `{"agg", "column", "where": None | {"column", "op", "value"}}` (spec 4.2)
- **view** (`semantic_layer.resolve`): `{"table_name", "status": "none"|"draft"|"approved"|"approved_outdated"|"unavailable", "pending_draft", "version", "effective": {"columns", "metrics"}, "draft", "approved", "drift": {"new_columns", "missing_columns"}, "invalid_metrics": [{"id", "label", "reason"}], "hidden_columns", "history", "warnings"}` และใน response ของ `/api/v1/semantic/*` มี `metric_values: {id: float|None}` เพิ่ม (`POST /draft` มี `engine`, `model` ด้วย)
- **profile หลัง `apply_to_profile`**: คอลัมน์ใน `hidden_columns` ถูกตัด คอลัมน์ที่เหลือได้คีย์ `role`, `label` (ว่างใช้ชื่อคอลัมน์), `unit`, `currency`, `default_agg` เพิ่ม และ `column_count`, `kind_counts` คำนวณใหม่ ฟังก์ชันใดที่อ่าน `c.get("role")` ต้องทำงานเหมือนเดิมเมื่อไม่มีคีย์นี้ (profile ดิบ)

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| Create `services/api/app/api/semantic_layer.py` | whitelist, กฎจากชื่อคอลัมน์, `validate_semantic`, `resolve`, `apply_to_profile` (ไม่มี I/O) | 1, 2 |
| Create `services/api/tests/test_semantic_layer.py`, `test_semantic_resolve.py` | เทสต์กฎ ตัวตรวจ view drift การซ่อน | 1, 2 |
| Modify `services/api/app/api/dashboard_compute.py` (CRLF) | `where_mask`, `evaluate_metric`, `grouped_metric`, `metric_values` แล้วให้วิดเจ็ตใช้นิยาม metric และคืน `column_labels` | 3, 6 |
| Create `services/api/tests/test_dashboard_metrics.py` | เทสต์ตัวคำนวณ metric | 3 |
| Create `services/api/app/api/semantic_llm.py`, `tests/test_semantic_llm.py` | ร่างด้วย Groq | 4 |
| Create `services/api/app/api/semantic.py`, `tests/test_semantic_api.py`; Modify `services/api/main.py`, `tests/test_route_contract.py` | router `/api/v1/semantic` + ES | 5 |
| Modify `services/api/app/api/dashboard_spec.py`; Create `tests/test_dashboard_semantic_spec.py` | `metric_id`, identifier, รูปแบบจากหน่วย, label | 6 |
| Modify `services/api/app/api/dashboard_llm.py`, `dashboard_suggest.py`; Create `tests/test_dashboard_semantic_ai.py` | พรอมต์ แดชบอร์ดแบบกฎ และกฎคำแนะนำอ่านความหมายคอลัมน์ | 7 |
| Modify `services/api/app/api/dashboards.py`, `tests/test_dashboards_api.py`, `tests/test_dashboard_quality_dataset.py`; Create `tests/test_dashboards_semantic.py` | ทุกเส้นของแดชบอร์ดใช้ view และซ่อน pii | 8 |
| Modify `services/ui/src/utils/numberFormat.js` (+test), `components/builder/KpiCard.jsx`, `ChartWidget.jsx`, `TableWidget.jsx`, `DashboardCanvas.jsx` (+test), `test/dashboardFixtures.js`, `pages/DashboardBuilder.css` | สกุลเงิน สี KPI label | 9 |
| Create `services/ui/src/utils/requestJson.js` (+test), `utils/semanticApi.js`, `components/builder/semanticModel.js` (+test), `SemanticStatus.jsx`, `ColumnMetaTable.jsx`, `SemanticEditor.jsx` (+test); Modify `utils/dashboardsApi.js`, `test/dashboardFixtures.js`, `pages/DashboardBuilder.css` | ตารางแก้ความหมายคอลัมน์และแถบสถานะ | 10 |
| Create `services/ui/src/components/builder/MetricPanel.jsx` (+test); Modify `semanticModel.js` (+test), `SemanticEditor.jsx` (+test), `pages/DashboardBuilder.css` | แผง metric | 11 |
| Modify `services/ui/src/components/builder/DataPreview.jsx`, `pages/DashboardBuilder.jsx`, `pages/DashboardBuilder.test.jsx` | ใส่ในขั้น "ดูข้อมูล" | 12 |
| Modify `docs/ui-analysis/06-create-dashboard.md`, `docs/create-dashboard-improvement-proposal.md` | เอกสาร + ตรวจกับระบบจริง | 13 |

---

### Task 1: กฎจากชื่อคอลัมน์และตัวตรวจ (`semantic_layer.py` ส่วนที่ 1)

**Files:**
- Create: `services/api/app/api/semantic_layer.py`
- Test: `services/api/tests/test_semantic_layer.py`

**Interfaces:**
- Consumes: profile ของ `dashboard_data.prepare_frame()` (ใช้ `columns[].name`, `kind`, `min`, `max`) ไม่มี import จากโมดูลอื่นในโปรเจกต์
- Produces (ใช้ใน Task 2, 4, 5):
  - ค่าคงที่ `ROLES`, `UNITS`, `DURATION_UNITS`, `DEFAULT_AGGS`, `METRIC_TYPES`, `METRIC_AGGS`, `NUMERIC_AGGS`, `WHERE_OPS`, `METRIC_FORMATS`, `MAX_METRICS = 20`, `MAX_IN_VALUES = 50`, `MAX_RULE_MONEY_METRICS = 5`
  - `class SemanticError(ValueError)`
  - `tokens(name) -> list[str]`, `is_pii_name(name) -> bool`
  - `rule_column(col) -> meta`, `rule_draft(profile) -> {"columns": {name: meta}, "metrics": [metric]}`
  - `slug(text) -> str`, `unique_id(text, used) -> str`, `metric_columns(metric) -> list[str]` (เรียงชื่อ ไม่ซ้ำ)
  - `clean_column(item, col, warnings) -> meta`, `clean_metric(item, by_name, used) -> (metric | None, reason | None)` โดย `by_name = {name: profile column}`
  - `validate_semantic(raw, profile) -> ({"columns", "metrics"}, warnings)` raise `SemanticError` เมื่อ `raw` ไม่ใช่ dict เท่านั้น

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_semantic_layer.py`:

```python
import os
import sys

import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import semantic_layer as sl  # noqa: E402


def col(name, kind, **extra):
    return {"name": name, "kind": kind, "distinct": 10, "missing_pct": 0.0, **extra}


PROFILE = {"rows": 100, "columns": [
    col("Order_ID", "text"), col("Order_Date", "date"), col("Customer_Name", "text"),
    col("Product_Name", "categorical"), col("Country", "categorical"),
    col("Total_Sales", "numeric", min=5.0, max=900.0), col("Profit", "numeric", min=-20.0, max=300.0),
    col("Discount_Percent", "numeric", min=0.0, max=30.0), col("Quantity", "numeric", min=1, max=9),
    col("Customer_Age", "numeric", min=18, max=80), col("duration_seconds", "numeric", min=0.1, max=40.0),
    col("Rating", "numeric", min=1, max=5),
]}
BY_NAME = {c["name"]: c for c in PROFILE["columns"]}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio",
         "numerator": {"agg": "sum", "column": "Profit"}, "denominator": {"agg": "sum", "column": "Total_Sales"},
         "format": "percent"}


def test_tokens_split_snake_and_camel_case():
    assert sl.tokens("CustomerName") == ["customer", "name"]
    assert sl.tokens("Order_ID") == ["order", "id"]
    assert sl.tokens("OrderID") == ["order", "id"]
    assert sl.tokens("ราคา ต่อหน่วย") == ["ราคา", "ต่อหน่วย"]


@pytest.mark.parametrize("name", ["Customer_Name", "CustomerName", "email", "e_mail", "Phone_Number",
                                  "date_of_birth", "name", "username", "ชื่อลูกค้า", "ที่อยู่จัดส่ง", "id_card"])
def test_personal_column_names(name):
    assert sl.is_pii_name(name) is True


@pytest.mark.parametrize("name", ["Product_Name", "Hotel_Rating", "Total_Sales", "ชื่อสินค้า", "Country", "Paid"])
def test_ordinary_column_names(name):
    assert sl.is_pii_name(name) is False


def test_rules_guess_role_unit_and_aggregation_from_names_and_kinds():
    columns = sl.rule_draft(PROFILE)["columns"]
    summary = {n: (m["role"], m["unit"], m["default_agg"]) for n, m in columns.items()}
    assert summary == {
        "Order_ID": ("identifier", None, None), "Order_Date": ("time", None, None),
        "Customer_Name": ("text", None, None), "Product_Name": ("dimension", None, None),
        "Country": ("dimension", None, None), "Total_Sales": ("measure", "currency", "sum"),
        "Profit": ("measure", "currency", "sum"), "Discount_Percent": ("measure", "percent", "avg"),
        "Quantity": ("measure", "count", "sum"), "Customer_Age": ("measure", "number", "avg"),
        "duration_seconds": ("measure", "duration", "avg"), "Rating": ("measure", "number", "sum"),
    }
    assert columns["Customer_Name"]["pii"] is True and columns["Product_Name"]["pii"] is False
    assert columns["Total_Sales"]["currency"] is None
    assert columns["duration_seconds"]["duration_unit"] == "seconds"


def test_rules_read_thai_names_and_need_a_0_to_100_range_for_percent():
    assert sl.rule_column(col("ยอดขาย", "numeric", min=0, max=10))["unit"] == "currency"
    assert sl.rule_column(col("อายุ", "numeric", min=1, max=90))["default_agg"] == "avg"
    assert sl.rule_column(col("จำนวนชิ้น", "numeric", min=1, max=9))["unit"] == "count"
    assert sl.rule_column(col("Conversion_Rate", "numeric", min=0, max=250))["unit"] == "number"
    assert sl.rule_column(col("Profit_Margin", "numeric", min=0, max=60))["unit"] == "percent"


def test_rule_metrics_are_row_count_and_money_totals():
    metrics = sl.rule_draft(PROFILE)["metrics"]
    assert [m["id"] for m in metrics] == ["row_count", "total_total_sales", "total_profit"]
    assert metrics[1]["measure"] == {"agg": "sum", "column": "Total_Sales", "where": None}
    assert metrics[1]["format"] == "currency"


def test_validate_keeps_good_values_and_repairs_bad_ones_with_reasons():
    raw = {"columns": {
        "Total_Sales": {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "usd", "default_agg": "sum"},
        "Customer_Name": {"role": "measure", "pii": False},
        "Country": {"role": "dimension", "unit": "currency", "currency": "THB"},
        "Profit": {"role": "measure", "unit": "dollars", "currency": "dollar"},
        "Ghost": {"role": "dimension"},
    }, "metrics": []}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    columns = semantic["columns"]
    assert "Ghost" not in columns
    assert columns["Total_Sales"]["currency"] == "USD" and columns["Total_Sales"]["label"] == "ยอดขาย"
    assert columns["Customer_Name"]["role"] == "text" and columns["Customer_Name"]["pii"] is False
    assert columns["Country"]["unit"] is None and columns["Country"]["currency"] is None
    assert columns["Profit"]["unit"] == "currency" and columns["Profit"]["currency"] is None
    text = " ".join(warnings)
    for reason in ("Ghost", "Customer_Name", "dollars", "dollar"):
        assert reason in text


def test_validating_a_validated_semantic_changes_nothing():
    first, _ = sl.validate_semantic(sl.rule_draft(PROFILE), PROFILE)
    second, warnings = sl.validate_semantic(first, PROFILE)
    assert second == first and warnings == []


def test_metrics_are_kept_when_valid_and_dropped_with_a_reason_otherwise():
    raw = {"columns": {}, "metrics": [
        GROSS,
        {"label": "อัตราลดราคา", "type": "ratio",
         "numerator": {"agg": "count", "column": "Profit", "where": {"column": "Discount_Percent", "op": "gt", "value": 0}},
         "denominator": {"agg": "count"}, "format": "percent"},
        {"label": "ออเดอร์ ไทยแลนด์", "type": "simple",
         "measure": {"agg": "count_distinct", "column": "Order_ID", "where": {"column": "Country", "op": "in", "value": ["TH", "LA"]}}},
        {"label": "หลังปีใหม่", "type": "simple",
         "measure": {"agg": "count", "where": {"column": "Order_Date", "op": "gte", "value": "2025-01-01"}}},
        {"label": "ผลรวมชื่อ", "type": "simple", "measure": {"agg": "sum", "column": "Customer_Name"}},
        {"label": "มัธยฐาน", "type": "simple", "measure": {"agg": "median", "column": "Profit"}},
        {"label": "ประเทศมากกว่า", "type": "simple", "measure": {"agg": "count", "where": {"column": "Country", "op": "gt", "value": 1}}},
        {"label": "ยอดมากกว่า", "type": "simple", "measure": {"agg": "count", "where": {"column": "Total_Sales", "op": "gt", "value": "100"}}},
        {"label": "", "type": "simple", "measure": {"agg": "count"}},
        {"label": "เรดาร์", "type": "formula"},
    ]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    metrics = semantic["metrics"]
    assert [m["label"] for m in metrics] == ["Gross Margin", "อัตราลดราคา", "ออเดอร์ ไทยแลนด์", "หลังปีใหม่"]
    assert metrics[0]["numerator"] == {"agg": "sum", "column": "Profit", "where": None}
    assert metrics[0]["higher_is_better"] is True and metrics[0]["currency"] is None
    assert metrics[1]["numerator"]["column"] is None  # count takes no column
    assert [m["id"] for m in metrics[1:]] == ["metric", "metric_2", "metric_3"]  # Thai labels give no slug
    text = " ".join(warnings)
    for reason in ("Customer_Name", "median", "Country", "ตัวเลข", "ไม่มีชื่อ", "formula"):
        assert reason in text


def test_metric_ids_are_kept_when_valid_and_made_unique_otherwise():
    raw = {"metrics": [GROSS, dict(GROSS, label="Margin again"), dict(GROSS, id="Bad Id!", label="Net Margin")]}
    semantic, _ = sl.validate_semantic(raw, PROFILE)
    assert [m["id"] for m in semantic["metrics"]] == ["gross_margin", "margin_again", "net_margin"]


def test_at_most_twenty_metrics_are_kept():
    raw = {"metrics": [dict(GROSS, id=f"m{i}", label=f"M{i}") for i in range(25)]}
    semantic, warnings = sl.validate_semantic(raw, PROFILE)
    assert len(semantic["metrics"]) == 20 and any("20" in w for w in warnings)


def test_currency_metric_keeps_its_code_and_others_drop_it():
    raw = {"metrics": [
        {"label": "รวม", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "currency", "currency": "thb"},
        {"label": "รวม2", "type": "simple", "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "number", "currency": "THB"}]}
    first, second = sl.validate_semantic(raw, PROFILE)[0]["metrics"]
    assert first["currency"] == "THB" and second["currency"] is None


def test_metric_columns_lists_every_referenced_column():
    metric = {"type": "ratio", "numerator": {"agg": "sum", "column": "Profit", "where": {"column": "Country", "op": "eq", "value": "TH"}},
              "denominator": {"agg": "count", "column": None, "where": None}}
    assert sl.metric_columns(metric) == ["Country", "Profit"]


def test_non_objects_are_rejected():
    with pytest.raises(sl.SemanticError):
        sl.validate_semantic([], PROFILE)
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_semantic_layer.py -q -p no:cacheprovider`
Expected: FAIL ตอนเก็บเทสต์ด้วย `ImportError: cannot import name 'semantic_layer' from 'app.api'`

- [ ] **Step 3: เขียนโค้ด**

สร้าง `services/api/app/api/semantic_layer.py` (ส่วนที่ 2 ของไฟล์นี้ Task 2 จะต่อท้าย):

```python
"""Semantic layer: what each column of a dataset means (role, label, unit, currency, PII)
and the dataset's metric definitions.

Pure functions only (no Elasticsearch, no LLM) so every rule can be tested on its own:
semantic.py stores the documents and semantic_llm.py drafts them with Groq. Whatever a
person or the LLM sends goes through validate_semantic() before it is stored or used."""
import re
from datetime import datetime

ROLES = ("measure", "dimension", "time", "identifier", "text")
UNITS = ("currency", "percent", "count", "duration", "number")
DURATION_UNITS = ("seconds", "minutes", "hours", "days")
DEFAULT_AGGS = ("sum", "avg", "min", "max", "count_distinct")
METRIC_TYPES = ("simple", "ratio")
METRIC_AGGS = ("count", "count_distinct", "sum", "avg", "min", "max")
NUMERIC_AGGS = ("sum", "avg", "min", "max")
WHERE_OPS = ("eq", "ne", "in", "gt", "gte", "lt", "lte")
METRIC_FORMATS = ("number", "currency", "percent")
MAX_METRICS = 20
MAX_IN_VALUES = 50
MAX_RULE_MONEY_METRICS = 5

_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
_METRIC_ID_RE = re.compile(r"^[a-z0-9_]{1,40}$")

# Name rules compare whole words: "CustomerName" and "customer_name" both give
# ["customer", "name"], so "Hotel" never matches "tel" and "Paid" never matches "id".
PII_WORDS = {"email", "phone", "mobile", "tel", "telephone", "address", "passport", "ssn", "birth",
             "birthday", "birthdate", "dob"}
PII_JOINED = ("email", "idcard", "citizen", "nationalid", "dateofbirth")
PERSON_WORDS = {"customer", "first", "last", "full", "user", "contact", "person", "employee", "owner", "member",
                "client", "patient", "student", "given", "family", "middle", "sender", "receiver", "recipient"}
PERSON_NAMES = {"name", "username", "fullname", "firstname", "lastname", "customername", "surname"}
THAI_PII = ("ชื่อลูกค้า", "ชื่อผู้", "ชื่อจริง", "นามสกุล", "ชื่อ-สกุล", "อีเมล", "เบอร์โทร", "ที่อยู่",
            "บัตรประชาชน", "เลขบัตร")
IDENTIFIER_WORDS = {"id", "code", "no", "uuid", "sku", "key"}
PERCENT_WORDS = {"pct", "percent", "percentage", "rate", "ratio", "score", "margin"}
MONEY_WORDS = {"sales", "revenue", "amount", "price", "cost", "profit", "income", "value", "spend"}
AGE_WORDS = {"age"}
COUNT_WORDS = {"qty", "quantity", "count", "records", "rows", "units", "items"}
DURATION_WORDS = {"seconds": "seconds", "secs": "seconds", "sec": "seconds", "duration": "seconds",
                  "minutes": "minutes", "mins": "minutes", "hours": "hours", "hrs": "hours", "lag": "hours",
                  "days": "days"}
THAI_MONEY = ("ยอด", "ราคา", "ต้นทุน", "กำไร")
THAI_AGE = ("อายุ",)
THAI_COUNT = ("จำนวน",)


class SemanticError(ValueError):
    """The input is not a semantic-layer object at all."""


def tokens(name):
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(name))
    return [t for t in re.split(r"[^a-z0-9\u0e00-\u0e7f]+", spaced.lower()) if t]


def is_pii_name(name):
    words = tokens(name)
    joined = "".join(words)
    if PII_WORDS & set(words) or any(part in joined for part in PII_JOINED) or joined in PERSON_NAMES:
        return True
    if "name" in words:
        i = words.index("name")
        if i > 0 and words[i - 1] in PERSON_WORDS:
            return True
    return any(part in str(name) for part in THAI_PII)


def _has(words, name, english, thai=()):
    return bool(english & set(words)) or any(part in str(name) for part in thai)


def rule_column(col):
    """What a column most likely means, from its name and profiled kind alone."""
    name, kind = col["name"], col["kind"]
    words = tokens(name)
    meta = {"role": "text", "label": "", "description": "", "unit": None, "currency": None,
            "duration_unit": None, "default_agg": None, "pii": is_pii_name(name)}

    def measure(unit, agg, duration_unit=None):
        meta.update(role="measure", unit=unit, default_agg=agg, duration_unit=duration_unit)

    low, high = col.get("min"), col.get("max")
    if words and (words[-1] in IDENTIFIER_WORDS or words[0] == "id"):
        meta["role"] = "identifier"
    elif kind == "date":
        meta["role"] = "time"
    elif kind == "numeric":
        in_0_100 = low is not None and high is not None and 0 <= low and high <= 100
        if _has(words, name, PERCENT_WORDS) and in_0_100:
            measure("percent", "avg")
        elif _has(words, name, MONEY_WORDS, THAI_MONEY):
            measure("currency", "sum")
        elif _has(words, name, AGE_WORDS, THAI_AGE):
            measure("number", "avg")
        elif _has(words, name, COUNT_WORDS, THAI_COUNT):
            measure("count", "sum")
        elif set(words) & set(DURATION_WORDS):
            measure("duration", "avg", next(DURATION_WORDS[w] for w in words if w in DURATION_WORDS))
        else:
            measure("number", "sum")
    elif kind == "categorical":
        meta["role"] = "dimension"
    return meta


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", str(text).lower()).strip("_")[:40] or "metric"


def unique_id(text, used):
    base = slug(text)
    candidate, n = base, 2
    while candidate in used:
        suffix = f"_{n}"
        candidate = base[: 40 - len(suffix)] + suffix
        n += 1
    return candidate


def rule_draft(profile):
    """The semantic layer guessed from names and kinds, used before anything is drafted
    or approved, when Groq is unavailable, and for columns the stored versions lack."""
    columns = {c["name"]: rule_column(c) for c in profile["columns"]}
    metrics = [{"id": "row_count", "label": "จำนวนแถว", "description": "", "type": "simple",
                "measure": {"agg": "count", "column": None, "where": None},
                "format": "number", "currency": None, "higher_is_better": True}]
    used = {"row_count"}
    money = [n for n, m in columns.items() if m["role"] == "measure" and m["unit"] == "currency" and not m["pii"]]
    for name in money[:MAX_RULE_MONEY_METRICS]:
        metric_id = unique_id(f"total_{name}", used)
        used.add(metric_id)
        metrics.append({"id": metric_id, "label": f"ผลรวม {name}", "description": "", "type": "simple",
                        "measure": {"agg": "sum", "column": name, "where": None},
                        "format": "currency", "currency": None, "higher_is_better": True})
    return {"columns": columns, "metrics": metrics}


def metric_columns(metric):
    parts = [metric.get("measure")] if metric.get("type") == "simple" else [metric.get("numerator"), metric.get("denominator")]
    names = []
    for part in parts:
        if isinstance(part, dict):
            names += [part.get("column"), (part.get("where") or {}).get("column")]
    return sorted({n for n in names if n})


def _text(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ""


def _role_fits(role, kind):
    return (role != "measure" or kind == "numeric") and (role != "time" or kind == "date")


def _currency(value, owner, warnings):
    if value in (None, ""):
        return None
    code = str(value).strip().upper()
    if _CURRENCY_RE.match(code):
        return code
    warnings.append(f"{owner}: รหัสสกุลเงิน {value} ไม่ถูกต้อง")
    return None


def clean_column(item, col, warnings):
    """One column's metadata with every field valid for the column's profiled kind; an
    unusable value falls back to the rule guess for that column."""
    base = rule_column(col)
    item = item if isinstance(item, dict) else {}
    name, kind = col["name"], col["kind"]
    role = item.get("role", base["role"])
    if role not in ROLES or not _role_fits(role, kind):
        warnings.append(f"{name}: ใช้บทบาท {role} กับคอลัมน์ชนิด {kind} ไม่ได้ ใช้ {base['role']} แทน")
        role = base["role"]
    meta = {"role": role, "label": _text(item.get("label"), 60), "description": _text(item.get("description"), 300),
            "unit": None, "currency": None, "duration_unit": None, "default_agg": None,
            "pii": bool(item.get("pii", base["pii"]))}
    if role != "measure":
        return meta
    fallback = base if base["role"] == "measure" else {"unit": "number", "default_agg": "sum", "duration_unit": None}
    unit = item.get("unit", fallback["unit"])
    if unit not in UNITS:
        warnings.append(f"{name}: ไม่รู้จักหน่วย {unit} ใช้ {fallback['unit']} แทน")
        unit = fallback["unit"]
    agg = item.get("default_agg", fallback["default_agg"])
    if agg not in DEFAULT_AGGS:
        warnings.append(f"{name}: ไม่รู้จักการรวม {agg} ใช้ {fallback['default_agg']} แทน")
        agg = fallback["default_agg"]
    meta.update(unit=unit, default_agg=agg)
    if unit == "currency":
        meta["currency"] = _currency(item.get("currency"), name, warnings)
    if unit == "duration":
        duration_unit = item.get("duration_unit") or fallback["duration_unit"] or "seconds"
        if duration_unit not in DURATION_UNITS:
            warnings.append(f"{name}: ไม่รู้จักหน่วยเวลา {duration_unit} ใช้ seconds แทน")
            duration_unit = "seconds"
        meta["duration_unit"] = duration_unit
    return meta


def _is_iso(value):
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _scalar(value):
    return isinstance(value, (str, int, float, bool))


def _clean_where(raw, by_name):
    if raw is None:
        return None, None
    if not isinstance(raw, dict):
        return None, "เงื่อนไขไม่ถูกต้อง"
    column, op, value = raw.get("column"), raw.get("op"), raw.get("value")
    if column not in by_name:
        return None, f"เงื่อนไขอ้างคอลัมน์ {column} ที่ไม่มี"
    if op not in WHERE_OPS:
        return None, f"ไม่รองรับเงื่อนไข {op}"
    kind = by_name[column]["kind"]
    if op == "in":
        if not isinstance(value, list) or not 1 <= len(value) <= MAX_IN_VALUES or not all(_scalar(v) for v in value):
            return None, f"เงื่อนไข in ต้องเป็นรายการ 1 ถึง {MAX_IN_VALUES} ค่า"
    elif op in ("gt", "gte", "lt", "lte"):
        if kind == "numeric":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return None, f"{op} บน {column} ต้องเทียบกับตัวเลข"
        elif kind == "date":
            if not _is_iso(value):
                return None, f"{op} บน {column} ต้องเทียบกับวันที่ ISO"
        else:
            return None, f"{op} ใช้ได้กับคอลัมน์ตัวเลขหรือวันที่เท่านั้น ({column})"
    elif not _scalar(value):
        return None, "ค่าของเงื่อนไขไม่ถูกต้อง"
    return {"column": column, "op": op, "value": value}, None


def _clean_part(raw, by_name):
    if not isinstance(raw, dict):
        return None, "ไม่มีส่วนการคำนวณ"
    agg, column = raw.get("agg"), raw.get("column")
    if agg not in METRIC_AGGS:
        return None, f"ไม่รองรับการคำนวณ {agg}"
    if agg == "count":
        column = None
    elif column not in by_name:
        return None, f"ไม่มีคอลัมน์ {column}"
    elif agg in NUMERIC_AGGS and by_name[column]["kind"] != "numeric":
        return None, f"{agg} ใช้ได้กับคอลัมน์ตัวเลขเท่านั้น ({column})"
    where, problem = _clean_where(raw.get("where"), by_name)
    if problem:
        return None, problem
    return {"agg": agg, "column": column, "where": where}, None


def clean_metric(item, by_name, used):
    """(metric, None) or (None, reason). used holds ids already taken in this dataset."""
    if not isinstance(item, dict):
        return None, "ไม่ใช่ object"
    label = _text(item.get("label"), 60)
    if not label:
        return None, "ไม่มีชื่อ"
    metric_type = item.get("type")
    if metric_type not in METRIC_TYPES:
        return None, f"ไม่รองรับชนิด {metric_type}"
    metric = {"id": None, "label": label, "description": _text(item.get("description"), 300), "type": metric_type}
    if metric_type == "simple":
        part, problem = _clean_part(item.get("measure"), by_name)
        if problem:
            return None, problem
        metric["measure"] = part
    else:
        for key, title in (("numerator", "ตัวตั้ง"), ("denominator", "ตัวหาร")):
            part, problem = _clean_part(item.get(key), by_name)
            if problem:
                return None, f"{title}: {problem}"
            metric[key] = part
    metric["format"] = item.get("format") if item.get("format") in METRIC_FORMATS else "number"
    metric["currency"] = _currency(item.get("currency"), label, []) if metric["format"] == "currency" else None
    metric["higher_is_better"] = bool(item.get("higher_is_better", True))
    given = item.get("id")
    ok = isinstance(given, str) and _METRIC_ID_RE.match(given) and given not in used
    metric["id"] = given if ok else unique_id(label, used)
    return metric, None


def validate_semantic(raw, profile):
    """({"columns", "metrics"}, warnings). Unknown columns are dropped, unusable values
    fall back to the rule guess, unusable metrics are dropped, each with a warning."""
    if not isinstance(raw, dict):
        raise SemanticError("ข้อมูลความหมายคอลัมน์ต้องเป็น JSON object")
    by_name = {c["name"]: c for c in profile["columns"]}
    warnings = []
    raw_columns = raw.get("columns") if isinstance(raw.get("columns"), dict) else {}
    columns = {}
    for name, item in raw_columns.items():
        if name not in by_name:
            warnings.append(f"ตัดคอลัมน์ {name}: ไม่มีในชุดข้อมูล")
            continue
        columns[name] = clean_column(item, by_name[name], warnings)
    metrics, used = [], set()
    for item in raw.get("metrics") if isinstance(raw.get("metrics"), list) else []:
        label = item.get("label") if isinstance(item, dict) else None
        metric, problem = clean_metric(item, by_name, used)
        if problem:
            warnings.append(f"ตัด metric '{label or '?'}': {problem}")
            continue
        if len(metrics) >= MAX_METRICS:
            warnings.append(f"ใช้ {MAX_METRICS} metric แรก")
            break
        metrics.append(metric)
        used.add(metric["id"])
    return {"columns": columns, "metrics": metrics}, warnings
```

หมายเหตุสำหรับเทสต์ `test_metrics_are_kept_when_valid_and_dropped_with_a_reason_otherwise`:
- "อัตราลดราคา" เป็น ratio ที่ตัวตั้งส่ง `"column": "Profit"` มากับ `agg: count` จึงถูกล้างเป็น `None` (count ไม่รับคอลัมน์)
- "ยอดมากกว่า" ส่ง `"100"` (สตริง) ให้ `gt` บนคอลัมน์ตัวเลข จึงถูกตัดด้วยเหตุผลที่มีคำว่า "ตัวเลข"
- label ภาษาไทยล้วนสร้าง slug ไม่ได้ id จึงเป็น `metric`, `metric_2`, `metric_3`

- [ ] **Step 4: รันให้ผ่าน**

Run: คำสั่งเดียวกับ Step 2 แล้วรัน API ทั้งชุด
Expected: `29 passed`; ทั้งชุด 479 ผ่าน + 9 ล้มเดิมใน `test_whitebox_engine.py`

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/api/app/api/semantic_layer.py services/api/tests/test_semantic_layer.py && git commit -m "feat(semantic): column meaning rules from names and a whitelist validator"
```

---

### Task 2: View ที่ใช้งานจริง drift และการซ่อนข้อมูลส่วนบุคคล (`semantic_layer.py` ส่วนที่ 2)

**Files:**
- Modify: `services/api/app/api/semantic_layer.py` (ต่อท้ายไฟล์)
- Test: `services/api/tests/test_semantic_resolve.py`

**Interfaces:**
- Consumes: `rule_draft`, `clean_column`, `clean_metric`, `metric_columns` (Task 1)
- Produces (ใช้ใน Task 5, 6, 7, 8):
  - `resolve(table_name, doc, profile, available=True) -> view` โดย `doc` คือเอกสารตามความหมาย `{"table_name", "draft": {"columns", "metrics", ...} | None, "approved": {"columns", "metrics", "version", ...} | None, "history": [...]}` หรือ `None` และ view ตามหัวข้อ "รูปแบบข้อมูล" ข้างบน (ยังไม่มี `metric_values`)
  - `apply_to_profile(profile, view) -> profile` ใหม่ (ไม่แก้ตัวเดิม) ที่ตัดคอลัมน์ใน `view["hidden_columns"]` และเติม `role`, `label` (ว่างใช้ชื่อคอลัมน์), `unit`, `currency`, `default_agg` ทุกคอลัมน์ พร้อม `column_count` และ `kind_counts` ใหม่

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_semantic_resolve.py`:

```python
import os
import sys

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import semantic_layer as sl  # noqa: E402

KINDS = ("numeric", "categorical", "date", "text")


def profile_of(*columns):
    cols = [{"name": n, "kind": k, "distinct": 5, "missing_pct": 0.0, "min": 0.0, "max": 500.0} for n, k in columns]
    return {"rows": 10, "column_count": len(cols), "columns": cols,
            "kind_counts": {k: sum(c["kind"] == k for c in cols) for k in KINDS}}


PROFILE = profile_of(("Order_ID", "text"), ("Customer_Name", "text"), ("Country", "categorical"),
                     ("Total_Sales", "numeric"), ("Profit", "numeric"))
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio",
         "numerator": {"agg": "sum", "column": "Profit"}, "denominator": {"agg": "sum", "column": "Total_Sales"},
         "format": "percent"}


def approved(columns, metrics=(), version=3):
    return {"columns": columns, "metrics": list(metrics), "version": version, "approved_by": "admin",
            "approved_at": "2026-10-02T00:00:00Z"}


def all_columns(**overrides):
    base = sl.rule_draft(PROFILE)["columns"]
    return {**base, **overrides}


def test_nothing_stored_uses_the_rules():
    view = sl.resolve("sales", None, PROFILE)
    assert view["status"] == "none" and view["version"] == 0 and view["pending_draft"] is False
    assert view["effective"]["columns"]["Total_Sales"]["unit"] == "currency"
    assert [m["id"] for m in view["effective"]["metrics"]] == ["row_count", "total_total_sales", "total_profit"]
    assert view["hidden_columns"] == ["Customer_Name"]
    assert view["drift"] == {"new_columns": [], "missing_columns": []}


def test_a_draft_is_used_until_something_is_approved():
    doc = {"draft": {"columns": all_columns(Total_Sales=USD), "metrics": [GROSS]}}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["status"] == "draft"
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"
    assert [m["id"] for m in view["effective"]["metrics"]] == ["gross_margin"]


def test_the_approved_version_wins_and_a_newer_draft_is_pending():
    doc = {"approved": approved(all_columns(Total_Sales=USD), [GROSS]),
           "draft": {"columns": all_columns(Total_Sales=dict(USD, currency="THB")), "metrics": []}}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["status"] == "approved" and view["version"] == 3 and view["pending_draft"] is True
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"


def test_structure_changes_make_the_approved_version_outdated():
    stored = {n: m for n, m in all_columns().items() if n != "Profit"}
    stored["Old_Column"] = {"role": "text", "pii": False}
    doc = {"approved": approved(stored, [GROSS]),
           "draft": {"columns": {"Profit": dict(USD, label="กำไร")}, "metrics": []}}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["status"] == "approved_outdated"
    assert view["drift"] == {"new_columns": ["Profit"], "missing_columns": ["Old_Column"]}
    assert view["effective"]["columns"]["Profit"]["label"] == "กำไร"  # new column taken from the draft
    assert "Old_Column" not in view["effective"]["columns"]


def test_a_person_unhides_a_column_only_by_approving_it():
    unhidden = sl.resolve("sales", {"approved": approved(all_columns(Customer_Name={"role": "text", "pii": False}))}, PROFILE)
    assert "Customer_Name" not in unhidden["hidden_columns"]
    drafted = sl.resolve("sales", {"draft": {"columns": all_columns(Customer_Name={"role": "text", "pii": False}), "metrics": []}}, PROFILE)
    assert drafted["hidden_columns"] == ["Customer_Name"]  # the name rule still hides it
    flagged = sl.resolve("sales", {"draft": {"columns": all_columns(Country={"role": "dimension", "pii": True}), "metrics": []}}, PROFILE)
    assert flagged["hidden_columns"] == ["Customer_Name", "Country"]
    assert flagged["effective"]["columns"]["Country"]["pii"] is True


def test_metrics_that_cannot_be_computed_are_reported_not_used():
    lost = dict(GROSS, id="aov", label="AOV", denominator={"agg": "count_distinct", "column": "Invoice_No"})
    personal = {"id": "buyers", "label": "ผู้ซื้อ", "type": "simple", "measure": {"agg": "count_distinct", "column": "Customer_Name"}}
    view = sl.resolve("sales", {"approved": approved(all_columns(), [GROSS, lost, personal])}, PROFILE)
    assert [m["id"] for m in view["effective"]["metrics"]] == ["gross_margin"]
    reasons = {m["id"]: m["reason"] for m in view["invalid_metrics"]}
    assert "Invoice_No" in reasons["aov"]
    assert "ข้อมูลส่วนบุคคล" in reasons["buyers"]


def test_stored_meaning_that_no_longer_fits_the_column_is_repaired_with_a_warning():
    doc = {"approved": approved(all_columns(Country={"role": "measure", "unit": "currency", "pii": False}))}
    view = sl.resolve("sales", doc, PROFILE)
    assert view["effective"]["columns"]["Country"]["role"] == "dimension"
    assert any("Country" in w for w in view["warnings"])


def test_without_elasticsearch_the_rules_still_hide_personal_columns():
    view = sl.resolve("sales", None, PROFILE, available=False)
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]


def test_apply_to_profile_removes_hidden_columns_and_adds_meaning():
    view = sl.resolve("sales", {"approved": approved(all_columns(Total_Sales=USD))}, PROFILE)
    applied = sl.apply_to_profile(PROFILE, view)
    names = [c["name"] for c in applied["columns"]]
    assert "Customer_Name" not in names and applied["column_count"] == 4
    sales = next(c for c in applied["columns"] if c["name"] == "Total_Sales")
    assert (sales["role"], sales["label"], sales["unit"], sales["currency"]) == ("measure", "ยอดขาย", "currency", "USD")
    country = next(c for c in applied["columns"] if c["name"] == "Country")
    assert country["label"] == "Country" and country["role"] == "dimension"
    assert applied["kind_counts"]["text"] == 1
    assert len(PROFILE["columns"]) == 5  # the original profile is untouched
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_semantic_resolve.py -q -p no:cacheprovider`
Expected: FAIL 9 ตัวด้วย `AttributeError: module 'app.api.semantic_layer' has no attribute 'resolve'` (`rule_draft` มีแล้วจาก Task 1)

- [ ] **Step 3: เขียนโค้ด**

ต่อท้าย `services/api/app/api/semantic_layer.py` (เว้นสองบรรทัดว่างจากฟังก์ชันสุดท้าย `validate_semantic`):

```python
def _stored_columns(part, by_name, warnings):
    """A stored draft/approved column map re-checked against the current profile."""
    stored = (part or {}).get("columns") or {}
    return {name: clean_column(meta, by_name[name], warnings) for name, meta in stored.items() if name in by_name}


def resolve(table_name, doc, profile, available=True):
    """The semantic view Create Dashboard uses (spec section 8)."""
    doc = doc or {}
    by_name = {c["name"]: c for c in profile["columns"]}
    rules = rule_draft(profile)
    draft, approved = doc.get("draft"), doc.get("approved")
    base = approved or draft
    warnings = []
    approved_columns = _stored_columns(approved, by_name, warnings if approved else [])
    draft_columns = _stored_columns(draft, by_name, [] if approved else warnings)
    base_columns = approved_columns if approved else draft_columns
    stored_names = (base or {}).get("columns") or {}
    new_columns = [n for n in by_name if base and n not in stored_names]
    missing_columns = sorted(n for n in stored_names if n not in by_name)

    columns, hidden = {}, []
    for name in by_name:
        meta = base_columns.get(name) or draft_columns.get(name) or rules["columns"][name]
        if approved and name in approved_columns:
            pii = approved_columns[name]["pii"]
        else:
            pii = draft_columns.get(name, {}).get("pii", False) or rules["columns"][name]["pii"]
        columns[name] = {**meta, "pii": bool(pii)}
        if pii:
            hidden.append(name)

    metrics, invalid, used = [], [], set()
    for item in (base or rules).get("metrics") or []:
        metric, problem = clean_metric(item, by_name, used)
        if not problem:
            private = [c for c in metric_columns(metric) if c in hidden]
            if private:
                problem = f"อ้างคอลัมน์ข้อมูลส่วนบุคคล {', '.join(private)}"
        if problem:
            invalid.append({"id": item.get("id") if isinstance(item, dict) else None,
                            "label": item.get("label") if isinstance(item, dict) else None, "reason": problem})
            continue
        metrics.append(metric)
        used.add(metric["id"])

    if not available:
        status = "unavailable"
    elif approved:
        status = "approved_outdated" if new_columns or missing_columns else "approved"
    elif draft:
        status = "draft"
    else:
        status = "none"
    return {"table_name": table_name, "status": status, "pending_draft": bool(approved and draft),
            "version": approved["version"] if approved else 0,
            "effective": {"columns": columns, "metrics": metrics},
            "draft": draft, "approved": approved,
            "drift": {"new_columns": new_columns, "missing_columns": missing_columns},
            "invalid_metrics": invalid, "hidden_columns": hidden,
            "history": doc.get("history") or [], "warnings": warnings}


def apply_to_profile(profile, view):
    """The profile Create Dashboard may use: hidden (personal) columns removed, each
    remaining column carrying its role, label, unit, currency and default aggregation."""
    hidden = set(view["hidden_columns"])
    meaning = view["effective"]["columns"]
    columns = []
    for c in profile["columns"]:
        if c["name"] in hidden:
            continue
        meta = meaning.get(c["name"], {})
        columns.append({**c, "role": meta.get("role"), "label": meta.get("label") or c["name"],
                        "unit": meta.get("unit"), "currency": meta.get("currency"),
                        "default_agg": meta.get("default_agg")})
    kind_counts = {k: sum(col["kind"] == k for col in columns) for k in profile["kind_counts"]}
    return {**profile, "columns": columns, "column_count": len(columns), "kind_counts": kind_counts}
```

กติกาที่โค้ดนี้ทำตาม spec 8:
- ฐานคือ approved ถ้ามี ไม่มีใช้ draft ไม่มีทั้งคู่ใช้ร่างแบบกฎ คอลัมน์ที่ฐานไม่มีใช้ค่าจาก draft แล้วจากกฎ
- ค่าที่เก็บไว้ถูกตรวจซ้ำกับ profile ปัจจุบันด้วย `clean_column` (ชนิดคอลัมน์อาจเปลี่ยน) และ warning ของฐานถูกส่งออกใน `view["warnings"]`
- metric ที่อ้างคอลัมน์ซ่อนหรือคอลัมน์ที่หายไปอยู่ใน `invalid_metrics` และไม่อยู่ใน `effective`

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_semantic_resolve.py tests/test_semantic_layer.py -q -p no:cacheprovider` แล้วรัน API ทั้งชุด
Expected: `38 passed`; ทั้งชุด 488 ผ่าน + 9 ล้มเดิม

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/api/app/api/semantic_layer.py services/api/tests/test_semantic_resolve.py && git commit -m "feat(semantic): resolve the semantic view with drift and personal-column hiding"
```

---

### Task 3: ตัวคำนวณ metric (where, ratio, grouped)

**Files:**
- Modify: `services/api/app/api/dashboard_compute.py` (**CRLF**: แก้ด้วย Edit tool)
- Test: `services/api/tests/test_dashboard_metrics.py`

**Interfaces:**
- Consumes: ฟังก์ชันเดิมใน `dashboard_compute.py`: `_value(v)`, `_labels(series)`, `_aggregate(frame, metric)` (รองรับ `count`, `count_distinct`, `count_missing`, `sum`, `avg`, `min`, `max`), `_grouped(frame, keys, metric)`, `logger`; รูปแบบ metric จาก Task 1
- Produces (ใช้ใน Task 5, 6):
  - `where_mask(frame, where) -> bool Series`
  - `evaluate_metric(frame, metric) -> float | None` (ratio ที่ `format == "percent"` คูณ 100 ตัวหาร 0 หรือว่างได้ `None` ค่าปัด 4 ตำแหน่งด้วย `_value`)
  - `grouped_metric(frame, keys, metric) -> pandas Series` (index = กลุ่มที่มีใน `frame` ตามลำดับที่พบ, count/count_distinct/count_missing/sum ของกลุ่มที่ไม่มีแถวตรงเงื่อนไขได้ 0, ค่าไม่ได้ปัด)
  - `metric_values(df, metrics) -> {id: float | None}` (metric ที่คำนวณไม่ได้ได้ `None` และ log warning)
- Task นี้ยังไม่เปลี่ยนพฤติกรรมของวิดเจ็ตใดๆ

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_dashboard_metrics.py`:

```python
import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_compute as dc  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402

DF, _ = prepare_frame(pd.DataFrame({
    "order_id": ["o1", "o1", "o2", "o3", "o4", "o5"],
    "order_date": ["2025-01-05", "2025-01-05", "2025-02-03", "2025-02-28", "2025-03-10", "2025-03-11"],
    "region": ["North", "North", "South", "South", "East", None],
    "sales": [100.0, 50.0, 200.0, 0.0, 80.0, 70.0],
    "profit": [40.0, 10.0, 60.0, 0.0, -8.0, 7.0],
    "returned": [False, False, True, False, True, False],
}))


def part(agg, column=None, where=None):
    return {"agg": agg, "column": column, "where": where}


def simple(p, fmt="number"):
    return {"id": "m", "type": "simple", "measure": p, "format": fmt}


def ratio(num, den, fmt="percent"):
    return {"id": "r", "type": "ratio", "numerator": num, "denominator": den, "format": fmt}


MARGIN = ratio(part("sum", "profit"), part("sum", "sales"))


def test_simple_and_ratio_metrics():
    assert dc.evaluate_metric(DF, simple(part("sum", "sales"))) == 500.0
    assert dc.evaluate_metric(DF, MARGIN) == pytest.approx(21.8)
    assert dc.evaluate_metric(DF, ratio(part("sum", "sales"), part("count_distinct", "order_id"), "currency")) == 100.0


@pytest.mark.parametrize("where,expected", [
    ({"column": "returned", "op": "eq", "value": True}, 2),
    ({"column": "region", "op": "ne", "value": "North"}, 4),
    ({"column": "region", "op": "in", "value": ["North", "South"]}, 4),
    ({"column": "sales", "op": "gt", "value": 75}, 3),
    ({"column": "sales", "op": "eq", "value": 0}, 1),
    ({"column": "order_date", "op": "gte", "value": "2025-02-28"}, 3),
    ({"column": "order_date", "op": "lt", "value": "2025-02-01T00:00:00+00:00"}, 2),
])
def test_where_conditions(where, expected):
    assert dc.evaluate_metric(DF, simple(part("count", where=where))) == expected


def test_conditional_ratio_and_zero_denominator():
    returned = ratio(part("count", where={"column": "returned", "op": "eq", "value": True}), part("count"))
    assert dc.evaluate_metric(DF, returned) == pytest.approx(33.3333)
    nowhere = ratio(part("sum", "profit"), part("sum", "sales", {"column": "region", "op": "eq", "value": "Nowhere"}))
    assert dc.evaluate_metric(DF, nowhere) is None


def test_grouped_ratio_is_computed_per_group():
    frame = DF.assign(_x=dc._labels(DF["region"]))
    values = dc.grouped_metric(frame, ["_x"], MARGIN).to_dict()
    assert values["North"] == pytest.approx(100 / 3) and values["South"] == pytest.approx(30.0)
    assert values["East"] == pytest.approx(-10.0) and values["(ว่าง)"] == pytest.approx(10.0)


def test_grouped_counts_with_a_condition_are_zero_not_missing():
    frame = DF.assign(_x=dc._labels(DF["region"]))
    returned = simple(part("count", where={"column": "returned", "op": "eq", "value": True}))
    assert dc.grouped_metric(frame, ["_x"], returned).to_dict() == {"North": 0, "South": 1, "East": 1, "(ว่าง)": 0}


def test_metric_values_reports_every_metric_and_survives_a_broken_one():
    broken = simple(part("sum", "gone"))
    values = dc.metric_values(DF, [dict(MARGIN, id="margin"), dict(broken, id="broken")])
    assert values["margin"] == pytest.approx(21.8) and values["broken"] is None
```

(`pytest.approx(100 / 3)` ใน `test_grouped_ratio_is_computed_per_group` ตั้งใจ: `grouped_metric` ไม่ปัดค่า ส่วน `evaluate_metric` ปัด 4 ตำแหน่งจึงเทียบกับ `33.3333` ได้)

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_dashboard_metrics.py -q -p no:cacheprovider`
Expected: FAIL 12 ตัวด้วย `AttributeError: module 'app.api.dashboard_compute' has no attribute 'evaluate_metric'` (หรือ `grouped_metric`, `metric_values`)

- [ ] **Step 3: เขียนโค้ด**

แก้ `services/api/app/api/dashboard_compute.py` ด้วย Edit tool สองจุด

(ก) แทน

```python
import math

import pandas as pd
```

ด้วย

```python
import math
import operator

import pandas as pd
```

(ข) ต่อจากฟังก์ชัน `_grouped` (ก่อนบรรทัด `def _top(totals, limit, ascending=False):`) เพิ่มบล็อกนี้ แล้วเว้นสองบรรทัดว่างก่อน `def _top`:

```python
_COMPARE = {"gt": operator.gt, "gte": operator.ge, "lt": operator.lt, "lte": operator.le}


def _matches(series, values):
    if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
        numbers = pd.to_numeric(pd.Series(list(values), dtype="object"), errors="coerce").dropna().tolist()
        return series.isin(numbers).fillna(False).astype(bool)
    return _labels(series).isin([str(v) for v in values]).astype(bool)


def where_mask(frame, where):
    """Rows matching one metric condition (semantic_layer.WHERE_OPS). Text comparisons use
    the labels the charts show, so "(ว่าง)" matches empty values."""
    series, op, value = frame[where["column"]], where["op"], where["value"]
    if op in ("eq", "ne", "in"):
        mask = _matches(series, value if op == "in" else [value])
        return ~mask if op == "ne" else mask
    if pd.api.types.is_datetime64_any_dtype(series):
        bound = pd.Timestamp(value)
        bound = bound.tz_convert(None) if bound.tzinfo else bound
    else:
        series, bound = pd.to_numeric(series, errors="coerce"), value
    return _COMPARE[op](series, bound).fillna(False).astype(bool)


def _part_value(frame, part):
    if part.get("where"):
        frame = frame[where_mask(frame, part["where"])]
    return _aggregate(frame, part)


def evaluate_metric(frame, metric):
    """One number for a semantic-layer metric over frame; ratios in percent are x100 and a
    zero or empty denominator gives None."""
    if metric["type"] == "simple":
        value = _part_value(frame, metric["measure"])
    else:
        numerator = _part_value(frame, metric["numerator"])
        denominator = _part_value(frame, metric["denominator"])
        value = None if numerator is None or not denominator else numerator / denominator
        if value is not None and metric.get("format") == "percent":
            value *= 100
    return _value(value)


def _grouped_part(frame, keys, part, index):
    subset = frame[where_mask(frame, part["where"])] if part.get("where") else frame
    values = _grouped(subset, keys, part).reindex(index)
    return values.fillna(0) if part["agg"] in ("count", "count_distinct", "count_missing", "sum") else values


def grouped_metric(frame, keys, metric):
    """A metric per group of keys; every group present in frame gets a value (or NaN)."""
    index = frame.groupby(keys, sort=False).size().index
    if metric["type"] == "simple":
        return _grouped_part(frame, keys, metric["measure"], index)
    numerator = _grouped_part(frame, keys, metric["numerator"], index)
    denominator = _grouped_part(frame, keys, metric["denominator"], index)
    values = numerator / denominator.where(denominator != 0)
    return values * 100 if metric.get("format") == "percent" else values


def metric_values(df, metrics):
    """{id: value} for the semantic-layer panel; a metric that cannot be computed gives None."""
    values = {}
    for metric in metrics:
        try:
            values[metric["id"]] = evaluate_metric(df, metric)
        except Exception:  # one broken definition must not hide the others
            logger.warning("Metric %s could not be computed", metric.get("id"), exc_info=True)
            values[metric["id"]] = None
    return values
```

- [ ] **Step 4: รันให้ผ่านและตรวจ line ending**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_dashboard_metrics.py tests/test_dashboard_compute.py tests/test_dashboard_final_review.py -q -p no:cacheprovider` แล้วรัน API ทั้งชุด แล้ว `cd /c/ETL/.claude/worktrees/semantic-layer && git diff --stat services/api/app/api/dashboard_compute.py && git ls-files --eol services/api/app/api/dashboard_compute.py`
Expected: เทสต์ผ่านทั้งหมด (`52 passed`); ทั้งชุด 500 ผ่าน + 9 ล้มเดิม; diff ประมาณ `75 insertions(+)` ไม่มี deletion; eol ยังเป็น `w/crlf`

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/api/app/api/dashboard_compute.py services/api/tests/test_dashboard_metrics.py && git commit -m "feat(dashboard): evaluate semantic metrics with conditions, ratios and groups"
```

---

### Task 4: ร่าง semantic layer ด้วย Groq

**Files:**
- Create: `services/api/app/api/semantic_llm.py`
- Test: `services/api/tests/test_semantic_llm.py`

**Interfaces:**
- Consumes: จาก `dashboard_llm.py` (มีอยู่แล้ว): `groq_settings() -> (key, model)`, `call_groq(messages, api_key, model) -> str`, `parse_json_object(text) -> dict` (raise `SpecError`), `profile_for_prompt(profile) -> {"rows", "columns": [{"name", "kind", "distinct", "missing_pct", "min"?, "max"?}]}`, `LLMUnavailable`, `RETRY_BUDGET_S` (= 25); `SpecError` จาก `dashboard_spec.py`; จาก Task 1: `rule_draft`, `validate_semantic`, `metric_columns`, `SemanticError` และค่าคงที่
- Produces (ใช้ใน Task 5):
  - `build_messages(table_name, profile) -> [system, user]` (profile ที่ส่งเข้ามาต้องตัดคอลัมน์ซ่อนแล้ว)
  - `draft_semantic(table_name, profile, hidden=()) -> {"semantic": {"columns", "metrics"}, "warnings": [str], "engine": "groq" | "rules", "model": str | None}` โดย `columns` ครบทุกคอลัมน์ของ profile คอลัมน์ใน `hidden` ไม่ถูกส่งและติด `pii: True` เสมอ

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_semantic_llm.py`:

```python
import json
import os
import sys
import types

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_llm, semantic_llm  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402

_, PROFILE = prepare_frame(pd.DataFrame({
    "Order_ID": [f"O{i}" for i in range(60)],
    "Customer_Name": [f"SECRET-PERSON-{i}" for i in range(60)],
    "Contact_Email": [f"p{i}@example.com" for i in range(60)],
    "Region": ["North", "South", "East"] * 20,
    "Total_Sales": [100.0, 200.0, 50.0] * 20,
    "Profit": [10.0, 20.0, 5.0] * 20,
}))
ANSWER = {"columns": {
    "Total_Sales": {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False},
    "Contact_Email": {"role": "text", "label": "อีเมล", "pii": False},
    "Region": {"role": "dimension", "label": "ภูมิภาค", "pii": False},
}, "metrics": [
    {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
     "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent"},
    {"id": "emails", "label": "อีเมลไม่ซ้ำ", "type": "simple", "measure": {"agg": "count_distinct", "column": "Contact_Email"}},
]}


class FakeGroq:
    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, messages, api_key, model):
        self.calls.append(messages)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture
def groq(monkeypatch):
    def install(*answers, key="gsk_test"):
        fake = FakeGroq(*answers)
        monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: (key, "openai/gpt-oss-120b"))
        monkeypatch.setattr(dashboard_llm, "call_groq", fake)
        return fake
    return install


def test_the_prompt_has_no_cell_values_and_no_hidden_column_names():
    visible = {**PROFILE, "columns": [c for c in PROFILE["columns"] if c["name"] != "Customer_Name"]}
    sent = json.dumps(semantic_llm.build_messages("sales", visible), ensure_ascii=False)
    for value in ("SECRET-PERSON", "example.com", "North", "Customer_Name"):
        assert value not in sent
    assert "Total_Sales" in sent and "hint_role" in sent and "hint_pii" in sent and "JSON" in sent


def test_the_llm_draft_covers_every_column_and_keeps_hidden_ones_private(groq):
    fake = groq(json.dumps(ANSWER, ensure_ascii=False))
    result = semantic_llm.draft_semantic("sales", PROFILE, hidden=["Customer_Name"])
    assert result["engine"] == "groq" and result["model"] == "openai/gpt-oss-120b"
    columns = result["semantic"]["columns"]
    assert set(columns) == {c["name"] for c in PROFILE["columns"]}
    assert columns["Total_Sales"]["currency"] == "USD"
    assert columns["Customer_Name"]["pii"] is True
    assert "Customer_Name" not in json.dumps(fake.calls[0], ensure_ascii=False)


def test_the_name_rule_overrides_an_llm_that_says_a_contact_column_is_not_personal(groq):
    groq(json.dumps(ANSWER, ensure_ascii=False))
    result = semantic_llm.draft_semantic("sales", PROFILE, hidden=["Customer_Name"])
    assert result["semantic"]["columns"]["Contact_Email"]["pii"] is True
    assert any("Contact_Email" in w for w in result["warnings"])
    assert [m["id"] for m in result["semantic"]["metrics"]] == ["gross_margin"]  # the e-mail metric is dropped
    assert any("อีเมลไม่ซ้ำ" in w for w in result["warnings"])


def test_a_rejected_answer_is_retried_once_then_the_rules_are_used(groq):
    fake = groq("ไม่มี JSON", "{}")
    result = semantic_llm.draft_semantic("sales", PROFILE)
    assert len(fake.calls) == 2 and "rejected" in fake.calls[1][-1]["content"]
    assert result["engine"] == "rules" and result["model"] is None
    assert result["warnings"][0].startswith("ใช้ร่างแบบกฎแทน AI")
    assert result["semantic"]["columns"]["Customer_Name"]["pii"] is True


def test_no_key_or_groq_down_uses_the_rules(groq):
    fake = groq(key="")
    assert semantic_llm.draft_semantic("sales", PROFILE)["engine"] == "rules" and fake.calls == []
    groq(dashboard_llm.LLMUnavailable("Groq ตอบกลับ HTTP 503"))
    result = semantic_llm.draft_semantic("sales", PROFILE)
    assert result["engine"] == "rules" and "HTTP 503" in result["warnings"][0]


def test_a_slow_rejected_answer_is_not_retried(groq, monkeypatch):
    fake = groq("ไม่มี JSON", json.dumps(ANSWER, ensure_ascii=False))
    ticks = iter([0.0, 26.0])
    monkeypatch.setattr(semantic_llm, "time", types.SimpleNamespace(monotonic=lambda: next(ticks)))
    result = semantic_llm.draft_semantic("sales", PROFILE)
    assert len(fake.calls) == 1 and result["engine"] == "rules"
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_semantic_llm.py -q -p no:cacheprovider`
Expected: FAIL ตอนเก็บเทสต์ด้วย `ImportError: cannot import name 'semantic_llm' from 'app.api'`

- [ ] **Step 3: เขียนโค้ด**

สร้าง `services/api/app/api/semantic_llm.py`:

```python
"""Groq draft of a dataset's semantic layer (column meaning + metrics).

Same privacy rule as the dashboard prompt: column names, kinds and ranges only, never a
cell value, and never the name of a column that is currently hidden as personal data.
Hidden columns keep their rule guess and stay flagged as personal."""
import json
import logging
import time

from . import dashboard_llm
from .dashboard_spec import SpecError
from .semantic_layer import (DEFAULT_AGGS, DURATION_UNITS, METRIC_AGGS, METRIC_FORMATS, ROLES, UNITS, WHERE_OPS,
                             SemanticError, metric_columns, rule_draft, validate_semantic)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = f"""You are a data steward. Describe what each column of a dataset means for business dashboards.
Reply with ONE JSON object and nothing else, following this schema:
{{
  "columns": {{"<column name>": {{
    "role": one of {json.dumps(list(ROLES))},
    "label": short display name in Thai,
    "description": one sentence in Thai,
    "unit": one of {json.dumps(list(UNITS))} or null,
    "currency": ISO 4217 code or null,
    "duration_unit": one of {json.dumps(list(DURATION_UNITS))} or null,
    "default_agg": one of {json.dumps(list(DEFAULT_AGGS))} or null,
    "pii": boolean
  }}}},
  "metrics": [{{
    "id": snake_case string, "label": string, "description": string,
    "type": "simple" | "ratio",
    "measure": {{"agg": one of {json.dumps(list(METRIC_AGGS))}, "column": string or null,
                "where": null or {{"column": string, "op": one of {json.dumps(list(WHERE_OPS))}, "value": any}}}},
    "numerator": same shape as measure, "denominator": same shape as measure,
    "format": one of {json.dumps(list(METRIC_FORMATS))}, "currency": ISO 4217 code or null,
    "higher_is_better": boolean
  }}]
}}
Rules:
- Describe every column in the profile using its exact name; "hint_role" and "hint_pii" are guesses from the name you may correct.
- measure needs kind numeric; time needs kind date; identifier means codes and keys (never summed).
- unit applies to measures only; percent means values from 0 to 100.
- pii is true for data about a person: names, contacts, addresses, national ids, birth dates.
- Set currency only when the column name makes it clear; otherwise null.
- Propose 3 to 8 business metrics, including ratios where they make sense (margin, average order value, rates).
  Use count_distinct of an identifier for "number of orders" or "number of customers". Never use a pii column."""


def build_messages(table_name, profile):
    """The prompt: dataset name, row count and the column profile with the rule guesses.
    `profile` must already be without the hidden columns."""
    hints = rule_draft(profile)["columns"]
    columns = [{**c, "hint_role": hints[c["name"]]["role"], "hint_pii": hints[c["name"]]["pii"]}
               for c in dashboard_llm.profile_for_prompt(profile)["columns"]]
    user = {"dataset": table_name, "rows": profile["rows"], "columns": columns}
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def _accept(content, profile):
    try:
        raw = dashboard_llm.parse_json_object(content)
    except SpecError as exc:
        raise SemanticError(str(exc)) from exc
    semantic, warnings = validate_semantic(raw, profile)
    if not semantic["columns"]:
        raise SemanticError("ไม่มีคอลัมน์ที่ใช้ได้")
    return semantic, warnings


def _ask(messages, profile):
    """(semantic, warnings, model). One retry that tells the LLM why it was rejected, only
    when the first answer came back within dashboard_llm.RETRY_BUDGET_S."""
    started = time.monotonic()
    key, model = dashboard_llm.groq_settings()
    if not key:
        raise dashboard_llm.LLMUnavailable("ยังไม่ได้ตั้งค่า Groq API key")
    content = dashboard_llm.call_groq(messages, key, model)
    try:
        semantic, warnings = _accept(content, profile)
    except SemanticError as exc:
        if time.monotonic() - started > dashboard_llm.RETRY_BUDGET_S:
            raise  # no time left for a second call before the proxy gives up on the request
        retry = messages + [
            {"role": "assistant", "content": content},
            {"role": "user", "content": f"That answer was rejected: {exc}. Reply again with the corrected JSON object only."},
        ]
        semantic, warnings = _accept(dashboard_llm.call_groq(retry, key, model), profile)
    return semantic, warnings, model


def draft_semantic(table_name, profile, hidden=()):
    """{"semantic": {"columns", "metrics"}, "warnings", "engine": "groq" | "rules", "model"}.
    columns cover every column of the profile; hidden columns are never sent and stay personal."""
    hidden = set(hidden)
    rules = rule_draft(profile)
    visible = {**profile, "columns": [c for c in profile["columns"] if c["name"] not in hidden]}
    try:
        drafted, warnings, model = _ask(build_messages(table_name, visible), visible)
        engine = "groq"
    except (dashboard_llm.LLMUnavailable, SemanticError) as exc:
        logger.warning("Semantic draft fell back to rules: %s", exc)
        drafted, warnings, model, engine = rules, [f"ใช้ร่างแบบกฎแทน AI: {exc}"], None, "rules"

    columns = {}
    for c in profile["columns"]:
        name = c["name"]
        meta = drafted["columns"].get(name) or rules["columns"][name]
        if name in hidden:
            meta = {**meta, "pii": True}
        elif rules["columns"][name]["pii"] and not meta["pii"]:
            meta = {**meta, "pii": True}
            warnings.append(f"{name}: ชื่อคอลัมน์บ่งว่าเป็นข้อมูลส่วนบุคคล จึงติดไว้ก่อน ให้คนตรวจอีกครั้ง")
        columns[name] = meta

    private = {n for n, m in columns.items() if m["pii"]}
    metrics = []
    for metric in drafted["metrics"]:
        if set(metric_columns(metric)) & private:
            warnings.append(f"ตัด metric '{metric['label']}': อ้างคอลัมน์ข้อมูลส่วนบุคคล")
        else:
            metrics.append(metric)
    return {"semantic": {"columns": columns, "metrics": metrics}, "warnings": warnings, "engine": engine, "model": model}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: คำสั่งเดียวกับ Step 2 แล้วรัน API ทั้งชุด
Expected: `6 passed`; ทั้งชุด 506 ผ่าน + 9 ล้มเดิม

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/api/app/api/semantic_llm.py services/api/tests/test_semantic_llm.py && git commit -m "feat(semantic): Groq draft of column meaning and metrics without personal data"
```

---

### Task 5: Router `/api/v1/semantic` และการเก็บใน Elasticsearch

**Files:**
- Create: `services/api/app/api/semantic.py`
- Modify: `services/api/main.py`, `services/api/tests/test_route_contract.py`
- Test: `services/api/tests/test_semantic_api.py`

**Interfaces:**
- Consumes: `resolve`, `validate_semantic` (Task 1, 2); `semantic_llm.draft_semantic` (Task 4); `dashboard_compute.metric_values` (Task 3); `dashboard_data.load_active_dataset(table) -> (df, profile)` (ตรวจชื่อด้วย `validate_table_name` ให้แล้ว และ raise `HTTPException` 404 เมื่อไม่มีตาราง); `auth.require_session` (dependency คืนชื่อผู้ใช้); `config.get_es_client()` (raise `HTTPException(503)` เมื่อ ES ล่ม); ในเทสต์ `tests/fakes.py` `FakeES` (มี `.docs[index][id]`, `index`, `search` ที่รองรับ `term` บน `<field>.keyword`, `indices.exists`)
- Produces (ใช้ใน Task 8, 10):
  - `SEMANTIC_INDEX = "sdoqap_semantic_layer"`, `MAX_HISTORY = 10`
  - `encode_doc(doc) -> es_source` และ `decode_doc(es_source) -> doc` (ใน ES ส่วน `draft`/`approved` เก็บ `{"columns", "metrics"}` เป็นสตริง `content_json` ตาม spec 4.3)
  - `read_doc(es, table_name) -> doc | None`
  - `load_view(table_name, profile, es_or_None) -> view` (ES เป็น `None` หรืออ่านไม่ได้ = สถานะ `unavailable` ที่ยังซ่อนตามกฎชื่อคอลัมน์)
  - Route (login ทุกเส้น): `GET /api/v1/semantic/{table_name}` -> view + `metric_values`; `POST /{table_name}/draft` -> view + `metric_values`, `engine`, `model`, `warnings`; `PUT /{table_name}/draft` body `{"columns", "metrics"}` -> view; `POST /{table_name}/approve` body `{"columns", "metrics", "base_version"}` -> view หรือ 409 `"มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่"`; ES ล่ม: GET 200 `unavailable`, POST/PUT 503
  - เวอร์ชันที่บันทึก (draft และ approved) มีทุกคอลัมน์ของชุดข้อมูลเสมอ (คอลัมน์ที่ body ไม่ส่งมาคงความหมายปัจจุบัน)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_semantic_api.py`:

```python
import json
import os
import sys

import pandas as pd
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_llm, semantic  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

RAW = pd.DataFrame({"Order_ID": ["A", "B", "C"], "Customer_Name": ["x", "y", "z"], "Region": ["N", "S", "N"],
                    "Total_Sales": [10.0, 20.0, 30.0], "Profit": [1.0, 2.0, 3.0]})
DF, PROFILE = dashboard_data.prepare_frame(RAW.copy())
BASE = "/api/v1/semantic/sales"
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "usd", "default_agg": "sum", "pii": False}
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent"}
BODY = {"columns": {"Total_Sales": USD}, "metrics": [GROSS]}


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    monkeypatch.setattr(semantic, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client(logged_in=True):
    app = FastAPI()
    app.include_router(semantic.router)
    cookies = {SESSION_COOKIE_NAME: create_session_token("tester")} if logged_in else None
    return TestClient(app, cookies=cookies)


def test_every_route_needs_a_login(es):
    c = client(logged_in=False)
    assert c.get(BASE).status_code == 401
    assert c.post(f"{BASE}/draft").status_code == 401
    assert c.put(f"{BASE}/draft", json=BODY).status_code == 401
    assert c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}).status_code == 401


def test_first_look_is_the_rule_guess_with_current_values(es):
    view = client().get(BASE).json()
    assert view["status"] == "none" and view["version"] == 0
    assert view["hidden_columns"] == ["Customer_Name"]
    assert view["effective"]["columns"]["Order_ID"]["role"] == "identifier"
    assert view["metric_values"] == {"row_count": 3, "total_total_sales": 60.0, "total_profit": 6.0}


def test_ai_draft_without_a_key_saves_the_rule_draft(es):
    view = client().post(f"{BASE}/draft").json()
    assert view["engine"] == "rules" and view["status"] == "draft"
    assert view["warnings"][0].startswith("ใช้ร่างแบบกฎแทน AI")
    stored = es.docs[semantic.SEMANTIC_INDEX]["sales"]["draft"]
    assert isinstance(stored["content_json"], str) and "columns" not in stored
    assert client().get(BASE).json()["status"] == "draft"


def test_ai_draft_with_groq(es, monkeypatch):
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", lambda messages, key, model: json.dumps(BODY, ensure_ascii=False))
    view = client().post(f"{BASE}/draft").json()
    assert view["engine"] == "groq" and view["model"] == "openai/gpt-oss-120b"
    assert view["effective"]["columns"]["Total_Sales"]["currency"] == "USD"
    assert view["metric_values"]["gross_margin"] == 10.0
    assert view["hidden_columns"] == ["Customer_Name"]


def test_saving_edits_as_a_draft(es):
    body = {"columns": {"Profit": {"role": "measure", "unit": "dollars"}}, "metrics": []}
    view = client().put(f"{BASE}/draft", json=body).json()
    assert view["draft"]["generated_by"] == "user" and view["draft"]["updated_by"] == "tester"
    assert any("dollars" in w for w in view["warnings"])
    assert set(view["draft"]["columns"]) == {c["name"] for c in PROFILE["columns"]}


def test_approval_versions_clears_the_draft_and_refuses_a_stale_base(es):
    c = client()
    c.put(f"{BASE}/draft", json=BODY)
    first = c.post(f"{BASE}/approve", json={**BODY, "base_version": 0}).json()
    assert first["status"] == "approved" and first["version"] == 1 and first["draft"] is None
    assert first["approved"]["approved_by"] == "tester" and len(first["history"]) == 1
    assert set(first["approved"]["columns"]) == {c["name"] for c in PROFILE["columns"]}
    assert first["metric_values"]["gross_margin"] == 10.0
    stale = c.post(f"{BASE}/approve", json={**BODY, "base_version": 0})
    assert stale.status_code == 409 and "โหลดใหม่" in stale.json()["detail"]
    second = c.post(f"{BASE}/approve", json={**BODY, "base_version": 1}).json()
    assert second["version"] == 2 and len(second["history"]) == 2


def test_a_new_column_makes_the_approval_outdated(es, monkeypatch):
    client().post(f"{BASE}/approve", json={**BODY, "base_version": 0})
    df, profile = dashboard_data.prepare_frame(RAW.assign(Coupon=["a", "b", "c"]))
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (df, profile))
    view = client().get(BASE).json()
    assert view["status"] == "approved_outdated" and view["drift"]["new_columns"] == ["Coupon"]


def test_without_elasticsearch_reading_still_hides_personal_columns_and_writing_is_refused(es, monkeypatch):
    def offline():
        raise HTTPException(status_code=503, detail="Elasticsearch service is offline")

    monkeypatch.setattr(semantic, "get_es_client", offline)
    view = client().get(BASE).json()
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]
    assert client().put(f"{BASE}/draft", json=BODY).status_code == 503


def test_unknown_dataset_is_404(es, monkeypatch):
    def missing(name):
        raise HTTPException(status_code=404, detail="Delta log not found")

    monkeypatch.setattr(dashboard_data, "load_active_dataset", missing)
    assert client().get(BASE).status_code == 404


def test_a_failing_read_counts_as_unavailable_and_still_hides():
    class Broken(FakeES):
        def search(self, *args, **kwargs):
            raise ConnectionError("es down")

    broken = Broken()
    broken.index(semantic.SEMANTIC_INDEX, "sales", {"table_name": "sales"})
    view = semantic.load_view("sales", PROFILE, broken)
    assert view["status"] == "unavailable" and view["hidden_columns"] == ["Customer_Name"]
```

แก้ `services/api/tests/test_route_contract.py` ด้วย Edit tool: แทน

```python
    ("DELETE", "/api/v1/dashboards/saved/D1", "/api/v1/dashboards/saved/{dashboard_id}"),
```

ด้วย

```python
    ("DELETE", "/api/v1/dashboards/saved/D1", "/api/v1/dashboards/saved/{dashboard_id}"),
    # DashboardBuilder.jsx via utils/semanticApi.js
    ("GET", "/api/v1/semantic/t1", "/api/v1/semantic/{table_name}"),
    ("POST", "/api/v1/semantic/t1/draft", "/api/v1/semantic/{table_name}/draft"),
    ("PUT", "/api/v1/semantic/t1/draft", "/api/v1/semantic/{table_name}/draft"),
    ("POST", "/api/v1/semantic/t1/approve", "/api/v1/semantic/{table_name}/approve"),
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_semantic_api.py tests/test_route_contract.py -q -p no:cacheprovider`
Expected: FAIL (`ImportError: cannot import name 'semantic' from 'app.api'` ตอนเก็บ `test_semantic_api.py`)

- [ ] **Step 3: เขียนโค้ด**

สร้าง `services/api/app/api/semantic.py`:

```python
"""Semantic layer API: column meaning and metric definitions per dataset, drafted by AI
(or by the name rules), edited and approved by a person. Stored in the ES index
sdoqap_semantic_layer, one document per dataset (id = dataset name)."""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import dashboard_data, semantic_llm
from .auth import require_session
from .config import get_es_client
from .dashboard_compute import metric_values
from .semantic_layer import resolve, validate_semantic

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/semantic", tags=["semantic"], dependencies=[Depends(require_session)])

SEMANTIC_INDEX = "sdoqap_semantic_layer"
MAX_HISTORY = 10


class SemanticPayload(BaseModel):
    columns: Dict[str, Any] = Field(default_factory=dict)
    metrics: List[Any] = Field(default_factory=list)


class ApprovePayload(SemanticPayload):
    base_version: int = Field(ge=0)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _encode_part(part):
    if not part:
        return None
    meta = {k: v for k, v in part.items() if k not in ("columns", "metrics")}
    # A string, not an object: column and metric fields would fight over one ES mapping.
    return {**meta, "content_json": json.dumps({"columns": part["columns"], "metrics": part["metrics"]}, ensure_ascii=False)}


def _decode_part(part):
    if not part:
        return None
    meta = {k: v for k, v in part.items() if k != "content_json"}
    return {**meta, **json.loads(part["content_json"])}


def encode_doc(doc):
    return {"table_name": doc["table_name"], "draft": _encode_part(doc.get("draft")),
            "approved": _encode_part(doc.get("approved")), "history": doc.get("history") or []}


def decode_doc(source):
    return {"table_name": source["table_name"], "draft": _decode_part(source.get("draft")),
            "approved": _decode_part(source.get("approved")), "history": source.get("history") or []}


def read_doc(es, table_name):
    if not es.indices.exists(index=SEMANTIC_INDEX):
        return None
    res = es.search(index=SEMANTIC_INDEX, query={"bool": {"filter": [{"term": {"table_name.keyword": table_name}}]}}, size=1)
    hits = res["hits"]["hits"]
    return decode_doc(hits[0]["_source"]) if hits else None


def _write(es, doc):
    es.index(index=SEMANTIC_INDEX, id=doc["table_name"], document=encode_doc(doc), refresh="wait_for")


def _es_or_none():
    try:
        return get_es_client()
    except HTTPException:
        return None


def load_view(table_name, profile, es):
    """The semantic view Create Dashboard uses. Without Elasticsearch it is the rule
    guess (status "unavailable"), which still hides columns whose names look personal."""
    if es is None:
        return resolve(table_name, None, profile, available=False)
    try:
        doc = read_doc(es, table_name)
    except Exception:  # ES answered the ping but not the read: hide by the name rules, as when it is down
        logger.warning("Reading the semantic layer of %s failed; using the name rules", table_name, exc_info=True)
        return resolve(table_name, None, profile, available=False)
    return resolve(table_name, doc, profile)


def _empty(table_name):
    return {"table_name": table_name, "draft": None, "approved": None, "history": []}


def _complete(semantic, view, profile):
    """Columns the body left out keep their current meaning, so a stored version always
    covers every column of the dataset."""
    columns = {c["name"]: semantic["columns"].get(c["name"], view["effective"]["columns"][c["name"]])
               for c in profile["columns"]}
    return {"columns": columns, "metrics": semantic["metrics"]}


def _answer(table_name, doc, profile, df, warnings=()):
    view = resolve(table_name, doc, profile)
    view["metric_values"] = metric_values(df, view["effective"]["metrics"])
    view["warnings"] = list(warnings) + view["warnings"]
    return view


@router.get("/{table_name}")
def get_semantic(table_name: str):
    df, profile = dashboard_data.load_active_dataset(table_name)
    view = load_view(table_name, profile, _es_or_none())
    view["metric_values"] = metric_values(df, view["effective"]["metrics"])
    return view


@router.post("/{table_name}/draft")
def draft_semantic_with_ai(table_name: str, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    doc = read_doc(es, table_name) or _empty(table_name)
    current = resolve(table_name, doc, profile)
    result = semantic_llm.draft_semantic(table_name, profile, current["hidden_columns"])
    doc["draft"] = {**result["semantic"], "generated_by": result["engine"], "model": result["model"],
                    "updated_by": user, "updated_at": _now()}
    _write(es, doc)
    view = _answer(table_name, doc, profile, df, result["warnings"])
    view.update(engine=result["engine"], model=result["model"])
    return view


@router.put("/{table_name}/draft")
def save_semantic_draft(table_name: str, payload: SemanticPayload, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    doc = read_doc(es, table_name) or _empty(table_name)
    semantic_doc, warnings = validate_semantic(payload.model_dump(), profile)
    current = resolve(table_name, doc, profile)
    doc["draft"] = {**_complete(semantic_doc, current, profile), "generated_by": "user", "model": None,
                    "updated_by": user, "updated_at": _now()}
    _write(es, doc)
    return _answer(table_name, doc, profile, df, warnings)


@router.post("/{table_name}/approve")
def approve_semantic(table_name: str, payload: ApprovePayload, user: str = Depends(require_session)):
    es = get_es_client()
    df, profile = dashboard_data.load_active_dataset(table_name)
    doc = read_doc(es, table_name) or _empty(table_name)
    version = (doc.get("approved") or {}).get("version", 0)
    if payload.base_version != version:
        raise HTTPException(status_code=409, detail="มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่")
    semantic_doc, warnings = validate_semantic(payload.model_dump(exclude={"base_version"}), profile)
    current = resolve(table_name, doc, profile)
    now = _now()
    doc["approved"] = {**_complete(semantic_doc, current, profile), "version": version + 1,
                       "approved_by": user, "approved_at": now}
    doc["draft"] = None
    doc["history"] = ([{"version": version + 1, "approved_by": user, "approved_at": now}] + doc["history"])[:MAX_HISTORY]
    _write(es, doc)
    return _answer(table_name, doc, profile, df, warnings)
```

แก้ `services/api/main.py` ด้วย Edit tool สองจุด:

(ก) แทน

```python
from app.api.dashboards import router as dashboards_router
```

ด้วย

```python
from app.api.dashboards import router as dashboards_router
from app.api.semantic import router as semantic_router
```

(ข) แทน

```python
app.include_router(dashboards_router)
```

ด้วย

```python
app.include_router(dashboards_router)
app.include_router(semantic_router)
```

- [ ] **Step 4: รันให้ผ่าน**

Run: คำสั่งเดียวกับ Step 2 แล้วรัน API ทั้งชุด
Expected: `105 passed` (10 ของ semantic + 95 ของ route contract); ทั้งชุด 520 ผ่าน + 9 ล้มเดิม

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/api/app/api/semantic.py services/api/main.py services/api/tests/test_semantic_api.py services/api/tests/test_route_contract.py && git commit -m "feat(semantic): /api/v1/semantic routes to draft, edit and approve column meaning"
```

---

### Task 6: สเปกแดชบอร์ดและการคำนวณใช้ semantic layer

**Files:**
- Modify: `services/api/app/api/dashboard_spec.py` (LF)
- Modify: `services/api/app/api/dashboard_compute.py` (**CRLF**: แก้ด้วย Edit tool)
- Test: `services/api/tests/test_dashboard_semantic_spec.py`

**Interfaces:**
- Consumes: `resolve`, `apply_to_profile` (Task 2); `evaluate_metric`, `grouped_metric` (Task 3)
- Produces (ใช้ใน Task 7, 8, 9):
  - `validate_spec(raw, profile, metrics=None) -> (spec, warnings)`: profile อาจมี `role`/`label`/`unit`/`currency` ต่อคอลัมน์; `metric` ของวิดเจ็ตเป็น `{"agg", "column"}` หรือ `{"metric_id": id}` (id ต้องอยู่ใน `metrics`); วิดเจ็ตที่มี metric ได้ฟิลด์ `format`, `currency` (ISO หรือ `None`), `higher_is_better` (bool) เสมอ
  - `compute_dashboard(df, spec, profile, selections=None, metrics=None) -> {"widgets", "filter_options", "rows_total", "rows_after_filter", "column_labels": {column: label}}` (`column_labels` มีเฉพาะคอลัมน์ใน profile ที่ส่งเข้ามา ซึ่งไม่มีคอลัมน์ซ่อน)
- กติกา (spec 11.1 ถึง 11.2):
  - role `identifier` ใช้กับ sum/avg/min/max ไม่ได้ ใช้เป็น `x` ไม่ได้ (วิดเจ็ตถูกตัดพร้อมเหตุผล) และเป็น `group_by` ไม่ได้ (กลับเป็น `None`) แต่ใช้ในตาราง ตัวกรอง และ count/count_distinct ได้
  - `format`/`currency`: `metric_id` ใช้ของ metric; count, count_distinct, count_missing ได้ `number`; คอลัมน์ role measure ใช้หน่วยของคอลัมน์ (currency ได้ `currency` + รหัส, percent กับ agg ที่ไม่ใช่ sum ได้ `percent`, อื่นๆ `number`); ไม่มีข้อมูล semantic ใช้ `format` ที่ LLM ส่งมา
  - ชื่อวิดเจ็ตเริ่มต้นและชื่อตัวกรองเริ่มต้นใช้ label ของคอลัมน์ ชื่อเริ่มต้นของวิดเจ็ต `metric_id` ใช้ label ของ metric
  - คอลัมน์ในตารางที่ไม่มีใน profile (เช่นถูกซ่อน) ถูกตัดพร้อม warning
  - profile ดิบ (ไม่มี role) และ `metrics=None` ต้องได้ผลเหมือนเดิมทุกอย่าง ยกเว้นฟิลด์ใหม่ `currency: None`, `higher_is_better: True`, `column_labels` และ format ของการนับเป็น `number`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_dashboard_semantic_spec.py`:

```python
import os
import sys

import pandas as pd
import pytest

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api.dashboard_compute import compute_dashboard  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402
from app.api.dashboard_spec import validate_spec  # noqa: E402
from app.api.semantic_layer import apply_to_profile, resolve  # noqa: E402

DF, RAW_PROFILE = prepare_frame(pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Invoice_No": [11, 12, 13, 14], "Region": ["N", "S", "N", "E"],
    "Total_Sales": [100.0, 200.0, 50.0, 150.0], "Profit": [10.0, 50.0, 5.0, 45.0],
    "Customer_Name": ["Ann", "Bob", "Cid", "Dee"]}))
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent", "higher_is_better": True}
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
VIEW = resolve("sales", {"approved": {"columns": {"Total_Sales": USD}, "metrics": [GROSS], "version": 1}}, RAW_PROFILE)
PROFILE = apply_to_profile(RAW_PROFILE, VIEW)
METRICS = VIEW["effective"]["metrics"]


def check(*widgets, filters=()):
    return validate_spec({"widgets": list(widgets), "filters": list(filters)}, PROFILE, METRICS)


def test_a_kpi_can_use_an_approved_metric_and_takes_its_presentation():
    spec, warnings = check({"id": "k", "type": "kpi", "metric": {"metric_id": "gross_margin"}})
    (kpi,) = spec["widgets"]
    assert warnings == [] and kpi["metric"] == {"metric_id": "gross_margin"}
    assert (kpi["title"], kpi["format"], kpi["currency"], kpi["higher_is_better"]) == ("Gross Margin", "percent", None, True)
    assert compute_dashboard(DF, spec, PROFILE, metrics=METRICS)["widgets"]["k"]["value"] == pytest.approx(22.0)


def test_unknown_metric_ids_are_dropped():
    spec, warnings = check({"type": "kpi", "metric": {"agg": "count", "column": None}},
                           {"type": "kpi", "title": "ไม่มี", "metric": {"metric_id": "nope"}},
                           {"type": "kpi", "title": "ผิดชนิด", "metric": {"metric_id": ["gross_margin"]}})
    assert len(spec["widgets"]) == 1
    assert "nope" in " ".join(warnings) and "ผิดชนิด" in " ".join(warnings)


def test_column_units_decide_the_number_format_not_the_llm():
    spec, _ = check({"type": "kpi", "metric": {"agg": "sum", "column": "Total_Sales"}, "format": "number"},
                    {"type": "kpi", "metric": {"agg": "count_distinct", "column": "Order_ID"}, "format": "currency"},
                    {"type": "kpi", "metric": {"agg": "count", "column": None}, "format": "percent"})
    money, orders, rows = spec["widgets"]
    assert (money["format"], money["currency"]) == ("currency", "USD")
    assert money["title"] == "sum(ยอดขาย)"
    assert (orders["format"], orders["currency"]) == ("number", None)
    assert rows["format"] == "number"


def test_identifiers_are_never_summed_or_used_as_chart_axes():
    spec, warnings = check({"type": "kpi", "metric": {"agg": "count", "column": None}},
                           {"type": "kpi", "title": "รวมเลขใบแจ้งหนี้", "metric": {"agg": "sum", "column": "Invoice_No"}},
                           {"type": "bar", "title": "ตามออเดอร์", "x": "Order_ID", "metric": {"agg": "count", "column": None}},
                           {"type": "bar", "title": "ตามภูมิภาค", "x": "Region", "group_by": "Order_ID",
                            "metric": {"agg": "count", "column": None}})
    assert [w["title"] for w in spec["widgets"]] == ["จำนวนแถว", "ตามภูมิภาค"]
    assert spec["widgets"][1]["group_by"] is None
    text = " ".join(warnings)
    assert "Invoice_No" in text and "Order_ID" in text


def test_hidden_personal_columns_cannot_be_used():
    spec, warnings = check({"type": "kpi", "metric": {"agg": "count", "column": None}},
                           {"type": "bar", "title": "ตามชื่อ", "x": "Customer_Name", "metric": {"agg": "count", "column": None}},
                           {"type": "table", "title": "รายการ", "columns": ["Region", "Customer_Name"]},
                           {"type": "table", "title": "ทั้งหมด"}, filters=[{"column": "Customer_Name"}])
    assert [w["type"] for w in spec["widgets"]] == ["kpi", "table", "table"]
    assert spec["widgets"][1]["columns"] == ["Region"]
    assert "Customer_Name" not in spec["widgets"][2]["columns"] and spec["filters"] == []
    text = " ".join(warnings)
    assert "ตามชื่อ" in text and "'รายการ': ตัดคอลัมน์ Customer_Name" in text and "ตัดตัวกรอง: ไม่มีคอลัมน์ Customer_Name" in text


def test_filters_are_labelled_with_the_column_label():
    spec, _ = check({"type": "kpi", "metric": {"agg": "count", "column": None}}, filters=[{"column": "Total_Sales"}])
    assert spec["filters"][0]["label"] == "ยอดขาย"


def test_grouped_metrics_are_computed_per_group_and_labels_come_back():
    spec, _ = check({"id": "b", "type": "bar", "x": "Region", "metric": {"metric_id": "gross_margin"}})
    assert spec["widgets"][0]["title"] == "Gross Margin ตาม Region"
    result = compute_dashboard(DF, spec, PROFILE, metrics=METRICS)
    rows = result["widgets"]["b"]["rows"]
    assert [r["x"] for r in rows] == ["E", "S", "N"]
    assert [r["value"] for r in rows] == pytest.approx([30.0, 25.0, 10.0])
    assert result["column_labels"]["Total_Sales"] == "ยอดขาย" and result["column_labels"]["Region"] == "Region"
    assert "Customer_Name" not in result["column_labels"]


def test_a_kpi_compare_uses_the_metric_definition_per_period():
    df, raw = prepare_frame(pd.DataFrame({
        "Order_Date": ["2025-01-05", "2025-01-20", "2025-02-03", "2025-02-28"],
        "Total_Sales": [100.0, 100.0, 200.0, 200.0], "Profit": [10.0, 30.0, 20.0, 20.0]}))
    view = resolve("sales", {"approved": {"columns": {}, "metrics": [GROSS], "version": 1}}, raw)
    profile, metrics = apply_to_profile(raw, view), view["effective"]["metrics"]
    spec, _ = validate_spec({"widgets": [{"id": "k", "type": "kpi", "metric": {"metric_id": "gross_margin"},
                                          "compare": {"date_column": "Order_Date", "time_grain": "month"}}]}, profile, metrics)
    kpi = compute_dashboard(df, spec, profile, metrics=metrics)["widgets"]["k"]
    assert (kpi["value"], kpi["current"], kpi["previous"], kpi["change_pct"]) == (13.3333, 10.0, 20.0, -50.0)


def test_validating_twice_with_semantics_changes_nothing():
    spec, _ = check({"type": "kpi", "metric": {"metric_id": "gross_margin"}},
                    {"type": "bar", "x": "Region", "metric": {"agg": "sum", "column": "Total_Sales"}},
                    filters=[{"column": "Region"}])
    again, warnings = validate_spec(spec, PROFILE, METRICS)
    assert again == spec and warnings == []


def test_without_semantics_the_llm_format_still_applies():
    _, raw = prepare_frame(pd.DataFrame({"amount": [1.0, 2.0], "region": ["a", "b"]}))
    spec, _ = validate_spec({"widgets": [{"type": "kpi", "metric": {"agg": "sum", "column": "amount"}, "format": "currency"}]}, raw)
    (kpi,) = spec["widgets"]
    assert (kpi["format"], kpi["currency"], kpi["higher_is_better"]) == ("currency", None, True)
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_dashboard_semantic_spec.py -q -p no:cacheprovider`
Expected: FAIL 10 ตัว ส่วนใหญ่ด้วย `TypeError: validate_spec() takes 2 positional arguments but 3 were given` และตัวสุดท้ายด้วย `KeyError: 'currency'`

- [ ] **Step 3: แก้ `dashboard_spec.py`** (Edit tool ทีละจุด ตามลำดับ)

(1) หัวฟังก์ชัน `_metric`: แทน

```python
def _metric(raw, kinds):
    """(metric, problem). count takes no column; sum/avg/min/max need a numeric one."""
    if not isinstance(raw, dict):
        return None, "ไม่มี metric"
    agg, column = raw.get("agg"), raw.get("column")
```

ด้วย

```python
def _metric(raw, kinds, columns, by_id):
    """(metric, problem). count takes no column; sum/avg/min/max need a numeric column that is
    not an identifier; {"metric_id"} must name a usable metric of the semantic layer."""
    if not isinstance(raw, dict):
        return None, "ไม่มี metric"
    if "metric_id" in raw:
        metric_id = raw["metric_id"]
        if not isinstance(metric_id, str) or metric_id not in by_id:
            return None, f"ไม่มี metric {metric_id}"
        return {"metric_id": metric_id}, None
    agg, column = raw.get("agg"), raw.get("column")
```

(2) ท้ายฟังก์ชัน `_metric` และฟังก์ชัน `_default_title` ทั้งฟังก์ชัน: แทน

```python
    if agg in NUMERIC_AGGREGATIONS and kinds[column] != "numeric":
        return None, f"{agg} ใช้ได้กับคอลัมน์ตัวเลขเท่านั้น ({column})"
    return {"agg": agg, "column": column}, None


def _default_title(w):
    if w["type"] == "table":
        return "ตารางข้อมูล"
    metric = w["metric"]
    label = "จำนวนแถว" if metric["agg"] == "count" else f"{metric['agg']}({metric['column']})"
    return f"{label} ตาม {w['x']}" if w.get("x") else label
```

ด้วย

```python
    if agg in NUMERIC_AGGREGATIONS and kinds[column] != "numeric":
        return None, f"{agg} ใช้ได้กับคอลัมน์ตัวเลขเท่านั้น ({column})"
    if agg in NUMERIC_AGGREGATIONS and columns[column].get("role") == "identifier":
        return None, f"{agg} ใช้กับคอลัมน์รหัสไม่ได้ ({column})"
    return {"agg": agg, "column": column}, None


def _label(columns, name):
    """The display name of a column: its semantic label, or the column name."""
    return columns[name].get("label") or name


def _presentation(metric, raw, columns, by_id):
    """(format, currency, higher_is_better). The semantic layer decides; the format the LLM
    sent is used only when the semantic layer says nothing about the column."""
    if "metric_id" in metric:
        definition = by_id[metric["metric_id"]]
        return definition["format"], definition.get("currency"), definition.get("higher_is_better", True)
    if metric["agg"] in ("count", "count_distinct", "count_missing"):
        return "number", None, True
    meta = columns[metric["column"]]
    if meta.get("role") == "measure":
        if meta.get("unit") == "currency":
            return "currency", meta.get("currency"), True
        if meta.get("unit") == "percent" and metric["agg"] != "sum":
            return "percent", None, True
        return "number", None, True
    return (raw.get("format") if raw.get("format") in FORMATS else "number"), None, True


def _default_title(w, columns, by_id):
    if w["type"] == "table":
        return "ตารางข้อมูล"
    metric = w["metric"]
    if "metric_id" in metric:
        label = by_id[metric["metric_id"]]["label"]
    elif metric["agg"] == "count":
        label = "จำนวนแถว"
    else:
        label = f"{metric['agg']}({_label(columns, metric['column'])})"
    return f"{label} ตาม {_label(columns, w['x'])}" if w.get("x") else label
```

(3) หัวฟังก์ชัน `_widget`: แทน `def _widget(raw, kinds, warnings):` ด้วย `def _widget(raw, kinds, warnings, columns, by_id):`

(4) ในกิ่ง table ของ `_widget`: แทน

```python
        listed = raw.get("columns") if isinstance(raw.get("columns"), list) else []
        w["columns"] = list(dict.fromkeys(c for c in listed if _known(c, kinds)))[:MAX_TABLE_COLUMNS] or list(kinds)[:8]
```

ด้วย

```python
        listed = raw.get("columns") if isinstance(raw.get("columns"), list) else []
        unknown = [c for c in listed if isinstance(c, str) and c not in kinds]
        if unknown:
            warnings.append(f"'{name}': ตัดคอลัมน์ {', '.join(unknown)} ออกจากตาราง เพราะไม่มีในชุดข้อมูลหรือเป็นข้อมูลส่วนบุคคล")
        w["columns"] = list(dict.fromkeys(c for c in listed if _known(c, kinds)))[:MAX_TABLE_COLUMNS] or list(kinds)[:8]
```

(5) ในกิ่ง metric ของ `_widget`: แทน

```python
        metric, problem = _metric(raw.get("metric"), kinds)
        if problem:
            return drop(problem)
        w["metric"] = metric
        w["format"] = raw.get("format") if raw.get("format") in FORMATS else "number"
```

ด้วย

```python
        metric, problem = _metric(raw.get("metric"), kinds, columns, by_id)
        if problem:
            return drop(problem)
        w["metric"] = metric
        w["format"], w["currency"], w["higher_is_better"] = _presentation(metric, raw, columns, by_id)
```

(6) ตรวจแกน x: แทน

```python
        if not _known(x, kinds):
            return drop(f"ไม่มีคอลัมน์ {x}")
```

ด้วย

```python
        if not _known(x, kinds):
            return drop(f"ไม่มีคอลัมน์ {x}")
        if columns[x].get("role") == "identifier":
            return drop(f"ใช้คอลัมน์รหัส {x} เป็นแกนกราฟไม่ได้")
```

(7) group_by: แทน

```python
        w["group_by"] = group if _known(group, kinds) and group != w["x"] else None
```

ด้วย

```python
        usable = _known(group, kinds) and group != w["x"] and columns[group].get("role") != "identifier"
        w["group_by"] = group if usable else None
```

(8) ชื่อเริ่มต้น: แทน

```python
        w["title"] = _default_title(w)
```

ด้วย

```python
        w["title"] = _default_title(w, columns, by_id)
```

(9) หัวฟังก์ชัน `_filters`: แทน `def _filters(raw_filters, kinds, warnings):` ด้วย `def _filters(raw_filters, kinds, warnings, columns):`

(10) label ของตัวกรอง: แทน

```python
                    "label": _text(raw.get("label"), 40) or column})
```

ด้วย

```python
                    "label": _text(raw.get("label"), 40) or _label(columns, column)})
```

(11) หัวของ `validate_spec`: แทน

```python
def validate_spec(raw, profile):
    """(spec, warnings). Raises SpecError when raw is not an object or no widget survives."""
    if not isinstance(raw, dict):
        raise SpecError("สเปกต้องเป็น JSON object")
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
```

ด้วย

```python
def validate_spec(raw, profile, metrics=None):
    """(spec, warnings). Raises SpecError when raw is not an object or no widget survives.
    profile may carry the semantic fields of each column (semantic_layer.apply_to_profile:
    role, label, unit, currency) and metrics are the dataset's usable metric definitions."""
    if not isinstance(raw, dict):
        raise SpecError("สเปกต้องเป็น JSON object")
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    columns = {c["name"]: c for c in profile["columns"]}
    by_id = {m["id"]: m for m in metrics or []}
```

(12) ใน `validate_spec`: แทน `        result = _widget(item, kinds, warnings)` ด้วย `        result = _widget(item, kinds, warnings, columns, by_id)`

(13) ใน `validate_spec`: แทน `    filters = _filters(raw.get("filters"), kinds, warnings)` ด้วย `    filters = _filters(raw.get("filters"), kinds, warnings, columns)`

- [ ] **Step 4: แก้ `dashboard_compute.py`** (CRLF, Edit tool)

(1) แทนฟังก์ชัน `_pivot_rows`, `_kpi`, `_bar`, `_pie` ทั้งก้อน (อยู่ติดกันในไฟล์):

```python
def _pivot_rows(frame, keys, metric, group):
    """rows [{"x": key, <series>: value}] for the given x keys, and the series names."""
    if not group:
        totals = _grouped(frame, ["_x"], metric)
        return [{"x": k, "value": _value(totals.get(k))} for k in keys], ["value"]
    frame = frame.assign(_g=_labels(frame[group]))
    totals = _grouped(frame, ["_g"], metric)
    names = _top(totals, MAX_SERIES)
    if len(totals) > MAX_SERIES:
        frame = frame.assign(_g=frame["_g"].where(frame["_g"].isin(names), OTHER))
        names = names + [OTHER]
    cells = _grouped(frame, ["_x", "_g"], metric)
    return [{"x": k, **{s: _value(cells.get((k, s))) for s in names}} for k in keys], names


def _kpi(df, w):
    out = {"value": _value(_aggregate(df, w["metric"]))}
    compare = w.get("compare")
    if compare:
        buckets = _bucket(df[compare["date_column"]], compare["time_grain"])
        periods = sorted(buckets.dropna().unique())
        if len(periods) >= 2:
            current = _aggregate(df[buckets == periods[-1]], w["metric"])
            previous = _aggregate(df[buckets == periods[-2]], w["metric"])
            change = round((current - previous) / abs(previous) * 100, 1) if previous and current is not None else None
            out.update(current=_value(current), previous=_value(previous),
                       period=_day(periods[-1]), change_pct=change)
    return out


def _bar(df, w):
    frame = df.assign(_x=_x_labels(df, w))
    totals = _grouped(frame, ["_x"], w["metric"])
    if w["sort"] == "x":
        keys = sorted(totals.index)[: w["limit"]]
    else:
        keys = _top(totals, w["limit"], ascending=(w["sort"] == "asc"))
    rows, series = _pivot_rows(frame[frame["_x"].isin(keys)], keys, w["metric"], w["group_by"])
    return {"rows": rows, "series": series}


def _pie(df, w):
    frame = df.assign(_x=_x_labels(df, w))
    totals = _grouped(frame, ["_x"], w["metric"])
    keys = _top(totals, w["limit"])
    if len(totals) > len(keys):
        frame = frame.assign(_x=frame["_x"].where(frame["_x"].isin(keys), OTHER))
        totals = _grouped(frame, ["_x"], w["metric"])
        keys = keys + [OTHER]
    return {"rows": [{"x": k, "value": _value(totals.get(k))} for k in keys], "series": ["value"]}
```

ด้วย

```python
def _pivot_rows(frame, keys, definition, group):
    """rows [{"x": key, <series>: value}] for the given x keys, and the series names."""
    if not group:
        totals = grouped_metric(frame, ["_x"], definition)
        return [{"x": k, "value": _value(totals.get(k))} for k in keys], ["value"]
    frame = frame.assign(_g=_labels(frame[group]))
    totals = grouped_metric(frame, ["_g"], definition)
    names = _top(totals, MAX_SERIES)
    if len(totals) > MAX_SERIES:
        frame = frame.assign(_g=frame["_g"].where(frame["_g"].isin(names), OTHER))
        names = names + [OTHER]
    cells = grouped_metric(frame, ["_x", "_g"], definition)
    return [{"x": k, **{s: _value(cells.get((k, s))) for s in names}} for k in keys], names


def _kpi(df, w):
    definition = w["_definition"]
    out = {"value": evaluate_metric(df, definition)}
    compare = w.get("compare")
    if compare:
        buckets = _bucket(df[compare["date_column"]], compare["time_grain"])
        periods = sorted(buckets.dropna().unique())
        if len(periods) >= 2:
            current = evaluate_metric(df[buckets == periods[-1]], definition)
            previous = evaluate_metric(df[buckets == periods[-2]], definition)
            change = round((current - previous) / abs(previous) * 100, 1) if previous and current is not None else None
            out.update(current=current, previous=previous, period=_day(periods[-1]), change_pct=change)
    return out


def _bar(df, w):
    frame = df.assign(_x=_x_labels(df, w))
    totals = grouped_metric(frame, ["_x"], w["_definition"])
    if w["sort"] == "x":
        keys = sorted(totals.index)[: w["limit"]]
    else:
        keys = _top(totals, w["limit"], ascending=(w["sort"] == "asc"))
    rows, series = _pivot_rows(frame[frame["_x"].isin(keys)], keys, w["_definition"], w["group_by"])
    return {"rows": rows, "series": series}


def _pie(df, w):
    frame = df.assign(_x=_x_labels(df, w))
    totals = grouped_metric(frame, ["_x"], w["_definition"])
    keys = _top(totals, w["limit"])
    if len(totals) > len(keys):
        frame = frame.assign(_x=frame["_x"].where(frame["_x"].isin(keys), OTHER))
        totals = grouped_metric(frame, ["_x"], w["_definition"])
        keys = keys + [OTHER]
    return {"rows": [{"x": k, "value": _value(totals.get(k))} for k in keys], "series": ["value"]}
```

(2) ในฟังก์ชัน `_time` แทน

```python
    rows, series = _pivot_rows(frame, [label(t) for t in points], w["metric"], w["group_by"])
```

ด้วย

```python
    rows, series = _pivot_rows(frame, [label(t) for t in points], w["_definition"], w["group_by"])
```

(3) หัวของ `compute_dashboard`: แทน

```python
def compute_dashboard(df, spec, profile, selections=None):
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    filtered = apply_filters(df, selections, kinds)
    widgets = {}
    for w in spec["widgets"]:
        try:
            widgets[w["id"]] = _COMPUTE[w["type"]](filtered, w)
```

ด้วย

```python
def _definition(metric, by_id, fmt):
    """The metric definition behind a widget metric ({"metric_id"} or {"agg", "column"})."""
    if "metric_id" in metric:
        return by_id[metric["metric_id"]]
    return {"type": "simple", "format": fmt, "measure": {"agg": metric["agg"], "column": metric["column"], "where": None}}


def compute_dashboard(df, spec, profile, selections=None, metrics=None):
    """Numbers for every widget of a validated spec. metrics are the semantic-layer
    definitions that {"metric_id"} widgets name (semantic.load_view(...)["effective"]["metrics"])."""
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    by_id = {m["id"]: m for m in metrics or []}
    filtered = apply_filters(df, selections, kinds)
    widgets = {}
    for w in spec["widgets"]:
        try:
            item = dict(w)
            if "metric" in w:
                item["_definition"] = _definition(w["metric"], by_id, w.get("format", "number"))
            widgets[w["id"]] = _COMPUTE[w["type"]](filtered, item)
```

(4) ค่าที่ `compute_dashboard` คืน: แทน

```python
    return {"widgets": widgets, "filter_options": filter_options(df, spec),
            "rows_total": len(df), "rows_after_filter": len(filtered)}
```

ด้วย

```python
    return {"widgets": widgets, "filter_options": filter_options(df, spec),
            "rows_total": len(df), "rows_after_filter": len(filtered),
            "column_labels": {c["name"]: c.get("label") or c["name"] for c in profile["columns"]}}
```

`_pivot_rows`, `_kpi`, `_bar`, `_pie`, `_time` อ่านนิยามจาก `w["_definition"]` ที่ `compute_dashboard` ใส่ในสำเนาของวิดเจ็ต (`item = dict(w)`) สเปกที่ส่งกลับไม่มีคีย์นี้ การเรียก `grouped_metric` ก่อนที่จะนิยามในไฟล์ไม่มีปัญหาเพราะ Python หาชื่อตอนเรียก

- [ ] **Step 5: รันให้ผ่านและตรวจ line ending**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests -q -p no:cacheprovider -k "dashboard or semantic"` แล้วรัน API ทั้งชุด แล้ว `cd /c/ETL/.claude/worktrees/semantic-layer && git diff --stat services/api/app/api/dashboard_compute.py && git ls-files --eol services/api/app/api/dashboard_compute.py`
Expected: ผ่านทั้งหมด รวมเทสต์เดิม `test_dashboard_spec.py`, `test_dashboard_compute.py`, `test_dashboard_llm.py`, `test_dashboard_final_review.py`, `test_dashboards_api.py` โดยไม่แก้; ทั้งชุด 530 ผ่าน + 9 ล้มเดิม; diff ของ `dashboard_compute.py` ใน Task นี้ประมาณ `31 insertions(+), 17 deletions(-)`; eol ยังเป็น `w/crlf`

- [ ] **Step 6: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/api/app/api/dashboard_spec.py services/api/app/api/dashboard_compute.py services/api/tests/test_dashboard_semantic_spec.py && git commit -m "feat(dashboard): specs use approved metrics, column units, labels and identifiers"
```

---

### Task 7: พรอมต์ AI แดชบอร์ดแบบกฎ และกฎคำแนะนำอ่านความหมายคอลัมน์

**Files:**
- Modify: `services/api/app/api/dashboard_suggest.py` (LF)
- Modify: `services/api/app/api/dashboard_llm.py` (LF)
- Test: `services/api/tests/test_dashboard_semantic_ai.py`

**Interfaces:**
- Consumes: `resolve`, `apply_to_profile` (Task 2); `validate_spec(raw, profile, metrics)` (Task 6)
- Produces (ใช้ใน Task 8):
  - `dashboard_suggest.is_identifier(column, rows)` คืน `True` เมื่อ `column["role"] == "identifier"` แล้วจึงใช้ heuristic เดิม
  - `dashboard_suggest.suggest_from_profile(profile, audience="business", limit=6)` (signature เดิม) ไม่เสนอคอลัมน์ role identifier และใช้ `default_agg` ของคอลัมน์
  - `dashboard_suggest.suggest_refinements(profile, spec, limit=GAP_LIMIT, metrics=None)` (เพิ่ม `metrics` เป็น keyword ท้ายสุด) นับ KPI ที่เป็น `metric_id` แบบ simple ว่าครอบคอลัมน์นั้นแล้ว และไม่พังเมื่อวิดเจ็ตใช้ `metric_id`
  - `dashboard_llm.profile_for_prompt(profile)` เติม `role`, `label`, `unit`, `currency` เมื่อ profile มี
  - `dashboard_llm.build_generate_messages(table_name, profile, context, audience, metrics=None)`, `build_refine_messages(table_name, profile, spec, instruction, metrics=None)` ใส่ `metrics` (id, label, description, format) ใน user message เมื่อมี
  - `dashboard_llm.fallback_spec(profile, context="", audience="business", metrics=None)`, `generate_spec(table_name, profile, context, audience, metrics=None)`, `refine_spec(table_name, profile, spec, instruction, metrics=None)`
  - `dashboard_llm.rank_suggestions(...)` signature เดิม (profile ที่ Task 8 ส่งมาตัดคอลัมน์ซ่อนแล้ว)
- กติกา `fallback_spec` (spec 11.3) สำหรับกลุ่มที่ไม่ใช่ steward: KPI จาก metric ใน `metrics` ก่อน (สูงสุด 4) แล้วเติมด้วย measure ตาม `default_agg` จนครบ 4 ใบ ข้าม measure ที่ metric แบบ simple (ไม่มี where) ครอบแล้ว ไม่ใช้คอลัมน์ identifier ไม่รวมตัวเลขที่ role ไม่ใช่ measure ชื่อวิดเจ็ตใช้ label เมื่อไม่มี metric และไม่มี role ผลต้องเหมือนเดิม (เทสต์เดิมใน `test_dashboard_llm.py` ล็อกไว้)
- ข้อความคำแนะนำยังมีชื่อคอลัมน์จริงเสมอ (ไม่แทนด้วย label)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_dashboard_semantic_ai.py`:

```python
"""The AI prompts, the rule-based dashboard and the suggestion rules read the semantic layer."""
import json
import os
import sys

import pandas as pd

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)

from app.api import dashboard_llm  # noqa: E402
from app.api.dashboard_data import prepare_frame  # noqa: E402
from app.api.dashboard_spec import validate_spec  # noqa: E402
from app.api.dashboard_suggest import suggest_from_profile, suggest_refinements  # noqa: E402
from app.api.semantic_layer import apply_to_profile, resolve  # noqa: E402

DF, RAW = prepare_frame(pd.DataFrame({
    "Order_ID": [f"o{i}" for i in range(12)],
    "Order_Date": [f"2025-{m:02d}-10" for m in range(1, 13)],
    "Customer_Name": [f"SECRET-PERSON-{i}" for i in range(12)],
    "Region": ["North", "South", "East"] * 4,
    "Store_Code": [1, 2] * 6,
    "Total_Sales": [100.5 + i for i in range(12)],
    "Profit": [10.25 + i for i in range(12)],
    "Rating": [3.5, 4.0, 4.5] * 4,
}))
GROSS = {"id": "gross_margin", "label": "Gross Margin", "description": "กำไรต่อยอดขาย", "type": "ratio",
         "numerator": {"agg": "sum", "column": "Profit"}, "denominator": {"agg": "sum", "column": "Total_Sales"},
         "format": "percent"}
SALES_TOTAL = {"id": "sales_total", "label": "ยอดขายรวม", "type": "simple",
               "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "currency", "currency": "USD"}
RATING = {"role": "measure", "label": "คะแนนรีวิว", "unit": "number", "default_agg": "sum", "pii": False}
SALES = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
VIEW = resolve("sales", {"approved": {"columns": {"Rating": RATING, "Total_Sales": SALES},
                                      "metrics": [GROSS, SALES_TOTAL], "version": 1}}, RAW)
PROFILE = apply_to_profile(RAW, VIEW)
METRICS = VIEW["effective"]["metrics"]


def test_the_prompt_carries_meaning_and_metrics_but_no_hidden_column_or_cell_value():
    messages = dashboard_llm.build_generate_messages("sales", PROFILE, "ภาพรวมยอดขาย", "business", METRICS)
    sent = json.dumps(messages, ensure_ascii=False)
    assert "Customer_Name" not in sent and "SECRET-PERSON" not in sent and "North" not in sent
    user = json.loads(messages[1]["content"])
    columns = {c["name"]: c for c in user["profile"]["columns"]}
    assert (columns["Total_Sales"]["role"], columns["Total_Sales"]["label"], columns["Total_Sales"]["unit"],
            columns["Total_Sales"]["currency"]) == ("measure", "ยอดขาย", "currency", "USD")
    assert columns["Order_ID"]["role"] == "identifier"
    assert user["metrics"] == [
        {"id": "gross_margin", "label": "Gross Margin", "description": "กำไรต่อยอดขาย", "format": "percent"},
        {"id": "sales_total", "label": "ยอดขายรวม", "description": "", "format": "currency"}]
    assert "metric_id" in messages[0]["content"] and 'role "identifier"' in messages[0]["content"]


def test_without_a_semantic_layer_the_prompt_is_unchanged():
    messages = dashboard_llm.build_generate_messages("sales", RAW, "ภาพรวม", "business")
    user = json.loads(messages[1]["content"])
    assert "metrics" not in user
    assert all("role" not in c and "label" not in c for c in user["profile"]["columns"])


def test_the_refine_prompt_lists_metrics_and_gaps_that_know_them():
    current, _ = validate_spec({"widgets": [{"id": "k", "type": "kpi", "metric": {"metric_id": "sales_total"}}]},
                               PROFILE, METRICS)
    messages = dashboard_llm.build_refine_messages("sales", PROFILE, current, "เพิ่มกราฟ", METRICS)
    user = json.loads(messages[1]["content"])
    assert [m["id"] for m in user["metrics"]] == ["gross_margin", "sales_total"]
    assert "เพิ่ม KPI ผลรวม Total_Sales" not in user["suggested_changes"]
    assert "Customer_Name" not in json.dumps(messages, ensure_ascii=False)


def test_the_rule_dashboard_leads_with_metrics_then_measures_by_their_default_aggregation():
    spec, warnings = validate_spec(dashboard_llm.fallback_spec(PROFILE, "", "business", METRICS), PROFILE, METRICS)
    assert warnings == []
    kpis = [w for w in spec["widgets"] if w["type"] == "kpi"]
    assert [w["metric"] for w in kpis] == [{"metric_id": "gross_margin"}, {"metric_id": "sales_total"},
                                           {"agg": "sum", "column": "Profit"}, {"agg": "sum", "column": "Rating"}]
    assert kpis[3]["title"] == "ผลรวม คะแนนรีวิว"
    assert all(w.get("x") not in ("Order_ID", "Store_Code") for w in spec["widgets"])
    assert all((w.get("metric") or {}).get("column") != "Store_Code" for w in spec["widgets"])
    bar = next(w for w in spec["widgets"] if w["type"] == "bar")
    assert bar["x"] == "Region" and bar["title"] == "แยกตาม Region"


def test_the_rule_dashboard_without_metrics_is_the_same_as_before():
    spec, _ = validate_spec(dashboard_llm.fallback_spec(RAW, "", "business"), RAW)
    assert spec["widgets"][0]["metric"] == {"agg": "count", "column": None}


def test_a_steward_health_view_skips_the_range_of_an_identifier():
    raw_titles = [w["title"] for w in dashboard_llm.fallback_spec(RAW, "", "steward")["widgets"]]
    assert "ต่ำสุด Store_Code" in raw_titles  # the name guess alone treats Store_Code as a number
    titles = [w["title"] for w in dashboard_llm.fallback_spec(PROFILE, "", "steward", METRICS)["widgets"]]
    assert "ต่ำสุด Store_Code" not in titles and "สูงสุด Store_Code" not in titles


def test_suggestions_follow_roles_and_default_aggregations_but_keep_column_names():
    texts = [s["text"] for s in suggest_from_profile(PROFILE, "business", 20)]
    joined = " ".join(texts)
    assert "Customer_Name" not in joined and "Order_ID" not in joined and "Store_Code" not in joined
    raw_texts = " ".join(s["text"] for s in suggest_from_profile(RAW, "business", 20))
    assert "Customer_Name" in raw_texts or "Order_ID" in raw_texts or "Store_Code" in raw_texts
    assert "ผลรวม Total_Sales ตาม Region" in texts


def test_gap_suggestions_count_a_metric_kpi_and_never_crash_on_one():
    spec, _ = validate_spec({"widgets": [
        {"id": "k", "type": "kpi", "metric": {"metric_id": "sales_total"}},
        {"id": "b", "type": "bar", "x": "Region", "metric": {"metric_id": "gross_margin"}}]}, PROFILE, METRICS)
    texts = [s["text"] for s in suggest_refinements(PROFILE, spec, 20, metrics=METRICS)]
    assert "เพิ่ม KPI ผลรวม Total_Sales" not in texts and "เพิ่ม KPI ผลรวม Profit" in texts
    assert "เพิ่ม KPI ผลรวม Rating" in texts  # the approved default_agg, not the name guess (an average)
    assert not any("Store_Code" in t or "Customer_Name" in t for t in texts)
```

(ค่า `Total_Sales` และ `Profit` เป็นทศนิยมโดยตั้งใจ: ตัวเลขจำนวนเต็มที่ไม่ซ้ำทุกแถวจะถูก heuristic ของ `is_identifier` มองเป็นรหัส ส่วน `Store_Code` เป็นรหัสจากกฎชื่อคอลัมน์อย่างเดียว ซึ่งพิสูจน์ว่า role ถูกใช้จริง)

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_dashboard_semantic_ai.py -q -p no:cacheprovider`
Expected: FAIL 6 ตัว (เช่น `TypeError: build_generate_messages() takes 4 positional arguments but 5 were given`, `TypeError: suggest_refinements() got an unexpected keyword argument 'metrics'`) ผ่าน 2 ตัว (`test_without_a_semantic_layer_the_prompt_is_unchanged`, `test_the_rule_dashboard_without_metrics_is_the_same_as_before` ซึ่งล็อกพฤติกรรมเดิม)

- [ ] **Step 3: แก้ `dashboard_suggest.py`** (Edit tool)

(1) `is_identifier`: แทน

```python
def is_identifier(column, rows):
    """A whole-number column that is (nearly) unique or has 9+ digit values: an id, account or
    phone number, whose min and max are real records."""
    low, high = column.get("min"), column.get("max")
```

ด้วย

```python
def is_identifier(column, rows):
    """A column the semantic layer marks as an identifier, or a whole-number column that is
    (nearly) unique or has 9+ digit values: an id, account or phone number, whose min and max
    are real records."""
    if column.get("role") == "identifier":
        return True
    low, high = column.get("min"), column.get("max")
```

(2) `_metric`: แทนทั้งฟังก์ชัน

```python
def _metric(name):
    """(metric, label): a total for quantities that add up, an average for the rest."""
    if _is_additive(name):
        return {"agg": "sum", "column": name}, f"ผลรวม {name}"
    return {"agg": "avg", "column": name}, f"ค่าเฉลี่ย {name}"
```

ด้วย

```python
_AGG_LABEL = {"sum": "ผลรวม", "avg": "ค่าเฉลี่ย", "min": "ต่ำสุด", "max": "สูงสุด", "count_distinct": "จำนวนค่าไม่ซ้ำ"}


def _metric(column):
    """(metric, label): the aggregation the semantic layer gives the column (default_agg); without
    one, a total for quantities that add up and an average for the rest, guessed from the name.
    The label keeps the column name: the AI ranking checks reworded texts against it."""
    name = column["name"]
    agg = column.get("default_agg") if column.get("default_agg") in _AGG_LABEL else ("sum" if _is_additive(name) else "avg")
    return {"agg": agg, "column": name}, f"{_AGG_LABEL[agg]} {name}"
```

(3) ลูปใน `_usable`: แทน

```python
    for c in profile["columns"]:
        if c["missing_pct"] > MAX_MISSING_PCT:
            continue
        if c["kind"] == "numeric" and not is_identifier(c, rows):
            measures.append(c)
        elif c["kind"] == "categorical" and CATEGORY_MIN_DISTINCT <= c["distinct"] <= CATEGORY_MAX_DISTINCT:
            categories.append(c)
        elif c["kind"] == "date" and c["distinct"] > 1:
            dates.append(c)
```

ด้วย

```python
    for c in profile["columns"]:
        # role is present only when the profile went through semantic_layer.apply_to_profile
        role = c.get("role")
        if c["missing_pct"] > MAX_MISSING_PCT or role == "identifier":
            continue
        if c["kind"] == "numeric" and role in (None, "measure") and not is_identifier(c, rows):
            measures.append(c)
        elif c["kind"] == "categorical" and CATEGORY_MIN_DISTINCT <= c["distinct"] <= CATEGORY_MAX_DISTINCT:
            categories.append(c)
        elif c["kind"] == "date" and c["distinct"] > 1:
            dates.append(c)
```

(4) ใน `suggest_from_profile`: แทน

```python
    main = _metric(measures[0]["name"]) if measures else ({"agg": "count", "column": None}, "จำนวนแถว")
    by_rule = {rule: [] for rule in ("R1", "R2", "R3", "R4", "R5", "R7", "R8")}
```

ด้วย

```python
    main = _metric(measures[0]) if measures else ({"agg": "count", "column": None}, "จำนวนแถว")
    by_rule = {rule: [] for rule in ("R1", "R2", "R3", "R4", "R5", "R7", "R8")}
```

(5) กฎ R7 ใน `suggest_from_profile`: แทน

```python
            metric, label = _metric(c["name"])
```

ด้วย

```python
            metric, label = _metric(c)
```

(6) หัวของ `suggest_refinements`: แทน

```python
def suggest_refinements(profile, spec, limit=GAP_LIMIT):
    """What the current dashboard does not use yet, as instructions the refine box understands.

    `spec` is a spec that validate_spec() produced for this profile; the suggestions are the gaps
    between it and the columns the profile says are worth charting. Same rules as above: profile and
    spec only, no rows, no LLM."""
    measures, categories, dates = _usable(profile)
    widgets, filters = spec["widgets"], spec["filters"]
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    distinct = {c["name"]: c["distinct"] for c in profile["columns"]}
    main = _metric(measures[0]["name"]) if measures else ({"agg": "count", "column": None}, "จำนวนแถว")
```

ด้วย

```python
def _kpi_columns(widgets, metrics):
    """The columns the kpi cards already show, directly or through a simple semantic-layer metric."""
    by_id = {m["id"]: m for m in metrics or []}
    columns = set()
    for w in widgets:
        if w["type"] != "kpi":
            continue
        definition = by_id.get(w["metric"].get("metric_id"))
        if definition is None:
            columns.add(w["metric"].get("column"))
        elif definition["type"] == "simple":
            columns.add(definition["measure"]["column"])
    return columns


def suggest_refinements(profile, spec, limit=GAP_LIMIT, metrics=None):
    """What the current dashboard does not use yet, as instructions the refine box understands.

    `spec` is a spec that validate_spec() produced for this profile; the suggestions are the gaps
    between it and the columns the profile says are worth charting. Same rules as above: profile and
    spec only, no rows, no LLM. `metrics` are the semantic-layer definitions that {"metric_id"}
    widgets name."""
    measures, categories, dates = _usable(profile)
    widgets, filters = spec["widgets"], spec["filters"]
    kinds = {c["name"]: c["kind"] for c in profile["columns"]}
    distinct = {c["name"]: c["distinct"] for c in profile["columns"]}
    main = _metric(measures[0]) if measures else ({"agg": "count", "column": None}, "จำนวนแถว")
```

(7) กฎ G2: แทน

```python
    in_kpi = {w["metric"]["column"] for w in widgets if w["type"] == "kpi"}
    for c in measures:
        if c["name"] not in in_kpi:
            by_gap["G2"].append(_change("G2", c["name"], f"เพิ่ม KPI {_metric(c['name'])[1]}"))
```

ด้วย

```python
    in_kpi = _kpi_columns(widgets, metrics)
    for c in measures:
        if c["name"] not in in_kpi:
            by_gap["G2"].append(_change("G2", c["name"], f"เพิ่ม KPI {_metric(c)[1]}"))
```

(8) กฎ G5: แทน

```python
        if w["type"] == "bar" and few_values and not w["group_by"] and w["metric"]["agg"] in ("sum", "count"):
```

ด้วย

```python
        if w["type"] == "bar" and few_values and not w["group_by"] and w["metric"].get("agg") in ("sum", "count"):
```

- [ ] **Step 4: แก้ `dashboard_llm.py`** (Edit tool)

(1) schema ของ metric ใน `SYSTEM_PROMPT`: แทน

```python
    "metric": {{"agg": one of {json.dumps(list(AGGREGATIONS))}, "column": string or null}},
```

ด้วย

```python
    "metric": {{"agg": one of {json.dumps(list(AGGREGATIONS))}, "column": string or null}} or {{"metric_id": string}},
```

(2) กฎใน `SYSTEM_PROMPT` (ยังอยู่ใน f-string จึงใช้ `{{` `}}`): แทน

```python
- sum, avg, min and max need a numeric column; count takes "column": null; count_distinct and count_missing take any column.
```

ด้วย

```python
- sum, avg, min and max need a numeric column; count takes "column": null; count_distinct and count_missing take any column.
- When the user message lists "metrics", they are the dataset's approved definitions: use {{"metric_id": "<id>"}} for kpi cards and charts of that measure instead of rebuilding the formula.
- Columns with role "identifier" are codes: never sum, average, min or max them and never put them on a chart axis or group_by; count_distinct them instead.
- When a column has a "label", use it in widget titles and filter labels.
```

(3) `profile_for_prompt`, `build_generate_messages`, `build_refine_messages`: แทนทั้งสามฟังก์ชัน

```python
def profile_for_prompt(profile):
    """The column profile without any cell value except numeric and date ranges (and not
    even the range of a numeric column that looks like an identifier)."""
    columns = []
    for c in profile["columns"]:
        item = {"name": c["name"], "kind": c["kind"], "distinct": c["distinct"], "missing_pct": c["missing_pct"]}
        identifier = c["kind"] == "numeric" and is_identifier(c, profile["rows"])
        if c["kind"] in ("numeric", "date") and not identifier:
            item["min"], item["max"] = c.get("min"), c.get("max")
        columns.append(item)
    return {"rows": profile["rows"], "columns": columns}


def build_generate_messages(table_name, profile, context, audience):
    user = {"dataset": table_name, "audience": audience, "request": context, "profile": profile_for_prompt(profile)}
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def build_refine_messages(table_name, profile, spec, instruction):
    user = {"dataset": table_name, "profile": profile_for_prompt(profile), "current_spec": spec,
            "suggested_changes": [s["text"] for s in suggest_refinements(profile, spec)], "instruction": instruction}
    return [{"role": "system", "content": SYSTEM_PROMPT + REFINE_RULES},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]
```

ด้วย

```python
def profile_for_prompt(profile):
    """The column profile without any cell value except numeric and date ranges (and not
    even the range of a numeric column that looks like an identifier), plus the column's
    meaning when the profile carries it (semantic_layer.apply_to_profile). Hidden personal
    columns never reach this function: apply_to_profile has already removed them."""
    columns = []
    for c in profile["columns"]:
        item = {"name": c["name"], "kind": c["kind"], "distinct": c["distinct"], "missing_pct": c["missing_pct"]}
        identifier = c["kind"] == "numeric" and is_identifier(c, profile["rows"])
        if c["kind"] in ("numeric", "date") and not identifier:
            item["min"], item["max"] = c.get("min"), c.get("max")
        for key in ("role", "label", "unit", "currency"):
            if c.get(key):
                item[key] = c[key]
        columns.append(item)
    return {"rows": profile["rows"], "columns": columns}


def _metrics_for_prompt(metrics):
    """The approved metric definitions the LLM may name by id (no formula, no value)."""
    return [{k: m.get(k) for k in ("id", "label", "description", "format")} for m in metrics]


def build_generate_messages(table_name, profile, context, audience, metrics=None):
    user = {"dataset": table_name, "audience": audience, "request": context, "profile": profile_for_prompt(profile)}
    if metrics:
        user["metrics"] = _metrics_for_prompt(metrics)
    return [{"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]


def build_refine_messages(table_name, profile, spec, instruction, metrics=None):
    user = {"dataset": table_name, "profile": profile_for_prompt(profile), "current_spec": spec,
            "suggested_changes": [s["text"] for s in suggest_refinements(profile, spec, metrics=metrics)],
            "instruction": instruction}
    if metrics:
        user["metrics"] = _metrics_for_prompt(metrics)
    return [{"role": "system", "content": SYSTEM_PROMPT + REFINE_RULES},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)}]
```

(4) หัวของ `_ask`: แทน

```python
def _ask(messages, profile):
    """(spec, warnings, model). One retry that tells the LLM why its answer was rejected."""
```

ด้วย

```python
def _ask(messages, profile, metrics=None):
    """(spec, warnings, model). One retry that tells the LLM why its answer was rejected."""
```

(5) การตรวจคำตอบแรกใน `_ask`: แทน

```python
        spec, warnings = validate_spec(parse_json_object(content), profile)
    except SpecError as exc:
```

ด้วย

```python
        spec, warnings = validate_spec(parse_json_object(content), profile, metrics)
    except SpecError as exc:
```

(6) การตรวจคำตอบที่ลองซ้ำใน `_ask`: แทน

```python
        spec, warnings = validate_spec(parse_json_object(call_groq(retry, key, model)), profile)
    return spec, warnings, model
```

ด้วย

```python
        spec, warnings = validate_spec(parse_json_object(call_groq(retry, key, model)), profile, metrics)
    return spec, warnings, model
```

(7) ส่วนต้นของ `fallback_spec` (ถึงก่อนบรรทัด `if audience != "management" or len(widgets) == 1:`): แทน

```python
def fallback_spec(profile, context="", audience="business"):
    """A sensible dashboard from the column kinds alone, used when the LLM is unavailable.
    The reader type shapes it: management gets no detail table and a period comparison, an analyst a
    wider table, a data steward a data-health view."""
    if audience == "steward":
        return {"title": "แดชบอร์ดสุขภาพข้อมูล", "description": context[:300], **_health_spec(profile)}
    columns = profile["columns"]
    numeric = [c["name"] for c in columns if c["kind"] == "numeric"]
    dates = [c["name"] for c in columns if c["kind"] == "date"]
    categories = sorted((c for c in columns if c["kind"] == "categorical"), key=lambda c: c["distinct"])
    main = {"agg": "sum", "column": numeric[0]} if numeric else {"agg": "count", "column": None}
    widgets = [{"type": "kpi", "title": "จำนวนแถว", "metric": {"agg": "count", "column": None}}]
    widgets += [{"type": "kpi", "title": f"ผลรวม {n}", "metric": {"agg": "sum", "column": n}} for n in numeric[:3]]
    if audience == "management" and dates:
        widgets[0]["compare"] = {"date_column": dates[0], "time_grain": "month"}
    if dates:
        widgets.append({"type": "line", "title": f"แนวโน้มรายเดือนตาม {dates[0]}", "x": dates[0],
                        "time_grain": "month", "metric": main})
    if categories:
        widest = categories[-1]["name"]
        widgets.append({"type": "bar", "title": f"แยกตาม {widest}", "x": widest, "metric": main})
        if len(categories) > 1 and categories[0]["distinct"] <= 8:
            narrow = categories[0]["name"]
            widgets.append({"type": "donut", "title": f"สัดส่วนตาม {narrow}", "x": narrow, "metric": main})
```

ด้วย

```python
AGG_WORDS = {"sum": "ผลรวม", "avg": "ค่าเฉลี่ย", "min": "ต่ำสุด", "max": "สูงสุด", "count_distinct": "จำนวนค่าไม่ซ้ำ"}
MAX_FALLBACK_KPIS = 4


def _label(column):
    return column.get("label") or column["name"]


def fallback_spec(profile, context="", audience="business", metrics=None):
    """A sensible dashboard from the column kinds alone, used when the LLM is unavailable.
    The reader type shapes it: management gets no detail table and a period comparison, an analyst a
    wider table, a data steward a data-health view. With a semantic layer, the approved metrics lead
    the kpi cards (at most 4), measures use their default aggregation and identifiers are never
    summed or charted."""
    if audience == "steward":
        return {"title": "แดชบอร์ดสุขภาพข้อมูล", "description": context[:300], **_health_spec(profile)}
    columns = profile["columns"]
    usable = [c for c in columns if c.get("role") != "identifier"]
    numeric = [c for c in usable if c["kind"] == "numeric" and c.get("role") in (None, "measure")]
    dates = [c for c in usable if c["kind"] == "date"]
    categories = sorted((c for c in usable if c["kind"] == "categorical"), key=lambda c: c["distinct"])

    def measure_metric(c):
        agg = c.get("default_agg") if c.get("default_agg") in AGG_WORDS else "sum"
        return {"agg": agg, "column": c["name"]}

    main = measure_metric(numeric[0]) if numeric else {"agg": "count", "column": None}
    metrics = metrics or []
    covered = {(m["measure"]["agg"], m["measure"]["column"]) for m in metrics
               if m["type"] == "simple" and not m["measure"].get("where")}
    widgets = [{"type": "kpi", "title": m["label"], "metric": {"metric_id": m["id"]}} for m in metrics[:MAX_FALLBACK_KPIS]]
    if not widgets:
        widgets.append({"type": "kpi", "title": "จำนวนแถว", "metric": {"agg": "count", "column": None}})
    for c in numeric:
        metric = measure_metric(c)
        if len(widgets) >= MAX_FALLBACK_KPIS:
            break
        if (metric["agg"], metric["column"]) not in covered:
            widgets.append({"type": "kpi", "title": f"{AGG_WORDS[metric['agg']]} {_label(c)}", "metric": metric})
    if audience == "management" and dates:
        widgets[0]["compare"] = {"date_column": dates[0]["name"], "time_grain": "month"}
    if dates:
        widgets.append({"type": "line", "title": f"แนวโน้มรายเดือนตาม {_label(dates[0])}", "x": dates[0]["name"],
                        "time_grain": "month", "metric": main})
    if categories:
        widest = categories[-1]
        widgets.append({"type": "bar", "title": f"แยกตาม {_label(widest)}", "x": widest["name"], "metric": main})
        if len(categories) > 1 and categories[0]["distinct"] <= 8:
            narrow = categories[0]
            widgets.append({"type": "donut", "title": f"สัดส่วนตาม {_label(narrow)}", "x": narrow["name"], "metric": main})
```

(8) ตัวกรองใน `fallback_spec` (`dates` เป็นรายการคอลัมน์แล้ว ไม่ใช่ชื่อ): แทน

```python
    filters = [{"column": c["name"]} for c in categories[:2]] + [{"column": d} for d in dates[:1]]
    title = "แดชบอร์ดผู้บริหาร" if audience == "management" else "แดชบอร์ดภาพรวม"
```

ด้วย

```python
    filters = [{"column": c["name"]} for c in categories[:2]] + [{"column": d["name"]} for d in dates[:1]]
    title = "แดชบอร์ดผู้บริหาร" if audience == "management" else "แดชบอร์ดภาพรวม"
```

(9) `generate_spec`: แทน

```python
def generate_spec(table_name, profile, context, audience):
    try:
        spec, warnings, model = _ask(build_generate_messages(table_name, profile, context, audience), profile)
        engine = "groq"
    except (LLMUnavailable, SpecError) as exc:
        logger.warning("Dashboard generation fell back to rules: %s", exc)
        spec, warnings = validate_spec(fallback_spec(profile, context, audience), profile)
```

ด้วย

```python
def generate_spec(table_name, profile, context, audience, metrics=None):
    try:
        messages = build_generate_messages(table_name, profile, context, audience, metrics)
        spec, warnings, model = _ask(messages, profile, metrics)
        engine = "groq"
    except (LLMUnavailable, SpecError) as exc:
        logger.warning("Dashboard generation fell back to rules: %s", exc)
        spec, warnings = validate_spec(fallback_spec(profile, context, audience, metrics), profile, metrics)
```

(10) `refine_spec`: แทน

```python
def refine_spec(table_name, profile, spec, instruction):
    """Raises LLMUnavailable or SpecError; there is no rule-based refinement."""
    new_spec, warnings, model = _ask(build_refine_messages(table_name, profile, spec, instruction), profile)
```

ด้วย

```python
def refine_spec(table_name, profile, spec, instruction, metrics=None):
    """Raises LLMUnavailable or SpecError; there is no rule-based refinement."""
    messages = build_refine_messages(table_name, profile, spec, instruction, metrics)
    new_spec, warnings, model = _ask(messages, profile, metrics)
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests -q -p no:cacheprovider -k "dashboard or semantic"` แล้วรัน API ทั้งชุด
Expected: ผ่านทั้งหมด รวม `test_dashboard_llm.py`, `test_dashboard_suggest.py`, `test_dashboard_final_review.py` เดิมโดยไม่แก้; ทั้งชุด 538 ผ่าน + 9 ล้มเดิม ถ้า `test_the_rule_based_spec_uses_the_column_kinds` ล้ม ให้ตรวจว่า `fallback_spec` ยังให้ `[kpi, kpi, line, bar, table]` เมื่อไม่มี metric และไม่มี role

- [ ] **Step 6: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/api/app/api/dashboard_suggest.py services/api/app/api/dashboard_llm.py services/api/tests/test_dashboard_semantic_ai.py && git commit -m "feat(dashboard): prompts, rule dashboards and suggestions read column roles, labels and metrics"
```

---

### Task 8: ทุกเส้นของ `/api/v1/dashboards` ใช้ semantic view และซ่อนข้อมูลส่วนบุคคล

**Files:**
- Modify: `services/api/app/api/dashboards.py` (LF)
- Modify: `services/api/tests/test_dashboards_api.py`, `services/api/tests/test_dashboard_quality_dataset.py` (แยกเทสต์เดิมออกจาก ES จริง)
- Test: `services/api/tests/test_dashboards_semantic.py`

**Interfaces:**
- Consumes: `semantic.load_view`, `semantic.encode_doc`, `semantic.SEMANTIC_INDEX` (Task 5); `semantic_layer.apply_to_profile` (Task 2); `validate_spec(..., metrics)`, `compute_dashboard(..., metrics=)` (Task 6); `generate_spec`/`refine_spec`/`suggest_refinements(..., metrics=)` (Task 7); `_es_or_none()` ที่มีอยู่แล้วใน `dashboards.py` (คืน `None` เมื่อ `get_es_client` raise `HTTPException`)
- Produces (ใช้ใน Task 10 ถึง 12):
  - `dashboards._dataset(table_name) -> (df, profile_ที่ตัดคอลัมน์ซ่อนแล้วและมีความหมาย, metrics)` เรียก ES ครั้งเดียวต่อคำขอ
  - `dashboards._checked_spec(raw, profile, metrics=None) -> (spec, warnings)` (เดิมคืน spec อย่างเดียว) หรือ 422
  - `POST /api/v1/dashboards/render` ตอบ `{"spec", "warnings", "data"}` (`warnings` เป็นคีย์ใหม่)
  - `GET /datasets/{t}/suggestions`, `POST /suggest-changes`, `POST /rank-suggestions`, `POST /generate`, `POST /refine`, `POST/PUT /saved` ใช้ profile จาก `_dataset` ทั้งหมด ส่วน `GET /datasets/{t}/preview` ไม่เปลี่ยน (คำตัดสินข้อ 3)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

สร้าง `services/api/tests/test_dashboards_semantic.py`:

```python
"""Every /api/v1/dashboards route reads the semantic view: hidden personal columns never reach a
widget, a filter, a table, a suggestion or an AI prompt, and approved metrics and units are used."""
import json
import os
import sys

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("SESSION_SECRET_KEY", "test-session-secret")

from app.api import dashboard_data, dashboard_llm, dashboards, semantic  # noqa: E402
from app.api.auth import SESSION_COOKIE_NAME, create_session_token  # noqa: E402
from fakes import FakeES  # noqa: E402

DF, PROFILE = dashboard_data.prepare_frame(pd.DataFrame({
    "Order_ID": ["o1", "o2", "o3", "o4"], "Region": ["N", "S", "N", "E"],
    "Total_Sales": [100.0, 200.5, 49.5, 150.0], "Profit": [10.0, 50.5, 4.5, 45.0],
    "Customer_Name": ["Ann", "Bob", "Cid", "Dee"]}))
GROSS = {"id": "gross_margin", "label": "Gross Margin", "type": "ratio", "numerator": {"agg": "sum", "column": "Profit"},
         "denominator": {"agg": "sum", "column": "Total_Sales"}, "format": "percent", "higher_is_better": True}
SALES_TOTAL = {"id": "sales_total", "label": "ยอดขายรวม", "type": "simple",
               "measure": {"agg": "sum", "column": "Total_Sales"}, "format": "currency", "currency": "USD"}
USD = {"role": "measure", "label": "ยอดขาย", "unit": "currency", "currency": "USD", "default_agg": "sum", "pii": False}
KPI = {"id": "k", "type": "kpi", "metric": {"metric_id": "gross_margin"}}
NAMES = {"id": "names", "type": "bar", "title": "ตามชื่อลูกค้า", "x": "Customer_Name", "metric": {"agg": "count", "column": None}}


def store(es, metrics):
    doc = {"table_name": "sales", "draft": None, "history": [],
           "approved": {"columns": {"Total_Sales": USD}, "metrics": metrics, "version": 1}}
    es.index(semantic.SEMANTIC_INDEX, "sales", semantic.encode_doc(doc))


@pytest.fixture
def es(monkeypatch):
    fake = FakeES()
    store(fake, [GROSS, SALES_TOTAL])
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: fake)
    monkeypatch.setattr(dashboards, "get_es_client", lambda: fake)
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    return fake


def client():
    app = FastAPI()
    app.include_router(dashboards.router)
    return TestClient(app, cookies={SESSION_COOKIE_NAME: create_session_token("tester")})


def render(spec):
    return client().post("/api/v1/dashboards/render", json={"table_name": "sales", "spec": spec}).json()


def capture_groq(monkeypatch, answer):
    sent = []

    def fake_groq(messages, key, model):
        sent.append(messages)
        return answer

    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("gsk_test", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboard_llm, "call_groq", fake_groq)
    return sent


def test_rule_dashboards_lead_with_approved_metrics_and_skip_personal_columns(es):
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": "sales", "context": "ภาพรวมยอดขาย", "audience": "management"}).json()
    first = body["spec"]["widgets"][0]
    assert first["metric"] == {"metric_id": "gross_margin"} and first["format"] == "percent"
    assert body["data"]["widgets"][first["id"]]["value"] == pytest.approx(22.0)
    assert "Customer_Name" not in json.dumps(body["spec"], ensure_ascii=False)


def test_the_llm_sees_metrics_and_labels_but_not_personal_columns(es, monkeypatch):
    sent = capture_groq(monkeypatch, json.dumps({"title": "ยอดขาย", "widgets": [KPI]}))
    body = client().post("/api/v1/dashboards/generate",
                         json={"table_name": "sales", "context": "ภาพรวมยอดขาย", "audience": "business"}).json()
    user = sent[0][1]["content"]
    assert "Customer_Name" not in user and "Ann" not in user
    assert "gross_margin" in user and "ยอดขาย" in user and "identifier" in user
    assert "metric_id" in sent[0][0]["content"]
    assert body["engine"] == "groq" and body["data"]["widgets"]["k"]["value"] == pytest.approx(22.0)


def test_the_refine_prompt_has_no_personal_column(es, monkeypatch):
    sent = capture_groq(monkeypatch, json.dumps({"title": "ยอดขาย", "widgets": [KPI]}))
    res = client().post("/api/v1/dashboards/refine",
                        json={"table_name": "sales", "spec": {"widgets": [KPI, NAMES]}, "instruction": "เพิ่มกราฟ"})
    assert res.status_code == 200
    assert "Customer_Name" not in json.dumps(sent[0], ensure_ascii=False)


def test_a_saved_widget_on_a_personal_column_is_dropped_with_a_note(es):
    body = render({"widgets": [KPI, NAMES]})
    assert [w["id"] for w in body["spec"]["widgets"]] == ["k"]
    assert any("Customer_Name" in w for w in body["warnings"])


def test_saved_dashboards_follow_the_current_metric_definition(es):
    assert render({"widgets": [KPI]})["data"]["widgets"]["k"]["value"] == pytest.approx(22.0)
    store(es, [dict(GROSS, denominator={"agg": "count", "column": None})])
    assert render({"widgets": [KPI]})["data"]["widgets"]["k"]["value"] == pytest.approx(2750.0)


def test_a_dashboard_is_saved_without_its_personal_widgets(es):
    body = {"name": "ยอดขาย", "table_name": "sales", "spec": {"widgets": [KPI, NAMES]}}
    saved = client().post("/api/v1/dashboards/saved", json=body).json()
    assert [w["id"] for w in saved["spec"]["widgets"]] == ["k"]
    assert "Customer_Name" not in json.dumps(es.docs[dashboards.DASHBOARDS_INDEX], ensure_ascii=False)


def test_without_elasticsearch_personal_columns_stay_hidden(es, monkeypatch):
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)
    body = render({"widgets": [{"id": "c", "type": "kpi", "metric": {"agg": "count", "column": None}}, NAMES]})
    assert [w["id"] for w in body["spec"]["widgets"]] == ["c"]


def test_money_columns_render_in_their_currency(es):
    body = render({"widgets": [{"id": "s", "type": "kpi", "metric": {"agg": "sum", "column": "Total_Sales"}}]})
    (kpi,) = body["spec"]["widgets"]
    assert (kpi["format"], kpi["currency"]) == ("currency", "USD")
    assert body["data"]["column_labels"]["Total_Sales"] == "ยอดขาย"


def test_suggestions_leave_out_personal_and_identifier_columns(es):
    body = client().get("/api/v1/dashboards/datasets/sales/suggestions").json()
    assert [s["text"] for s in body["suggestions"]] == [
        "ผลรวม Total_Sales ตาม Region", "สัดส่วน ผลรวม Total_Sales ตาม Region"]


def test_gap_suggestions_know_the_metric_cards(es):
    spec = {"widgets": [{"id": "k", "type": "kpi", "metric": {"metric_id": "sales_total"}}]}
    body = client().post("/api/v1/dashboards/suggest-changes", json={"table_name": "sales", "spec": spec}).json()
    texts = [s["text"] for s in body["suggestions"]]
    assert texts == ["เพิ่มตัวกรอง Region", "เพิ่ม KPI ผลรวม Profit"]


def test_the_ranking_prompt_has_no_personal_column(es, monkeypatch):
    rule_made = client().get("/api/v1/dashboards/datasets/sales/suggestions").json()["suggestions"]
    sent = capture_groq(monkeypatch, json.dumps({"suggestions": [{"id": rule_made[0]["id"], "text": rule_made[0]["text"]}]}))
    res = client().post("/api/v1/dashboards/rank-suggestions", json={"table_name": "sales", "audience": "business"})
    assert res.status_code == 200
    prompt = json.dumps(sent[0], ensure_ascii=False)
    assert "Customer_Name" not in prompt and "Ann" not in prompt


def test_the_preview_still_shows_every_column_so_the_user_can_review_it(es):
    body = client().get("/api/v1/dashboards/datasets/sales/preview").json()
    assert "Customer_Name" in [c["name"] for c in body["profile"]["columns"]]
```

(ค่าเงินมีทศนิยมโดยตั้งใจ ด้วยเหตุผลเดียวกับ Task 7 ส่วน `Order_ID` 4 ค่าถูกจัดเป็นหมวดหมู่ ถ้าไม่มี role identifier มันจะถูกเสนอในคำแนะนำ เทสต์ preview ผ่านตั้งแต่ก่อนแก้ เพราะล็อกพฤติกรรมที่ตั้งใจไม่เปลี่ยน)

แก้เทสต์เดิมสองไฟล์ด้วย Edit tool ให้ไม่ไปอ่าน ES จริง (เครื่อง dev เปิด ES ที่ `localhost:9200` อยู่ และ `_dataset` จะเรียก `_es_or_none`):

(ก) `services/api/tests/test_dashboards_api.py` fixture `dataset`: แทน

```python
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))


def llm_answers
```

ด้วย

```python
    monkeypatch.setattr(dashboard_data, "load_active_dataset", lambda name: (DF, PROFILE))
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: None)  # the semantic view falls back to the name rules


def llm_answers
```

(ข) `services/api/tests/test_dashboard_quality_dataset.py`: แทน

```python
def test_a_data_quality_dashboard_can_be_generated_and_computed(es, monkeypatch):
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
```

ด้วย

```python
def test_a_data_quality_dashboard_can_be_generated_and_computed(es, monkeypatch):
    monkeypatch.setattr(dashboard_llm, "groq_settings", lambda: ("", "openai/gpt-oss-120b"))
    monkeypatch.setattr(dashboards, "_es_or_none", lambda: es)  # no semantic layer stored: the name rules apply
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests/test_dashboards_semantic.py -q -p no:cacheprovider`
Expected: FAIL 11 ตัว ผ่าน 1 ตัว (`test_the_preview_still_shows_every_column_so_the_user_can_review_it`) ตัวที่ล้มเห็น `Customer_Name` หรือ `Order_ID` ในผลลัพธ์ หรือ `KeyError: 'warnings'`

- [ ] **Step 3: แก้ `dashboards.py`** (Edit tool)

(1) import: แทน

```python
from . import dashboard_data, dashboard_llm, dashboard_suggest
```

ด้วย

```python
from . import dashboard_data, dashboard_llm, dashboard_suggest, semantic, semantic_layer
```

(2) `_checked_spec`: แทนทั้งฟังก์ชัน

```python
def _checked_spec(raw, profile):
    try:
        return validate_spec(raw, profile)[0]
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"สเปกแดชบอร์ดใช้ไม่ได้: {exc}")
```

ด้วย

```python
def _dataset(table_name):
    """(DataFrame, profile without the hidden personal columns and with each column's meaning,
    usable metric definitions). The semantic view is read once per request; without
    Elasticsearch it is the rule guess, which still hides columns whose names look personal."""
    df, profile = dashboard_data.load_active_dataset(table_name)
    view = semantic.load_view(table_name, profile, _es_or_none())
    return df, semantic_layer.apply_to_profile(profile, view), view["effective"]["metrics"]


def _checked_spec(raw, profile, metrics=None):
    """(spec, warnings), or 422 when nothing in the spec can be drawn."""
    try:
        return validate_spec(raw, profile, metrics)
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"สเปกแดชบอร์ดใช้ไม่ได้: {exc}")
```

(3) `dashboard_suggestions`: แทน

```python
    audience = _audience(audience)
    _, profile = dashboard_data.load_active_dataset(table_name)
    found = dashboard_suggest.suggest_from_profile(profile, audience)
```

ด้วย

```python
    audience = _audience(audience)
    _, profile, _ = _dataset(table_name)
    found = dashboard_suggest.suggest_from_profile(profile, audience)
```

(4) `suggest_dashboard_changes`: แทน

```python
    _, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
    return {"suggestions": dashboard_suggest.suggest_refinements(profile, spec)}
```

ด้วย

```python
    _, profile, metrics = _dataset(payload.table_name)
    spec, _ = _checked_spec(payload.spec, profile, metrics)
    return {"suggestions": dashboard_suggest.suggest_refinements(profile, spec, metrics=metrics)}
```

(5) `rank_dashboard_suggestions`: แทน

```python
    audience = _audience(payload.audience)
    _, profile = dashboard_data.load_active_dataset(payload.table_name)
    candidates = dashboard_suggest.suggest_from_profile(profile, audience, dashboard_llm.RANK_CANDIDATES)
```

ด้วย

```python
    audience = _audience(payload.audience)
    _, profile, _ = _dataset(payload.table_name)
    candidates = dashboard_suggest.suggest_from_profile(profile, audience, dashboard_llm.RANK_CANDIDATES)
```

(6) route `generate_dashboard`, `refine_dashboard`, `render_dashboard` ทั้งสาม: แทน

```python
@router.post("/generate")
def generate_dashboard(payload: GeneratePayload):
    audience = _audience(payload.audience)
    df, profile = dashboard_data.load_active_dataset(payload.table_name)
    result = dashboard_llm.generate_spec(payload.table_name, profile, payload.context.strip(), audience)
    result["data"] = compute_dashboard(df, result["spec"], profile)
    return result


@router.post("/refine")
def refine_dashboard(payload: RefinePayload):
    df, profile = dashboard_data.load_active_dataset(payload.table_name)
    current = _checked_spec(payload.spec, profile)
    try:
        result = dashboard_llm.refine_spec(payload.table_name, profile, current, payload.instruction.strip())
    except dashboard_llm.LLMUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"ปรับด้วย AI ไม่ได้ตอนนี้: {exc}")
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"AI ตอบสเปกที่ใช้ไม่ได้: {exc}")
    result["data"] = compute_dashboard(df, result["spec"], profile)
    return result


@router.post("/render")
def render_dashboard(payload: RenderPayload):
    df, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
    return {"spec": spec, "data": compute_dashboard(df, spec, profile, payload.selections)}
```

ด้วย

```python
@router.post("/generate")
def generate_dashboard(payload: GeneratePayload):
    audience = _audience(payload.audience)
    df, profile, metrics = _dataset(payload.table_name)
    result = dashboard_llm.generate_spec(payload.table_name, profile, payload.context.strip(), audience, metrics)
    result["data"] = compute_dashboard(df, result["spec"], profile, metrics=metrics)
    return result


@router.post("/refine")
def refine_dashboard(payload: RefinePayload):
    df, profile, metrics = _dataset(payload.table_name)
    current, _ = _checked_spec(payload.spec, profile, metrics)
    try:
        result = dashboard_llm.refine_spec(payload.table_name, profile, current, payload.instruction.strip(), metrics)
    except dashboard_llm.LLMUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"ปรับด้วย AI ไม่ได้ตอนนี้: {exc}")
    except SpecError as exc:
        raise HTTPException(status_code=422, detail=f"AI ตอบสเปกที่ใช้ไม่ได้: {exc}")
    result["data"] = compute_dashboard(df, result["spec"], profile, metrics=metrics)
    return result


@router.post("/render")
def render_dashboard(payload: RenderPayload):
    df, profile, metrics = _dataset(payload.table_name)
    spec, warnings = _checked_spec(payload.spec, profile, metrics)
    return {"spec": spec, "warnings": warnings,
            "data": compute_dashboard(df, spec, profile, payload.selections, metrics)}
```

(7) ใน `_document`: แทน

```python
    _, profile = dashboard_data.load_active_dataset(payload.table_name)
    spec = _checked_spec(payload.spec, profile)
    now = datetime.now(timezone.utc).isoformat()
```

ด้วย

```python
    _, profile, metrics = _dataset(payload.table_name)
    spec, _ = _checked_spec(payload.spec, profile, metrics)
    now = datetime.now(timezone.utc).isoformat()
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests -q -p no:cacheprovider -k "dashboard or semantic"` แล้วรัน API ทั้งชุด
Expected: ผ่านทั้งหมด รวม `test_dashboards_api.py`, `test_dashboards_saved.py`, `test_dashboard_quality_dataset.py`; ทั้งชุด 550 ผ่าน + 9 ล้มเดิม

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/api/app/api/dashboards.py services/api/tests/test_dashboards_api.py services/api/tests/test_dashboard_quality_dataset.py services/api/tests/test_dashboards_semantic.py && git commit -m "feat(dashboard): every dashboard route reads the semantic view and never exposes personal columns"
```

---

### Task 9: ตัวเลขตามรหัสสกุลเงิน สี KPI ตาม `higher_is_better` และ label บนแดชบอร์ด (UI)

**Files:**
- Modify: `services/ui/src/utils/numberFormat.js`, `services/ui/src/utils/numberFormat.test.js`
- Modify: `services/ui/src/components/builder/KpiCard.jsx`, `ChartWidget.jsx`, `TableWidget.jsx`, `DashboardCanvas.jsx`, `DashboardCanvas.test.jsx`
- Modify: `services/ui/src/test/dashboardFixtures.js`, `services/ui/src/pages/DashboardBuilder.css`

**Interfaces:**
- Consumes: วิดเจ็ตที่มี `format`, `currency`, `higher_is_better` และผลคำนวณที่มี `column_labels` (Task 6)
- Produces (ใช้ใน Task 11):
  - `formatValue(value, format = "number", currency = null) -> string` (export เดิม เพิ่มพารามิเตอร์ที่สาม)
  - `TableWidget({ widget, data, labels = {} })`
  - class `is-good` / `is-bad` บน `.dbb-kpi-change` (แทน `is-up` / `is-down`)
- **พฤติกรรมที่เปลี่ยนตาม spec 11.5:** วันนี้ `formatValue(..., "currency")` ใส่ `฿` เสมอ หลัง Task นี้ใช้ `Intl.NumberFormat` แบบ `style: "currency"`, `currencyDisplay: "narrowSymbol"` ตามรหัส (ย่อ K/M เมื่อ >= 10,000) ไม่มีรหัสหรือรหัสที่ `Intl` ไม่รู้จักแสดงตัวเลขเปล่า ผลคือแดชบอร์ดเงินที่ยังไม่ได้ตั้งสกุลเงินใน semantic layer จะไม่มี `฿` อีก (ตั้งใจ) เทสต์เดิมที่คาด `฿` จึงแก้ใน Task นี้ (ดู Global Constraints)

- [ ] **Step 1: แก้เทสต์ให้คาดพฤติกรรมใหม่**

(1) `services/ui/src/utils/numberFormat.test.js`: แทน

```js
it("formats currency and percent", () => {
  expect(formatValue(21900, "currency")).toBe("฿21.9K");
  expect(formatValue(95.1, "percent")).toBe("95.1%");
});
```

ด้วย

```js
it("shows the symbol of the currency code", () => {
  expect(formatValue(625.33, "currency", "USD")).toBe("$625.33");
  expect(formatValue(1770000, "currency", "USD")).toBe("$1.77M");
  expect(formatValue(21900, "currency", "THB")).toBe("฿21.9K");
});

it("shows no currency symbol when the code is missing or unknown", () => {
  expect(formatValue(21900, "currency")).toBe("21.9K");
  expect(formatValue(21900, "currency", "XX")).toBe("21.9K");
});

it("formats percent", () => {
  expect(formatValue(95.1, "percent")).toBe("95.1%");
});
```

(2) `services/ui/src/test/dashboardFixtures.js` วิดเจ็ต `w1` ของ `SPEC`: แทน

```js
    { id: "w1", type: "kpi", title: "ยอดขายรวม", metric: { agg: "sum", column: "amount" }, format: "currency", layout: { x: 0, y: 0, w: 3, h: 2 } },
```

ด้วย

```js
    { id: "w1", type: "kpi", title: "ยอดขายรวม", metric: { agg: "sum", column: "amount" }, format: "currency", currency: "USD",
      higher_is_better: true, layout: { x: 0, y: 0, w: 3, h: 2 } },
```

(3) `services/ui/src/components/builder/DashboardCanvas.test.jsx` ในเทสต์ "draws every widget with its title and the KPI in BI short form": แทน

```js
  expect(screen.getByText("฿1.77M")).toBeInTheDocument();
  expect(screen.getByText(/46\.2%/)).toHaveClass("is-down");
```

ด้วย

```js
  expect(screen.getByText("$1.77M")).toBeInTheDocument();
  expect(screen.getByText(/46\.2%/)).toHaveClass("is-bad");
```

และในเทสต์ "shows a widget's own error without hiding the others": แทน

```js
  expect(screen.getByText("คำนวณวิดเจ็ตนี้ไม่ได้: boom")).toBeInTheDocument();
  expect(screen.getByText("฿1.77M")).toBeInTheDocument();
```

ด้วย

```js
  expect(screen.getByText("คำนวณวิดเจ็ตนี้ไม่ได้: boom")).toBeInTheDocument();
  expect(screen.getByText("$1.77M")).toBeInTheDocument();
```

(4) ต่อท้าย `DashboardCanvas.test.jsx` (ไฟล์ import `within` อยู่แล้ว):

```jsx
it("colours a drop as good when lower is better", () => {
  const spec = { ...SPEC, widgets: SPEC.widgets.map((w) => (w.id === "w1" ? { ...w, higher_is_better: false } : w)) };
  draw({ spec });
  expect(screen.getByText(/46\.2%/)).toHaveClass("is-good");
});

it("labels table columns and drill chips with the names from the semantic layer", () => {
  draw({ data: { ...DATA, column_labels: { region: "ภูมิภาค", amount: "ยอดขาย", segment: "กลุ่มลูกค้า" } },
    selections: { segment: { values: ["A"] } } });
  const table = within(screen.getByRole("article", { name: "รายการล่าสุด" }));
  expect(table.getByRole("button", { name: "ยอดขาย" })).toBeInTheDocument();
  expect(table.queryByRole("button", { name: "amount" })).toBeNull();
  expect(screen.getByRole("button", { name: "ล้างตัวกรอง กลุ่มลูกค้า" })).toHaveTextContent("กลุ่มลูกค้า: A");
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run src/utils/numberFormat.test.js src/components/builder/DashboardCanvas.test.jsx`
Expected: FAIL (`expected '625.33' to be '$625.33'`, ไม่เจอ `$1.77M` เพราะยังแสดง `฿1.77M`, ไม่มี class `is-bad`/`is-good`, หัวตารางยังเป็น `amount`)

- [ ] **Step 3: เขียนโค้ด**

(1) `services/ui/src/utils/numberFormat.js`: แทน

```js
// KPI and axis numbers: 1,234.57 below ten thousand, 12.2K / 1.77M above.
export function formatValue(value, format = "number") {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const text = Math.abs(n) >= 10000 ? compact.format(n) : plain.format(n);
  if (format === "percent") return `${text}%`;
  if (format === "currency") return `฿${text}`;
  return text;
}
```

ด้วย

```js
function money(n, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      notation: Math.abs(n) >= 10000 ? "compact" : "standard",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(n);
  } catch {
    return null; // not a currency code Intl knows: the plain number is shown instead
  }
}

// KPI and axis numbers: 1,234.57 below ten thousand, 12.2K / 1.77M above. Currency shows the
// symbol of its ISO 4217 code ($, ฿, €) and no symbol when the code is missing or unknown.
export function formatValue(value, format = "number", currency = null) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (format === "currency" && currency) {
    const text = money(n, currency);
    if (text) return text;
  }
  const text = Math.abs(n) >= 10000 ? compact.format(n) : plain.format(n);
  return format === "percent" ? `${text}%` : text;
}
```

(2) `services/ui/src/components/builder/KpiCard.jsx`: แทน

```jsx
export default function KpiCard({ widget, data }) {
  const change = data?.change_pct;
  return (
    <div className="dbb-kpi">
      <div className="dbb-kpi-value">{formatValue(data?.value, widget.format)}</div>
      {change != null && (
        <div className={`dbb-kpi-change ${change >= 0 ? "is-up" : "is-down"}`}>
```

ด้วย

```jsx
export default function KpiCard({ widget, data }) {
  const change = data?.change_pct;
  // a fall is good news when lower is better (costs, returns): the colour follows the metric
  const good = widget.higher_is_better === false ? change <= 0 : change >= 0;
  return (
    <div className="dbb-kpi">
      <div className="dbb-kpi-value">{formatValue(data?.value, widget.format, widget.currency)}</div>
      {change != null && (
        <div className={`dbb-kpi-change ${good ? "is-good" : "is-bad"}`}>
```

(3) `services/ui/src/components/builder/ChartWidget.jsx`: แทน `  const fmt = (v) => formatValue(v, widget.format);` ด้วย `  const fmt = (v) => formatValue(v, widget.format, widget.currency);`

(4) `services/ui/src/components/builder/TableWidget.jsx`: แทน `export default function TableWidget({ widget, data }) {` ด้วย `export default function TableWidget({ widget, data, labels = {} }) {` และแทน

```jsx
                  {c}{sort?.column === c ? (sort.desc ? " ↓" : " ↑") : ""}
```

ด้วย

```jsx
                  {labels[c] || c}{sort?.column === c ? (sort.desc ? " ↓" : " ↑") : ""}
```

(5) `services/ui/src/components/builder/DashboardCanvas.jsx` สี่จุด: แทน

```jsx
function WidgetBody({ widget, data, onDrill }) {
  if (data?.error) return <p className="dbb-error-inline">{data.error}</p>;
  if (widget.type === "kpi") return <KpiCard widget={widget} data={data} />;
  if (widget.type === "table") return <TableWidget widget={widget} data={data} />;
```

ด้วย

```jsx
function WidgetBody({ widget, data, onDrill, labels }) {
  if (data?.error) return <p className="dbb-error-inline">{data.error}</p>;
  if (widget.type === "kpi") return <KpiCard widget={widget} data={data} />;
  if (widget.type === "table") return <TableWidget widget={widget} data={data} labels={labels} />;
```

แทน

```jsx
  const filterColumns = new Set(spec.filters.filter((f) => f.type === "select").map((f) => f.column));
```

ด้วย

```jsx
  const filterColumns = new Set(spec.filters.filter((f) => f.type === "select").map((f) => f.column));
  const labels = data?.column_labels || {}; // display names from the semantic layer
```

แทน

```jsx
            <button type="button" key={column} className="dbb-chip is-active" onClick={() => clear(column)} aria-label={`ล้างตัวกรอง ${column}`}>
              {column}: {sel.values[0]} ×
```

ด้วย

```jsx
            <button type="button" key={column} className="dbb-chip is-active" onClick={() => clear(column)} aria-label={`ล้างตัวกรอง ${labels[column] || column}`}>
              {labels[column] || column}: {sel.values[0]} ×
```

และแทน

```jsx
            <WidgetBody widget={w} data={data?.widgets?.[w.id]} onDrill={drill} />
```

ด้วย

```jsx
            <WidgetBody widget={w} data={data?.widgets?.[w.id]} onDrill={drill} labels={labels} />
```

(6) `services/ui/src/pages/DashboardBuilder.css`: แทน

```css
.dbb-kpi-change.is-up { color: var(--dbb-up); }
.dbb-kpi-change.is-down { color: var(--dbb-down); }
```

ด้วย

```css
.dbb-kpi-change.is-good { color: var(--dbb-up); }
.dbb-kpi-change.is-bad { color: var(--dbb-down); }
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run`
Expected: PASS ทั้งหมด 233 เทสต์ (229 เดิม; `numberFormat.test.js` จาก 3 เป็น 5, `DashboardCanvas.test.jsx` เพิ่ม 2)

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/ui/src/utils/numberFormat.js services/ui/src/utils/numberFormat.test.js services/ui/src/components/builder/KpiCard.jsx services/ui/src/components/builder/ChartWidget.jsx services/ui/src/components/builder/TableWidget.jsx services/ui/src/components/builder/DashboardCanvas.jsx services/ui/src/components/builder/DashboardCanvas.test.jsx services/ui/src/test/dashboardFixtures.js services/ui/src/pages/DashboardBuilder.css && git commit -m "feat(dashboard): format numbers by currency code, colour KPIs by direction, label columns"
```

---

### Task 10: ตารางแก้ความหมายคอลัมน์และแถบสถานะ (UI)

**Files:**
- Create: `services/ui/src/utils/requestJson.js`, `services/ui/src/utils/requestJson.test.js`, `services/ui/src/utils/semanticApi.js`
- Modify: `services/ui/src/utils/dashboardsApi.js`
- Create: `services/ui/src/components/builder/semanticModel.js`, `semanticModel.test.js`, `SemanticStatus.jsx`, `ColumnMetaTable.jsx`, `SemanticEditor.jsx`, `SemanticEditor.test.jsx`
- Modify: `services/ui/src/test/dashboardFixtures.js`, `services/ui/src/pages/DashboardBuilder.css`

**Interfaces:**
- Consumes: route จาก Task 5; `friendlyApiError(detail, fallback)` จาก `utils/apiError.js`; `KIND_LABELS` (export จาก `components/builder/DatasetPicker.jsx`); `mockFetchByUrl` จาก `test/renderPage.jsx`
- Produces (ใช้ใน Task 11, 12):
  - `requestJson(url, { method, body }) -> Promise<json>` error มี `.status` (0 เมื่อเชื่อมต่อไม่ได้) ข้อความ error เดิมของ `dashboardsApi` ไม่เปลี่ยน
  - `semanticApi.get(table)`, `.draft(table)`, `.saveDraft(table, body)`, `.approve(table, body)`
  - `semanticModel.js`: `ROLE_LABELS`, `UNIT_LABELS`, `AGG_LABELS`, `DEFAULT_AGGS`, `DURATION_UNITS` (object หน่วย -> ชื่อไทย), `CURRENCIES`, `roleOptions(kind)`, `updateColumn(meta, patch)`, `fromView(table, view)`, `differsFromApproved(name, meta, view)`, `statusText(view)`
  - `SemanticEditor({ table, profile, value, onChange })` โดย `value` = `{table, view, columns, metrics, dirty, conflict, warnings}` หรือ `null` และโหลดเองเมื่อ `value?.table !== table` (`onChange` ต้องเป็นฟังก์ชันที่ไม่เปลี่ยนทุก render เช่น setter ของ `useState`)
  - fixture `PROFILE` และ `SEMANTIC_VIEW` ใน `test/dashboardFixtures.js` (metric `row_count` ตั้ง label เป็น "จำนวนรายการ" เพื่อไม่ชนกับการ์ด "จำนวนแถว" ของขั้นดูข้อมูล)
  - ข้อความหน้าจอ: สถานะ (`role="status"`), "ยังไม่ได้อนุมัติความหมายคอลัมน์ ตัวเลขอาจแสดงหน่วยไม่ถูก", "มีการแก้ไขที่ยังไม่บันทึก", ปุ่ม "ให้ AI ร่าง" / "บันทึกร่าง" / "อนุมัติ" / "โหลดใหม่", label ของช่อง `บทบาท <คอลัมน์>`, `ชื่อที่แสดง <คอลัมน์>`, `หน่วย <คอลัมน์>`, `สกุลเงิน <คอลัมน์>`, `หน่วยเวลา <คอลัมน์>`, `รวมแบบ <คอลัมน์>`, `ส่วนบุคคล <คอลัมน์>`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

(1) ต่อท้าย `services/ui/src/test/dashboardFixtures.js`:

```js
// The profile of the "sales" preview used by the builder tests.
export const PROFILE = {
  rows: 6, column_count: 3, missing_cells: 1, kind_counts: { numeric: 1, categorical: 1, date: 1, text: 0 },
  columns: [
    { name: "order_date", kind: "date", dtype: "datetime64[ns]", missing: 0, missing_pct: 0, distinct: 6 },
    { name: "region", kind: "categorical", dtype: "string", missing: 1, missing_pct: 16.67, distinct: 3 },
    { name: "amount", kind: "numeric", dtype: "Float64", missing: 0, missing_pct: 0, distinct: 6 }
  ]
};

const meta = (role, extra = {}) => ({ role, label: "", description: "", unit: null, currency: null,
  duration_unit: null, default_agg: null, pii: false, ...extra });

// GET /api/v1/semantic/sales for PROFILE: a draft waiting for approval.
export const SEMANTIC_VIEW = {
  table_name: "sales", status: "draft", pending_draft: false, version: 0,
  effective: {
    columns: {
      order_date: meta("time"),
      region: meta("dimension", { label: "ภูมิภาค" }),
      amount: meta("measure", { label: "ยอดขาย", unit: "currency", default_agg: "sum" })
    },
    metrics: [
      // Labelled "จำนวนรายการ", not "จำนวนแถว", so it never collides with the preview's row-count tile.
      { id: "row_count", label: "จำนวนรายการ", description: "", type: "simple",
        measure: { agg: "count", column: null, where: null }, format: "number", currency: null, higher_is_better: true },
      { id: "avg_amount", label: "ยอดขายเฉลี่ย", description: "", type: "simple",
        measure: { agg: "avg", column: "amount", where: null }, format: "number", currency: null, higher_is_better: true }
    ]
  },
  draft: null, approved: null, drift: { new_columns: [], missing_columns: [] },
  invalid_metrics: [{ id: "aov", label: "Average Order Value", reason: "ไม่มีคอลัมน์ Order_ID" }],
  hidden_columns: [], history: [], warnings: [], metric_values: { row_count: 6, avg_amount: 83.3333 }
};
```

(2) สร้าง `services/ui/src/utils/requestJson.test.js`:

```js
import { it, expect, vi } from "vitest";
import { requestJson } from "./requestJson";
import { mockFetchByUrl } from "../test/renderPage";

it("keeps the HTTP status on the error", async () => {
  mockFetchByUrl([["/x", { status: 409, body: { detail: "มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่" } }]]);
  const error = await requestJson("/api/v1/x").catch((e) => e);
  expect(error.status).toBe(409);
  expect(error.message).toBe("มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่");
});

it("sends a JSON body with the method", async () => {
  const fetchMock = mockFetchByUrl([["/x", { body: { ok: true } }]]);
  expect(await requestJson("/api/v1/x", { method: "PUT", body: { a: 1 } })).toEqual({ ok: true });
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/v1/x");
  expect(options.method).toBe("PUT");
  expect(JSON.parse(options.body)).toEqual({ a: 1 });
});

it("explains a network failure in Thai", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const error = await requestJson("/api/v1/x").catch((e) => e);
  expect(error.message).toBe("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
  expect(error.status).toBe(0);
});
```

(3) สร้าง `services/ui/src/components/builder/semanticModel.test.js`:

```js
import { it, expect } from "vitest";
import { roleOptions, updateColumn, differsFromApproved, statusText } from "./semanticModel";
import { SEMANTIC_VIEW } from "../../test/dashboardFixtures";

it("offers only the roles a column kind allows", () => {
  expect(roleOptions("numeric")).toEqual(["measure", "dimension", "identifier", "text"]);
  expect(roleOptions("date")).toEqual(["dimension", "time", "identifier", "text"]);
  expect(roleOptions("text")).toEqual(["dimension", "identifier", "text"]);
});

it("keeps measure fields consistent when a column changes", () => {
  const amount = SEMANTIC_VIEW.effective.columns.amount;
  expect(updateColumn(amount, { role: "dimension" })).toMatchObject({ role: "dimension", unit: null, default_agg: null, currency: null });
  expect(updateColumn(amount, { currency: " usd " }).currency).toBe("USD");
  expect(updateColumn(amount, { unit: "duration" })).toMatchObject({ unit: "duration", duration_unit: "seconds", currency: null });
  expect(updateColumn(SEMANTIC_VIEW.effective.columns.region, { role: "measure" })).toMatchObject({ unit: "number", default_agg: "sum" });
});

it("spots columns that differ from the approved version", () => {
  const view = { ...SEMANTIC_VIEW, approved: { columns: { amount: { ...SEMANTIC_VIEW.effective.columns.amount, currency: "USD" } } } };
  expect(differsFromApproved("amount", SEMANTIC_VIEW.effective.columns.amount, view)).toBe(true);
  expect(differsFromApproved("region", SEMANTIC_VIEW.effective.columns.region, view)).toBe(false);
});

it("describes every status", () => {
  expect(statusText(SEMANTIC_VIEW)).toBe("ร่างแล้ว รออนุมัติ");
  expect(statusText({ ...SEMANTIC_VIEW, status: "approved", version: 3, pending_draft: true })).toBe("อนุมัติแล้ว v3 · มีร่างที่ยังไม่อนุมัติ");
  expect(statusText({ ...SEMANTIC_VIEW, status: "approved_outdated", version: 3,
    drift: { new_columns: ["a", "b"], missing_columns: ["c"] } })).toBe("อนุมัติแล้ว v3 แต่โครงสร้างเปลี่ยน: คอลัมน์ใหม่ 2 · คอลัมน์ที่หายไป 1");
  expect(statusText({ ...SEMANTIC_VIEW, status: "none" })).toBe("ยังไม่มีความหมายคอลัมน์ ระบบเดาให้จากชื่อคอลัมน์");
  expect(statusText({ ...SEMANTIC_VIEW, status: "unavailable" })).toBe("เชื่อมต่อที่เก็บความหมายคอลัมน์ไม่ได้ ใช้ค่าที่เดาจากชื่อคอลัมน์");
});
```

(4) สร้าง `services/ui/src/components/builder/SemanticEditor.test.jsx`:

```jsx
import React, { useState } from "react";
import { it, expect } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import SemanticEditor from "./SemanticEditor";
import { mockFetchByUrl } from "../../test/renderPage";
import { PROFILE, SEMANTIC_VIEW } from "../../test/dashboardFixtures";

const APPROVED_VIEW = { ...SEMANTIC_VIEW, status: "approved", version: 1,
  approved: { columns: SEMANTIC_VIEW.effective.columns, metrics: SEMANTIC_VIEW.effective.metrics, version: 1 } };

function Harness() {
  const [value, setValue] = useState(null);
  return <SemanticEditor table="sales" profile={PROFILE} value={value} onChange={setValue} />;
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const callTo = (part, method) =>
  fetch.mock.calls.find(([url, options]) => String(url).includes(part) && (options?.method || "GET") === method);
const gets = () => fetch.mock.calls.filter(([url, o]) => String(url).endsWith("/semantic/sales") && (o?.method || "GET") === "GET").length;

// routes: the longer "/semantic/sales/..." URLs come first (mockFetchByUrl: the first match wins).
async function show(routes = []) {
  mockFetchByUrl([...routes, ["/semantic/sales", { body: SEMANTIC_VIEW }]]);
  render(<Harness />);
  await settle();
}

it("loads the column meaning and shows its status", async () => {
  await show();
  expect(screen.getByRole("status")).toHaveTextContent("ร่างแล้ว รออนุมัติ");
  expect(screen.getByText("ยังไม่ได้อนุมัติความหมายคอลัมน์ ตัวเลขอาจแสดงหน่วยไม่ถูก")).toBeInTheDocument();
  expect(screen.getByLabelText("ชื่อที่แสดง amount")).toHaveValue("ยอดขาย");
  expect(screen.getByText("ระบุสกุลเงิน")).toBeInTheDocument();
  expect(screen.getByText("1 (16.67%)")).toBeInTheDocument();
});

it("offers roles by column kind", async () => {
  await show();
  expect(within(screen.getByLabelText("บทบาท region")).queryByRole("option", { name: "ตัววัด" })).toBeNull();
  expect(within(screen.getByLabelText("บทบาท amount")).getByRole("option", { name: "ตัววัด" })).toBeInTheDocument();
});

it("saves edits as a draft", async () => {
  await show([["/semantic/sales/draft", { body: SEMANTIC_VIEW }]]);
  const save = screen.getByRole("button", { name: "บันทึกร่าง" });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("สกุลเงิน amount"), { target: { value: "usd" } });
  expect(screen.getByText("มีการแก้ไขที่ยังไม่บันทึก")).toBeInTheDocument();
  await act(async () => { fireEvent.click(save); });
  await settle();
  const body = JSON.parse(callTo("/semantic/sales/draft", "PUT")[1].body);
  expect(body.columns.amount.currency).toBe("USD");
  expect(body.metrics.map((m) => m.id)).toEqual(["row_count", "avg_amount"]);
  expect(screen.queryByText("มีการแก้ไขที่ยังไม่บันทึก")).toBeNull();
});

it("clears measure fields when a column stops being a measure", async () => {
  await show();
  fireEvent.change(screen.getByLabelText("บทบาท amount"), { target: { value: "dimension" } });
  expect(screen.queryByLabelText("หน่วย amount")).toBeNull();
  expect(screen.queryByLabelText("รวมแบบ amount")).toBeNull();
});

it("marks a column as personal data", async () => {
  await show([["/semantic/sales/draft", { body: SEMANTIC_VIEW }]]);
  fireEvent.click(screen.getByLabelText("ส่วนบุคคล region"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึกร่าง" })); });
  await settle();
  expect(JSON.parse(callTo("/semantic/sales/draft", "PUT")[1].body).columns.region.pii).toBe(true);
});

it("approves with the version the user started from", async () => {
  await show([["/semantic/sales/approve", { body: APPROVED_VIEW }]]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "อนุมัติ" })); });
  await settle();
  expect(JSON.parse(callTo("/semantic/sales/approve", "POST")[1].body).base_version).toBe(0);
  expect(screen.getByRole("status")).toHaveTextContent("อนุมัติแล้ว v1");
  expect(screen.queryByText(/ตัวเลขอาจแสดงหน่วยไม่ถูก/)).toBeNull();
});

it("asks to reload when someone approved a newer version, and keeps the edits until then", async () => {
  await show([["/semantic/sales/approve", { status: 409, body: { detail: "มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่" } }]]);
  fireEvent.change(screen.getByLabelText("ชื่อที่แสดง region"), { target: { value: "ภาค" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "อนุมัติ" })); });
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("กรุณาโหลดใหม่");
  expect(screen.getByLabelText("ชื่อที่แสดง region")).toHaveValue("ภาค");
  const before = gets();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "โหลดใหม่" })); });
  await settle();
  expect(gets()).toBe(before + 1);
  expect(screen.getByLabelText("ชื่อที่แสดง region")).toHaveValue("ภูมิภาค");
});

it("asks the AI for a draft only when the button is pressed", async () => {
  await show([["/semantic/sales/draft", { body: { ...SEMANTIC_VIEW, engine: "groq" } }]]);
  expect(callTo("/semantic/sales/draft", "POST")).toBeUndefined();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "ให้ AI ร่าง" })); });
  await settle();
  expect(callTo("/semantic/sales/draft", "POST")).toBeTruthy();
});

it("disables changes when the semantic store is unavailable", async () => {
  mockFetchByUrl([["/semantic/sales", { body: { ...SEMANTIC_VIEW, status: "unavailable" } }]]);
  render(<Harness />);
  await settle();
  for (const name of ["ให้ AI ร่าง", "บันทึกร่าง", "อนุมัติ"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
});

it("shows the load error when the view cannot be read", async () => {
  mockFetchByUrl([["/semantic/sales", { status: 404, body: { detail: "ไม่พบชุดข้อมูล" } }]]);
  render(<Harness />);
  await settle();
  expect(screen.getByRole("alert")).toHaveTextContent("ไม่พบชุดข้อมูล");
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run src/utils/requestJson.test.js src/components/builder/semanticModel.test.js src/components/builder/SemanticEditor.test.jsx`
Expected: FAIL ทั้งสามไฟล์ด้วย `Failed to resolve import "./requestJson"` / `"./semanticModel"` / `"./SemanticEditor"`

- [ ] **Step 3: เขียนโค้ด**

(1) สร้าง `services/ui/src/utils/requestJson.js`:

```js
import { friendlyApiError } from "./apiError";

// fetch + JSON for this app's API: sends the session cookie, goes to /login on 401 and throws an
// Error a user can read. The HTTP status stays on error.status (0 when the server was not reached).
export async function requestJson(url, { method = "GET", body } = {}) {
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
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "";
    const error = new Error(friendlyApiError(detail, `คำขอล้มเหลว (HTTP ${res.status})`));
    error.status = res.status;
    throw error;
  }
  return data;
}
```

(2) `services/ui/src/utils/dashboardsApi.js`: แทนส่วนหัวไฟล์ทั้งหมดก่อน `export const dashboardsApi = {`

```js
import { friendlyApiError } from "./apiError";

const BASE = "/api/v1/dashboards";

async function request(path, { method = "GET", body } = {}) {
  const options = { method, credentials: "same-origin" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
  }
  if (res.status === 401 && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "";
    throw new Error(friendlyApiError(detail, `คำขอล้มเหลว (HTTP ${res.status})`));
  }
  return data;
}
```

ด้วย

```js
import { requestJson } from "./requestJson";

const BASE = "/api/v1/dashboards";

const request = (path, options) => requestJson(`${BASE}${path}`, options);
```

(ส่วน `export const dashboardsApi = { ... }` คงเดิมทุกบรรทัด)

(3) สร้าง `services/ui/src/utils/semanticApi.js`:

```js
import { requestJson } from "./requestJson";

const url = (table, suffix = "") => `/api/v1/semantic/${encodeURIComponent(table)}${suffix}`;

// /api/v1/semantic: the column meaning and metric definitions of one dataset.
export const semanticApi = {
  get: (table) => requestJson(url(table)),
  draft: (table) => requestJson(url(table, "/draft"), { method: "POST" }),
  saveDraft: (table, body) => requestJson(url(table, "/draft"), { method: "PUT", body }),
  approve: (table, body) => requestJson(url(table, "/approve"), { method: "POST", body })
};
```

(4) สร้าง `services/ui/src/components/builder/semanticModel.js`:

```js
// Choices and pure helpers for editing a dataset's semantic layer (column meaning + metrics).
// The server checks everything again (semantic_layer.validate_semantic); these only keep the form tidy.
export const ROLE_LABELS = { measure: "ตัววัด", dimension: "มิติ", time: "เวลา", identifier: "รหัส", text: "ข้อความ" };
export const UNIT_LABELS = { currency: "เงิน", percent: "เปอร์เซ็นต์", count: "จำนวนนับ", duration: "ระยะเวลา", number: "ตัวเลข" };
export const AGG_LABELS = { count: "นับแถว", count_distinct: "นับไม่ซ้ำ", sum: "ผลรวม", avg: "ค่าเฉลี่ย", min: "ต่ำสุด", max: "สูงสุด" };
export const DEFAULT_AGGS = ["sum", "avg", "min", "max", "count_distinct"];
export const DURATION_UNITS = { seconds: "วินาที", minutes: "นาที", hours: "ชั่วโมง", days: "วัน" };
export const CURRENCIES = ["THB", "USD", "EUR", "JPY", "CNY", "GBP", "SGD"];
const META_FIELDS = ["role", "label", "unit", "currency", "duration_unit", "default_agg", "pii"];

// measure needs a numeric column and time a date column (the same rule as the server).
export function roleOptions(kind) {
  return Object.keys(ROLE_LABELS).filter((role) => (role !== "measure" || kind === "numeric") && (role !== "time" || kind === "date"));
}

// Applies an edit and keeps the measure-only fields consistent with the role and the unit.
export function updateColumn(meta, patch) {
  const next = { ...meta, ...patch };
  if (next.role !== "measure") {
    return { ...next, unit: null, currency: null, duration_unit: null, default_agg: null };
  }
  next.unit = next.unit || "number";
  next.default_agg = next.default_agg || "sum";
  next.currency = next.unit === "currency" && typeof next.currency === "string" ? next.currency.trim().toUpperCase() || null : null;
  next.duration_unit = next.unit === "duration" ? next.duration_unit || "seconds" : null;
  return next;
}

// The editor state for a view from GET/PUT/POST /api/v1/semantic/{table}.
export function fromView(table, view) {
  if (!view?.effective) throw new Error("โหลดความหมายคอลัมน์ไม่ได้");
  return { table, view, columns: view.effective.columns, metrics: view.effective.metrics,
    dirty: false, conflict: false, warnings: view.warnings || [] };
}

export function differsFromApproved(name, meta, view) {
  const approved = view.approved?.columns?.[name];
  if (!approved) return false;
  return META_FIELDS.some((field) => (approved[field] ?? null) !== (meta[field] ?? null));
}

export function statusText(view) {
  const text = {
    none: "ยังไม่มีความหมายคอลัมน์ ระบบเดาให้จากชื่อคอลัมน์",
    draft: "ร่างแล้ว รออนุมัติ",
    approved: `อนุมัติแล้ว v${view.version}`,
    approved_outdated: `อนุมัติแล้ว v${view.version} แต่โครงสร้างเปลี่ยน: คอลัมน์ใหม่ ${view.drift.new_columns.length} · คอลัมน์ที่หายไป ${view.drift.missing_columns.length}`,
    unavailable: "เชื่อมต่อที่เก็บความหมายคอลัมน์ไม่ได้ ใช้ค่าที่เดาจากชื่อคอลัมน์"
  }[view.status];
  return view.pending_draft ? `${text} · มีร่างที่ยังไม่อนุมัติ` : text;
}
```

(5) สร้าง `services/ui/src/components/builder/SemanticStatus.jsx`:

```jsx
import React from "react";
import { statusText } from "./semanticModel";

export default function SemanticStatus({ view, dirty, busy, onDraft, onSaveDraft, onApprove }) {
  const offline = view.status === "unavailable";
  return (
    <div className={`dbb-semantic-status is-${view.status}`}>
      <div>
        <strong role="status">{statusText(view)}</strong>
        {view.status !== "approved" && <p className="dbb-muted">ยังไม่ได้อนุมัติความหมายคอลัมน์ ตัวเลขอาจแสดงหน่วยไม่ถูก</p>}
        {dirty && <p className="dbb-muted">มีการแก้ไขที่ยังไม่บันทึก</p>}
      </div>
      <div className="dbb-actions">
        <button type="button" onClick={onDraft} disabled={offline || Boolean(busy)}>
          {busy === "draft" ? "AI กำลังร่าง…" : "ให้ AI ร่าง"}
        </button>
        <button type="button" onClick={onSaveDraft} disabled={offline || !dirty || Boolean(busy)}>บันทึกร่าง</button>
        <button type="button" className="dbb-btn-primary" onClick={onApprove} disabled={offline || Boolean(busy)}>
          {busy === "approve" ? "กำลังอนุมัติ…" : "อนุมัติ"}
        </button>
      </div>
    </div>
  );
}
```

(6) สร้าง `services/ui/src/components/builder/ColumnMetaTable.jsx` (ช่องที่ไม่เกี่ยวกับบทบาทปล่อยว่าง ไม่ใส่ขีด):

```jsx
import React from "react";
import { KIND_LABELS } from "./DatasetPicker";
import {
  AGG_LABELS, CURRENCIES, DEFAULT_AGGS, DURATION_UNITS, ROLE_LABELS, UNIT_LABELS,
  differsFromApproved, roleOptions, updateColumn
} from "./semanticModel";

function UnitDetail({ name, meta, set }) {
  if (meta.unit === "currency") {
    return (
      <>
        <input aria-label={`สกุลเงิน ${name}`} list="dbb-currencies" maxLength={3} value={meta.currency || ""}
          onChange={(e) => set({ currency: e.target.value })} />
        {!meta.currency && <div className="dbb-error-inline">ระบุสกุลเงิน</div>}
      </>
    );
  }
  if (meta.unit === "duration") {
    return (
      <select aria-label={`หน่วยเวลา ${name}`} value={meta.duration_unit} onChange={(e) => set({ duration_unit: e.target.value })}>
        {Object.entries(DURATION_UNITS).map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}
      </select>
    );
  }
  return null;
}

// One editable row per column of the preview profile; the missing and distinct counts stay read-only.
export default function ColumnMetaTable({ profile, view, columns, onChange }) {
  const fresh = new Set(view.drift.new_columns);
  return (
    <div className="dbb-scroll">
      <table className="dbb-table dbb-meta-table">
        <thead>
          <tr>
            <th>คอลัมน์</th><th>ชนิด</th><th>บทบาท</th><th>ชื่อที่แสดง</th><th>หน่วย</th><th>สกุลเงิน / เวลา</th>
            <th>รวมแบบ</th><th>ส่วนบุคคล</th><th>ค่าว่าง</th><th>ค่าไม่ซ้ำ</th>
          </tr>
        </thead>
        <tbody>
          {profile.columns.map((c) => {
            const meta = columns[c.name];
            if (!meta) return null;
            const set = (patch) => onChange(c.name, updateColumn(meta, patch));
            const measure = meta.role === "measure";
            return (
              <tr key={c.name} className={differsFromApproved(c.name, meta, view) ? "is-changed" : ""}>
                <td><code>{c.name}</code>{fresh.has(c.name) && <span className="dbb-badge">ใหม่</span>}</td>
                <td>{KIND_LABELS[c.kind]}</td>
                <td>
                  <select aria-label={`บทบาท ${c.name}`} value={meta.role} onChange={(e) => set({ role: e.target.value })}>
                    {roleOptions(c.kind).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </td>
                <td>
                  <input aria-label={`ชื่อที่แสดง ${c.name}`} value={meta.label} placeholder={c.name} maxLength={60}
                    onChange={(e) => set({ label: e.target.value })} />
                </td>
                <td>
                  {measure && (
                    <select aria-label={`หน่วย ${c.name}`} value={meta.unit} onChange={(e) => set({ unit: e.target.value })}>
                      {Object.entries(UNIT_LABELS).map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}
                    </select>
                  )}
                </td>
                <td>{measure && <UnitDetail name={c.name} meta={meta} set={set} />}</td>
                <td>
                  {measure && (
                    <select aria-label={`รวมแบบ ${c.name}`} value={meta.default_agg} onChange={(e) => set({ default_agg: e.target.value })}>
                      {DEFAULT_AGGS.map((agg) => <option key={agg} value={agg}>{AGG_LABELS[agg]}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  <input type="checkbox" aria-label={`ส่วนบุคคล ${c.name}`} checked={meta.pii}
                    onChange={(e) => set({ pii: e.target.checked })} />
                </td>
                <td>{c.missing} ({c.missing_pct}%)</td>
                <td>{c.distinct}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="dbb-currencies">{CURRENCIES.map((code) => <option key={code} value={code} />)}</datalist>
    </div>
  );
}
```

(7) สร้าง `services/ui/src/components/builder/SemanticEditor.jsx`:

```jsx
import React, { useCallback, useEffect, useState } from "react";
import { semanticApi } from "../../utils/semanticApi";
import { fromView } from "./semanticModel";
import SemanticStatus from "./SemanticStatus";
import ColumnMetaTable from "./ColumnMetaTable";

// The column meaning (and metrics) of one dataset. `value` lives in DashboardBuilder so unsaved
// edits survive a step change: {table, view, columns, metrics, dirty, conflict, warnings} or null.
// It loads the view itself whenever `value` belongs to another table.
export default function SemanticEditor({ table, profile, value, onChange }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const ready = value?.table === table;

  const load = useCallback(async () => {
    setError("");
    try {
      onChange(fromView(table, await semanticApi.get(table)));
    } catch (e) {
      setError(e.message);
    }
  }, [table, onChange]);

  useEffect(() => {
    if (!ready) load();
  }, [ready, load]);

  if (!ready) {
    return error ? <p role="alert" className="dbb-error">{error}</p> : <p className="dbb-muted">กำลังโหลดความหมายคอลัมน์…</p>;
  }

  const perform = (kind, call) => async () => {
    setBusy(kind);
    setError("");
    try {
      onChange(fromView(table, await call()));
    } catch (e) {
      if (e.status === 409) onChange({ ...value, conflict: true });
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const body = { columns: value.columns, metrics: value.metrics };
  const setColumn = (name, meta) => onChange({ ...value, columns: { ...value.columns, [name]: meta }, dirty: true });

  return (
    <div className="dbb-semantic">
      <SemanticStatus
        view={value.view}
        dirty={value.dirty}
        busy={busy}
        onDraft={perform("draft", () => semanticApi.draft(table))}
        onSaveDraft={perform("save", () => semanticApi.saveDraft(table, body))}
        onApprove={perform("approve", () => semanticApi.approve(table, { ...body, base_version: value.view.version }))}
      />
      {error && (
        <p role="alert" className="dbb-error">
          {error}
          {value.conflict && <button type="button" onClick={load}>โหลดใหม่</button>}
        </p>
      )}
      {value.warnings.length > 0 && (
        <details>
          <summary>หมายเหตุ {value.warnings.length} รายการ</summary>
          <ul>{value.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}
      <h3>ความหมายคอลัมน์</h3>
      <ColumnMetaTable profile={profile} view={value.view} columns={value.columns} onChange={setColumn} />
    </div>
  );
}
```

(8) ต่อท้าย `services/ui/src/pages/DashboardBuilder.css`:

```css
/* Semantic layer editor in the "ดูข้อมูล" step */
.dbb-semantic { display: flex; flex-direction: column; gap: 10px; }
.dbb-semantic h3 { margin: 4px 0 0; font-size: 14px; }
.dbb-semantic-status { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--dbb-border); border-radius: 6px; background: #f8fafc; }
.dbb-semantic-status.is-approved { border-color: #abefc6; background: #ecfdf3; }
.dbb-semantic-status.is-approved_outdated, .dbb-semantic-status.is-unavailable { border-color: #fedf89; background: #fffaeb; }
.dbb-badge { margin-left: 6px; padding: 1px 6px; border-radius: 999px; background: var(--dbb-primary-soft); color: var(--dbb-primary); font-size: 11px; font-weight: 600; }
.dbb-meta-table select, .dbb-meta-table input:not([type="checkbox"]) { max-width: 150px; padding: 4px 6px; border: 1px solid var(--dbb-border); border-radius: 4px; font: inherit; font-size: 12px; }
.dbb-meta-table tr.is-changed { background: #fffaeb; }
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run`
Expected: PASS ทั้งหมด 250 เทสต์ (รวม `dashboardsApi.test.js` เดิมที่ตอนนี้วิ่งผ่าน `requestJson` และยังได้ข้อความ "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่" กับ "คำขอล้มเหลว (HTTP 404)" เหมือนเดิม)

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/ui/src/utils/requestJson.js services/ui/src/utils/requestJson.test.js services/ui/src/utils/dashboardsApi.js services/ui/src/utils/semanticApi.js services/ui/src/components/builder/semanticModel.js services/ui/src/components/builder/semanticModel.test.js services/ui/src/components/builder/SemanticStatus.jsx services/ui/src/components/builder/ColumnMetaTable.jsx services/ui/src/components/builder/SemanticEditor.jsx services/ui/src/components/builder/SemanticEditor.test.jsx services/ui/src/test/dashboardFixtures.js services/ui/src/pages/DashboardBuilder.css && git commit -m "feat(dashboard): edit and approve column meaning with status and conflict handling"
```

---

### Task 11: แผง Metric (UI)

**Files:**
- Modify: `services/ui/src/components/builder/semanticModel.js`, `semanticModel.test.js`
- Create: `services/ui/src/components/builder/MetricPanel.jsx`, `MetricPanel.test.jsx`
- Modify: `services/ui/src/components/builder/SemanticEditor.jsx`, `SemanticEditor.test.jsx`, `services/ui/src/pages/DashboardBuilder.css`

**Interfaces:**
- Consumes: `formatValue(value, format, currency)` (Task 9); `AGG_LABELS`, `CURRENCIES` (datalist `dbb-currencies` ใน `ColumnMetaTable`), `SemanticEditor`, `PROFILE`, `SEMANTIC_VIEW` (Task 10); view ที่มี `effective.metrics`, `metric_values`, `invalid_metrics`, `hidden_columns`
- Produces (ใช้ใน Task 12):
  - ใน `semanticModel.js`: `METRIC_AGGS`, `NUMERIC_AGGS`, `WHERE_OPS`, `FORMAT_LABELS`, `describeMetric(metric, labelOf)`, `emptyMetric()`, `toMetricBody(form, profile)`, `columnsFor(agg, profile, columns, hidden)`, `metricValueText(metric, view)`
  - `MetricPanel({ profile, columns, metrics, view, onChange(metrics) })` (default export) และ `MetricForm` (named export)
  - ข้อความหน้าจอ: ปุ่ม "เพิ่ม metric", "แก้ <label>", "ลบ <label>", "ยกเลิก", "ใช้ metric นี้"; ช่อง "ชื่อ metric", "รหัส", "คำอธิบาย", "ชนิด", "รูปแบบ", "สกุลเงิน", "ยิ่งสูงยิ่งดี", `<ส่วน>: การคำนวณ`, `<ส่วน>: คอลัมน์`, `<ส่วน>: มีเงื่อนไข`, `<ส่วน>: คอลัมน์เงื่อนไข`, `<ส่วน>: ตัวเทียบ`, `<ส่วน>: ค่า` โดย `<ส่วน>` คือ "ค่า", "ตัวตั้ง", "ตัวหาร"; metric ที่ใช้ไม่ได้ขึ้นเป็น "ใช้ไม่ได้ <label>: <เหตุผล>" สีแดง

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

(1) `services/ui/src/components/builder/semanticModel.test.js`: แทนบรรทัด import สองบรรทัดแรกหลัง `vitest`

```js
import { roleOptions, updateColumn, differsFromApproved, statusText } from "./semanticModel";
import { SEMANTIC_VIEW } from "../../test/dashboardFixtures";
```

ด้วย

```js
import {
  roleOptions, updateColumn, differsFromApproved, statusText,
  describeMetric, toMetricBody, columnsFor, metricValueText, emptyMetric
} from "./semanticModel";
import { PROFILE, SEMANTIC_VIEW } from "../../test/dashboardFixtures";
```

แล้วต่อท้ายไฟล์:

```js
const labelOf = (name) => ({ amount: "ยอดขาย", region: "ภูมิภาค" }[name] || name);

it("reads a metric formula in plain words", () => {
  const margin = { type: "ratio", numerator: { agg: "sum", column: "amount", where: { column: "region", op: "in", value: ["N", "S"] } },
    denominator: { agg: "count", column: null, where: null } };
  expect(describeMetric(margin, labelOf)).toBe("sum(ยอดขาย) เมื่อ ภูมิภาค อยู่ใน N, S ÷ count(*)");
});

it("turns the form into the body the API validates", () => {
  const form = { ...emptyMetric(), label: " ยอดเหนือ ", type: "simple",
    measure: { agg: "count", column: "amount", where: { column: "amount", op: "gt", value: "50" } } };
  expect(toMetricBody(form, PROFILE)).toEqual({ label: "ยอดเหนือ", description: "", type: "simple", format: "number",
    currency: null, higher_is_better: true, measure: { agg: "count", column: null, where: { column: "amount", op: "gt", value: 50 } } });
  const listed = { ...form, measure: { agg: "count", column: null, where: { column: "region", op: "in", value: "N, S ," } } };
  expect(toMetricBody(listed, PROFILE).measure.where.value).toEqual(["N", "S"]);
  expect(toMetricBody({ ...form, id: " sales_north " }, PROFILE).id).toBe("sales_north");
});

it("offers numeric non-identifier visible columns for sums", () => {
  const columns = { amount: { role: "measure" }, region: { role: "dimension" }, order_date: { role: "time" } };
  expect(columnsFor("sum", PROFILE, columns, [])).toEqual(["amount"]);
  expect(columnsFor("sum", PROFILE, { ...columns, amount: { role: "identifier" } }, [])).toEqual([]);
  expect(columnsFor("count_distinct", PROFILE, columns, ["region"])).toEqual(["order_date", "amount"]);
});

it("shows a current value only for metrics unchanged since the server computed them", () => {
  const [, avg] = SEMANTIC_VIEW.effective.metrics;
  expect(metricValueText(avg, SEMANTIC_VIEW)).toBe("ค่าปัจจุบัน 83.33");
  expect(metricValueText({ ...avg, label: "ใหม่" }, SEMANTIC_VIEW)).toBe("บันทึกร่างเพื่อดูค่า");
  expect(metricValueText(avg, { ...SEMANTIC_VIEW, metric_values: { avg_amount: null } })).toBe("ยังไม่มีค่า");
});
```

(2) สร้าง `services/ui/src/components/builder/MetricPanel.test.jsx`:

```jsx
import React from "react";
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import MetricPanel from "./MetricPanel";
import { PROFILE, SEMANTIC_VIEW } from "../../test/dashboardFixtures";

function draw(props = {}) {
  const onChange = vi.fn();
  render(<MetricPanel profile={PROFILE} columns={SEMANTIC_VIEW.effective.columns} metrics={SEMANTIC_VIEW.effective.metrics}
    view={SEMANTIC_VIEW} onChange={onChange} {...props} />);
  return onChange;
}

it("lists metrics with their formula and current value, and the ones that broke", () => {
  draw();
  expect(screen.getByText("จำนวนรายการ")).toBeInTheDocument();
  expect(screen.getByText("count(*)")).toBeInTheDocument();
  expect(screen.getByText("ค่าปัจจุบัน 6")).toBeInTheDocument();
  expect(screen.getByText("avg(ยอดขาย)")).toBeInTheDocument();
  expect(screen.getByText(/Average Order Value: ไม่มีคอลัมน์ Order_ID/)).toBeInTheDocument();
});

it("adds a ratio metric", () => {
  const onChange = draw();
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม metric" }));
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "ยอดต่อแถว" } });
  fireEvent.change(screen.getByLabelText("ชนิด"), { target: { value: "ratio" } });
  fireEvent.change(screen.getByLabelText("ตัวตั้ง: คอลัมน์"), { target: { value: "amount" } });
  fireEvent.change(screen.getByLabelText("ตัวหาร: การคำนวณ"), { target: { value: "count" } });
  fireEvent.change(screen.getByLabelText("รูปแบบ"), { target: { value: "currency" } });
  fireEvent.change(screen.getByLabelText("สกุลเงิน"), { target: { value: "usd" } });
  fireEvent.click(screen.getByRole("button", { name: "ใช้ metric นี้" }));
  const added = onChange.mock.calls[0][0].at(-1);
  expect(added).toEqual({ label: "ยอดต่อแถว", description: "", type: "ratio", format: "currency", currency: "USD",
    higher_is_better: true, numerator: { agg: "sum", column: "amount", where: null },
    denominator: { agg: "count", column: null, where: null } });
});

it("adds a metric with a condition and its own id", () => {
  const onChange = draw();
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม metric" }));
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "ยอดภาคเหนือ" } });
  fireEvent.change(screen.getByLabelText("รหัส"), { target: { value: "north_sales" } });
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์"), { target: { value: "amount" } });
  fireEvent.click(screen.getByLabelText("ค่า: มีเงื่อนไข"));
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์เงื่อนไข"), { target: { value: "region" } });
  fireEvent.change(screen.getByLabelText("ค่า: ค่า"), { target: { value: "North" } });
  fireEvent.click(screen.getByLabelText("ยิ่งสูงยิ่งดี"));
  fireEvent.click(screen.getByRole("button", { name: "ใช้ metric นี้" }));
  expect(onChange.mock.calls[0][0].at(-1)).toMatchObject({ id: "north_sales", higher_is_better: false,
    measure: { agg: "sum", column: "amount", where: { column: "region", op: "eq", value: "North" } } });
});

it("needs a name and a column before a metric can be used", () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม metric" }));
  const use = screen.getByRole("button", { name: "ใช้ metric นี้" });
  expect(use).toBeDisabled();
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "รวม" } });
  expect(use).toBeDisabled();
  fireEvent.change(screen.getByLabelText("ค่า: คอลัมน์"), { target: { value: "amount" } });
  expect(use).toBeEnabled();
  expect(within(screen.getByLabelText("ค่า: คอลัมน์")).getAllByRole("option").map((o) => o.value)).toEqual(["", "amount"]);
});

it("never offers a hidden personal column", () => {
  draw({ view: { ...SEMANTIC_VIEW, hidden_columns: ["region"] } });
  fireEvent.click(screen.getByRole("button", { name: "เพิ่ม metric" }));
  fireEvent.change(screen.getByLabelText("ค่า: การคำนวณ"), { target: { value: "count_distinct" } });
  const options = within(screen.getByLabelText("ค่า: คอลัมน์")).getAllByRole("option").map((o) => o.value);
  expect(options).toEqual(["", "order_date", "amount"]);
});

it("edits and deletes metrics", () => {
  const onChange = draw();
  fireEvent.click(screen.getByRole("button", { name: "แก้ ยอดขายเฉลี่ย" }));
  fireEvent.change(screen.getByLabelText("ชื่อ metric"), { target: { value: "ยอดเฉลี่ย" } });
  fireEvent.click(screen.getByRole("button", { name: "ใช้ metric นี้" }));
  expect(onChange.mock.calls[0][0][1]).toMatchObject({ id: "avg_amount", label: "ยอดเฉลี่ย" });
  fireEvent.click(screen.getByRole("button", { name: "ลบ จำนวนรายการ" }));
  expect(onChange.mock.calls[1][0].map((m) => m.id)).toEqual(["avg_amount"]);
});
```

(3) ต่อท้าย `services/ui/src/components/builder/SemanticEditor.test.jsx`:

```jsx
it("saves the metric list from the panel with the draft", async () => {
  await show([["/semantic/sales/draft", { body: SEMANTIC_VIEW }]]);
  fireEvent.click(screen.getByRole("button", { name: "ลบ จำนวนรายการ" }));
  expect(screen.getByText("มีการแก้ไขที่ยังไม่บันทึก")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "บันทึกร่าง" })); });
  await settle();
  expect(JSON.parse(callTo("/semantic/sales/draft", "PUT")[1].body).metrics.map((m) => m.id)).toEqual(["avg_amount"]);
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run src/components/builder/semanticModel.test.js src/components/builder/MetricPanel.test.jsx src/components/builder/SemanticEditor.test.jsx`
Expected: FAIL (`semanticModel.test.js` ด้วย `describeMetric is not a function` หรือ `SyntaxError: The requested module does not provide an export`, `MetricPanel.test.jsx` ด้วย `Failed to resolve import "./MetricPanel"`, เทสต์ใหม่ของ `SemanticEditor` หาปุ่ม "ลบ จำนวนรายการ" ไม่เจอ)

- [ ] **Step 3: เขียนโค้ด**

(1) `services/ui/src/components/builder/semanticModel.js`: แทนบรรทัดแรกของไฟล์

```js
// Choices and pure helpers for editing a dataset's semantic layer (column meaning + metrics).
```

ด้วย

```js
import { formatValue } from "../../utils/numberFormat";

// Choices and pure helpers for editing a dataset's semantic layer (column meaning + metrics).
```

แล้วต่อท้ายไฟล์:

```js
export const METRIC_AGGS = ["count", "count_distinct", "sum", "avg", "min", "max"];
export const NUMERIC_AGGS = ["sum", "avg", "min", "max"];
export const WHERE_OPS = { eq: "=", ne: "≠", in: "อยู่ใน", gt: ">", gte: "≥", lt: "<", lte: "≤" };
export const FORMAT_LABELS = { number: "ตัวเลข", currency: "เงิน", percent: "เปอร์เซ็นต์" };

function describePart(part, labelOf) {
  const base = part.agg === "count" ? "count(*)" : `${part.agg}(${labelOf(part.column)})`;
  if (!part.where) return base;
  const value = Array.isArray(part.where.value) ? part.where.value.join(", ") : String(part.where.value);
  return `${base} เมื่อ ${labelOf(part.where.column)} ${WHERE_OPS[part.where.op]} ${value}`;
}

// The formula in plain words, with the columns' display names.
export function describeMetric(metric, labelOf = (name) => name) {
  return metric.type === "ratio"
    ? `${describePart(metric.numerator, labelOf)} ÷ ${describePart(metric.denominator, labelOf)}`
    : describePart(metric.measure, labelOf);
}

export function emptyMetric() {
  const part = () => ({ agg: "sum", column: "", where: null });
  return { id: "", label: "", description: "", type: "simple", measure: part(), numerator: part(), denominator: part(),
    format: "number", currency: null, higher_is_better: true };
}

function parseValue(where, kind) {
  const number = (v) => (kind === "numeric" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v);
  if (where.op === "in") return String(where.value).split(",").map((v) => v.trim()).filter(Boolean).map(number);
  return typeof where.value === "string" ? number(where.value.trim()) : where.value;
}

// The metric as the API expects it (semantic_layer.clean_metric). Without an id the server makes one from the label.
export function toMetricBody(form, profile) {
  const kindOf = (name) => profile.columns.find((c) => c.name === name)?.kind;
  const part = (p) => ({
    agg: p.agg,
    column: p.agg === "count" ? null : p.column,
    where: p.where ? { column: p.where.column, op: p.where.op, value: parseValue(p.where, kindOf(p.where.column)) } : null
  });
  const body = { label: form.label.trim(), description: (form.description || "").trim(), type: form.type, format: form.format,
    currency: form.format === "currency" ? form.currency || null : null, higher_is_better: form.higher_is_better };
  if (form.id && form.id.trim()) body.id = form.id.trim();
  if (form.type === "simple") body.measure = part(form.measure);
  else {
    body.numerator = part(form.numerator);
    body.denominator = part(form.denominator);
  }
  return body;
}

// Columns a metric part may use: never a hidden (personal) column; sum/avg/min/max need a numeric non-identifier.
export function columnsFor(agg, profile, columns, hidden) {
  return profile.columns
    .filter((c) => !hidden.includes(c.name))
    .filter((c) => !NUMERIC_AGGS.includes(agg) || (c.kind === "numeric" && columns[c.name]?.role !== "identifier"))
    .map((c) => c.name);
}

// The value the server computed, shown only while the metric is unchanged since then.
export function metricValueText(metric, view) {
  const original = view.effective.metrics.find((m) => m.id === metric.id);
  if (!original || JSON.stringify(original) !== JSON.stringify(metric)) return "บันทึกร่างเพื่อดูค่า";
  const value = view.metric_values?.[metric.id];
  if (value === null || value === undefined) return "ยังไม่มีค่า";
  return `ค่าปัจจุบัน ${formatValue(value, metric.format, metric.currency)}`;
}
```

(2) สร้าง `services/ui/src/components/builder/MetricPanel.jsx`:

```jsx
import React, { useState } from "react";
import {
  AGG_LABELS, FORMAT_LABELS, METRIC_AGGS, WHERE_OPS,
  columnsFor, describeMetric, emptyMetric, metricValueText, toMetricBody
} from "./semanticModel";

const partReady = (part) => part.agg === "count" || Boolean(part.column);

function PartFields({ title, part, onChange, profile, columns, hidden }) {
  const options = columnsFor(part.agg, profile, columns, hidden);
  const whereColumns = columnsFor("count", profile, columns, hidden);
  const labelOf = (name) => columns[name]?.label || name;
  const where = part.where;
  return (
    <fieldset className="dbb-metric-part">
      <legend>{title}</legend>
      <select aria-label={`${title}: การคำนวณ`} value={part.agg}
        onChange={(e) => onChange({ ...part, agg: e.target.value, column: e.target.value === "count" ? null : part.column })}>
        {METRIC_AGGS.map((agg) => <option key={agg} value={agg}>{AGG_LABELS[agg]}</option>)}
      </select>
      {part.agg !== "count" && (
        <select aria-label={`${title}: คอลัมน์`} value={part.column || ""} onChange={(e) => onChange({ ...part, column: e.target.value })}>
          <option value="">เลือกคอลัมน์</option>
          {options.map((name) => <option key={name} value={name}>{labelOf(name)}</option>)}
        </select>
      )}
      <label className="dbb-check">
        <input type="checkbox" aria-label={`${title}: มีเงื่อนไข`} checked={Boolean(where)}
          onChange={(e) => onChange({ ...part, where: e.target.checked ? { column: whereColumns[0] || "", op: "eq", value: "" } : null })} />
        มีเงื่อนไข
      </label>
      {where && (
        <>
          <select aria-label={`${title}: คอลัมน์เงื่อนไข`} value={where.column} onChange={(e) => onChange({ ...part, where: { ...where, column: e.target.value } })}>
            {whereColumns.map((name) => <option key={name} value={name}>{labelOf(name)}</option>)}
          </select>
          <select aria-label={`${title}: ตัวเทียบ`} value={where.op} onChange={(e) => onChange({ ...part, where: { ...where, op: e.target.value } })}>
            {Object.entries(WHERE_OPS).map(([op, text]) => <option key={op} value={op}>{text}</option>)}
          </select>
          <input aria-label={`${title}: ค่า`} value={Array.isArray(where.value) ? where.value.join(", ") : String(where.value ?? "")}
            onChange={(e) => onChange({ ...part, where: { ...where, value: e.target.value } })} />
        </>
      )}
    </fieldset>
  );
}

export function MetricForm({ initial, profile, columns, hidden, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({ ...emptyMetric(), ...initial }));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const parts = { profile, columns, hidden };
  const ready = form.label.trim().length > 0 &&
    (form.type === "simple" ? partReady(form.measure) : partReady(form.numerator) && partReady(form.denominator));
  const submit = (e) => {
    e.preventDefault();
    if (ready) onSave(toMetricBody(form, profile));
  };

  return (
    <form className="dbb-metric-form" onSubmit={submit}>
      <label htmlFor="dbb-metric-label">ชื่อ metric</label>
      <input id="dbb-metric-label" maxLength={60} value={form.label} onChange={(e) => set({ label: e.target.value })} />
      <label htmlFor="dbb-metric-id">รหัส</label>
      <input id="dbb-metric-id" maxLength={40} value={form.id} placeholder="เว้นว่างให้ระบบสร้างจากชื่อ"
        onChange={(e) => set({ id: e.target.value })} />
      <label htmlFor="dbb-metric-description">คำอธิบาย</label>
      <input id="dbb-metric-description" maxLength={300} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      <label htmlFor="dbb-metric-type">ชนิด</label>
      <select id="dbb-metric-type" value={form.type} onChange={(e) => set({ type: e.target.value })}>
        <option value="simple">ค่าเดี่ยว</option>
        <option value="ratio">อัตราส่วน</option>
      </select>
      {form.type === "simple" ? (
        <PartFields title="ค่า" part={form.measure} onChange={(measure) => set({ measure })} {...parts} />
      ) : (
        <>
          <PartFields title="ตัวตั้ง" part={form.numerator} onChange={(numerator) => set({ numerator })} {...parts} />
          <PartFields title="ตัวหาร" part={form.denominator} onChange={(denominator) => set({ denominator })} {...parts} />
        </>
      )}
      <label htmlFor="dbb-metric-format">รูปแบบ</label>
      <select id="dbb-metric-format" value={form.format} onChange={(e) => set({ format: e.target.value })}>
        {Object.entries(FORMAT_LABELS).map(([format, label]) => <option key={format} value={format}>{label}</option>)}
      </select>
      {form.format === "currency" && (
        <>
          <label htmlFor="dbb-metric-currency">สกุลเงิน</label>
          <input id="dbb-metric-currency" list="dbb-currencies" maxLength={3} value={form.currency || ""}
            onChange={(e) => set({ currency: e.target.value.trim().toUpperCase() || null })} />
        </>
      )}
      <label className="dbb-check">
        <input type="checkbox" checked={form.higher_is_better} onChange={(e) => set({ higher_is_better: e.target.checked })} />
        ยิ่งสูงยิ่งดี
      </label>
      <div className="dbb-actions">
        <button type="button" onClick={onCancel}>ยกเลิก</button>
        <button type="submit" className="dbb-btn-primary" disabled={!ready}>ใช้ metric นี้</button>
      </div>
    </form>
  );
}

export default function MetricPanel({ profile, columns, metrics, view, onChange }) {
  const [editing, setEditing] = useState(null); // index of the metric being edited, or "new"
  const hidden = view.hidden_columns;
  const labelOf = (name) => columns[name]?.label || name;
  const save = (metric) => {
    onChange(editing === "new" ? [...metrics, metric] : metrics.map((m, i) => (i === editing ? metric : m)));
    setEditing(null);
  };

  return (
    <section className="dbb-metrics" aria-label="Metric">
      <div className="dbb-toolbar">
        <h3>Metric</h3>
        <button type="button" onClick={() => setEditing("new")} disabled={editing !== null}>เพิ่ม metric</button>
      </div>
      <ul>
        {metrics.map((m, i) => (
          <li key={m.id || `new-${i}`}>
            <div>
              <strong>{m.label}</strong>{" "}
              <span className="dbb-muted">{describeMetric(m, labelOf)}</span>
            </div>
            <span className="dbb-metric-value">{metricValueText(m, view)}</span>
            <div className="dbb-actions">
              <button type="button" aria-label={`แก้ ${m.label}`} onClick={() => setEditing(i)} disabled={editing !== null}>แก้</button>
              <button type="button" aria-label={`ลบ ${m.label}`} onClick={() => onChange(metrics.filter((_, j) => j !== i))}>ลบ</button>
            </div>
          </li>
        ))}
        {view.invalid_metrics.map((m) => (
          <li key={`invalid-${m.id}`} className="is-invalid">ใช้ไม่ได้ {m.label || m.id}: {m.reason}</li>
        ))}
      </ul>
      {editing !== null && (
        <MetricForm initial={editing === "new" ? {} : metrics[editing]} profile={profile} columns={columns} hidden={hidden}
          onSave={save} onCancel={() => setEditing(null)} />
      )}
    </section>
  );
}
```

(3) `services/ui/src/components/builder/SemanticEditor.jsx`: แทน

```jsx
import ColumnMetaTable from "./ColumnMetaTable";
```

ด้วย

```jsx
import ColumnMetaTable from "./ColumnMetaTable";
import MetricPanel from "./MetricPanel";
```

และแทน

```jsx
      <ColumnMetaTable profile={profile} view={value.view} columns={value.columns} onChange={setColumn} />
```

ด้วย

```jsx
      <ColumnMetaTable profile={profile} view={value.view} columns={value.columns} onChange={setColumn} />
      <MetricPanel profile={profile} columns={value.columns} metrics={value.metrics} view={value.view}
        onChange={(metrics) => onChange({ ...value, metrics, dirty: true })} />
```

(4) ต่อท้าย `services/ui/src/pages/DashboardBuilder.css`:

```css
.dbb-metrics ul { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.dbb-metrics li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid var(--dbb-border); border-radius: 6px; font-size: 13px; }
.dbb-metrics li.is-invalid { border-color: #fecdca; background: #fef3f2; color: var(--dbb-down); }
.dbb-metric-value { font-variant-numeric: tabular-nums; font-weight: 600; }
.dbb-metric-form { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 8px 12px; padding: 12px; border: 1px solid var(--dbb-border); border-radius: 6px; font-size: 13px; }
.dbb-metric-form .dbb-metric-part, .dbb-metric-form .dbb-actions, .dbb-metric-form > .dbb-check { grid-column: 1 / -1; }
.dbb-metric-part { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 8px; border: 1px dashed var(--dbb-border); border-radius: 6px; }
.dbb-metric-form input, .dbb-metric-form select, .dbb-metric-part select, .dbb-metric-part input { padding: 4px 6px; border: 1px solid var(--dbb-border); border-radius: 4px; font: inherit; font-size: 13px; }
.dbb-check { display: inline-flex; align-items: center; gap: 6px; }
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run`
Expected: PASS ทั้งหมด 261 เทสต์

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/ui/src/components/builder/semanticModel.js services/ui/src/components/builder/semanticModel.test.js services/ui/src/components/builder/MetricPanel.jsx services/ui/src/components/builder/MetricPanel.test.jsx services/ui/src/components/builder/SemanticEditor.jsx services/ui/src/components/builder/SemanticEditor.test.jsx services/ui/src/pages/DashboardBuilder.css && git commit -m "feat(dashboard): metric panel to add, edit and remove metric definitions with current values"
```

---

### Task 12: ใส่ semantic layer ในขั้น "ดูข้อมูล" ของ Create Dashboard

**Files:**
- Modify: `services/ui/src/components/builder/DataPreview.jsx`
- Modify: `services/ui/src/pages/DashboardBuilder.jsx`
- Test: `services/ui/src/pages/DashboardBuilder.test.jsx`

**Interfaces:**
- Consumes: `SemanticEditor` (Task 10 และ 11); `SEMANTIC_VIEW` (Task 10); `POST /render` ที่ตอบ `warnings` (Task 8); ใน `DashboardBuilder.jsx` ของเดิม: `STEPS`, `notice`/`setNotice`, `chooseDataset`, `openSaved`, `QualityNotice`; ใน `DashboardBuilder.test.jsx` ของเดิม: `builderRoutes(extra)`, `settle`, `callTo(part, method)`, `DATASETS`, `ID`, `SAVED_DOC`, `SUMMARY`, `PREVIEW` (แถวแรกมี `region: "North"`)
- Produces:
  - `DataPreview({ table, renderColumns, hiddenColumns = [] })`: `renderColumns(profile)` แทนตาราง "โครงสร้างคอลัมน์" เมื่อส่งมา และหัวคอลัมน์ใน `hiddenColumns` ของตัวอย่าง 20 แถวมีป้าย "ส่วนบุคคล" (ตัวอย่างยังแสดงทุกคอลัมน์และทุกค่า)
  - state `semantic` ใน `DashboardBuilder` (ค่าของ `SemanticEditor`) ล้างเมื่อเปลี่ยนชุดข้อมูล ไม่หายเมื่อสลับขั้น
  - กด "ถัดไป" ขณะมีการแก้ค้างขึ้น notice "มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก" แต่ไม่บล็อก (spec 12)
  - แดชบอร์ดที่เปิดจากรายการบันทึกแสดง `warnings` ของ `render` ในหมายเหตุ

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

`services/ui/src/pages/DashboardBuilder.test.jsx` (Edit tool):

(1) แทน `import { SPEC, DATA } from "../test/dashboardFixtures";` ด้วย `import { SPEC, DATA, SEMANTIC_VIEW } from "../test/dashboardFixtures";`

(2) ใน `builderRoutes` แทน

```jsx
    ...extra,
    ["/dashboards/suggest-changes", { body: CHANGES }],
```

ด้วย

```jsx
    ...extra,
    ["/semantic/sales", { body: SEMANTIC_VIEW }], // the "ดูข้อมูล" step loads the column meaning
    ["/dashboards/suggest-changes", { body: CHANGES }],
```

(route นี้อยู่หลัง `...extra` เพื่อให้เทสต์ส่ง view อื่นมาแทนได้ และไม่ชนกับ route ของ `/dashboards/...` เพราะไม่มี URL ใดของแดชบอร์ดมีสตริง `/semantic/sales`)

(3) ต่อท้ายไฟล์:

```jsx
// --- the semantic layer in the "ดูข้อมูล" step ----------------------------------------------------
it("lets the user check column meaning before asking for a dashboard, without calling the AI", async () => {
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes());
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(screen.getByRole("status")).toHaveTextContent("ร่างแล้ว รออนุมัติ");
  expect(callTo("/semantic/sales/draft")).toBeUndefined();
  fireEvent.change(screen.getByLabelText("ชื่อที่แสดง region"), { target: { value: "ภาค" } });
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  expect(screen.getByText("มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก")).toBeInTheDocument();
  expect(screen.getByLabelText(/อยากวิเคราะห์อะไรจาก/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /ดูข้อมูล/ }));
  await settle();
  expect(screen.getByLabelText("ชื่อที่แสดง region")).toHaveValue("ภาค");
});

it("marks personal columns in the sample and still shows them", async () => {
  const view = { ...SEMANTIC_VIEW, hidden_columns: ["region"] };
  await renderPage(DashboardBuilder, "/dashboard-builder", builderRoutes([["/semantic/sales", { body: view }]]));
  fireEvent.click(screen.getByRole("radio", { name: "เลือก sales" }));
  fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
  await settle();
  expect(screen.getByRole("columnheader", { name: "region ส่วนบุคคล" })).toBeInTheDocument();
  expect(screen.getByText("North")).toBeInTheDocument();
});

it("explains widgets dropped when a saved dashboard is opened", async () => {
  const note = "ตัดวิดเจ็ต 'ตามชื่อลูกค้า': ไม่มีคอลัมน์ Customer_Name";
  await renderPage(DashboardBuilder, "/dashboard-builder", [
    [`/dashboards/saved/${ID}`, { body: SAVED_DOC }],
    ["/dashboards/saved", { body: { dashboards: [SUMMARY] } }],
    ["/dashboards/datasets", { body: DATASETS }],
    ["/dashboards/render", { body: { spec: SPEC, data: DATA, warnings: [note] } }]
  ]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "เปิด ยอดขายผู้บริหาร" })); });
  await settle();
  expect(screen.getByText(note)).toBeInTheDocument();
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run src/pages/DashboardBuilder.test.jsx`
Expected: FAIL 3 เทสต์ใหม่ (ไม่มี `role="status"` ของความหมายคอลัมน์ในขั้นดูข้อมูล, ไม่มีหัวคอลัมน์ "region ส่วนบุคคล", ไม่เห็นหมายเหตุของแดชบอร์ดที่บันทึกไว้) เทสต์เดิมยังผ่าน

- [ ] **Step 3: แก้ `DataPreview.jsx`** (Edit tool สามจุด)

(1) แทนบรรทัดหัวฟังก์ชัน

```jsx
export default function DataPreview({ table }) {
```

ด้วย

```jsx
function StructureTable({ profile }) {
  return (
    <>
      <h3>โครงสร้างคอลัมน์</h3>
      <div className="dbb-scroll">
        <table className="dbb-table">
          <thead>
            <tr><th>คอลัมน์</th><th>ประเภท</th><th>dtype</th><th>ค่าว่าง</th><th>ค่าไม่ซ้ำ</th></tr>
          </thead>
          <tbody>
            {profile.columns.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td><span className={`dbb-kind dbb-kind-${c.kind}`}>{KIND_LABELS[c.kind]}</span></td>
                <td><code>{c.dtype}</code></td>
                <td>{c.missing} ({c.missing_pct}%)</td>
                <td>{c.distinct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// renderColumns(profile), when given, replaces the read-only structure table (the builder puts the
// semantic editor there). hiddenColumns are tagged "ส่วนบุคคล" in the sample, which still shows every column.
export default function DataPreview({ table, renderColumns, hiddenColumns = [] }) {
```

(2) แทน

```jsx
  const { profile, sample } = preview;
  const stats = [
```

ด้วย

```jsx
  const { profile, sample } = preview;
  const hidden = new Set(hiddenColumns);
  const stats = [
```

(3) แทน

```jsx
      <h3>โครงสร้างคอลัมน์</h3>
      <div className="dbb-scroll">
        <table className="dbb-table">
          <thead>
            <tr><th>คอลัมน์</th><th>ประเภท</th><th>dtype</th><th>ค่าว่าง</th><th>ค่าไม่ซ้ำ</th></tr>
          </thead>
          <tbody>
            {profile.columns.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td><span className={`dbb-kind dbb-kind-${c.kind}`}>{KIND_LABELS[c.kind]}</span></td>
                <td><code>{c.dtype}</code></td>
                <td>{c.missing} ({c.missing_pct}%)</td>
                <td>{c.distinct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>ตัวอย่าง {sample.length} แถวแรก</h3>
      <div className="dbb-scroll">
        <table className="dbb-table">
          <thead>
            <tr>{profile.columns.map((c) => <th key={c.name}>{c.name}</th>)}</tr>
          </thead>
```

ด้วย

```jsx
      {renderColumns ? renderColumns(profile) : <StructureTable profile={profile} />}
      <h3>ตัวอย่าง {sample.length} แถวแรก</h3>
      <div className="dbb-scroll">
        <table className="dbb-table">
          <thead>
            <tr>
              {profile.columns.map((c) => (
                <th key={c.name}>{c.name}{hidden.has(c.name) && <span className="dbb-badge">ส่วนบุคคล</span>}</th>
              ))}
            </tr>
          </thead>
```

- [ ] **Step 4: แก้ `DashboardBuilder.jsx`** (Edit tool ห้าจุด)

(1) import: แทน

```jsx
import SavedDashboards from "../components/builder/SavedDashboards";
```

ด้วย

```jsx
import SavedDashboards from "../components/builder/SavedDashboards";
import SemanticEditor from "../components/builder/SemanticEditor";
```

(2) state: แทน

```jsx
  const [notice, setNotice] = useState("");
```

ด้วย

```jsx
  const [notice, setNotice] = useState("");
  // The column meaning being edited in the "ดูข้อมูล" step (SemanticEditor's value). It lives here so
  // unsaved edits survive moving between steps; the editor reloads it when it belongs to another table.
  const [semantic, setSemantic] = useState(null);
```

(3) ใน `chooseDataset`: แทน

```jsx
      setError("");
      setBusy("");
    }
    setDataset(next);
```

ด้วย

```jsx
      setError("");
      setBusy("");
      setSemantic(null);
    }
    setDataset(next);
```

(4) ใน `openSaved`: แทน

```jsx
    setDraft({ spec: rendered.spec, data: rendered.data, engine: "saved", model: null, warnings: [], savedName: doc.name });
```

ด้วย

```jsx
    // the render re-checks the saved spec against today's data and semantic layer: say what it dropped
    setDraft({ spec: rendered.spec, data: rendered.data, engine: "saved", model: null, warnings: rendered.warnings || [], savedName: doc.name });
```

(5) ในส่วน `step === 1`: แทน

```jsx
          <QualityNotice quality={quality} tableRows={catalogEntry?.records} />
          <DataPreview table={dataset.name} />
          <div className="dbb-actions">
            <button type="button" onClick={() => setStep(0)}>ย้อนกลับ</button>
            <button type="button" className="dbb-btn-primary" onClick={() => setStep(2)}>ถัดไป</button>
          </div>
```

ด้วย

```jsx
          <QualityNotice quality={quality} tableRows={catalogEntry?.records} />
          <DataPreview
            table={dataset.name}
            hiddenColumns={semantic?.table === dataset.name ? semantic.view.hidden_columns : []}
            renderColumns={(profile) => (
              <SemanticEditor table={dataset.name} profile={profile} value={semantic} onChange={setSemantic} />
            )}
          />
          <div className="dbb-actions">
            <button type="button" onClick={() => setStep(0)}>ย้อนกลับ</button>
            <button
              type="button"
              className="dbb-btn-primary"
              onClick={() => {
                // a reminder, not a block: the dashboard can be built from the stored meaning
                setNotice(semantic?.table === dataset.name && semantic.dirty ? "มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก" : "");
                setStep(2);
              }}
            >
              ถัดไป
            </button>
          </div>
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run`
Expected: PASS ทั้งหมด 264 เทสต์ (เทสต์เดิม "previews the chosen dataset before asking what to analyse" ยังเจอ `1 (16.67%)` ในตารางความหมายคอลัมน์ และ "จำนวนแถว" ยังมีที่เดียว) ข้อความเตือนของ recharts เรื่อง width(0) ใน stderr เป็นของเดิม

- [ ] **Step 6: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add services/ui/src/components/builder/DataPreview.jsx services/ui/src/pages/DashboardBuilder.jsx services/ui/src/pages/DashboardBuilder.test.jsx && git commit -m "feat(dashboard): review column meaning and metrics in the Create Dashboard preview step"
```

---

### Task 13: เอกสาร และทดสอบกับระบบจริง

**Files:**
- Modify: `docs/ui-analysis/06-create-dashboard.md` (LF)
- Modify: `docs/create-dashboard-improvement-proposal.md` (LF)

**Interfaces:**
- Consumes: ผลของ Task 1 ถึง 12
- Produces: เอกสารที่ตรงกับพฤติกรรมจริง และหลักฐานจากระบบจริง (ส่วน B)

**ส่วน A (executor):** แก้เอกสารและรันเทสต์ทั้งสองฝั่ง **ห้ามรันคำสั่ง docker** ใช้ Edit tool หาบรรทัดด้วย Grep ตามคำขึ้นต้นที่ระบุ แล้วแก้เฉพาะส่วนที่บอก (คงข้อความเดิมที่เหลือทั้งหมด)

- [ ] **Step 1: อัปเดต `docs/ui-analysis/06-create-dashboard.md`**

(ก) ตารางภาพรวม: ต่อจากแถวที่ขึ้นต้นด้วย ``| `DataPreview.jsx` |`` เพิ่มแถวใหม่นี้

```markdown
| `SemanticEditor.jsx`, `SemanticStatus.jsx`, `ColumnMetaTable.jsx`, `MetricPanel.jsx` (อยู่ในขั้น "ดูข้อมูล") | `GET /api/v1/semantic/{table}`, `POST /api/v1/semantic/{table}/draft`, `PUT /api/v1/semantic/{table}/draft`, `POST /api/v1/semantic/{table}/approve` (ผ่าน `utils/semanticApi.js`, ต้อง login ทุกเส้น) | `semantic.py` -> `semantic_layer.resolve` / `validate_semantic`, `semantic_llm.draft_semantic`, `dashboard_compute.metric_values` | **Elasticsearch index `sdoqap_semantic_layer`** หนึ่งเอกสารต่อชุดข้อมูล (id = ชื่อชุดข้อมูล) เก็บ draft, approved (มีเวอร์ชัน) และประวัติ 10 รายการ |
```

(ข) ส่วนที่ 3: แทนบรรทัดที่ขึ้นต้นด้วย `- **[ตาราง "โครงสร้างคอลัมน์"]**` ทั้งบรรทัด (คงบรรทัดย่อยถัดไปเรื่องคอลัมน์เทคนิคไว้) ด้วยสองบรรทัดนี้

```markdown
- **[ส่วน "ความหมายคอลัมน์" (แทนตาราง "โครงสร้างคอลัมน์" เดิม)]** -> (1) ปุ่ม "ให้ AI ร่าง" (กดเองเท่านั้น ไม่เรียกอัตโนมัติ), "บันทึกร่าง", "อนุมัติ" และช่องแก้ต่อคอลัมน์: บทบาท (ตัววัด มิติ เวลา รหัส ข้อความ ตัวเลือกกรองตามชนิดคอลัมน์), ชื่อที่แสดง, หน่วย, สกุลเงินหรือหน่วยเวลา, รวมแบบ, ส่วนบุคคล ค่าว่างและค่าไม่ซ้ำยังอยู่ในแถวเดียวกัน (2) ความหมายทางธุรกิจของแต่ละคอลัมน์ แถบสถานะบอก "ยังไม่มีความหมายคอลัมน์" / "ร่างแล้ว รออนุมัติ" / "อนุมัติแล้ว vN" / "โครงสร้างเปลี่ยน" / "เชื่อมต่อที่เก็บไม่ได้" และเตือน "ยังไม่ได้อนุมัติความหมายคอลัมน์ ตัวเลขอาจแสดงหน่วยไม่ถูก" ปุ่ม "ถัดไป" กดได้เสมอ ถ้ามีการแก้ค้างจะขึ้น "มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก" แต่ไม่บล็อก (3) `SemanticEditor.jsx`, `SemanticStatus.jsx`, `ColumnMetaTable.jsx` -> `/api/v1/semantic/{table}` (`semantic.py`); ยังไม่มีเอกสารใช้คำเดาจากชื่อคอลัมน์ (`semantic_layer.rule_column` เช่น คำ sales/price/profit = เงิน, คำลงท้าย id/code/no = รหัส, ชื่อคน อีเมล เบอร์ ที่อยู่ = ส่วนบุคคล); อนุมัติแล้วเก็บเป็นเวอร์ชัน ถ้ามีคนอนุมัติเวอร์ชันใหม่กว่าก่อน ได้ HTTP 409 และปุ่ม "โหลดใหม่"; การแก้ที่ยังไม่บันทึกอยู่ใน state ของ `DashboardBuilder` ไม่หายเมื่อสลับขั้น (4) 🟡 คำเดาจากกฎ / 🤖 เมื่อกด "ให้ AI ร่าง" (ถ้า AI บอกว่าไม่ใช่ข้อมูลส่วนบุคคลแต่กฎบอกว่าใช่ ระบบติดไว้ก่อนให้คนตัดสิน) / 🟢 ฉบับที่คนอนุมัติ คอลัมน์ที่ติด "ส่วนบุคคล" ไม่ถูกส่งให้ AI และไม่ขึ้นบนแดชบอร์ด จนกว่าคนจะอนุมัติว่าไม่ใช่
- **[แผง Metric]** -> (1) ปุ่ม "เพิ่ม metric", "แก้", "ลบ" และฟอร์ม (ชื่อ metric, รหัส, คำอธิบาย, ชนิด ค่าเดี่ยวหรืออัตราส่วน, การคำนวณ คอลัมน์ และเงื่อนไขหนึ่งข้อของแต่ละส่วน, รูปแบบ, สกุลเงิน, ยิ่งสูงยิ่งดี) (2) นิยาม metric กลางของชุดข้อมูล เช่น Gross Profit Margin = ผลรวม Profit ÷ ผลรวม Total_Sales ที่ทุกแดชบอร์ดใช้สูตรเดียวกัน แต่ละรายการแสดงสูตรอ่านง่ายและค่าปัจจุบัน metric ที่ใช้ไม่ได้ (อ้างคอลัมน์ที่หายไปหรือเป็นข้อมูลส่วนบุคคล) ขึ้นสีแดงพร้อมเหตุผล (3) `MetricPanel.jsx`; ค่าปัจจุบันจาก `metric_values` ที่ `dashboard_compute.evaluate_metric` คำนวณจากข้อมูลทั้งชุด (ไม่มีตัวกรอง) สูงสุด 20 metric ต่อชุดข้อมูล (4) 🟡 ตัวเลขคำนวณจากข้อมูลจริง นิยามมาจากคน หรือ 🤖 AI ร่างให้คนตรวจ
```

(ค) ส่วนที่ 3 บรรทัดที่ขึ้นต้นด้วย `- **[ตาราง "ตัวอย่าง 20 แถวแรก"]**` ต่อท้ายบรรทัดด้วยประโยค: ` คอลัมน์ที่ถูกซ่อนเป็นข้อมูลส่วนบุคคล (`hidden_columns`) มีป้าย "ส่วนบุคคล" ที่หัวคอลัมน์ แต่ยังแสดงค่า เพราะขั้นนี้มีไว้ให้ผู้ใช้ที่ login ตรวจข้อมูลก่อนอนุมัติ`

(ง) ส่วน 5.3 บรรทัดที่ขึ้นต้นด้วย `- **[การ์ด KPI (ตัวเลขใหญ่)]**`: แทนวลี `` `currency` ใส่ `฿` นำหน้าเสมอ `` ด้วย `` `currency` ใช้สัญลักษณ์ตามรหัสสกุลเงินของวิดเจ็ต (`$`, `฿`, `€` มาจากความหมายคอลัมน์หรือ metric ที่อนุมัติ) ถ้าไม่มีรหัสแสดงตัวเลขเปล่า `` แล้วต่อท้ายบรรทัดด้วย ` การ์ดที่ใช้ `metric_id` คำนวณตามนิยาม metric (`evaluate_metric`: อัตราส่วนคำนวณตัวตั้งและตัวหารแยกกันแล้วหาร ตัวหารเป็น 0 ได้ค่าว่าง รูปแบบเปอร์เซ็นต์คูณ 100) และรูปแบบตัวเลขมาจาก semantic layer ก่อนค่าที่ AI ส่งมา`

(จ) บรรทัดที่ขึ้นต้นด้วย `- **[แถบ "▲/▼ x% ช่วงล่าสุดเทียบช่วงก่อน" บน KPI]**` ต่อท้ายบรรทัดด้วย ` สีเขียวหรือแดงตาม `higher_is_better` ของวิดเจ็ต (เช่นต้นทุนที่ลดลงเป็นสีเขียว) class `is-good` / `is-bad``

(ฉ) บรรทัดที่ขึ้นต้นด้วย `- **[ตาราง (Table)]**` ต่อท้ายบรรทัดด้วย ` หัวตารางและชิปตัวกรองจากการคลิกกราฟใช้ชื่อที่แสดงจาก `column_labels``

(ช) ส่วนที่ 0 บรรทัดที่ขึ้นต้นด้วย `- **ส่งอะไรให้ Groq?**` ต่อท้ายบรรทัดด้วย ` เมื่อมี semantic layer โปรไฟล์ที่ส่งตัดคอลัมน์ข้อมูลส่วนบุคคลออกก่อนเสมอ (ทั้งตอนสร้าง ปรับ และเรียบเรียงคำแนะนำ) และเติมบทบาท ชื่อที่แสดง หน่วย สกุลเงินของแต่ละคอลัมน์ พร้อมรายการ metric (id ชื่อ คำอธิบาย รูปแบบ ไม่มีค่า) ตอนกด "ให้ AI ร่าง" ความหมายคอลัมน์ ส่งชื่อชุดข้อมูล จำนวนแถว โปรไฟล์ของคอลัมน์ที่ไม่ถูกซ่อน และคำเดาจากกฎ (`hint_role`, `hint_pii`) ไม่ส่งค่าในเซลล์`

(ซ) ตาราง "ความเป็นส่วนตัวของข้อมูลที่ส่งออกไป Groq (สรุป)": แทนวลี ``หรือมี >=9 หลัก `:110-117, 120-130`) |`` ด้วย ``หรือมี >=9 หลัก `:110-117, 120-130`), ชื่อและสถิติของคอลัมน์ที่ถูกซ่อนเป็นข้อมูลส่วนบุคคล (`hidden_columns` ของ semantic layer ซึ่งยังซ่อนตามกฎชื่อคอลัมน์แม้ Elasticsearch ล่ม) |``

(ฌ) บรรทัดที่ขึ้นต้นด้วย `แดชบอร์ดแบบกฎ (`fallback_spec``: แทนวลี `สร้างจากชนิดคอลัมน์ล้วน ๆ และตามกลุ่มผู้ใช้` ด้วย `สร้างจากชนิดคอลัมน์ ความหมายคอลัมน์ (ถ้ามี) และกลุ่มผู้ใช้ เมื่อมี metric ใน semantic layer การ์ด KPI ใช้ metric ก่อน (สูงสุด 4 ใบ) แล้วเติมด้วยตัววัดตาม "รวมแบบ" ที่อนุมัติ และไม่รวมหรือวาดกราฟจากคอลัมน์รหัส`

(ญ) หัวข้อ "Flow ตั้งแต่ต้นจนจบ" แทนบรรทัด `3. ขั้นที่ 2: `GET /datasets/{ตาราง}/preview` -> เห็นสถิติ โครงสร้างคอลัมน์ ตัวอย่าง 20 แถว 🟢🟡` ด้วย `3. ขั้นที่ 2: `GET /datasets/{ตาราง}/preview` + `GET /api/v1/semantic/{ตาราง}` -> เห็นสถิติ ความหมายคอลัมน์ แผง metric และตัวอย่าง 20 แถว แก้แล้วบันทึกร่างหรืออนุมัติได้ และกด "ให้ AI ร่าง" ได้ 🟢🟡🤖`

- [ ] **Step 2: อัปเดต `docs/create-dashboard-improvement-proposal.md`**

(ก) ภาคผนวก ย่อหน้าที่ขึ้นต้นด้วย `**มีแล้วและตรวจจากโค้ด:**` ต่อท้ายบรรทัด (หลัง `... prompt ปรับ (ระยะ 4)`) ด้วย ` | Semantic Layer: ความหมายคอลัมน์ หน่วย สกุลเงิน ข้อมูลส่วนบุคคล และนิยาม metric ที่ AI ร่างและคนอนุมัติในขั้น "ดูข้อมูล" (`semantic_layer.py`, `semantic.py`, ES `sdoqap_semantic_layer`) | KPI อัตราส่วนผ่าน `metric_id` (`evaluate_metric`) | ตัวเลขตามรหัสสกุลเงินและสี KPI ตาม `higher_is_better` | คอลัมน์ส่วนบุคคลไม่ถึง AI และไม่ขึ้นบนแดชบอร์ด กฎคำแนะนำใช้ role และ default_agg (ระยะ 5)`

(ข) ย่อหน้าที่ขึ้นต้นด้วย `**ยังไม่มี (ข้อเสนอทั้งหมดในเอกสารนี้):**` แทนวลี `ระบบ role จริง | Semantic Layer | KPI อัตราส่วน | การค้นหา Insight` ด้วย `ระบบ role จริง | Spark และ Gold อ่าน semantic layer (ปิดบังข้อมูลส่วนบุคคลตอน export, metric คำนวณล่วงหน้า) | การเลือกตัววัดหลักของคำแนะนำจาก semantic layer (ยังใช้คำในชื่อคอลัมน์) | การค้นหา Insight`

(ค) ย่อหน้าที่ขึ้นต้นด้วย `**หมายเหตุสำคัญ:** Semantic Layer มี spec และแผนเขียนไว้แล้ว` ต่อท้ายบรรทัดด้วย ` (อัปเดต 2026-10-07: ระยะ 5 ทำแล้วตามแผน `docs/superpowers/plans/2026-10-07-create-dashboard-semantic-layer.md` กฎคำแนะนำตัดคอลัมน์รหัสและคอลัมน์ส่วนบุคคล และใช้ default_agg แล้ว ส่วนการเลือกตัววัดหลักยังใช้คำในชื่อคอลัมน์)`

- [ ] **Step 3: ตรวจข้อความต้องห้ามในบรรทัดที่เพิ่ม**

Run: `cd /c/ETL/.claude/worktrees/semantic-layer && git diff f28e65a -- services/ui/src services/api/app services/api/tests | grep "^+" | grep -n "—\|–\|กุ้ง\|ปู"`
Expected: ไม่มีผลลัพธ์ (grep จบด้วย exit code 1) ถ้าเจอบรรทัดใด ให้แก้ข้อความนั้น (em dash ที่มีอยู่เดิม เช่น `return "—"` ใน `numberFormat.js` ไม่ใช่บรรทัดที่เพิ่ม จึงไม่ขึ้น)

- [ ] **Step 4: รันเทสต์ทั้งสองฝั่ง**

Run (แยกคำสั่ง): `cd /c/ETL/.claude/worktrees/semantic-layer/services/api && python -m pytest tests -q -p no:cacheprovider` และ `cd /c/ETL/.claude/worktrees/semantic-layer/services/ui && npx vitest run`
Expected: API 550 ผ่าน + 9 ล้มเดิมใน `tests/test_whitebox_engine.py`; UI 264 ผ่าน (รายงานตัวเลขจริงจากผลทั้งชุด ไม่ใช่จากผลที่กรองด้วย `-k`)

- [ ] **Step 5: Commit**

```bash
cd /c/ETL/.claude/worktrees/semantic-layer && git add docs/ui-analysis/06-create-dashboard.md docs/create-dashboard-improvement-proposal.md && git commit -m "docs(dashboard): describe the semantic layer, ratio KPIs and personal-column hiding"
```

**ส่วน B (ผู้ควบคุม หลัง merge branch เข้า working tree หลัก `C:\ETL`):** ถ้าขั้นใดไม่ผ่าน ให้หยุดและรายงานพร้อม log ห้ามแก้โค้ดในส่วนนี้ ชุดข้อมูลที่ใช้คือ `global_ecommerce_sales` (ตรวจแล้วตอนเขียนแผนว่ามีอยู่ใน `/data/active`: 2,000 แถว 15 คอลัมน์ `Order_ID, Order_Date, Customer_Name, Customer_Segment, Country, Region, Product_Category, Product_Name, Quantity, Unit_Price, Discount_Percent, Total_Sales, Shipping_Cost, Profit, Payment_Method` และยังไม่มี index `sdoqap_semantic_layer` ใน ES)

- [ ] **Step 6: รันเทสต์ใน working tree หลักแล้ว build**

Run: `cd /c/ETL/services/api && python -m pytest tests -q -p no:cacheprovider` (ต้องผ่านทั้งหมด 559 ตัว ไม่มี 9 ตัวที่ล้มใน worktree) และ `cd /c/ETL/services/ui && npx vitest run` (264) แล้ว `cd /c/ETL && docker compose up -d --build api ui`
Expected: container `sdoqap-api` และ `sdoqap-ui` healthy; `curl -s -o /dev/null -w "%{http_code}" http://localhost/api/v1/semantic/global_ecommerce_sales` ได้ `401`

- [ ] **Step 7: ตรวจ view จากกฎใน container (ไม่ต้อง login)**

Run:

```bash
docker exec sdoqap-api python -c "
from app.api import dashboard_data, semantic
df, p = dashboard_data.load_active_dataset('global_ecommerce_sales')
v = semantic.load_view('global_ecommerce_sales', p, semantic._es_or_none())
print(v['status'], v['hidden_columns'])
print({n: (m['role'], m['unit']) for n, m in v['effective']['columns'].items()})
print([m['id'] for m in v['effective']['metrics']])"
```

Expected: `none ['Customer_Name']`; `Order_ID` เป็น `identifier`; `Order_Date` เป็น `time`; `Unit_Price`, `Total_Sales`, `Shipping_Cost`, `Profit` เป็น `('measure', 'currency')`; `Discount_Percent` เป็น `('measure', 'percent')`; `Quantity` เป็น `('measure', 'count')`; คอลัมน์หมวดหมู่เป็น `dimension`; metric `['row_count', 'total_unit_price', 'total_total_sales', 'total_shipping_cost', 'total_profit']`

- [ ] **Step 8: เดิน flow ใน browser** (ผู้ใช้ login เอง และใส่คีย์ Groq ในหน้า Rules เองถ้ายังไม่มี ห้ามพิมพ์คีย์แทน)

เปิด `http://localhost/dashboard-builder` แล้วทำและตรวจตามลำดับ:

1. เลือก `global_ecommerce_sales` แล้วกด "ถัดไป"
   - แถบสถานะ "ยังไม่มีความหมายคอลัมน์ ระบบเดาให้จากชื่อคอลัมน์" และคำเตือนเรื่องหน่วย
   - `Customer_Name` ติดช่อง "ส่วนบุคคล" และหัวคอลัมน์ในตัวอย่าง 20 แถวมีป้าย "ส่วนบุคคล" ส่วน `Product_Name` ไม่ติด
   - `Order_ID` เป็น "รหัส"; คอลัมน์เงินขึ้น "ระบุสกุลเงิน"; `Discount_Percent` เป็น "เปอร์เซ็นต์"
   - Network tab ไม่มีคำขอ `POST /api/v1/semantic/.../draft` จนกว่าจะกดปุ่ม
2. กด "ให้ AI ร่าง" แถบสถานะเป็น "ร่างแล้ว รออนุมัติ" (ถ้าหมายเหตุขึ้น "ใช้ร่างแบบกฎแทน AI" ให้ตรวจคีย์ Groq และ `docker compose logs api --since 10m | grep -E "Groq returned|fell back"` แล้วรายงาน)
3. ตั้งสกุลเงินของคอลัมน์เงินทั้งหมดเป็น `USD`
4. เพิ่ม metric "Gross Profit Margin" รหัส `gross_margin` ชนิดอัตราส่วน ตัวตั้ง ผลรวม Profit ตัวหาร ผลรวม Total_Sales รูปแบบเปอร์เซ็นต์
5. เพิ่ม metric "Average Order Value" รหัส `aov` ชนิดอัตราส่วน ตัวตั้ง ผลรวม Total_Sales ตัวหาร นับไม่ซ้ำ Order_ID รูปแบบเงิน สกุลเงิน USD
6. กด "บันทึกร่าง" ค่าปัจจุบันของทั้งสอง metric ต้องขึ้นและสมเหตุสมผล (margin อยู่ระหว่าง 0 ถึง 100%, AOV ใกล้ผลรวม Total_Sales หารจำนวนออเดอร์)
7. กด "อนุมัติ" แถบสถานะเป็น "อนุมัติแล้ว v1" และคำเตือนเรื่องหน่วยหายไป
8. กลับไปขั้นดูข้อมูล แก้ชื่อที่แสดงของ `Region` แล้วกด "ถัดไป" โดยไม่บันทึก ต้องขึ้น "มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก" และยังไปขั้นถัดไปได้
9. ในขั้นระบุความต้องการพิมพ์ "สร้าง Dashboard สำหรับผู้บริหาร ดูยอดขาย กำไร และมูลค่าเฉลี่ยต่อออเดอร์" เลือก Management แล้วสร้าง
10. แดชบอร์ดต้องมีการ์ดที่แสดง `$…` และการ์ด `…%`; หัวตาราง ชื่อตัวกรองเริ่มต้น และชื่อวิดเจ็ตเริ่มต้นใช้ชื่อที่แสดง; ไม่มี `Customer_Name` ในวิดเจ็ต ตัวกรอง หรือตาราง (เรื่องที่ไม่อยู่ในพรอมต์พิสูจน์ด้วย unit test ใน Task 7 และ 8 ไม่ต้องดักคำขอที่ส่งไป Groq จริง)
11. ถ่าย screenshot ขั้นดูข้อมูลและแดชบอร์ดให้ผู้ใช้ดูในแชต (ไม่ commit รูป)

---

## Self-Review

**1. ครอบคลุม spec (หัวข้อ -> Task):**

| หัวข้อ spec | Task |
|---|---|
| 1 เป้าหมาย (หน่วยถูก, KPI อัตราส่วน, pii ไม่ถึง LLM และแดชบอร์ด) | 6, 7, 8, 9 |
| 2 การตัดสินใจ (AI ร่าง คนอนุมัติ, เฉพาะ Create Dashboard, หน้าตรวจในขั้นดูข้อมูล, ไม่บังคับอนุมัติแต่ซ่อน pii ไว้ก่อน, สูตร aggregate + ratio + where หนึ่งข้อ, index ใหม่) | 1 ถึง 5, 10 ถึง 12 |
| 3 ขอบเขต / ไม่ทำ | หัวแผน "ไม่ทำในแผนนี้" และ Task 13 (ภาคผนวกบอกสิ่งที่ยังไม่มี) |
| 4.1 metadata ของคอลัมน์ (whitelist, role ตาม kind, ล้างฟิลด์ไม่เกี่ยว) | 1 |
| 4.2 นิยาม metric (agg, where ทุก op, format, สูงสุด 20, อ้าง pii ไม่ได้, ตัวหาร 0 ได้ null) | 1, 2, 3 |
| 4.3 เอกสาร ES, `content_json`, history 10, `_quality_runs` | 5 (คำตัดสินข้อ 11) |
| 5 ร่างแบบกฎ (ทุกแถวของตาราง รวมชื่อไทย, metric เริ่มต้น) | 1 |
| 6 ร่างด้วย AI (ไม่เรียกอัตโนมัติ, ไม่ส่งค่าในเซลล์, ลองใหม่ 1 ครั้ง, fallback กฎ + warning, pii ของกฎชนะ, ไม่แตะ approved) | 4, 5 (คำตัดสินข้อ 15, 16) |
| 7 ตัวตรวจ `validate_semantic` (idempotent, ไม่ raise ยกเว้นไม่ใช่ object) | 1 |
| 8 `resolve` (ฐาน, new/missing columns, invalid metrics, hidden ทั้ง 3 กรณี, ทุก status, pending_draft, metric_values) | 2, 5 (คำตัดสินข้อ 5) |
| 9 API (4 เส้น, login, base_version + 409, 404, ES ล่ม GET unavailable / POST PUT 503) | 5 |
| 10 โมดูล | 1 ถึง 5 |
| 11.1 สเปก (`metric_id`, เก็บ id ไม่คัดลอกสูตร, identifier, รูปแบบตัวเลข, `currency`, `higher_is_better`) | 6 (คำตัดสินข้อ 1, 6, 7) |
| 11.2 การคำนวณ (ratio ต่อกลุ่ม, percent x100, ตัวหาร 0, `column_labels`) | 3, 6 |
| 11.3 AI และแดชบอร์ดแบบกฎ (profile_for_prompt, รายการ metrics, กฎใน prompt, fallback ใช้ metric ก่อน 4 ใบ) | 7 |
| 11.4 ซ่อน pii ทุกเส้น (generate, refine, render, saved) + ES ล่ม | 8 (คำตัดสินข้อ 2, 3, 4) และคำแนะนำ 3 เส้นตามเอกสารข้อเสนอ |
| 11.5 รูปแบบตัวเลข UI, สี KPI, label | 9 (คำตัดสินข้อ 13) |
| 12 หน้าจอ (แถบสถานะ + 3 ปุ่ม + คำเตือน, ถัดไปกดได้เสมอ, ตารางแก้ได้ + ตัวเลือกตาม kind + ป้ายใหม่ + ไฮไลต์, แผง metric + ค่าปัจจุบัน + ใช้ไม่ได้สีแดง + ฟอร์ม, การแก้ค้างไม่หาย + ข้อความเตือน, ป้ายส่วนบุคคลในตัวอย่าง, 409 + โหลดใหม่) | 10, 11, 12 (คำตัดสินข้อ 12, 14) |
| 13 Error handling | 4 (Groq), 5 (ES, 409, 404, body), 2 + 8 (metric หาย -> invalid -> วิดเจ็ตถูกตัด) |
| 14 การทดสอบ (semantic_layer, evaluate_metric, ความเป็นส่วนตัว, API, Create Dashboard, UI, ทดสอบจริง) | 1 ถึง 12, 13 ส่วน B |
| 15 ทางต่อยอด | ไม่ทำ (บันทึกในภาคผนวกเอกสารข้อเสนอ Task 13) |
| เอกสารข้อเสนอ: "เมื่อทำ Semantic Layer ให้ใช้ role/label แทนการเดาจากชื่อ" | 7 (คำตัดสินข้อ 8, 9) |

**2. Placeholder scan:** ไม่มี TBD, TODO, "ทำแบบเดียวกับ Task N" ทุกขั้นที่แก้โค้ดมีโค้ดเต็มหรือข้อความก่อน/หลังที่ตรงกับไฟล์จริง (ข้อความ "ก่อน" ของทุกการแก้ตรวจแล้วว่าพบในไฟล์ปัจจุบันครั้งเดียวพอดี และโค้ดทั้งหมดของแผนถูกรันจริงตามลำดับ Task บนสำเนาของ worktree ก่อนเขียนแผน)

**3. ความสอดคล้องของชื่อข้าม Task:**
- API: `rule_draft`, `clean_column`, `clean_metric`, `metric_columns`, `validate_semantic`, `SemanticError` (1) -> `resolve`, `apply_to_profile` (2) -> `where_mask`, `evaluate_metric`, `grouped_metric`, `metric_values` (3) -> `build_messages`, `draft_semantic` (4) -> `SEMANTIC_INDEX`, `encode_doc`, `decode_doc`, `read_doc`, `load_view` (5) -> `validate_spec(raw, profile, metrics=None)`, `compute_dashboard(df, spec, profile, selections=None, metrics=None)` (6) -> `suggest_refinements(..., metrics=None)`, `fallback_spec(profile, context, audience, metrics=None)`, `generate_spec(..., metrics=None)`, `refine_spec(..., metrics=None)` (7) -> `_dataset`, `_checked_spec` ที่คืน tuple (8)
- UI: `formatValue(value, format, currency)`, `TableWidget labels` (9) -> `requestJson`, `semanticApi`, `fromView`, `updateColumn`, `statusText`, `SemanticEditor`, `PROFILE`, `SEMANTIC_VIEW` (10) -> `describeMetric`, `toMetricBody`, `columnsFor`, `metricValueText`, `MetricPanel` (11) -> `DataPreview renderColumns hiddenColumns`, state `semantic` (12)
- ข้อความหน้าจอที่เทสต์ข้าม Task ใช้: "ร่างแล้ว รออนุมัติ", "ชื่อที่แสดง region", "มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก", "จำนวนรายการ", "ลบ จำนวนรายการ", "ส่วนบุคคล" ตรงกันระหว่างโค้ดและเทสต์

**ข้อจำกัดที่รู้:**
- การอนุมัติตรวจ `base_version` ก่อนเขียน แต่การอ่านกับการเขียน ES ไม่ใช่ธุรกรรมเดียว ถ้าสองคนกดอนุมัติพร้อมกันในเสี้ยววินาทียังทับกันได้ ซึ่งรับได้สำหรับระบบที่มีบัญชีผู้ดูแลเดียว
- `metric_values` และการคำนวณ metric ใช้เฟรมทั้งชุดในหน่วยความจำของ API เหมือนแดชบอร์ดเดิม (ไม่มี pushdown) ชุดข้อมูลที่ใหญ่มากจะช้าเท่ากับการคำนวณแดชบอร์ดปัจจุบัน
- `GET /saved/{id}` ยังคืนสเปกเดิมที่อาจมีชื่อคอลัมน์ที่ภายหลังถูกติดเป็นข้อมูลส่วนบุคคล (ชื่อคอลัมน์เท่านั้น ไม่มีค่า) จนกว่าจะเปิดผ่าน `render` หรือบันทึกใหม่
