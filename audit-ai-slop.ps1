# ==============================================================================
# Anti-AI Slop Language, Wordy Buttons, Em-Dash, Emoji and Test Leakage Linter
# Deterministic regex audit scanning source files for banned robotic buzzwords,
# raw Unicode emojis (📊/🛒/🛡️), em-dashes (—/–), wordy buttons, and exposed test routes.
# Derived from: jalaalrd/anti-ai-slop-writing, LeoStehlik/no-slop-ui, Leonxlnx/taste-skill, emoji-to-icons
# ==============================================================================
param (
    [string]$TargetDir = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[*] Running Anti-AI Slop Language, Emoji and Test Leak Audit" -ForegroundColor Cyan
Write-Host "[*] Target Path: $TargetDir"
Write-Host "=========================================================="

# 1. Define Banned Patterns
$BannedEnglish = @(
    "\bdelve(s|d|ing)?\b",
    "\btapestry\b",
    "\btestament\b",
    "\bmeticulous(ly)?\b",
    "\bbolster(ed|ing|s)?\b",
    "\bgarner(ed|ing|s)?\b",
    "\bunderscore(s|d)?\b",
    "\binterplay\b",
    "\bmultifaceted\b",
    "\bgroundbreaking\b",
    "\bcutting-edge\b",
    "\bgame-changer\b",
    "\btransformative\b",
    "\bseamless(ly)?\b",
    "\bspearhead(ing|ed|s)?\b",
    "\bharness(ing|ed)?\b",
    "\bunprecedented\b",
    "\bremarkable\b",
    "\bin a nutshell\b",
    "\bunlock the power\b",
    "\belevate your\b",
    "\bstreamline your\b",
    "\bsupercharge\b",
    "\bmove the needle\b",
    "\bmoreover\b",
    "\bfurthermore\b",
    "\brevolutionize\b",
    "\benhance(s|d|ment)?\b",
    "\bfoster(s|ed|ing)?\b",
    "\btransform(s|ed|ing)?\b",
    "\bdynamic dashboard\b",
    "\bseamless integration\b",
    "\bcrucial\b",
    "\bwrap-up\b",
    "here is your complete",
    "at its core",
    "let's dive in"
)

$BannedThai = @(
    "ปฏิวัติ",
    "นวัตกรรมล้ำสมัย",
    "ขีดสุด",
    "นี่คือบทสรุป",
    "ยินดีต้อนรับสู่แพลตฟอร์มของเรา",
    "อย่างราบรื่น",
    "ครอบคลุมที่สุด"
)

$BannedButtonPhrases = @(
    "click here to",
    "คลิกที่นี่เพื่อ",
    "save all changes to database"
)

$BannedTestRoutes = @(
    "/(test-route|debug-panel|sandbox|dev-test)"
)

$BannedPunctuation = @(
    "—",
    "–"
)

# Raw Unicode Emojis (Surrogate pair range + Misc Symbols range)
$BannedEmojiRegex = "[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]"

# Localization Slop: Dual-language parenthetical translation (Thai + English or English + Thai)
# e.g., "แดชบอร์ดวิเคราะห์ผลการเรียน (Performance Telemetry)" or "Performance Telemetry (แดชบอร์ด)"
$LocalizationSlopRegex = "[\u0E00-\u0E7F]{2,}\s*\([A-Za-z0-9\s_\-\.\/]{2,}\)|[A-Za-z0-9\s_\-\.\/]{2,}\s*\([\u0E00-\u0E7F\s]{2,}\)"

# Combine patterns
$AllTextPatterns = ($BannedEnglish + $BannedThai + $BannedButtonPhrases + $BannedTestRoutes + $BannedPunctuation) -join "|"

# 2. File Extensions to Inspect
$Extensions = @("*.ts", "*.tsx", "*.js", "*.jsx", "*.html", "*.vue", "*.svelte")

# 3. Directories to Exclude
$ExcludeDirs = @("node_modules", ".git", "dist", "build", ".next", "coverage", ".gemini", "logs")

$Files = Get-ChildItem -Path $TargetDir -Recurse -File -Include $Extensions | Where-Object {
    $FilePath = $_.FullName
    $Excluded = $false
    foreach ($Dir in $ExcludeDirs) {
        if ($FilePath -match "[\\/]$Dir[\\/]") {
            $Excluded = $true
            break
        }
    }
    if ($_.Name -like "*audit-ai-slop*") { $Excluded = $true }
    -not $Excluded
}

$Violations = @()

foreach ($File in $Files) {
    $LineNumber = 1
    Get-Content $File.FullName -Encoding utf8 -ErrorAction SilentlyContinue | ForEach-Object {
        $Line = $_
        $Matched = $false
        $MatchedReason = ""
        $MatchedWord = ""

        if ($Line -match $AllTextPatterns) {
            $Matched = $true
            $MatchedWord = $Matches[0]
            $MatchedReason = "Banned Buzzword / Stylistic Punctuation"
        } elseif ($Line -match $BannedEmojiRegex) {
            $Matched = $true
            $MatchedWord = "[Unicode Emoji]"
            $MatchedReason = "Raw Unicode Emoji Slop (Use Lucide/SVG component instead)"
        } elseif ($Line -match $LocalizationSlopRegex) {
            $Matched = $true
            $MatchedWord = $Matches[0]
            $MatchedReason = "Localization Slop / Robotic Parenthetical Translation (Use i18n JSON + useTranslation hook)"
        }

        if ($Matched) {
            $RelativePath = $File.FullName.Replace($TargetDir, "").TrimStart("\/")
            $Violations += [PSCustomObject]@{
                File = $RelativePath
                Line = $LineNumber
                Type = $MatchedReason
                Word = $MatchedWord
                Snippet = $Line.Trim()
            }
        }
        $LineNumber++
    }
}

if ($Violations.Count -gt 0) {
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Red
    Write-Host "[!] [CRITICAL LINTER FAILURE] AI SLOP / EMOJI / LOCALIZATION SLOP DETECTED! " -ForegroundColor Red
    Write-Host "======================================================================" -ForegroundColor Red
    Write-Host "Found $($Violations.Count) prohibited buzzwords, raw emojis, localization slops, or buttons:" -ForegroundColor Red
    foreach ($V in $Violations) {
        Write-Host " -> File: $($V.File):$($V.Line) [$($V.Type)]" -ForegroundColor Yellow
        Write-Host "    Violation Pattern : '$($V.Word)'" -ForegroundColor Red
        Write-Host "    Code Snippet      : $($V.Snippet)" -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host "[X] Remediate: Replace raw emojis with tree-shaken SVG icons (import { Icon } from 'lucide-react')." -ForegroundColor Red
    Write-Host "[X] Remediate: Replace buzzwords/em-dashes with concise human words and plain punctuation." -ForegroundColor Red
    Write-Host "[X] Remediate: Separate dual-language parenthetical translations into i18n JSON (locales/th.json, locales/en.json) and wire via useTranslation()." -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "[+] [PASS] Anti-AI Slop Audit Clean: 0 robotic phrases, 0 emojis, 0 em-dashes, 0 localization slops, 0 test leaks." -ForegroundColor Green
    Write-Host "[+] Total Source Files Inspected: $($Files.Count)" -ForegroundColor Green
    exit 0
}
