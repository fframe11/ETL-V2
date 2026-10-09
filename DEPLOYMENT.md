# คู่มือการติดตั้งและการส่งมอบระบบสู่สภาพแวดล้อมจริง (SDOQAP Production Deployment Guide)

**ระบบ**: SDOQAP (Smart Data Operations & Quality Assurance Platform) — DataServe  
**เอกสารตามข้อกำหนด**: CLAUDE.md ข้อ 21 (Client Handover Manifest Parity)  
**วันที่ปรับปรุงล่าสุด**: 9 ตุลาคม 2569  

---

## 1. ข้อกำหนดสภาพแวดล้อมฮาร์ดแวร์และซอฟต์แวร์ (Target Server Prerequisites)

### 1.1 ความต้องการด้านฮาร์ดแวร์ขั้นต่ำ (Minimum Hardware Specifications)
* **CPU**: 4 vCPU ขึ้นไป (แนะนำ 8 vCPU สำหรับ Spark Processing ขนาดใหญ่)
* **RAM**: 16 GB ขึ้นไป (Engine หลักจอง: Spark Worker 3.5GB, Spark Master 3GB, Elasticsearch 1.2GB, n8n 800MB, อื่นๆ รวมประมาณ 12GB)
* **Storage**: 50 GB ขึ้นไป (SSD แนะนำ เพื่อ I/O สำหรับ HDFS DataNode และ Delta Lake)
* **Operating System**: Ubuntu 22.04 LTS, Debian 12, RHEL 9 หรือ Rocky Linux 9

### 1.2 ซอฟต์แวร์พื้นฐานที่ต้องติดตั้งบนเซิร์ฟเวอร์เป้าหมาย (Host Prerequisites)
1. **Docker Engine**: เวอร์ชัน 24.0.0 หรือใหม่กว่า
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```
2. **Docker Compose Plugin**: เวอร์ชัน v2.20.0 ขึ้นไป
   ```bash
   docker compose version
   ```
3. **OpenSSL** (สำหรับสร้าง SSL Certificate และ Secret Keys):
   ```bash
   openssl version
   ```
4. **Ports ที่จำเป็นต้องเปิดสู่ภายนอก (Firewall Rules)**:
   * **Port 80/TCP** (HTTP สำหรับ Redirect ไปยัง HTTPS หรือ Let's Encrypt Challenge)
   * **Port 443/TCP** (HTTPS สำหรับ Production Gateway)
   * *พอร์ตภายในทั้งหมด (9200, 5601, 9870, 9002, 8081, 7077, 8099, 5678, 8000, 5432, 9092) จะถูกกักกันไว้ที่ `127.0.0.1` หรืออยู่ในเครือข่ายภายใน Docker ไม่เปิดสู่สาธารณะ*

---

## 2. ขั้นตอนการตั้งค่าความปลอดภัยก่อน Deploy (Production Security Checklist)

### 2.1 การเตรียมไฟล์ `.env` สำหรับ Production
คัดลอกไฟล์เทมเพลต:
```bash
cp .env.example .env
```

แก้ไขค่าตัวแปรใน `.env` โดยห้ามใช้ค่า Default เด็ดขาด:

```bash
# 1. รหัสผ่านผู้ดูแลระบบ (บังคับเปลี่ยน)
ADMIN_USERNAME=sdoqap_admin
ADMIN_PASSWORD=$(openssl rand -base64 24)

# 2. คีย์เข้ารหัสเซสชัน (บังคับเปลี่ยน ห้ามเว้นว่าง)
SESSION_SECRET_KEY=$(openssl rand -hex 32)

# 3. การเปิดโหมดความปลอดภัยคุกกี้ (ต้องเป็น true เมื่อรันผ่าน HTTPS)
SESSION_COOKIE_SECURE=true

# 4. การผูกพอร์ตเครือข่ายภายใน (Default: 127.0.0.1 ห้ามแก้เป็น 0.0.0.0)
HOST_BIND_IP=127.0.0.1

# 5. รหัสผ่าน Elasticsearch Superuser
ELASTIC_PASSWORD=$(openssl rand -base64 20)
ELASTICSEARCH_PASSWORD=${ELASTIC_PASSWORD}

# 6. รหัสผ่าน Grafana
GRAFANA_ADMIN_USER=sdoqap_admin
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 20)

# 7. คีย์สำหรับ Machine-to-Machine API
ALERT_WEBHOOK_SECRET=$(openssl rand -hex 32)
INGEST_SERVICE_KEY=$(openssl rand -hex 32)
TRIGGER_SHARED_SECRET=$(openssl rand -hex 32)

# 8. AI Engine Model (Groq)
GROQ_API_KEY=gsk_your_actual_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
```

### 2.2 การติดตั้งใบรับรองความปลอดภัย SSL/TLS
สร้างโฟลเดอร์สำหรับเก็บใบรับรอง:
```bash
mkdir -p certs
```

* **กรณีใช้ Let's Encrypt**:
  ```bash
  sudo certbot certonly --standalone -d yourdomain.com
  sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem certs/
  sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem certs/
  ```
* **กรณีใช้ Self-Signed Certificate เพื่อทดสอบบนเครือข่ายปิด**:
  ```bash
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout certs/privkey.pem -out certs/fullchain.pem \
    -subj "/C=TH/ST=Bangkok/L=Bangkok/O=SDOQAP/CN=localhost"
  ```

---

## 3. คำสั่งติดตั้งและเริ่มระบบแบบ 1-Click (1-Click Deployment Commands)

### 3.1 สั่ง Start คลัสเตอร์ในโหมด Production
ใช้การซ้อนทับด้วย `docker-compose.prod.yml` เพื่อปิดพอร์ตภายในและเปิด HTTPS:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### 3.2 ตรวจสอบสถานะความพร้อมของ Container ทั้งหมด
```bash
docker compose ps
```
ตรวจสอบให้แน่ใจว่าทุก Container มีสถานะ `healthy` (โดยเฉพาะ `sdoqap-api`, `sdoqap-ui`, `sdoqap-elasticsearch`, `sdoqap-spark-master`)

### 3.3 กำหนดสิทธิ์โฟลเดอร์ใน HDFS เมื่อติดตั้งครั้งแรก
```bash
docker exec sdoqap-namenode hdfs dfs -mkdir -p /data/raw /data/active /data/quarantine /data/archive /data/staging
docker exec sdoqap-namenode hdfs dfs -chown -R spark:spark /data
docker exec sdoqap-namenode hdfs dfs -chmod -R 775 /data
```

---

## 4. การจัดการ CI/CD และ GitHub Actions Runner

* **ไฟล์ `.github/workflows/ci.yml`**: ทำงานอัตโนมัติบน GitHub-hosted Runner (`ubuntu-latest`) ครอบคลุม Compose Config Validation, API Pytest, UI Build และ Spark Stage Unit Tests
* **ไฟล์ `.github/workflows/deploy.yml`**: ออกแบบมาสำหรับ Deploy อัตโนมัติเมื่อ Merge เข้าสู่ Branch `main`
  * **ข้อกำหนด**: ต้องการ GitHub Self-Hosted Runner ที่ติดตั้งอยู่บน Production Server
  * **วิธีติดตั้ง Runner**: เข้าไปที่ GitHub Repo $\rightarrow$ Settings $\rightarrow$ Actions $\rightarrow$ Runners $\rightarrow$ New self-hosted runner แล้วรันสคริปต์ตามคำแนะนำของ GitHub

---

## 5. การตรวจสอบความถูกต้องหลังติดตั้ง (Post-Deployment Verification)

1. **ทดสอบการเชื่อมต่อหน้าเว็บ (HTTPS)**:
   ```bash
   curl -k -I https://localhost/
   # ต้องตอบกลับ HTTP/2 200 หรือ HTTP/1.1 200
   ```
2. **ทดสอบ API Health Check**:
   ```bash
   curl -k https://localhost/api/v1/healthz
   # ต้องตอบกลับ {"status": "ok"}
   ```
3. **ทดสอบล็อกอินเข้าสู่ระบบ**:
   * เข้าใช้งานผ่าน Browser ที่ `https://<server-ip>/login`
   * กรอก `ADMIN_USERNAME` และ `ADMIN_PASSWORD` ที่ตั้งค่าไว้ใน `.env`

---

## 6. แผนการสำรองข้อมูลและการกู้คืน (Backup & Disaster Recovery)

* **Delta Lake & HDFS Data**: สำรองข้อมูลในไดเรกทอรี Docker Volume `hadoop_namenode` และ `hadoop_datanode`
* **Elasticsearch Metadata**: แนะนำตั้งค่า Snapshot Repository ไปยัง Object Storage / S3
* **PostgreSQL (OLTP)**:
  ```bash
  docker exec -t sdoqap-postgres pg_dump -U sdoqap sdoqap_oltp > backup_sdoqap_$(date +%F).sql
  ```
