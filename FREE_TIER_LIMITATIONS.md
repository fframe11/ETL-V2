# Data Serve / SDOQAP — Free-Tier Limitations & Provider Verification

## 1. Provider Verification Matrix (Card Requirement & Free Tier Audits)

This audit rigorously verifies the signup, payment card requirements, quotas, and inactivity behaviors of potential cloud providers as of late 2026.

| Provider & Service | Free Plan Name | Card Required? | Free Quotas & Allowances | Inactivity / Sleep Behavior | Verification Status | Final Decision |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Vercel** (Frontend) | Hobby Plan | **NO** | 100 GB Bandwidth/mo, 100 Serverless Function invocations, unlimited deployments | Never sleeps; always warm edge CDN | **VERIFIED** | **ADOPTED** (Primary Frontend) |
| **Cloudflare Pages** (Frontend) | Free | **NO** | Unlimited sites, 500 builds/month, unlimited bandwidth | Static CDN edge; never sleeps | **VERIFIED** | **ADOPTED** (Secondary / Backup) |
| **Cloudflare Tunnel** (Network Ingress) | TryCloudflare / Quick Tunnel | **NO** | Zero-config outbound QUIC tunnel, unlimited bandwidth | Active while local connector runs | **VERIFIED** | **ADOPTED** (Primary Backend Ingress) |
| **Cloudflare R2** (Object Storage) | Free (10GB) | **YES (CARD REQUIRED)** | 10 GB storage, 1M Class A ops, 10M Class B ops | Persistent object storage | **VERIFIED: DISQUALIFIED** | **REJECTED** (Requires credit card to enable in dashboard) |
| **Render** (FastAPI Backend) | Free Web Service | **NO** (GitHub signup) | 750 instance hours/month, 512 MB RAM, 0.1 CPU | **Spins down after 15m idle**; 50s cold start delay | **VERIFIED** | **OPTIONAL CLOUD CANDIDATE** (Local + Tunnel preferred for zero latency) |
| **Fly.io** (Container Hosting) | Hobby | **YES (CARD REQUIRED)** | Small VMs require billing verification | Auto-sleeps | **VERIFIED: DISQUALIFIED** | **REJECTED** |
| **Railway** (Container Hosting) | Trial / Hobby | **YES (CARD REQUIRED)** | Requires card after $5 initial trial | Ephemeral | **VERIFIED: DISQUALIFIED** | **REJECTED** |
| **Neon.tech** (PostgreSQL) | Free Tier | **NO** | 0.5 GB storage, 1 shared compute branch | Auto-suspends compute after 5m idle; wakes in ~1s | **VERIFIED** | **COMPATIBLE CANDIDATE** (Tested alongside Local Postgres) |
| **Supabase** (PostgreSQL) | Free Plan | **NO** | 2 free projects, 500 MB database, 1 GB storage | **Pauses project after 7 days of inactivity** | **VERIFIED** | **COMPATIBLE CANDIDATE** (Requires weekly ping or local fallback) |
| **Elastic Cloud** (Elasticsearch) | 14-Day Trial | **YES (AFTER TRIAL)** | Requires card upon expiration; no permanent free tier | Suspended after 14 days | **VERIFIED: DISQUALIFIED** | **REJECTED** (Cannot sustain ฿0 long-term) |
| **AWS / GCP / Azure** (Spark/HDFS) | Free Tier | **YES (CARD REQUIRED)** | Requires card verification during initial signup | Egress and storage charges risk | **VERIFIED: DISQUALIFIED** | **REJECTED** |
| **Local Docker Host** | Self-Hosted Core | **NO** | Bound only by physical host hardware (16GB+ RAM, SSD) | Never sleeps unless machine turns off | **VERIFIED** | **ADOPTED** (Primary Big Data & Storage Engine) |

---

## 2. In-Depth Operational Limitations & Mitigations

### 2.1 The Render Sleep Problem (Cold Starts & Ephemeral Disk)
* **Limitation**: Render Free Web Services spin down to 0 instances after 15 minutes of inactivity. When a request arrives, the service takes 40–60 seconds to boot up. Furthermore, the local filesystem is ephemeral: all files written to `/tmp` or uploaded via multipart forms are erased when the container spins down.
* **Mitigation**:
  1. For live academic and client demonstrations, the **Local FastAPI + Cloudflare Tunnel** architecture is the primary serving mechanism. It runs on native host hardware with 0ms cold start, persistent file caching in `data/`, and zero timeout risks.
  2. If deploying to Render, the frontend must implement a waking screen ("Backend is waking up...") and external database storage (Neon/Supabase) must be configured.

### 2.2 The Cloudflare R2 Payment Trap
* **Limitation**: Cloudflare advertises R2 as having a generous free tier (10 GB storage free every month). However, navigating to the Cloudflare Dashboard to enable R2 prompts for a credit/debit card before the bucket creation interface unlocks.
* **Mitigation**: Strictly avoided. All raw datasets, profiling caches, and quarantine tables are persisted on the local persistent storage engine and HDFS lakehouse, requiring **฿0 and zero payment cards**.

### 2.3 Supabase 7-Day Inactivity Rule
* **Limitation**: Free Supabase projects are automatically paused if no API calls or SQL queries hit the instance within 7 consecutive days. Restoring requires manual dashboard unpausing.
* **Mitigation**: Do not use Supabase as the single point of truth. The local PostgreSQL container (`sdoqap-postgres`) maintains the gold layer, and automated `pg_dump` backups are preserved on disk.

### 2.4 TryCloudflare Ephemeral Domain Rotation
* **Limitation**: Quick Tunnels created via `cloudflared tunnel --url http://localhost:8000` generate dynamic subdomains (e.g. `https://xxxx.trycloudflare.com`). When the tunnel process restarts, the URL rotates.
* **Mitigation**:
  1. The tunnel is supervised as a persistent background daemon (`task-628`).
  2. For permanent custom domains without rotation, users can configure a free Cloudflare Named Tunnel using a free domain (e.g., Freenom, Cloudflare DNS zone) as documented in `infra/cloudflare/CLOUDFLARE_PRODUCTION_SETUP.md`.
