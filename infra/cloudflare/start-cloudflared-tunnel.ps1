<#
.SYNOPSIS
  Automated Cloudflare Quick Tunnel Runner for Data Serve Backend.
.DESCRIPTION
  Downloads cloudflared if not present, then starts an encrypted zero-config
  Cloudflare Tunnel to expose the local Backend API (Port 8000 / 80) to a
  public HTTPS endpoint on *.trycloudflare.com.
#>

param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

$binDir = Join-Path $PSScriptRoot "bin"
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

$cloudflaredPath = Join-Path $binDir "cloudflared.exe"

# 1. Check if cloudflared is already in PATH or in binDir
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    $cloudflaredCmd = "cloudflared"
} elseif (Test-Path $cloudflaredPath) {
    $cloudflaredCmd = $cloudflaredPath
} else {
    Write-Host "[*] Downloading cloudflared.exe from Cloudflare official release..." -ForegroundColor Cyan
    $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $cloudflaredPath -UseBasicParsing
    Write-Host "[+] cloudflared downloaded to: $cloudflaredPath" -ForegroundColor Green
    $cloudflaredCmd = $cloudflaredPath
}

Write-Host "[*] Starting Cloudflare Tunnel for http://localhost:$Port ..." -ForegroundColor Cyan
Write-Host "[*] Notice: Press Ctrl+C to stop the tunnel." -ForegroundColor Yellow

& $cloudflaredCmd tunnel --url "http://localhost:$Port"
