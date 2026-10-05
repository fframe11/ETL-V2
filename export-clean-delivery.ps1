# ==============================================================================
# Clean Client Delivery Packager & Immigration Checkpoint Gatekeeper
# Supports:
#   - Source Mode : Clean source code archive via git archive + .gitattributes
#   - Dist Mode   : Production compiled build (dist/build) stripped of dev pollution
#   - Both Mode   : Generates both pristine deliverables
#   - AuditOnly   : Audits an existing delivery package and hard-aborts if polluted
# ==============================================================================
param (
    [ValidateSet("Source", "Dist", "Both")]
    [string]$Mode = "Source",
    [string]$OutputFile = "",
    [string]$DistPath = "dist",
    [switch]$AuditOnly
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# ------------------------------------------------------------------------------
# IMMIGRATION CHECKPOINT GATEKEEPER
# Scans zip archive for internal scripts, backups, and secret leaks.
# Hard-aborts with Exit 1 and deletes package if any violation is found.
# ------------------------------------------------------------------------------
function Invoke-ImmigrationGate {
    param (
        [string]$ZipFilePath
    )

    if (-not (Test-Path $ZipFilePath)) {
        throw "[-] Immigration Gate Error: File not found: $ZipFilePath"
    }

    Write-Host "[*] [IMMIGRATION CHECKPOINT] Auditing package contents..." -ForegroundColor Cyan
    $ResolvedPath = (Resolve-Path $ZipFilePath).Path
    $Zip = [System.IO.Compression.ZipFile]::OpenRead($ResolvedPath)
    
    $PollutedFiles = @()
    # Forbidden patterns regex: backups, watchers, agent rules, env files, logs
    $ForbiddenRegex = "(backup.*|\.bak$|watch-autocommit|CLAUDE\.md|GEMINI\.md|\.env(\..+)?$|export-clean|error\.log|\.tsbuildinfo|^\.git/)"

    foreach ($Entry in $Zip.Entries) {
        $NormalizedName = $Entry.FullName.Replace('\', '/')
        if ($NormalizedName -match $ForbiddenRegex) {
            $PollutedFiles += $NormalizedName
        }
    }
    $Zip.Dispose()

    if ($PollutedFiles.Count -gt 0) {
        Write-Host ""
        Write-Host "======================================================================" -ForegroundColor Red
        Write-Host "[!] [CRITICAL IMMIGRATION GATE FAILURE] BUILD POLLUTION DETECTED!       " -ForegroundColor Red
        Write-Host "======================================================================" -ForegroundColor Red
        Write-Host "The following internal/prohibited files were detected inside package: " -ForegroundColor Red
        foreach ($BadFile in $PollutedFiles) {
            Write-Host "  [X] $BadFile" -ForegroundColor Yellow
        }
        Write-Host "----------------------------------------------------------------------" -ForegroundColor Red
        Write-Host "DELIVERY BLOCKED! Deleting contaminated package to protect client...  " -ForegroundColor Red
        Write-Host "======================================================================" -ForegroundColor Red
        Write-Host ""

        # Hard delete contaminated package
        Remove-Item $ResolvedPath -Force -ErrorAction SilentlyContinue
        Write-Host "[-] Quarantined & deleted: $ResolvedPath" -ForegroundColor Red
        exit 1
    }

    $ZipItem = Get-Item $ResolvedPath
    $ZipSizeKB = [math]::Round($ZipItem.Length / 1KB, 2)
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "[+] [IMMIGRATION CHECKPOINT PASSED] ZERO BUILD POLLUTION DETECTED" -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "[+] Verified Package : $(Split-Path $ResolvedPath -Leaf) ($ZipSizeKB KB)" -ForegroundColor Green
    Write-Host "[+] Audit Result     : 0 internal scripts, 0 backups, 0 secrets" -ForegroundColor Green
    Write-Host "[+] Status           : Ready for safe client handover." -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# PACKAGE BUILDER: SOURCE MODE
# ------------------------------------------------------------------------------
function Ensure-DeploymentManifest {
    $DeployFile = Join-Path $ProjectRoot "DEPLOYMENT.md"
    if (-not (Test-Path $DeployFile)) {
        Write-Host "[*] Auto-generating client DEPLOYMENT.md manifest..." -ForegroundColor Cyan
        @'
# Production Deployment Manifest & Environment Requirements

## 🖥️ Target Environment Prerequisites
- **Node.js**: >= 20.x LTS
- **PostgreSQL**: >= 16.x
- **Redis**: >= 7.x (required for cache, rate limiting, and background queues)
- **Minimum RAM**: 2 GB (4 GB recommended for concurrent workloads)

## 🚀 Quickstart via Docker Compose (Recommended)
1. Ensure Docker & Docker Compose are installed.
2. Copy environment file: `cp .env.example .env` (fill in your production secrets).
3. Start all services:
   ```bash
   docker compose up -d
   ```
4. Run database migrations:
   ```bash
   npx prisma migrate deploy
   ```

## 🛠️ Bare-Metal / Cloud VM Deployment
1. Install dependencies: `npm ci --omit=dev`
2. Apply database migrations: `npx prisma migrate deploy`
3. Start production server: `npm start`
'@ | Out-File -FilePath $DeployFile -Encoding utf8
        Write-Host "[+] Generated DEPLOYMENT.md (Client Handover Manifest)" -ForegroundColor Green
    }
}

function Build-SourcePackage {
    param ([string]$TargetZip)
    if (-not $TargetZip) { $TargetZip = "delivery-source.zip" }
    $TargetZipPath = Join-Path $ProjectRoot $TargetZip

    Ensure-DeploymentManifest

    Write-Host "[*] Packing Source Code via git archive (.gitattributes stripped)..." -ForegroundColor Cyan
    $Status = git status --porcelain
    if ($Status) {
        Write-Host "[!] Warning: Working tree has uncommitted changes. git archive only includes committed code." -ForegroundColor Yellow
    }

    git archive --format=zip HEAD -o $TargetZipPath
    if (-not (Test-Path $TargetZipPath)) {
        throw "Failed to create source archive: $TargetZipPath"
    }

    Invoke-ImmigrationGate -ZipFilePath $TargetZipPath
}

# ------------------------------------------------------------------------------
# PACKAGE BUILDER: DIST MODE
# ------------------------------------------------------------------------------
function Build-DistPackage {
    param (
        [string]$TargetZip,
        [string]$BuildDir
    )
    if (-not $TargetZip) { $TargetZip = "delivery-dist.zip" }
    $TargetZipPath = Join-Path $ProjectRoot $TargetZip

    # Detect build directory
    $ResolvedBuildDir = Join-Path $ProjectRoot $BuildDir
    if (-not (Test-Path $ResolvedBuildDir)) {
        if (Test-Path (Join-Path $ProjectRoot "build")) {
            $ResolvedBuildDir = Join-Path $ProjectRoot "build"
        } elseif (Test-Path (Join-Path $ProjectRoot ".next/standalone")) {
            $ResolvedBuildDir = Join-Path $ProjectRoot ".next/standalone"
        } else {
            throw "[-] Build directory '$BuildDir' not found! Please run your build command first (e.g., npm run build)."
        }
    }

    Ensure-DeploymentManifest

    Write-Host "[*] Packing Compiled Dist from: $ResolvedBuildDir" -ForegroundColor Cyan
    $StageDir = Join-Path $env:TEMP ("delivery-stage-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $StageDir -Force | Out-Null

    try {
        # Copy build output
        Copy-Item -Path "$ResolvedBuildDir\*" -Destination $StageDir -Recurse -Force

        # Copy production essentials if present at root
        $RootFiles = @("package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "README.md", "DEPLOYMENT.md", "docker-compose.yml", "docker-compose.prod.yml")
        foreach ($RF in $RootFiles) {
            $SourcePath = Join-Path $ProjectRoot $RF
            if (Test-Path $SourcePath) {
                Copy-Item -Path $SourcePath -Destination $StageDir -Force
            }
        }

        # Purge any accidental local pollution from staging
        Get-ChildItem -Path $StageDir -Recurse -Include "*.bak", "*backup*", "*.log", "*.tsbuildinfo" | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue

        # Create zip archive
        if (Test-Path $TargetZipPath) { Remove-Item $TargetZipPath -Force }
        [System.IO.Compression.ZipFile]::CreateFromDirectory($StageDir, $TargetZipPath)

        if (-not (Test-Path $TargetZipPath)) {
            throw "Failed to create dist archive: $TargetZipPath"
        }

        Invoke-ImmigrationGate -ZipFilePath $TargetZipPath
    } finally {
        if (Test-Path $StageDir) {
            Remove-Item $StageDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# ------------------------------------------------------------------------------
# MAIN EXECUTION
# ------------------------------------------------------------------------------
Push-Location $ProjectRoot
try {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "[*] Clean Client Delivery Exporter & Immigration Gate" -ForegroundColor Cyan
    Write-Host "[*] Project Root : $ProjectRoot"
    Write-Host "[*] Mode         : $Mode"
    Write-Host "=========================================================="

    if ($AuditOnly) {
        if (-not $OutputFile) {
            # Find default zip in root
            $FoundZips = Get-ChildItem -Path $ProjectRoot -Filter "delivery-*.zip"
            if ($FoundZips.Count -gt 0) {
                $OutputFile = $FoundZips[0].FullName
            } else {
                throw "AuditOnly requires -OutputFile parameter or an existing delivery-*.zip package."
            }
        }
        Invoke-ImmigrationGate -ZipFilePath $OutputFile
        return
    }

    switch ($Mode) {
        "Source" {
            Build-SourcePackage -TargetZip $OutputFile
        }
        "Dist" {
            Build-DistPackage -TargetZip $OutputFile -BuildDir $DistPath
        }
        "Both" {
            Write-Host "--- Packaging Mode 1: Source ---" -ForegroundColor Cyan
            Build-SourcePackage -TargetZip "delivery-source.zip"
            Write-Host ""
            Write-Host "--- Packaging Mode 2: Compiled Dist ---" -ForegroundColor Cyan
            Build-DistPackage -TargetZip "delivery-dist.zip" -BuildDir $DistPath
        }
    }
} finally {
    Pop-Location
}
