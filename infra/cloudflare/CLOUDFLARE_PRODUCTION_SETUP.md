# Cloudflare & Vercel Production Deployment Architecture Guide

คู่มือการตั้งค่าเครือข่าย Production สำหรับ **Data Serve (SDOQAP Platform)** โดยผสานการทำงานระหว่าง **Vercel** (Frontend) และ **Cloudflare** (DNS, SSL/TLS, CDN, Zero-Trust Tunnel / Edge Gateway)

---

## 1. ผังโครงสร้างสถาปัตยกรรม (Architecture Blueprint)

```
                            [ Public User Browser ]
                                       │
                      ┌────────────────┴────────────────┐
                      │                                 │
           [ app.yourdomain.com ]             [ api.yourdomain.com ]
                      │                                 │
                      ▼                                 ▼
           Cloudflare DNS (CNAME)             Cloudflare DNS (Proxied)
                      │                                 │
                      ▼                                 ▼
         Vercel Edge Network (React SPA)      Cloudflare Tunnel / Edge Proxy
                      │                                 │
                      │ (Proxy /api/* calls)            │
                      └─────────────────────────────────┘
                                       │
                                       ▼
                       FastAPI Backend Container / Host
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
      White-Box Engine           PostgreSQL DB               Delta Lake / HDFS
    (Pandas / In-Memory)         (Metadata/OLTP)            (Spark Quality Runs)
```

---

## 2. การตั้งค่า Vercel (Frontend Deployment)

1. **เชื่อมต่อ Repository บน Vercel Dashboard**:
   - นำเข้า GitHub Repository `fframe11/ETL-V2`
   - กำหนด **Root Directory**: `services/ui`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install` (พร้อมกำหนด Environment Variable `PUPPETEER_SKIP_DOWNLOAD=true`)

2. **Environment Variables บน Vercel**:
   - `VITE_API_BASE_URL`: ปล่อยว่างไว้หากใช้ Rewrite ผ่าน `vercel.json` หรือระบุ `https://api.yourdomain.com`

3. **การตั้งค่า Custom Domain บน Vercel**:
   - ไปที่ Settings $\rightarrow$ Domains $\rightarrow$ เพิ่ม `app.yourdomain.com`

---

## 3. การตั้งค่า Cloudflare DNS & SSL/TLS

### 3.1 DNS Records
ใน Cloudflare Dashboard $\rightarrow$ DNS $\rightarrow$ Records:

| Type | Name | Target / Content | Proxy Status | คำอธิบาย |
| :--- | :--- | :--- | :--- | :--- |
| **CNAME** | `app` | `cname.vercel-dns.com` | **DNS Only** (Grey Cloud) | ชี้ไปยัง Vercel สำหรับ Frontend |
| **CNAME** | `api` | `<tunnel-uuid>.cfargotunnel.com` | **Proxied** (Orange Cloud) | ชี้ไปยัง Cloudflare Tunnel ของ Backend |

> *หมายเหตุ: สำหรับ Vercel แนะนำตั้งค่าเป็น DNS Only ในขั้นตอนแรกเพื่อให้ Vercel ออกใบรับรอง Let's Encrypt ได้อย่างสมบูรณ์ หลังจากนั้นสามารถเปิดเป็น Proxied ได้ตามต้องการ*

### 3.2 SSL/TLS Encryption
- ไปที่ **SSL/TLS $\rightarrow$ Overview**:
  - เลือกโหมด **Full (strict)** หาก Backend มี SSL Certificate จริง (เช่น Nginx Reverse Proxy)
  - เลือกโหมด **Full** หากเชื่อมต่อผ่าน Cloudflare Tunnel (Tunnel จัดการเข้ารหัสผ่าน mTLS ภายใน)
- ไปที่ **SSL/TLS $\rightarrow$ Edge Certificates**:
  - **Always Use HTTPS**: `ON`
  - **Minimum TLS Version**: `TLS 1.2`
  - **Automatic HTTPS Rewrites**: `ON`

---

## 4. การเปิดใช้งาน Cloudflare Tunnel สำหรับ Backend (1-Click Run)

ระบบจัดเตรียมสคริปต์อัตโนมัติไว้ในโฟลเดอร์ `infra/cloudflare/`:

```powershell
# รันเพื่อเปิด Public HTTPS Tunnel สำหรับ Backend (Default: Port 8000)
powershell -ExecutionPolicy Bypass -File infra/cloudflare/start-cloudflared-tunnel.ps1
```

สคริปต์จะแสดงผล Public URL เช่น:
```
https://xxxx-xxxx-xxxx.trycloudflare.com
```
นำ URL นี้ไปอัปเดตใน `services/ui/vercel.json` ที่ฟิลด์ `destination` เพื่อให้ Vercel Proxy ไปยัง Backend ได้ทันที!
