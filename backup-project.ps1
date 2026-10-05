# ==============================================================================
# Automated Offline Backup and Disaster Recovery Script (Universal Project Template)
# ==============================================================================
param (
    [string]$BackupDir = "",
    [string]$ExternalBackupDir = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$ProjectName = (Get-Item $ProjectRoot).Name

if (-not $BackupDir) {
    $BackupDir = "C:\Users\ffram\project_backups\$ProjectName"
}

$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$ArchiveBase = "${ProjectName}_backup_$Timestamp.tar.gz"
$DestinationPath = Join-Path $BackupDir $ArchiveBase

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[*] Starting Disaster Recovery Snapshot: $Timestamp" -ForegroundColor Cyan
Write-Host "[*] Project Name : $ProjectName"
Write-Host "[*] Project Root : $ProjectRoot"
Write-Host "[*] Destination  : $DestinationPath"
Write-Host "=========================================================="

# 1. Create Backup Directory if missing
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    Write-Host "[+] Created backup directory: $BackupDir" -ForegroundColor Green
}

# 2. Check Git Status
Push-Location $ProjectRoot
try {
    $GitStatus = git status --porcelain
    if ($GitStatus) {
        Write-Host "[!] Warning: Workspace has uncommitted changes:" -ForegroundColor Yellow
        $GitStatus | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
    } else {
        Write-Host "[+] Git working tree is clean." -ForegroundColor Green
    }
} catch {
    Write-Host "[i] Git check notice: $_" -ForegroundColor DarkGray
} finally {
    Pop-Location
}

# 3. Create Compressed Archive
Write-Host "[*] Compressing project snapshot (excluding caches and dependencies)..." -ForegroundColor Cyan

tar -czf "$DestinationPath" -C "$ProjectRoot" --exclude="node_modules" --exclude=".next" --exclude="dist" --exclude="coverage" --exclude=".turbo" .

if (Test-Path "$DestinationPath") {
    $FileItem = Get-Item "$DestinationPath"
    $FileSizeMB = [math]::Round($FileItem.Length / 1MB, 2)
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "[+] SNAPSHOT SUCCESSFUL!" -ForegroundColor Green
    Write-Host "[+] Archive: $DestinationPath ($FileSizeMB MB)" -ForegroundColor Green
    Write-Host "[!] Recovery: tar -xzf `"$DestinationPath`" -C <target-dir>" -ForegroundColor Yellow
    if ($ExternalBackupDir -and (Test-Path $ExternalBackupDir)) {
        $ExternalDest = Join-Path $ExternalBackupDir $ArchiveBase
        Copy-Item "$DestinationPath" "$ExternalDest" -Force
        Write-Host "[+] Replicated to Physical Storage: $ExternalDest" -ForegroundColor Cyan
    }
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Error "[-] Backup creation failed: $DestinationPath was not created."
}
