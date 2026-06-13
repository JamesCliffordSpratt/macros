<#
.SYNOPSIS
    Interactive release script for the Macros Obsidian plugin.
    Stages changes, commits, bumps version, and pushes — triggering
    an automated GitHub Actions release.

.EXAMPLE
    .\release.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ── Helpers ─────────────────────────────────────────────────────────────────

function Header([string]$msg) {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor White
    Write-Host ("  " + ("─" * $msg.Length)) -ForegroundColor DarkGray
}

function Step([string]$msg) {
    Write-Host "`n→ $msg" -ForegroundColor Cyan
}

function Ok([string]$msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Warn([string]$msg) {
    Write-Host "  ! $msg" -ForegroundColor Yellow
}

function Fail([string]$msg) {
    Write-Host "`n  ✗ $msg" -ForegroundColor Red
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 1
}

function Prompt([string]$msg) {
    Write-Host "  $msg" -ForegroundColor Gray -NoNewline
    return (Read-Host " ")
}

function Menu([string]$title, [string[]]$options, [string[]]$descriptions, [int]$default = 0) {
    Write-Host ""
    Write-Host "  $title" -ForegroundColor White
    for ($i = 0; $i -lt $options.Length; $i++) {
        $marker = if ($i -eq $default) { "▶" } else { " " }
        $num = $i + 1
        Write-Host "  $marker [$num] $($options[$i])" -ForegroundColor $(if ($i -eq $default) { "Cyan" } else { "Gray" })
        Write-Host "        $($descriptions[$i])" -ForegroundColor DarkGray
    }
    Write-Host ""
    $choice = Prompt "Choose (1-$($options.Length)) [default: $($default+1)]"
    if ([string]::IsNullOrWhiteSpace($choice)) { return $default }
    $idx = [int]$choice - 1
    if ($idx -lt 0 -or $idx -ge $options.Length) { return $default }
    return $idx
}

# ── Banner ───────────────────────────────────────────────────────────────────

Clear-Host
Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor DarkCyan
Write-Host "  ║     Macros Plugin Release Script     ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor DarkCyan

# ── Check git status ─────────────────────────────────────────────────────────

Header "Changed files"

$status = git status --short
if ([string]::IsNullOrWhiteSpace($status)) {
    Warn "No changes detected. Nothing to commit."
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 0
}

$status -split "`n" | ForEach-Object {
    if ($_.Trim()) { Write-Host "    $_" -ForegroundColor DarkGray }
}

# ── Commit type ──────────────────────────────────────────────────────────────

$typeIdx = Menu "Commit type" `
    @("feat", "fix", "chore", "docs", "refactor", "perf", "test") `
    @(
        "New feature or capability          → bumps MINOR version",
        "Bug fix or correction              → bumps PATCH version",
        "Maintenance, deps, tooling         → bumps PATCH version",
        "Documentation only                 → bumps PATCH version",
        "Code restructure, no behaviour change → bumps PATCH version",
        "Performance improvement            → bumps PATCH version",
        "Adding or fixing tests             → bumps PATCH version"
    )

$types = @("feat", "fix", "chore", "docs", "refactor", "perf", "test")
$commitType = $types[$typeIdx]

# ── Commit description ───────────────────────────────────────────────────────

Header "Commit message"
$subject = ""
while ([string]::IsNullOrWhiteSpace($subject)) {
    $subject = Prompt "Short description (e.g. 'add weekly summary view')"
}

Write-Host ""
Write-Host "  Optional: add a longer body (press Enter to skip)" -ForegroundColor Gray
Write-Host "  You can paste multiple lines. Enter a blank line when done." -ForegroundColor DarkGray
Write-Host ""
$bodyLines = @()
while ($true) {
    $line = Prompt "  >"
    if ([string]::IsNullOrWhiteSpace($line)) { break }
    $bodyLines += $line
}

$commitMsg = "${commitType}: ${subject}"
if ($bodyLines.Count -gt 0) {
    $commitMsg += "`n`n" + ($bodyLines -join "`n")
}

# ── Breaking change? ─────────────────────────────────────────────────────────

$breaking = Prompt "Breaking change? (y/N)"
if ($breaking -match "^[Yy]") {
    $breakingDesc = Prompt "Describe the breaking change"
    $commitMsg += "`n`nBREAKING CHANGE: $breakingDesc"
}

# ── Version bump ─────────────────────────────────────────────────────────────

$defaultBump = if ($commitType -eq "feat" -or $breaking -match "^[Yy]") { 1 } else { 0 }
if ($breaking -match "^[Yy]") { $defaultBump = 2 }

$bumpIdx = Menu "Version bump" `
    @("patch", "minor", "major") `
    @(
        "x.x.X  Bug fixes, maintenance, small improvements",
        "x.X.0  New features (backward compatible)",
        "X.0.0  Breaking changes"
    ) `
    $defaultBump

$bumps = @("patch", "minor", "major")
$bump = $bumps[$bumpIdx]

# ── Confirm ───────────────────────────────────────────────────────────────────

$currentVersion = node -p "require('./package.json').version"
Header "Ready to release"
Write-Host "  Commit : $commitMsg" -ForegroundColor White
Write-Host "  Bump   : $bump  ($currentVersion → next $bump)" -ForegroundColor White
Write-Host ""
$confirm = Prompt "Proceed? (Y/n)"
if ($confirm -match "^[Nn]") {
    Write-Host "`n  Aborted." -ForegroundColor Yellow
    exit 0
}

# ── Execute ───────────────────────────────────────────────────────────────────

Step "Staging all changes..."
git add .
Ok "Staged"

Step "Committing..."
git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) { Fail "Commit failed." }
Ok "Committed"

Step "Type checking..."
npm run typecheck
if ($LASTEXITCODE -ne 0) { Fail "Type check failed. Fix errors before releasing." }
Ok "Types OK"

Step "Bumping version ($bump) and updating CHANGELOG..."
npx standard-version --release-as $bump
if ($LASTEXITCODE -ne 0) { Fail "Version bump failed." }

Step "Syncing version to manifest.json..."
node sync-version.js
if ($LASTEXITCODE -ne 0) { Fail "Version sync failed." }
git add manifest.json
$syncResult = git commit -m "chore: sync version to manifest" --no-verify 2>&1
if ($LASTEXITCODE -ne 0 -and $syncResult -notmatch "nothing to commit") {
    Warn "manifest sync commit skipped (already in sync)"
} else {
    Ok "manifest.json synced"
}

Step "Pushing to GitHub..."
git push --follow-tags origin main
if ($LASTEXITCODE -ne 0) { Fail "Push failed." }

$newVersion = node -p "require('./package.json').version"
Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor DarkGreen
Write-Host "  ║        Release v$newVersion complete!$(if($newVersion.Length -lt 6){'       '}elseif($newVersion.Length -lt 7){'      '}else{'     '})║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor DarkGreen
Write-Host ""
Write-Host "  GitHub Actions is now building and publishing the release." -ForegroundColor Gray
Write-Host "  Track: https://github.com/JamesCliffordSpratt/macros/actions" -ForegroundColor DarkGray
Write-Host ""
Read-Host "  Press Enter to close"
