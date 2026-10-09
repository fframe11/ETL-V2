# Data Serve / SDOQAP — Data Safety, Backup & Recovery Standard Operating Procedure

## 1. Data Classification Matrix

| Data Classification | Storage Engine & Path | Persistence Guarantee | Backup Strategy | Recovery Objective (RTO / RPO) |
| :--- | :--- | :--- | :--- | :--- |
| **Gold Layer Analytics** | PostgreSQL (`sdoqap-postgres` container, `postgres_data` volume) | Permanent across container restarts | Automated `pg_dump` snapshot script (`scripts/backup/backup_postgres.sh`) | RTO: < 2 min<br/>RPO: < 1 hour |
| **White-Box DQ Evidence & Rules** | Filesystem (`data/evaluation/`, `data/inputs/`, `data/outputs/`) | Permanent on host filesystem | File-level atomic copy / Git versioning | RTO: Instant<br/>RPO: Zero data loss |
| **Pipeline Metadata & Telemetry** | Elasticsearch (`sdoqap-elasticsearch`, `elasticsearch_data` volume) | Permanent across container restarts | Index snapshot / export to JSON | RTO: < 5 min<br/>RPO: Daily |
| **HDFS Lakehouse (Bronze / Staging)**| Hadoop HDFS (`hadoop_namenode`, `hadoop_datanode` volumes) | Permanent across container restarts | HDFS snapshot / WebHDFS export | RTO: < 10 min<br/>RPO: Daily |
| **Uploaded Staging Files** | Ingestion temporary directory (`/tmp` or `services/api/uploads/`) | Ephemeral (cleared after profiling) | N/A (Uploaded raw datasets are copied to persistent store immediately) | Transferred to disk before processing |

---

## 2. Automated PostgreSQL Backup & Recovery Procedure

### 2.1 Backup Procedure (`pg_dump`)
To take an atomic, consistent snapshot of the PostgreSQL Gold Layer and system tables:

```bash
# From host or WSL Ubuntu:
docker exec -t sdoqap-postgres pg_dump -U postgres -d postgres -F c -b -v -f /tmp/sdoqap_gold_backup.dump
docker cp sdoqap-postgres:/tmp/sdoqap_gold_backup.dump ./backups/sdoqap_gold_backup_$(date +%Y%m%d_%H%M%S).dump
```

**PowerShell Equivalent (Windows)**:
```powershell
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
wsl -d Ubuntu -- sh -c "docker exec sdoqap-postgres pg_dump -U postgres -d postgres -F c -b -f /tmp/backup.dump && docker cp sdoqap-postgres:/tmp/backup.dump /mnt/c/DataEngProj/backups/pg_backup_$timestamp.dump"
Write-Host "[+] PostgreSQL Backup created at: backups/pg_backup_$timestamp.dump" -ForegroundColor Green
```

### 2.2 Restoration Procedure (`pg_restore`)
To restore a snapshot into a clean or recovered PostgreSQL instance:

```bash
# Drop connections and restore:
docker cp ./backups/latest_backup.dump sdoqap-postgres:/tmp/latest_backup.dump
docker exec -t sdoqap-postgres pg_restore -U postgres -d postgres --clean --if-exists /tmp/latest_backup.dump
```

---

## 3. White-Box Dataset & Rule Configuration Safety

To prevent accidental data loss or partial writes during White-Box profiling and rule transformations:
1. **Atomic Segregation**: Clean, Review, and Quarantine records are written using transactional atomic temporary files before renaming to the final dataset paths (`clean_records.csv`, `quarantine_records.csv`).
2. **Immutable Input Safeguard**: The raw uploaded file is checksummed (SHA-256) and marked read-only in `data/inputs/`. Profiling engines read from memory/streams without mutating the source file.
3. **Traceability Logging**: Every execution logs the exact rule configuration payload, timestamp, author, and record IDs flagged.

---

## 4. Verification Test (Persistence Across Container Restarts)

To prove that the data persists across service restarts:
1. Insert test record into PostgreSQL:
   ```sql
   INSERT INTO student_evaluation_summary (run_id, dataset_name, total_records, clean_records, quarantined_records, quality_score)
   VALUES ('test_verify_001', 'persistence_check.csv', 1000, 950, 50, 95.0);
   ```
2. Restart container:
   ```bash
   docker restart sdoqap-postgres
   ```
3. Query record:
   ```sql
   SELECT * FROM student_evaluation_summary WHERE run_id = 'test_verify_001';
   ```
4. Record verified: **Data retained with 100% fidelity**.
