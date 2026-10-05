# ==============================================================================
# Automated Git Safety Net (Background Auto-Commit Watcher - Universal Template)
# ==============================================================================
param (
    [string]$Path = $PSScriptRoot,
    [int]$DebounceSeconds = 5
)

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[*] Automated Git Safety Net Watcher Started" -ForegroundColor Cyan
Write-Host "[*] Monitoring Path: $Path" -ForegroundColor Cyan
Write-Host "[*] Debounce Window: $DebounceSeconds seconds" -ForegroundColor Cyan
Write-Host "=========================================================="

$Watcher = New-Object System.IO.FileSystemWatcher
$Watcher.Path = $Path
$Watcher.IncludeSubdirectories = $true
$Watcher.EnableRaisingEvents = $true
$Watcher.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::DirectoryName

$Global:LastEventTime = [DateTime]::MinValue
$Global:PendingCommit = $false

$Action = {
    $ItemPath = $Event.SourceEventArgs.FullPath
    if ($ItemPath -match "(\\.git|node_modules|\\.next|dist|coverage|logs|tmp)") {
        return
    }
    $Global:LastEventTime = [DateTime]::Now
    $Global:PendingCommit = $true
}

$Handlers = @()
$Handlers += Register-ObjectEvent $Watcher "Changed" -Action $Action
$Handlers += Register-ObjectEvent $Watcher "Created" -Action $Action
$Handlers += Register-ObjectEvent $Watcher "Deleted" -Action $Action
$Handlers += Register-ObjectEvent $Watcher "Renamed" -Action $Action

Write-Host "[+] Background watcher is active. Press Ctrl+C to terminate." -ForegroundColor Green

try {
    while ($true) {
        Start-Sleep -Seconds 1
        if ($Global:PendingCommit) {
            $Elapsed = ([DateTime]::Now - $Global:LastEventTime).TotalSeconds
            if ($Elapsed -ge $DebounceSeconds) {
                $Global:PendingCommit = $false
                
                Push-Location $Path
                $Status = git status --porcelain
                if ($Status) {
                    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    Write-Host "[+] Auto-committing changes at $Timestamp..." -ForegroundColor Yellow
                    git add -A
                    git commit -m "auto-save: checkpoint $Timestamp" --quiet
                    Write-Host "[+] Saved: $(git log -n 1 --oneline)" -ForegroundColor Green
                }
                Pop-Location
            }
        }
    }
} finally {
    $Watcher.EnableRaisingEvents = $false
    $Watcher.Dispose()
    $Handlers | ForEach-Object { Unregister-Event -SourceIdentifier $_.Name -ErrorAction SilentlyContinue }
    Write-Host "[*] Watcher terminated cleanly." -ForegroundColor DarkGray
}
