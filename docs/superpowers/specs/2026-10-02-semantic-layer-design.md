# Semantic Layer (Metadata ของคอลัมน์ + นิยาม Metric) — Design

**วันที่:** 2026-10-02
**สถานะ:** ผู้ใช้อนุมัติการออกแบบทีละส่วนแล้ว รอตรวจ spec ฉบับเขียน
**ขึ้นกับ:** แผน [Create Dashboard](../plans/2026-10-02-ai-dashboard-builder.md) ต้องทำแผนนั้นให้เสร็จก่อน เพราะงานนี้ต่อยอดจาก `dashboard_data.py`, `dashboard_spec.py`, `dashboard_compute.py`, `dashboard_llm.py`, `dashboards.py` และหน้า `DashboardBuilder.jsx`

## 1. เป้าหมาย

ให้แต่ละชุดข้อมูลมี "ความหมายทางธุรกิจ" ที่คนอนุมัติแล้ว ได้แก่ บทบาทของคอลัมน์ หน่วย สกุลเงิน ชื่อที่แสดง และข้อมูลส่วนบุคคล รวมถึงนิยาม metric กลาง เช่น Gross Profit Margin และ Average Order Value จากนั้นหน้า Create Dashboard และ AI ใช้ความหมายนี้ เพื่อให้:

- ตัวเลขแสดงถูกหน่วย ($625.33, 40.07%) ไม่ใช่เดาเป็น ฿ ทุกครั้ง
- KPI ที่เป็นอัตราส่วนทำได้ และใช้สูตรเดียวกันทุกแดชบอร์ด
- คอลัมน์ข้อมูลส่วนบุคคลไม่ถึง LLM และไม่ขึ้นบนแดชบอร์ด

## 2. การตัดสินใจที่ผู้ใช้เลือกแล้ว

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | ใครสร้าง metadata และ metric | AI ร่าง คนตรวจและอนุมัติ |
| 2 | มีผลกับส่วนไหน | เฉพาะ Create Dashboard ก่อน และออกแบบเผื่อให้ ETL กับ Gold ใช้ทีหลังได้ |
| 3 | หน้าตรวจและอนุมัติอยู่ไหน | ในขั้น "ดูข้อมูล" ของ Create Dashboard |
| 4 | ยังไม่อนุมัติ สร้างแดชบอร์ดได้ไหม | ได้ ไม่บังคับ แต่ซ่อนคอลัมน์ที่น่าจะเป็นข้อมูลส่วนบุคคลไว้ก่อน |
| 5 | สูตร metric ซับซ้อนแค่ไหน | aggregate เดี่ยว + อัตราส่วน + เงื่อนไข where หนึ่งข้อ |
| — | เก็บที่ไหน | index ใหม่ `sdoqap_semantic_layer` หนึ่งเอกสารต่อชุดข้อมูล |

## 3. ขอบเขต

**ทำ:**
- index `sdoqap_semantic_layer`, ตัวตรวจ, ร่างแบบกฎ, ร่างด้วย Groq, API `/api/v1/semantic/*`
- ตารางแก้ความหมายคอลัมน์และแผง metric ในขั้น "ดูข้อมูล"
- ให้ Create Dashboard ใช้ semantic layer ทั้งตอนสร้าง ปรับ คำนวณ แสดงผล และบันทึก

**ไม่ทำ (ต่อยอดภายหลังได้):**
- Spark pipeline ไม่อ่าน semantic layer ทั้งการตรวจหน่วย การปิดบังข้อมูลตอน export และการสร้างคอลัมน์ ปี/ไตรมาส
- Gold layer หรือ data mart ที่คำนวณ metric ล่วงหน้า
- สูตรอิสระ (formula expression)
- metric ข้ามหลายชุดข้อมูล
- ระบบบทบาทผู้ใช้ (ผู้ใช้ที่ login ทุกคนอนุมัติได้)
- แท็บแก้ไขในหน้า Catalog

## 4. รูปแบบข้อมูล

### 4.1 Metadata ของคอลัมน์

```json
"Total_Sales": {
  "role": "measure",
  "label": "ยอดขาย",
  "description": "ยอดขายสุทธิหลังหักส่วนลด",
  "unit": "currency",
  "currency": "USD",
  "duration_unit": null,
  "default_agg": "sum",
  "pii": false
}
```

| ฟิลด์ | ค่าที่รับ | กติกา |
|---|---|---|
| `role` | `measure`, `dimension`, `time`, `identifier`, `text` | `measure` ต้องเป็นคอลัมน์ kind `numeric`, `time` ต้องเป็น kind `date` |
| `label` | สตริง ≤ 60 ตัว | ว่างได้ ถ้าว่างใช้ชื่อคอลัมน์ |
| `description` | สตริง ≤ 300 ตัว | ว่างได้ |
| `unit` | `currency`, `percent`, `count`, `duration`, `number` | เฉพาะ `measure` อื่นๆ เป็น `null` ส่วน `percent` หมายถึงค่าอยู่ในช่วง 0–100 |
| `currency` | รหัส ISO 4217 3 ตัวพิมพ์ใหญ่ หรือ `null` | เฉพาะ `unit = currency` ถ้า `null` แสดงตัวเลขโดยไม่มีสัญลักษณ์ และหน้าจอขอให้ระบุ |
| `duration_unit` | `seconds`, `minutes`, `hours`, `days` หรือ `null` | เฉพาะ `unit = duration` |
| `default_agg` | `sum`, `avg`, `min`, `max`, `count_distinct` | เฉพาะ `measure` |
| `pii` | boolean | `true` = ซ่อนจากแดชบอร์ดและจาก LLM |

### 4.2 นิยาม Metric

```json
{"id": "gross_margin", "label": "Gross Profit Margin", "description": "กำไรขั้นต้นต่อยอดขาย",
 "type": "ratio",
 "numerator":   {"agg": "sum", "column": "Profit", "where": null},
 "denominator": {"agg": "sum", "column": "Total_Sales", "where": null},
 "format": "percent", "currency": null, "higher_is_better": true}
```

```json
{"id": "gate_pass_rate", "label": "อัตราผ่าน Quality Gate", "type": "ratio",
 "numerator":   {"agg": "count", "column": null, "where": {"column": "gate_result", "op": "eq", "value": "ผ่าน"}},
 "denominator": {"agg": "count", "column": null, "where": null},
 "format": "percent", "higher_is_better": true}
```

| ฟิลด์ | ค่าที่รับ |
|---|---|
| `id` | `^[a-z0-9_]{1,40}$` ไม่ซ้ำในชุดข้อมูล |
| `label` | สตริง ≤ 60 ตัว (บังคับ) |
| `type` | `simple` (ใช้ `measure`) หรือ `ratio` (ใช้ `numerator` และ `denominator`) |
| measure ย่อย | `{"agg", "column", "where"}` โดย `agg` เป็น `count` (column = null), `count_distinct`, `sum`, `avg`, `min`, `max` และ sum/avg/min/max ต้องใช้คอลัมน์ kind `numeric` |
| `where` | `null` หรือ `{"column", "op", "value"}` โดย `op` เป็น `eq`, `ne`, `in` (value เป็น list ≤ 50 ค่า), `gt`, `gte`, `lt`, `lte` (value เป็นตัวเลข หรือวันที่ ISO เมื่อคอลัมน์เป็นวันที่) |
| `format` | `number`, `currency`, `percent` ถ้าเป็น ratio และ `percent` ระบบคูณ 100 ให้ |
| `currency` | ISO 4217 หรือ `null` (เมื่อ `format = currency`) |
| `higher_is_better` | boolean ค่าเริ่มต้น `true` |

- metric อ้างคอลัมน์ที่ถูกซ่อน (pii) ไม่ได้ ถือว่าใช้ไม่ได้
- ตัวหารเป็น 0 หรือว่าง ได้ค่า `null` ไม่ error
- มีได้สูงสุด 20 metric ต่อชุดข้อมูล

### 4.3 เอกสารใน `sdoqap_semantic_layer` (id = ชื่อชุดข้อมูล)

```json
{
  "table_name": "global_ecommerce_sales",
  "draft":    {"columns": {}, "metrics": [], "generated_by": "groq | rules | user", "model": "openai/gpt-oss-120b",
               "updated_by": "admin", "updated_at": "2026-10-02T03:00:00Z"},
  "approved": {"columns": {}, "metrics": [], "version": 3, "approved_by": "admin", "approved_at": "2026-10-02T04:00:00Z"},
  "history":  [{"version": 3, "approved_by": "admin", "approved_at": "2026-10-02T04:00:00Z"}]
}
```

- `draft` และ `approved` เป็น `null` ได้
- `history` เก็บ 10 รายการล่าสุด
- ตัวอย่างด้านบนเป็นรูปแบบตามความหมาย ซึ่ง API ส่งให้ UI แบบนี้ ส่วนในเอกสาร ES จริง `{"columns", "metrics"}` ของ draft และ approved เก็บเป็นสตริง JSON ในฟิลด์ `draft.content_json` และ `approved.content_json` เหมือน `spec_json` ของแดชบอร์ด เพื่อไม่ให้ dynamic mapping ของ ES ชนกัน ส่วนเมตาดาต้าอื่น (version, ผู้อนุมัติ, เวลา, generated_by) เก็บเป็นฟิลด์ปกติ
- ชุดข้อมูลผลตรวจคุณภาพ `_quality_runs` ใช้ index นี้เหมือนตารางอื่น

## 5. ร่างแบบกฎ (ไม่ใช้ LLM)

ใช้เมื่อยังไม่มีเอกสาร, เมื่อไม่มีคีย์ Groq หรือ Groq ล้มเหลว และใช้เติมคอลัมน์ที่ยังไม่มีใน draft/approved

กฎทั้งหมดเทียบเป็น "คำ" ของชื่อคอลัมน์ (ตัวพิมพ์เล็ก แยกด้วย `_`, ช่องว่าง หรือรอยต่อ camelCase เช่น `CustomerName` และ `customer_name` ได้คำว่า `customer`, `name`) ไม่ใช่การค้นหาข้อความย่อย จึงไม่สับสน `Hotel` กับ `tel` หรือ `Paid` กับ `id` ส่วนคำภาษาไทยใช้การค้นหาข้อความย่อย

| เงื่อนไข (ตรวจตามลำดับ) | ผล |
|---|---|
| มีคำ `email`, `phone`, `mobile`, `tel`, `telephone`, `address`, `passport`, `ssn`, `birth`, `birthday`, `birthdate`, `dob` หรือคำต่อกันมี `email`, `idcard`, `citizen`, `nationalid`, `dateofbirth` หรือชื่อทั้งคำเป็น `name`, `username`, `fullname`, `firstname`, `lastname`, `customername`, `surname` หรือมีคำ `name` ต่อจากคำบอกคน (`customer`, `first`, `last`, `full`, `user`, `contact`, `person`, `employee`, `owner`, `member`, `client`, `patient`, `student`, `given`, `family`, `middle`, `sender`, `receiver`, `recipient`) หรือมีข้อความไทย `ชื่อลูกค้า`, `ชื่อผู้`, `ชื่อจริง`, `นามสกุล`, `ชื่อ-สกุล`, `อีเมล`, `เบอร์โทร`, `ที่อยู่`, `บัตรประชาชน`, `เลขบัตร` | `pii: true` (ตรวจได้ทุก role) `Product_Name` และ `ชื่อสินค้า` จึงไม่ถูกซ่อน |
| คำสุดท้ายเป็น `id`, `code`, `no`, `uuid`, `sku`, `key` หรือคำแรกเป็น `id` | `identifier` |
| kind `date` | `time` |
| kind `numeric` และมีคำ `pct`, `percent`, `percentage`, `rate`, `ratio`, `score`, `margin` และ min ≥ 0, max ≤ 100 | `measure`, `percent`, `avg` (ตรวจก่อนเงิน เพื่อให้ `Profit_Margin` เป็นเปอร์เซ็นต์) |
| kind `numeric` และมีคำ `sales`, `revenue`, `amount`, `price`, `cost`, `profit`, `income`, `value`, `spend` หรือข้อความไทย `ยอด`, `ราคา`, `ต้นทุน`, `กำไร` | `measure`, `currency`, `currency: null`, `sum` |
| kind `numeric` และมีคำ `age` หรือข้อความไทย `อายุ` | `measure`, `number`, `avg` |
| kind `numeric` และมีคำ `qty`, `quantity`, `count`, `records`, `rows`, `units`, `items` หรือข้อความไทย `จำนวน` | `measure`, `count`, `sum` |
| kind `numeric` และมีคำ `seconds`, `secs`, `sec`, `duration` (→ seconds), `minutes`, `mins` (→ minutes), `hours`, `hrs`, `lag` (→ hours), `days` (→ days) | `measure`, `duration` (หน่วยตามคำแรกที่เจอ), `avg` |
| kind `numeric` อื่นๆ | `measure`, `number`, `sum` |
| kind `categorical` | `dimension` |
| kind `text` | `text` |

**metric เริ่มต้น:** `row_count` (count) และ `total_<column>` (sum) ของทุก measure ที่เป็น `currency` (สูงสุด 5 ตัว) id ได้จากชื่อคอลัมน์ โดยทำเป็นตัวพิมพ์เล็ก แทนอักขระที่ไม่ใช่ a–z/0–9 ด้วย `_` และตัดให้ไม่เกิน 40 ตัว ถ้าซ้ำต่อท้าย `_2`, `_3` … เช่น `Total_Sales` → `total_total_sales`

## 6. ร่างด้วย AI

- เรียกผ่าน `POST /api/v1/semantic/{table}/draft` เท่านั้น ไม่เรียกอัตโนมัติ
- prompt ส่ง: ชื่อชุดข้อมูล, profile ตามกติกาเดียวกับ Create Dashboard (name, kind, distinct, missing_pct, min/max ของตัวเลขและวันที่) และ hint จากร่างแบบกฎ (role, pii) ห้ามส่งค่าในเซลล์
- ให้ LLM ตอบ JSON `{"columns": {...}, "metrics": [...]}` แล้วผ่าน `validate_semantic()` ถ้าไม่ผ่านให้ลองใหม่ 1 ครั้งพร้อมเหตุผล ถ้ายังไม่ผ่าน หรือไม่มีคีย์ หรือ Groq ล่ม ใช้ร่างแบบกฎและเพิ่ม warning
- ถ้า LLM บอก `pii: false` แต่กฎบอก `true` ให้ถือ `true` (ฝั่งปลอดภัย) และใส่ warning ให้คนตัดสิน
- ผลบันทึกเป็น `draft` (`generated_by: groq | rules`) โดยไม่แตะ `approved`
- ใช้ `call_groq`, `groq_settings`, `parse_json_object` จาก `dashboard_llm.py`

## 7. ตัวตรวจ `validate_semantic(raw, profile) -> (semantic, warnings)`

- รับ `{"columns": {...}, "metrics": [...]}` จาก LLM หรือจาก browser
- คอลัมน์ที่ไม่มีใน profile ถูกตัด ค่าที่ไม่อยู่ใน whitelist ถูกแทนด้วยค่าจากร่างแบบกฎของคอลัมน์นั้น (ไม่ทิ้งทั้งคอลัมน์) และทุกครั้งมี warning
- role ที่ไม่ตรงกับ kind (เช่น measure บนข้อความ) แก้เป็นค่าจากร่างแบบกฎ
- ฟิลด์ที่ไม่เกี่ยวกับ role ถูกล้างเป็น `null` (เช่น `unit` ของ dimension)
- metric ที่ผิดถูกตัดทั้งตัวพร้อมเหตุผล
- idempotent: ตรวจผลที่ตรวจแล้วซ้ำต้องได้ค่าเดิม
- ไม่ raise error ยกเว้น `raw` ไม่ใช่ object

## 8. การประกอบผลที่ใช้งานจริง `resolve(doc, profile) -> view`

1. **ฐาน:** ใช้ `approved` ถ้ามี ไม่มีใช้ `draft` ไม่มีทั้งคู่ใช้ร่างแบบกฎ
2. **คอลัมน์ใน profile ที่ฐานไม่มี** (`new_columns` เมื่อฐานคือ approved): ใช้ค่าจาก `draft` ถ้ามี ไม่มีใช้ร่างแบบกฎ
3. **คอลัมน์ในฐานที่ profile ไม่มี:** ตัดออก ใส่ใน `missing_columns`
4. **ตรวจ metric** กับคอลัมน์ปัจจุบัน ตัวที่ใช้ไม่ได้ใส่ใน `invalid_metrics` พร้อมเหตุผล และไม่อยู่ใน `effective`
5. **`hidden_columns`** คอลัมน์จะถูกซ่อนเมื่อ:
   - อยู่ใน approved และ approved ติด `pii: true`
   - หรือไม่อยู่ใน approved และ (draft ติด `pii: true` หรือร่างแบบกฎติด `pii: true`)

   คอลัมน์จะกลับมาแสดงได้ก็ต่อเมื่อคนอนุมัติด้วย `pii: false`
6. **`status`:**
   - `none`: ไม่มีเอกสาร
   - `draft`: มี draft แต่ไม่มี approved
   - `approved`: มี approved และไม่มี drift
   - `approved_outdated`: มี approved แต่มี `new_columns` หรือ `missing_columns`
   - `unavailable`: ES ล่ม
7. **`pending_draft`:** `true` เมื่อมี draft ที่ใหม่กว่า approved

ผลลัพธ์:

```json
{"table_name": "...", "status": "approved_outdated", "pending_draft": false, "version": 3,
 "effective": {"columns": {}, "metrics": []},
 "draft": {}, "approved": {},
 "drift": {"new_columns": [], "missing_columns": []},
 "invalid_metrics": [{"id": "aov", "reason": "ไม่มีคอลัมน์ Order_ID"}],
 "hidden_columns": ["Customer_Name"],
 "metric_values": {"gross_margin": 40.07}}
```

`metric_values` คำนวณจากข้อมูลทั้งชุด (ไม่มีตัวกรอง) ด้วยตัวคำนวณเดียวกับแดชบอร์ด

## 9. API (`/api/v1/semantic`, ต้อง login ทุกเส้น)

| Method + path | Body | ผล |
|---|---|---|
| `GET /{table}` | — | view ตามหัวข้อ 8 |
| `POST /{table}/draft` | — | ร่างด้วย AI หรือกฎ แล้วบันทึก `draft` คืน view + `engine`, `model`, `warnings` |
| `PUT /{table}/draft` | `{"columns", "metrics"}` | ตรวจแล้วบันทึกเป็น `draft` (`generated_by: user`) คืน view + `warnings` |
| `POST /{table}/approve` | `{"columns", "metrics", "base_version"}` | ตรวจแล้วบันทึกเป็น `approved` เวอร์ชัน `base_version + 1` แล้วล้าง `draft` คืน view + `warnings` |

- `base_version` คือเวอร์ชันที่ผู้ใช้เปิดมาแก้ (`0` ถ้ายังไม่เคยอนุมัติ) ถ้าไม่ตรงกับ approved ปัจจุบัน ตอบ `409` พร้อมข้อความ "มีคนอนุมัติเวอร์ชันใหม่กว่าแล้ว กรุณาโหลดใหม่"
- ชื่อชุดข้อมูลผ่าน `validate_table_name()` และต้องโหลดได้ด้วย `load_active_dataset()` (404 ถ้าไม่มี)
- ES ล่ม: `GET` ตอบ 200 สถานะ `unavailable` พร้อม `effective` จากร่างแบบกฎ ส่วน `POST/PUT` ตอบ 503

## 10. โมดูล

| ไฟล์ | หน้าที่ | พึ่งพา |
|---|---|---|
| `services/api/app/api/semantic_layer.py` | ค่าคงที่ whitelist, `rule_draft(profile)`, `validate_semantic`, `resolve`, `hidden_columns`, `apply_to_profile(profile, view)` (ตัดคอลัมน์ที่ซ่อน และเติม role/label/unit ลงในแต่ละคอลัมน์ของ profile) | ไม่มี I/O |
| `services/api/app/api/semantic_llm.py` | prompt และ `draft_semantic(table, profile)` | `dashboard_llm` |
| `services/api/app/api/semantic.py` | router, อ่าน/เขียน ES, `load_view(table, profile, es)` | `semantic_layer`, `semantic_llm`, `dashboard_data`, `dashboard_compute` |
| `services/api/app/api/dashboard_compute.py` (แก้) | `evaluate_metric(df, metric)` และ grouped, ใช้ใน KPI/bar/line/pie | — |

## 11. การใช้ใน Create Dashboard

### 11.1 สเปกแดชบอร์ด
- `metric` ของวิดเจ็ตรับ `{"metric_id": "<id>"}` เพิ่มจาก `{"agg", "column"}` เดิม
- `validate_spec(raw, profile, semantic=None)`:
  - `metric_id` ต้องอยู่ใน `effective.metrics` ไม่งั้นตัดวิดเจ็ตพร้อมเหตุผล
  - สเปกเก็บ `metric_id` ไว้ ไม่คัดลอกสูตร เมื่อแก้นิยาม metric แล้ว แดชบอร์ดที่บันทึกไว้จะใช้สูตรใหม่ตอนเปิดครั้งถัดไป
  - คอลัมน์ role `identifier` ใช้กับ sum/avg/min/max ไม่ได้ และใช้เป็น `x` ของ bar/line/area/pie ไม่ได้ (ใช้ในตารางได้)
- **รูปแบบตัวเลขของวิดเจ็ต:**
  - ถ้า metric มาจาก `metric_id` ใช้ `format`/`currency` ของ metric
  - ถ้าเป็น agg บนคอลัมน์ measure ใช้หน่วยของคอลัมน์ (`currency` → `format: currency` + รหัสสกุล, `percent` → `percent`)
  - ถ้าเป็น `count`/`count_distinct` ใช้ `number`
  - ค่าที่ LLM ส่งมาใช้เฉพาะเมื่อไม่มีข้อมูลจาก semantic
- วิดเจ็ตได้ฟิลด์เพิ่ม `currency` (ISO หรือ `null`) และ `higher_is_better` (boolean)

### 11.2 การคำนวณ
- `compute_dashboard(df, spec, profile, selections=None, semantic=None)` แปลง `metric_id` เป็นนิยาม แล้วคำนวณผ่าน `evaluate_metric`
  - **ratio:** ตัวตั้งและตัวหารคำนวณแยกต่อกลุ่ม แล้วหาร
  - **percent ratio:** คูณ 100
  - **ตัวหาร 0 หรือว่าง:** ได้ `null`
- ผลคำนวณมี `column_labels: {column: label}` ของคอลัมน์ที่ไม่ถูกซ่อน

### 11.3 AI และร่างแบบกฎของแดชบอร์ด
- `profile_for_prompt` ตัดคอลัมน์ที่ซ่อนออก และเพิ่ม `role`, `label`, `unit`, `currency` ให้แต่ละคอลัมน์
- prompt เพิ่มรายการ `metrics` (id, label, description, format) พร้อมกฎ:
  - ใช้ `metric_id` สำหรับ KPI เมื่อมี metric ที่เกี่ยวข้อง
  - ห้ามรวมค่าคอลัมน์ identifier
  - ใช้ label เป็นชื่อวิดเจ็ต
- `fallback_spec` ใช้ metric ใน `effective` เป็น KPI ก่อน (สูงสุด 4 ตัว) แล้วค่อยใช้ measure ตาม `default_agg` และไม่ใช้ identifier

### 11.4 การซ่อนข้อมูลส่วนบุคคล
- ทุกเส้นของ `/api/v1/dashboards` (generate, refine, render, saved) เรียก `semantic.load_view` แล้วใช้ `apply_to_profile` ตัดคอลัมน์ที่ซ่อนออกจาก profile ก่อน `validate_spec`
- วิดเจ็ต ตัวกรอง หรือคอลัมน์ในตารางที่อ้างคอลัมน์ซ่อน จะถูกตัดพร้อม warning
- ES ล่ม: `load_view` คืนสถานะ `unavailable` ที่ยังซ่อนตามกฎชื่อคอลัมน์ แดชบอร์ดจึงไม่หลุดข้อมูลส่วนบุคคลแม้ ES ใช้ไม่ได้

### 11.5 รูปแบบตัวเลขฝั่ง UI
- `formatValue(value, format, currency = null)`
  - เมื่อ `format = currency` และมีรหัส ใช้ `Intl.NumberFormat` แบบ `style: "currency"`, `currencyDisplay: "narrowSymbol"` และย่อ (K/M) เมื่อ ≥ 10,000 เช่น `$625.33`, `$1.77M`, `฿21.9K`
  - เมื่อไม่มีรหัส แสดงตัวเลขเปล่า
- **เปลี่ยนจากแผน Create Dashboard:** แผนนั้นให้ `currency` แสดง `฿` เสมอ งานนี้เปลี่ยนเป็นตามรหัสสกุล ถ้าไม่มีรหัสไม่ใส่สัญลักษณ์
- `KpiCard` ใช้ `higher_is_better` ตัดสินสีเมื่อเปลี่ยนแปลง: ลดลงแต่ `higher_is_better: false` = สีเขียว
- หัวตาราง ชื่อตัวกรองเริ่มต้น และชื่อ series ใช้ `column_labels`

## 12. หน้าจอ (ขั้น "ดูข้อมูล" ของ Create Dashboard)

- **แถบสถานะ:** ข้อความตาม `status` และ `pending_draft` พร้อมปุ่ม "ให้ AI ร่าง", "บันทึกร่าง", "อนุมัติ" ถ้ายังไม่ใช่ `approved` ให้ขึ้นคำเตือนว่า "ยังไม่ได้อนุมัติความหมายคอลัมน์ ตัวเลขอาจแสดงหน่วยไม่ถูก" ส่วนปุ่ม "ถัดไป" กดได้เสมอ
- **ตารางคอลัมน์ (แก้ได้):**
  - ช่องต่างๆ: คอลัมน์, ชนิด, บทบาท, ชื่อที่แสดง, หน่วย, สกุลเงิน (THB, USD, EUR, JPY, CNY, GBP, SGD หรือพิมพ์รหัสเอง), รวมแบบ, ส่วนบุคคล
  - ตัวเลือกของแต่ละช่องกรองตาม kind
  - ป้าย "ใหม่" สำหรับ `new_columns` และไฮไลต์แถวที่ต่างจาก approved
  - ช่องค่าว่างและค่าไม่ซ้ำยังแสดงเหมือนเดิม
- **แผง Metric:**
  - แต่ละรายการแสดง label, สูตรอ่านง่าย (ใช้ label ของคอลัมน์), ค่าปัจจุบันจาก `metric_values` และปุ่มแก้/ลบ
  - metric ใน `invalid_metrics` เป็นสีแดงพร้อมเหตุผล
  - ฟอร์มเพิ่ม/แก้: label, id (สร้างจาก label ได้), คำอธิบาย, ชนิด, agg/คอลัมน์/where ของแต่ละส่วน, รูปแบบ, สกุลเงิน, ยิ่งสูงยิ่งดี
- **การแก้ที่ยังไม่บันทึก:** เก็บใน state ของ `DashboardBuilder` ไม่หายเมื่อสลับขั้น กด "ถัดไป" ขณะมีการแก้ค้าง จะขึ้นข้อความ "มีการแก้ไขความหมายคอลัมน์ที่ยังไม่บันทึก" แต่ไม่บล็อก
- **ตัวอย่าง 20 แถว:** แสดงทุกคอลัมน์ คอลัมน์ใน `hidden_columns` มีป้าย "ส่วนบุคคล"
- **409:** ขึ้นข้อความพร้อมปุ่ม "โหลดใหม่"

## 13. Error handling

| สถานการณ์ | พฤติกรรม |
|---|---|
| ไม่มีคีย์ Groq / Groq ล่ม / ตอบผิดสองครั้ง | ร่างแบบกฎ + warning บันทึกเป็น draft (`generated_by: rules`) |
| ES ล่ม | `GET` → `unavailable` + ร่างแบบกฎ (ยังซ่อน pii), `POST`/`PUT` → 503, แดชบอร์ดยังสร้างได้และซ่อน pii ตามกฎ |
| อนุมัติซ้อน | 409 |
| ชุดข้อมูลไม่มี | 404 |
| ค่าที่ไม่รู้จักใน body | ตัดหรือแทนด้วยค่าจากกฎ + warning ไม่ตอบ 422 ยกเว้น body ไม่ใช่ object |
| metric อ้างคอลัมน์ที่หายไป | อยู่ใน `invalid_metrics` วิดเจ็ตที่ใช้ metric นั้นถูกตัดพร้อม warning |

## 14. การทดสอบ

- **`semantic_layer`:**
  - กฎทุกแถวในหัวข้อ 5 รวมชื่อภาษาไทย
  - `validate_semantic`: whitelist, role ไม่ตรง kind, ล้างฟิลด์ไม่เกี่ยว, metric ผิด, idempotent
  - `resolve`: ทุก status, new/missing columns, ลำดับการซ่อน pii ทั้ง 3 กรณี, `pending_draft`
- **`evaluate_metric`:** simple, ratio, where ทุก op, grouped ratio, ตัวหาร 0, percent ×100, count_distinct + where
- **ความเป็นส่วนตัว:**
  - prompt ของ semantic และของแดชบอร์ดไม่มีชื่อคอลัมน์ที่ซ่อนและไม่มีค่าในเซลล์
  - กฎ pii ชนะเมื่อ LLM บอก false
- **API (FakeES + TestClient):** 401 ทุกเส้น, GET ตอนไม่มีเอกสาร, draft ด้วย Groq จำลองและไม่มีคีย์, PUT, approve + version, 409, 503 เมื่อ ES ล่ม, 404
- **Create Dashboard:**
  - `metric_id` ใน spec ผ่าน/ไม่ผ่าน
  - รูปแบบจากหน่วยคอลัมน์
  - วิดเจ็ตอ้าง pii ถูกตัด
  - แดชบอร์ดที่บันทึกไว้ใช้นิยามใหม่หลังแก้ metric
  - `fallback_spec` ใช้ metric
- **UI:**
  - ตารางแก้ไขและตัวเลือกตาม kind, แผง metric (เพิ่ม/แก้/ลบ/ค่าปัจจุบัน/ใช้ไม่ได้)
  - ปุ่ม AI ร่าง/บันทึก/อนุมัติ และ body ที่ส่ง, 409
  - `formatValue` กับ USD/THB/ไม่มีรหัส, สี KPI ตาม `higher_is_better`
- **ทดสอบจริง:** กับ `global_ecommerce_sales`
  1. AI ร่าง → แก้สกุลเงินเป็น USD → เพิ่ม Gross Margin และ AOV → อนุมัติ
  2. สร้างแดชบอร์ดผู้บริหาร ต้องเห็นการ์ด `$…` และ `…%`
  3. `Customer_Name` ต้องไม่อยู่ในแดชบอร์ด ทั้งวิดเจ็ต ตัวกรอง และตาราง (เรื่องที่ไม่อยู่ใน prompt พิสูจน์ด้วย unit test ที่จับ messages ไว้ ไม่ต้องดักคำขอที่ส่งไป Groq จริง)

## 15. ทางต่อยอด (ไม่อยู่ในงานนี้)

- Spark อ่าน `approved` เพื่อปิดบัง pii ตอน export, ตรวจว่า measure ที่เป็นเงินไม่ติดลบ และสร้างคอลัมน์ ปี/ไตรมาส/เดือน จาก role `time`
- Gold layer คำนวณ metric ที่อนุมัติไว้ล่วงหน้าเป็น data mart
- metric ชนิด `formula` (สูตรอิสระ) เพิ่มเป็น `type` ใหม่ได้โดยไม่เปลี่ยนรูปแบบที่เก็บ
- แท็บแก้ไขในหน้า Catalog ที่ใช้ API ชุดเดียวกัน
