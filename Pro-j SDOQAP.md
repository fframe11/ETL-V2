## Data Extraction (การสกัดข ้อมูล) ในระบบ SDOQAP

- 1. ภาพรวมสถาปัตยกรรมและบทบาทของ Data Extraction ในระบบ SDOQAP

(Data Extraction Architecture & Core Philosophy)

- แนวคิดการแยกเลเยอร์ออกจากกัน (Decoupled Architecture):

- ในระบบ ETL แบบดั้งเดิม กระบวนการดึงข ้อมูล (Extract) และการตรวจ เช็คคุณภาพ (Validate) มักจะถูกเขียนผูกติดกันในโค ้ดเดียว ซึ่งเมื่อ ข ้อมูลต ้นทางมีปัญหา (เช่น มีค่าว่าง หรือชนิดข ้อมูลผิด) ตัวสกัด ข ้อมูลจะแครช (Pipeline Crash) ทันที

- SDOQAP แก ้ปัญหานี้โดยการแยก Extraction Layer ออกมาทำงาน เดี่ยวๆ หน้าที่เดียวของเลเยอร์นี้คือ "สกัดข ้อมูลจากต ้นทางมาเขียน ลงคลังข ้อมูลดิบ (Raw Zone) ให ้สำเร็จ 100%" โดยไม่ทำการตัด ละทิ้ง หรือแก ้ไขข ้อมูลใดๆ ในขั้นตอนนี้

- หลักการรักษาข้อมูลต้นฉบับ 100% (Raw Data Preservation Policy):

- ข ้อมูลที่สกัดมาจาก API, ไฟล์ หรือสตรีมมิ่ง จะถูกบันทึกในรูปแบบคง เดิม (Immutable Raw State) เพื่อใช ้เป็น Audit Trail (หลักฐานอ้างอิง รอยตรา) สำหรับการตรวจสอบย ้อนหลังเมื่อเกิดความเสียหาย ทางการเงิน

- ความแตกต่างระหว่างการสกัดแบบ Batch และ Streaming:

- Batch Extraction: สกัดข ้อมูลเป็นก ้อน/เป็นไฟล์ เหมาะกับข ้อมูลสรุป รายวัน รายเดือน (เช่น CSV, API Snapshots)

- Streaming Extraction: สกัดข ้อมูลแบบสายธารไหลต่อเนื่อง เหมาะกับ ข ้อมูลเหตุการณ์ (Events) ที่เกิดขึ้นตลอดเวลา (เช่น โซเชียลมีเดีย, IoT)

- 2. ช่องทางและฟอร์แมตข ้อมูลนำเข ้า (Multi-Source Ingestion Mechanisms)

(Ingestion Channels & Technical Payload Handling)

- 1. Structured Files (ไฟล์ตาราง CSV/TSV):

- ทำงานผ่านหน้าเว็บ React UI ผู ้ใช ้ลากวางไฟล์ -> React ส่งไฟล์ผ่าน FormData ไปที่ API Endpoint /api/v1/pipeline/ingest/csv -> FastAPI อ่าน Stream ของไฟล์ดิบและส่งตรงไปเขียนลง HDFS

- 2. Semi-Structured REST API (บริการข้อมูลกึ่งโครงสร้าง):


- ทำงานผ่าน Endpoint /api/v1/pipeline/ingest/api

- Smart UUID/Resource ID Resolver: มีระบบ Regular Expression (^[0-9a-fA-F]{8}-...) คอยตรวจจับว่า URL ที่ผู ้ใช ้กรอกมาเป็น Resource ID ของ Open Data (เช่น data.go.th) หรือไม่ หากใช่ ระบบจะแปลง URL ไป ยัง CKAN Data API อัตโนมัติ

- API Key & Header Injection: รองรับการแนบ API Key เข ้าไปใน HTTP Request Header ทั้งรูปแบบ Authorization: Bearer <key> และ api-key: <key>

- JSON-to-CSV Conversion: เมื่อสกัด JSON ปลายทางมาได ระบบจะทำ การหาระดับตาราง (Array Path เช่น json.result.records หรือ json.data) แล ้วแปลงโครงสร ้าง JSON เป็น CSV ทันที

- 3. Real-time Event Streaming (ข้อมูลสตรีมสด Reddit):

- ทำงานผ่าน Endpoint /api/v1/pipeline/ingest/reddit

- เรียกสคริปต์ scripts/reddit_stream.py ในเบื้องหลัง รับพารามิเตอร์ Subreddit และระยะเวลาสกัด (Duration 10-120 วินาที) สกัดโพสต์และ คอมเมนต์สดส่งเข ้าคิวตัวกลาง

- 3. สถาปัตยกรรมเทคโนโลยีและโปรโตคอลเบื้องหลัง (Technical Stack & Protocols) (Underlying Infrastructure & Deep Protocols)

- 1. WebHDFS 2-Step Handshake Protocol: การสกัดไฟล์ส่งเข ้า HDFS จากตู FastAPI ผ่านโปรโตคอล WebHDFS บนพอร์ต 9870 มีขั้นตอนการทำงานทาง เทคนิค 3 สเต็ป:

- 1. Step 1 (Create Request): FastAPI ส่งคำขอ PUT ไปยัง NameNode (http://sdoqap-namenode:9870/webhdfs/v1/data/raw/<table_name>/<table_na me>.csv?op=CREATE&overwrite=true&user.name=spark)

- 2. Step 2 (Redirect Response): NameNode ตอบกลับด ้วยสถานะ HTTP 307 Temporary Redirect พร ้อมส่ง URL ปลายทางของ DataNode ใน Location Header

- 3. Step 3 (Data Transfer): FastAPI ปรับเปลี่ยน IP/Hostname ใน Redirect URL ให ้ตรงกับเครือข่าย Docker (datanode:9864) แล ้วทำการยิง Payload ข ้อมูลดิบตรงเข ้าสู่ DataNode โดยไม่ผ่าน NameNode อีก เพื่อ ประสิทธิภาพสูงสุด

- 2. Apache Kafka Message Broker (Port 9092):


- ทำหน้าที่เป็น Distributed Buffer คั่นกลางระหว่างตัวสกัด (reddit_stream.py) และตัวประมวลผล Spark (streaming_job.py)

- ช่วยป้องกันข ้อมูลสูญหาย (Data Loss Protection) หาก Spark Cluster ทำ งานไม่ทัน ข ้อมูลสตรีมมิ่งจะถูกพักไว ้ใน Kafka Topic reddit_topic อย่าง ปลอดภัย

- 3. Spark Cluster (Port 7077):

- ใช spark-submit รันงานแบบกระจาย (Dynamic Allocation 1-4 Executors) อ่านข ้อมูลจาก HDFS หรืออ่าน Micro-batch จาก Kafka ผ่านแพ็กเกจ spark-sql-kafka-0-10

## 4. การบริหารจัดการพื้นที่พักข ้อมูลดิบและการรับมือความล ้มเหลว (Raw Zone

Storage & Fault Tolerance)

(Raw Landing Zone & Resilience Mechanisms)

- โครงสร้างจัดเก็บไฟล์ใน HDFS (HDFS Directory Hierarchy):

- ข ้อมูลดิบที่สกัดมาทั้งหมดจะถูกจัดเก็บแยกไดเรกทอรีอย่างเป็น ระบบที่:

- การแยกบริเวณความเสียหาย (Fault Isolation):

- เนื่องจากโซน /data/raw/ มีหน้าที่รับข ้อมูลเพียงอย่างเดียว ไฟล์ที่มีข ้อ ผิดพลาด (เช่น มีค่าว่าง 80%, ตัวพิมพ์เล็ก-ใหญ่เพี้ยน, หรือมีค่า Outlier) จะยังคงถูกบันทึกได ้สำเร็จ โดยไม่ทำให ้กระบวนการ Ingestion ล ้มเหลว

- กลไกการรับมือเครือข่ายและการบริหารดิสก์ (Network Resilience & Disk Cleanup):

- Timeout Guard: ตั้งค่าการเชื่อมต่อดึงข ้อมูล API ภายนอกไว ้ที่ 10 วินาที หากเกินกำหนดจะยกเลิกคำขอเพื่อไม่ให ้เธรดค ้าง

- Namenode Disk Bloating Cleanup: หลังจากการสกัดและคัดแยกข ้อมูล ลง HDFS สำเร็จ ระบบมีกลไกลบไฟล์ชั่วคราวในโฟลเดอร์ /tmp/ ของตู NameNode ออก เพื่อป้องกันปัญหาดิสก์เต็ม

- 5. การสร ้าง Metadata และการลงทะเบียนเส ้นทางข ้อมูล (Ingestion Metadata &

Upstream Lineage)

(Observability Tagging & Upstream Traceability)

- 1. การออกรหัสประจำรอบนำเข้า (Dynamic Run ID Generation):


- ทุกครั้งที่มีกระบวนการสกัดข ้อมูลเกิดขึ้น ระบบจะสร ้างรหัสประจำตัว Unique Run ID ขึ้นมาในรูปแบบ: (ตัวอย่าง:

run_20260707_081812_995747)

- 2. การประทับเวลาสากล (UTC Timestamping):

- ทำการประทับเวลาขณะสกัดข ้อมูลในรูปแบบ ISO-8601 (UTC Time) แนบไปกับ Metadata

- 3. การลงทะเบียนเส้นทางข้อมูลใน Elasticsearch (sdoqap_lineage_runs):

- ระบบสกัดข ้อมูลจะยิงข ้อมูล Metadata เข ้าไปสร ้างเอกสารใน

Elasticsearch ดัชนี sdoqap_lineage_runs โดยบันทึกฟิลด์สำคัญ:

- run_id: รหัสประจำรอบ

- table_name: ชื่อตาราง/ชุดข ้อมูล

- data_source: จุดกำเนิดข ้อมูล (เช่น CSV Upload, REST API, Reddit Stream)

- timestamp: เวลาที่นำเข ้า

- total_records: จำนวนแถวข ้อมูลดิบที่สกัดมาได

- ความเชื่อมโยงกับ Upstream-First Remediation:

- Metadata นี้คือจุดเริ่มต ้นของ Data Lineage (เส้นทางการไหลของ ข้อมูล) หากขั้นตอนถัดไปตรวจพบว่าข ้อมูลเน่า ระบบ AI/Advisor จะ ดึง data_source นี้ไปออก Upstream Remediation Ticket เพื่อส่งแจ ้ง เตือนกลับไปยังผู ้ดูแลระบบต ้นทางได ้อย่างถูกต ้อง

6. ผลการทดสอบประสิทธิภาพและการส่งต่อกระบวนการ (Empirical Performance &

Handover)

(Performance Evidence & Downstream Handover)

- ผลการทดสอบสกัดข้อมูลชุดใหญ่ (Stress Test Performance):

- ชุดข้อมูลทดสอบ: customer_churn_full (ไฟล์ CSV ขนาด 23.4 MB จำนวน 440,834 แถว)

- ผลลัพธ์: ระบบสามารถสกัดข ้อมูลทั้งหมด ส่งผ่าน WebHDFS เข ้าไป สร ้างเป็นไฟล์ดิบใน HDFS ที่

- /data/raw/customer_churn_full/customer_churn_full.csv ได ้สำเร็จ 100% ภายในเวลาเพียงไม่กี่วินาที

- การตรวจเช็คสุขภาพของบริการสกัดข้อมูล (Health Observability Checks):


- ระบบมีเกตเวย์ตรวจสอบสถานะพอร์ตการเชื่อมต่อสกัดข ้อมูลอยู่ ตลอดเวลา:

- NameNode WebHDFS: Port 9870 (HTTP) / Port 9000 (RPC) -> Status: Healthy

- DataNode Data Transfer: Port 9864 -> Status: Healthy

- Kafka Broker Service: Port 9092 -> Status: Healthy

- กลไกการส่งต่อเข้าสู่กระบวนการถัดไป (Handover Interface):

- เมื่อการสกัดข ้อมูลลง HDFS สิ้นสุดลง FastAPI หรือสคริปต์นำเข ้าจะส่ง คำขอ HTTP POST ไปยัง Spark Trigger Daemon (Port 8099/retry) หรือสั่ง รัน spark-submit เพื่อส่งสัญญาณให Spark Quality Engine (spark_quality_engine.py) เริ่มต ้นดึงข ้อมูลจาก Raw Zone เข ้าสู่ กระบวนการตรวจวัดคุณภาพ คัดแยกข ้อมูลดี/เสีย (Validation & Quarantine) ในขั้นตอนถัดไปทันที


## เนื้อหานำเสนอ

🎬 Slide 1

Data Extraction & Ingestion Architecture

## กระบวนการสกัดข้อมูลและการนำเข้าสู่แพลตฟอร์ม

## วัตถุประสงค์

แนะนำกระบวนการสกัดข ้อมูล ซึ่งเป็นขั้นตอนแรกของ Data Pipeline ใน แพลตฟอร์ม SDOQAP

## เนื้อหา

- Data Pipeline Entry Layer โดยมุ่งรักษาความครบถ ้วนของข ้อมูลต ้นฉบับ (Raw Data Integrity) ทำหน้าที่สกัด รับ และนำเข ้าข ้อมูลจากแหล่งข ้อมูลภายนอกเข ้าสู่ระบบ

- Fault-Tolerant Ingestion Architecture จัดเก็บข ้อมูลเข ้าสู่ Raw Landing Zone ก่อนเริ่มการประมวลผล เพื่อป้องกัน การสูญหายของข ้อมูลและเพิ่มความทนทานต่อความผิดพลาดของ Pipeline

- Multi-Source Data Ingestion รองรับการนำเข ้าข ้อมูลจาก 3 ประเภทหลัก ได ้แก่

- Batch Files

- REST API Services

- Real-time Streaming

File → API → Streaming → SDOQAP Platform

## ภาพประกอบที่แนะนำ

## 🎬 Slide 2

Supported Ingestion Sources

## การรองรับแหล่งข้อมูลและรูปแบบข้อมูล

## วัตถุประสงค์

แสดงศักยภาพของระบบในการรองรับข ้อมูลจากแหล่งข ้อมูลที่หลากหลาย

## เนื้อหา

## Structured Data

- รองรับไฟล์ CSV และ TSV

- อัปโหลดผ่าน Web-based Drag & Drop Interface


## Semi-Structured Data

- รองรับ REST API (JSON)

- รองรับ Open Data Services

- Smart URL Resolver

- Authentication Header และ API Key Management

## Streaming Data

- รองรับการนำเข ้าข ้อมูลแบบ Real-time

- เชื่อมต่อ Event Stream จาก Reddit อย่างต่อเนื่อง

## ภาพประกอบที่แนะนำ

## กล่องเปรียบเทียบ 3 ประเภท

CSV | REST API | Streaming

## 🎬 Slide 3

Extraction Engine Architecture

## สถาปัตยกรรมการสกัดข้อมูล

## วัตถุประสงค์

นำเสนอเทคโนโลยีหลักที่ใช ้ในการสกัดและนำเข ้าข ้อมูล

## เนื้อหา

## WebHDFS Upload Engine

- FastAPI จัดการ Upload Session

- ส่งข ้อมูลเข ้าสู่ HDFS DataNode โดยตรงผ่าน WebHDFS Protocol

## Apache Kafka

- ทำหน้าที่เป็น Event Buffer

- รองรับการรับข ้อมูลแบบ Streaming

- ลดความเสี่ยงของข ้อมูลสูญหายระหว่างการส่งผ่าน

## Spark Ingestion Engine

- ประมวลผลข ้อมูลแบบ Micro-batch

- เตรียมข ้อมูลก่อนเข ้าสู่กระบวนการ Data Quality Assessment


## ภาพประกอบที่แนะนำ

## Mermaid Architecture

Source

↓

FastAPI

↓

Kafka

↓

Spark

↓

HDFS Raw Zone

## 🎬 Slide 4

Raw Landing Zone & Fault Tolerance

## การจัดเก็บข้อมูลดิบและความทนทานของระบบ

## วัตถุประสงค์

แสดงแนวทางการรักษาความถูกต ้องของข ้อมูลต ้นฉบับและเสถียรภาพของระบบ

## เนื้อหา

## Raw Data Preservation

- จัดเก็บข ้อมูลต ้นฉบับทั้งหมดไว ้ใน HDFS Raw Zone

- ไม่มีการแก ้ไขหรือลบข ้อมูลในขั้นตอน Ingestion

## Non-Blocking Ingestion

- รองรับข ้อมูลที่มี Missing Values

- รองรับ Duplicate Records

- รองรับ Invalid Formats

- ระบบยังคงสามารถนำเข ้าข ้อมูลได ้โดยไม่หยุดการทำงานของ Pipeline

## Automatic Recovery

- Automatic Retry

- Timeout Handling

- รองรับความผิดพลาดของเครือข่ายระหว่างเชื่อมต่อ API

## ภาพประกอบที่แนะนำ

```
Data Source
↓
Invalid Data
↓
```


Raw Zone

Pipeline Continues

🎬 Slide 5

Metadata & Data Lineage

## การจัดการ Metadata และการติดตามแหล่งกำเนิดข้อมูล

## วัตถุประสงค์

สนับสนุนการตรวจสอบย ้อนกลับของข ้อมูลและการแก ้ไขปัญหาที่ต ้นทาง

## เนื้อหา

## Ingestion Metadata

- สร ้าง Run ID สำหรับแต่ละรอบการนำเข ้า

- บันทึก Ingestion Timestamp

- จัดเก็บข ้อมูลระดับ Partition

## Source Lineage

- บันทึกข ้อมูลแหล่งกำเนิดของ Dataset

- ลงทะเบียนข ้อมูลบน Elasticsearch

## Upstream Remediation

เมื่อพบปัญหาคุณภาพข ้อมูล ระบบสามารถระบุแหล่งกำเนิดข ้อมูลและแจ ้งเตือน

ไปยังระบบต ้นทางเพื่อดำเนินการแก ้ไขได ้อย่างรวดเร็ว

## ภาพประกอบที่แนะนำ

```
{
"run_id": "RUN-20260804-001",
"source": "OpenData API",
"timestamp": "...",
"dataset": "population"
}
```

พร ้อมภาพ Lineage Graph


## 🎬 Slide 6

## Extraction Performance Summary

## สรุปประสิทธิภาพของกระบวนการสกัดข้อมูล

## วัตถุประสงค์

สรุปผลการทดสอบและความพร ้อมก่อนเข ้าสู่กระบวนการตรวจสอบคุณภาพข ้อมูล

## เนื้อหา

## Performance Evaluation

- รองรับการนำเข ้าข ้อมูลมากกว่า 440,000 Records

- สามารถจัดเก็บข ้อมูลลง HDFS ได ้สำเร็จภายในระยะเวลาระดับไม่กี่วินาที (เเนบรูผภาพการรัน)

## Service Health Monitoring

- ตรวจสอบสถานะบริการแบบ Real-time

- HDFS NameNode

- HDFS DataNode

- Apache Kafka

- Service Status Dashboard

ข ้อมูลที่จัดเก็บใน Raw Zone จะถูกส่งต่อเข ้าสู่ Spark Quality Engine เพื่อดำเนินการ ตรวจสอบคุณภาพข ้อมูล (Data Validation) และกระบวนการ Quarantine ก่อนเข ้าสู่ขั้น ตอนการวิเคราะห์

แสดง กราฟหรือตัวเลข KPI สรุปผล (เช่น 440K Records Ingested / System Status: Healthy 100%)

## Handover to Data Validation

## 6 หัวข ้อนำเสนอ

- 1. ทำไมต ้องมี Slide 1 (บทนำ): เพื่อปูบริบทและขอบเขตงาน

- เหตุผล: อาจารย์/ผู ้ฟังจำเป็นต ้องทราบก่อนว่าขั้นตอน Data Extraction ใน โครงการนี้มีเป้าหมายอะไร และต่างจาก ETL ทั่วไปอย่างไร


- สิ่งที่ได้: แสดงให ้เห็นว่าเราไม่ได ้แค่อ่านไฟล์ แต่เราสร ้าง "ประตูนำเข้าข้อ มูลที่ไม่ยอมให้ระบบล่ม" (Non-breaking Gate) เพื่อเตรียมพร ้อมสำหรับการ ตรวจสอบคุณภาพ

2. ทำไมต ้องมี Slide 2 (ความหลากหลายของข ้อมูล): เพื่อโชว์ศักยภาพการรองรับ

Big Data (Variety)

- เหตุผล: ในยุค Big Data ระบบที่ดีต ้องไม่รองรับแค่ไฟล์ CSV บนเครื่อง แต่ ต ้องดึงข ้อมูลได ้หลายรูปแบบ

- สิ่งที่ได้: แสดงศักยภาพของระบบที่รองรับทั้ง Batch (ไฟล์ CSV), Web Services (REST API) และ Real-time Streaming (Reddit) ทำให ้โครงงานดูมีมิติ และมีความเป็นระบบขนาดใหญ่จริง

- 3. ทำไมต ้องมี Slide 3 (สถาปัตยกรรมเทคโนโลยี): เพื่อโชว์ความลึกทางเทคนิค (Engineering Depth)

- เหตุผล: กรรมการสอบโครงงานมักจะถามว่า "ใช ้อะไรทำ และทำไมถึงใช ้ ตัวนี้?"

- สิ่งที่ได้: พิสูจน์ความเชี่ยวชาญเชิงเทคนิค (Technical Competency) โดยการ อธิบายการเลือกใช ้เทคโนโลยีที่เหมาะสม เช่น WebHDFS สำหรับไฟล์ใหญ่, Kafka สำหรับคิวสตรีมมิ่งสด และ Spark สำหรับการประมวลผลขนาน

4. ทำไมต ้องมี Slide 4 (ความทนทานและการเก็บ Raw Zone): เพื่อโชว์ความน่า

เชื่อถือระดับองค์กร (Enterprise Resilience)

- เหตุผล: ปัญหาจริงของ Data Pipeline คือ ข ้อมูลเน่าส่งผลให ้ระบบล่ม (Pipeline Crash)

- สิ่งที่ได้: แสดงจุดเด่นว่าเรามี Raw Landing Zone (/data/raw/) เพื่อเก็บข ้อมูล ต ้นฉบับไว 100% ป้องกันข ้อมูลสูญหาย และเน้นย้ำว่าระบบสกัดของเรา ทนทานต่อความล ้มเหลวแม ้ข ้อมูลต ้นทางจะผิดสเปก

5. ทำไมต ้องมี Slide 5 (Metadata & Lineage): เพื่อตอบโจทย์หลักของโครงงาน (SDOQAP Philosophy)

- เหตุผล: โครงงานนี้คือ Data Observability Platform หัวใจสำคัญคือต ้องรู ้ว่า "ข้อมูลมาจากไหน และสกัดมาเมื่อไหร่"


- สิ่งที่ได้: ชี้ให ้เห็นการทำ Upstream Lineage Tracking โดยการแปะป้าย Run ID และ Timestamp ตั้งแต่ขั้นตอนสกัดข ้อมูล เพื่อรองรับการสืบหาต ้นตอตาม แนวคิด Upstream-First Remediation

6. ทำไมต ้องมี Slide 6 (ผลทดสอบจริงและการส่งต่อ): เพื่อพิสูจน์ผลลัพธ์เชิง

ประจักษ์ (Empirical Evidence)

- เหตุผล: การนำเสนอจะสมบูรณ์ได ้ต ้องมีตัวเลขผลการทดสอบจริง (Stress Test) ไม่ใช่แค่ทฤษฎี

- สิ่งที่ได้: โชว์ตัวเลขการสกัดข ้อมูลระดับ 440,000+ เรคคอร์ด ได ้สำเร็จ เพื่อ ยืนยันว่าระบบทำงานได ้จริงตามสเปก และเป็นการจบสไลด์ส่วน Extraction เพื่อส่งต่อไปยังขั้นตอน Data Validation ได ้อย่างไหลลื่น
