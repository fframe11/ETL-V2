# Evaluation

รายงานหลัก: [rubric-mapping.md](rubric-mapping.md) (สร้างอัตโนมัติ ห้ามแก้ด้วยมือ)

## สร้างหลักฐานใหม่ทั้งหมด (stack ต้องรันอยู่)

```bash
python scripts/evaluation/prepare_datasets.py
bash scripts/ops/e2e_ingest_check.sh | tee docs/evaluation/evidence/b-e2e-ingest-check.txt
bash scripts/evaluation/run_batch_evaluation.sh
python scripts/evaluation/run_scale_benchmark.py            # ขนาดใหญ่ใช้เวลานาน (1M แถวราว 8 นาที)
python scripts/evaluation/source_inventory.py --es-url "http://elastic:<password>@localhost:9200" > docs/evaluation/evidence/d-source-inventory.json
python scripts/evaluation/build_rubric_report.py
```

บน Windows ให้รันจาก Git Bash ตั้ง `PYTHONUTF8=1` (สคริปต์ตั้งให้เองแล้ว) `run_scale_benchmark.py` เรียก Git Bash ด้วย path เต็ม เพราะ `bash` เปล่าๆ บน Windows อาจชี้ไป WSL

| ไฟล์ใน `evidence/` | มาจาก |
|---|---|
| `b-e2e-ingest-check.txt` | การอัปโหลดพร้อมกัน, ไฟล์ซ้ำ, archive |
| `c-golden-before.json`, `c-golden-after.json`, `c-stage-list.txt` | golden test ของการแยก stage |
| `d-profile-before.json` | profile ก่อน transform |
| `d-batch-run.json`, `d-detection.json` | รอบประเมินและ detection เทียบ ground truth (IQR 3.0) |
| `d-batch-run-iqr1_5.json`, `d-detection-iqr1_5.json` | รอบเดียวกันแต่ IQR 1.5 (เทียบผลกระทบของการตั้งค่า) |
| `d-utilization.json` (+ `../d-utilization.md`) | การใช้ประโยชน์จากข้อมูลสะอาด |
| `d-scale.json` | เวลาตามขนาดข้อมูล |
| `d-source-inventory.json` | แหล่งข้อมูลและปริมาณ |
| `d-stage-list.json` | รายการ stage |
| `d-whitebox-evaluation.txt` | ผลประเมินเอนจินโต้ตอบ |
