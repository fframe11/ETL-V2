#!/usr/bin/env python3
"""
SDOQAP Automated PostgreSQL Backup & Snapshot Script
Dumps sdoqap_oltp from the sdoqap-postgres container into the backups/ directory.
"""

import os
import sys
import time
import subprocess
from datetime import datetime

def run_backup():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backup_dir = os.path.join(project_root, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target_filename = f"sdoqap_backup_{timestamp}.dump"
    target_path = os.path.join(backup_dir, target_filename)
    container_tmp = f"/tmp/{target_filename}"

    print(f"[*] Starting PostgreSQL backup for sdoqap_oltp...")
    
    # 1. Run pg_dump inside container
    cmd_dump = [
        "wsl", "-d", "Ubuntu", "--",
        "docker", "exec", "sdoqap-postgres",
        "pg_dump", "-U", "sdoqap", "-d", "sdoqap_oltp", "-F", "c", "-b", "-f", container_tmp
    ]
    subprocess.run(cmd_dump, check=True)
    
    # 2. Copy out of container
    cmd_cp = [
        "wsl", "-d", "Ubuntu", "--",
        "docker", "cp", f"sdoqap-postgres:{container_tmp}", f"/mnt/c/DataEngProj/backups/{target_filename}"
    ]
    subprocess.run(cmd_cp, check=True)

    # 3. Clean up container /tmp
    subprocess.run(["wsl", "-d", "Ubuntu", "--", "docker", "exec", "sdoqap-postgres", "rm", "-f", container_tmp])

    if os.path.exists(target_path):
        size_bytes = os.path.getsize(target_path)
        print(f"[+] Backup successfully created: {target_path} ({size_bytes:,} bytes)")
        return target_path
    else:
        print(f"[-] Backup file not found at expected path: {target_path}")
        sys.exit(1)

if __name__ == "__main__":
    run_backup()
