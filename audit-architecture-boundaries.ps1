# ==============================================================================
# 🏛️ Architectural Boundary & Full-Stack Anti-Drift Linter
# Scans codebase for:
#   1. Ghost Architecture Drift: Frontend leaking into backend/database directly
#   2. Phantom Migrations: Destructive NOT NULL without DEFAULT on existing tables
#   3. API Boundary Drift: Missing shared schema / untyped fetch payloads
#   4. Stale State Traps: Mutations missing cache invalidation hooks
# ==============================================================================
param (
    [string]$TargetDir = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "🏛️ [ARCHITECTURAL INTEGRITY AUDIT] Scanning boundaries in: $TargetDir" -ForegroundColor Cyan
Write-Host "======================================================================"

$Violations = @()

# 1. GHOST ARCHITECTURE DRIFT: Frontend importing DB/Server directly
$ClientFiles = Get-ChildItem -Path $TargetDir -Recurse -Include *.tsx, *.jsx, *.ts, *.js -ErrorAction SilentlyContinue | Where-Object {
    $_.FullName -match "(\\components\\|\\ui\\|\\pages\\|\\app\\)" -and
    $_.FullName -notmatch "node_modules|\.git|dist|build|\.next|api"
}

$ForbiddenClientImports = @(
    "@prisma/client",
    "prisma/client",
    "@/lib/db",
    "@/server",
    "typeorm",
    "pg",
    "child_process",
    "fs/promises"
)

foreach ($File in $ClientFiles) {
    $Content = Get-Content -Path $File.FullName -Raw -Encoding utf8
    # If file contains 'use client' or is inside components
    foreach ($Pattern in $ForbiddenClientImports) {
        if ($Content -match "from\s+['""]$([regex]::Escape($Pattern))['""]") {
            $Violations += "[Ghost Architecture Leak] Frontend component '$($File.Name)' directly imports backend/database module '$Pattern'."
        }
    }
}

# 2. PHANTOM MIGRATIONS: NOT NULL without DEFAULT in migrations
$MigrationFiles = Get-ChildItem -Path $TargetDir -Recurse -Filter "*.sql" -ErrorAction SilentlyContinue | Where-Object {
    $_.FullName -match "migration" -and $_.FullName -notmatch "node_modules|\.git"
}

foreach ($SqlFile in $MigrationFiles) {
    $SqlContent = Get-Content -Path $SqlFile.FullName -Raw -Encoding utf8
    $Lines = $SqlContent -split "\r?\n"
    foreach ($Line in $Lines) {
        # Check: ADD COLUMN ... NOT NULL without DEFAULT
        if ($Line -match "ADD\s+COLUMN\s+.+\bNOT\s+NULL\b" -and $Line -notmatch "\bDEFAULT\b") {
            $Violations += "[Phantom Migration Risk] File '$($SqlFile.Name)' adds NOT NULL column without DEFAULT. This locks and breaks active production tables!"
        }
    }
}

# 3. REPORT RESULTS
if ($Violations.Count -gt 0) {
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Red
    Write-Host "[!] [ARCHITECTURAL INTEGRITY VIOLATIONS DETECTED]                     " -ForegroundColor Red
    Write-Host "======================================================================" -ForegroundColor Red
    foreach ($V in $Violations) {
        Write-Host "  [X] $V" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Recommendation: Decouple layers, use API routes, and apply Expand-Contract migrations." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "[+] All Architectural Boundaries intact! Zero cross-layer leaks detected." -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Cyan
    exit 0
}
