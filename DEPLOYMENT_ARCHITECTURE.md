# Data Serve / SDOQAP — Deployment Architecture (Zero-Card & Free-Tier)

## 1. Executive Summary & Philosophy

This document defines the production and demonstration deployment architecture for **Data Serve (SDOQAP - Semi-Automated Data Quality & ETL Governance Platform)**.

The deployment model is designed under two non-negotiable operational constraints:
1. **Target Cost**: **฿0/month** (Strict Zero-Cost).
2. **Payment Card Policy**: **Zero-Card Requirement** — absolutely no credit or debit card linking required at any stage of signup, deployment, or execution.

To guarantee that the platform demonstrates **real data processing, authentic White-Box governance, and honest system boundaries** without fabricating results or breaking under cloud provider restrictions, the system operates as a **Hybrid Edge-Core Architecture**:
* **Layer A (Interactive White-Box Serving & Ingestion Layer)**: Hosted and publicly exposed via **Vercel / Cloudflare Edge** with full interactive data profiling, dynamic rule recommendations, business context locking, validation, and data segregation (Clean, Review, Quarantine).
* **Layer B (Distributed Big Data Platform)**: Maintained on **Local Docker Infrastructure** to run Apache Spark 3.4.1, Hadoop HDFS 3.2.1, Delta Lake, PostgreSQL 15, and Elasticsearch 8.10.2 without violating zero-card policies.

---

## 2. End-to-End System Architecture Diagram

```mermaid
flowchart TB
    subgraph Public_Internet["PUBLIC INTERNET (Free Tier — Zero-Card)"]
        UserBrowser["User Browser / Professor Demo Client"]
        
        subgraph Edge_Frontend["Frontend Edge Layer"]
            VercelSPA["Vercel Edge Network (Vite SPA)<br/>Framework: React 18 + Vite 5<br/>URL: https://<project>.vercel.app<br/>Rewrites: /api/:path* -> Tunnel"]
            CFPages["Alternative: Cloudflare Pages<br/>Static SPA Hosting (Zero Card)"]
        end

        subgraph Ingress_Security["Encrypted Ingress & Tunnel Layer"]
            CFTunnel["Cloudflare Edge Network & Tunnel<br/>TryCloudflare / Quick Tunnel<br/>Endpoint: https://indices-cornell-burlington-physician.trycloudflare.com<br/>• Outbound-only TLS 1.3 / HTTP2<br/>• Zero Open Firewall Ports<br/>• DDoS & Bot Protection"]
        end
    end

    subgraph Host_Environment["HOST MACHINE RUNTIME (Local Compute & Storage)"]
        subgraph Layer_A["Layer A: Interactive White-Box Serving Engine"]
            FastAPI["FastAPI Serving Layer (Port 8000)<br/>Python 3.10+ / Uvicorn ASGI<br/>• Profiling Engine (Pandas/NumPy/PyArrow)<br/>• Rule Recommendation Engine<br/>• Data Segregation (Clean/Review/Quarantine)<br/>• HttpOnly Session Security (Lax/Strict)"]
            LocalDataStore["Local Persistent Storage<br/>data/inputs/, data/outputs/, data/evaluation/"]
        end

        subgraph Layer_B["Layer B: Distributed Processing Cluster (Docker Compose)"]
            direction TB
            subgraph Hadoop_Lake["Hadoop Lakehouse"]
                NameNode["HDFS NameNode (Port 9870/9002)<br/>bde2020/hadoop-namenode:3.2.1"]
                DataNode["HDFS DataNode (Port 9864)<br/>bde2020/hadoop-datanode:3.2.1"]
            end
            
            subgraph Spark_Cluster["Apache Spark Cluster"]
                SparkMaster["Spark Master (Port 8081/7077)<br/>Trigger Daemon (Port 8099)"]
                SparkWorker["Spark Worker (3G RAM, 2 Cores)"]
            end

            subgraph Storage_Audit["Databases & Observability"]
                Postgres["PostgreSQL 15 (Port 5432)<br/>Gold Layer & System Metadata"]
                Elastic["Elasticsearch 8.10.2 (Port 9200)<br/>Index: sdoqap_pipeline_runs, drifts"]
                Kibana["Kibana (Port 5601)"]
                Grafana["Grafana (Port 3002)"]
            end
        end
    end

    %% Network Connections
    UserBrowser -->|HTTPS / Assets| VercelSPA
    UserBrowser -->|HTTPS / Assets| CFPages
    VercelSPA -->|/api/* Reverse Proxy| CFTunnel
    CFTunnel -->|Encrypted Forwarding| FastAPI
    FastAPI -->|In-Memory / File DQ Processing| LocalDataStore
    FastAPI -.->|REST / Triggers| SparkMaster
    FastAPI -.->|Metadata / Audit| Postgres
    FastAPI -.->|Telemetry Query| Elastic
    SparkMaster --> SparkWorker
    SparkWorker <--> Hadoop_Lake
    SparkWorker -.-> Postgres
    SparkWorker -.-> Elastic
```

---

## 3. Component Boundaries & Responsibilities

| Component | Runtime Environment | Hosting Provider | Card Required? | Operational Status | Fallback / Recovery Mode |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Frontend UI** | Static Client SPA | Vercel Hobby / Cloudflare Pages | **NO** (Verified) | Production Ready | Cloudflare Pages fallback |
| **API Reverse Proxy** | Edge Worker / CDN Rewrites | Vercel Edge (`vercel.json`) | **NO** (Verified) | Active | Direct Cloudflare Worker Gateway |
| **Backend Ingress** | Tunnel Daemon (`cloudflared`) | Cloudflare Tunnel | **NO** (Verified) | Live (`trycloudflare.com`) | Self-healing process supervisor |
| **Layer A Engine** | FastAPI + Python 3.13 | Local Host / Container | **NO** (Local hardware) | Live & Active | Standalone disk/memory execution |
| **PostgreSQL 15** | Docker Container | Local Docker (`sdoqap-postgres`) | **NO** (Local hardware) | Running (`postgres_data` volume) | `pg_dump` automated snapshot |
| **Elasticsearch 8** | Docker Container | Local Docker (`sdoqap-elasticsearch`) | **NO** (Local hardware) | Running (`elasticsearch_data` volume)| File-based metadata fallback |
| **Hadoop HDFS** | Multi-Container Cluster | Local Docker (`namenode`, `datanode`) | **NO** (Local hardware) | Running | Staging directory filesystem |
| **Apache Spark** | Distributed Cluster | Local Docker (`spark-master`, `worker`) | **NO** (Local hardware) | Running | Layer A White-Box fallback |

---

## 4. Provider Evaluation & Decision Rationale

### 4.1 Why Frontend on Vercel / Cloudflare Pages?
* **Zero Cost**: 100GB bandwidth, unlimited requests, automatic HTTPS.
* **Zero Card Requirement**: Both Vercel Hobby and Cloudflare Pages can be created with a standard GitHub account without providing billing information.
* **Edge Reverse Proxy**: Vercel rewrites `/api/:path*` to the Cloudflare Tunnel backend. This guarantees **First-Party Cookie Semantics** (`credentials: "same-origin"`), completely bypassing browser third-party cookie restrictions (Safari ITP, Chrome Privacy Sandbox).

### 4.2 Why Cloudflare Tunnel for Backend Exposure?
* **Zero Port Forwarding**: The local router/firewall does not need to open inbound port 80 or 443.
* **DDoS & Web Application Firewall**: Free DDoS mitigation and HTTPS termination.
* **No Account Required for TryCloudflare**: Allows instantaneous zero-config ephemeral tunnels for live demonstrations, while named tunnels can be bound to free Cloudflare zones.

### 4.3 Why Keep Layer B (Spark/HDFS/ES) on Local Docker?
* **Cloud Free-Tier Incompatibility**: No cloud provider offers free multi-node JVM clusters with >4GB RAM without requiring a credit card or expiring after a 14-day trial.
* **Honest Systems Engineering**: Running Spark, HDFS, and Elasticsearch locally allows the platform to process 100,000+ rows with real distributed executors rather than faking distributed execution on an under-resourced cloud container.
