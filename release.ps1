<#
.SYNOPSIS
    Bumps the plugin version and triggers an automated GitHub release.

.DESCRIPTION
    Runs type checking, bumps the version using standard-version (which also
    updates CHANGELOG.md and creates a git tag), syncs the version to
    manifest.json, then pushes. The tag push triggers GitHub Actions to build
    the plugin and publish the release automatically.

.PARAMETER Bump
    Version bump type: patch, minor, or major (default: patch)
      patch  x.x.X  Bug fixes, small improvements
      minor  x.X.0  New features (backward compatible)
      major  X.0.0  Breaking changes

.EXAMPLE
    .\release.ps1
    .\release.ps1 minor
    .\release.ps1 -Bump major
#>
param(
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Step([string]$msg) {
    Write-Host "`n→ $msg" -ForegroundColor Cyan
}

function Fail([string]$msg) {
    Write-Host "`n✗ $msg" -ForegroundColor Red
    exit 1
}

Step "Type checking..."
npm run typecheck
if ($LASTEXITCODE -ne 0) { Fail "Type check failed. Fix errors before releasing." }

Step "Bumping version ($Bump) and updating CHANGELOG.md..."
npx standard-version --release-as $Bump
if ($LASTEXITCODE -ne 0) { Fail "Version bump failed." }

Step "Syncing version to manifest.json..."
node sync-version.js
if ($LASTEXITCODE -ne 0) { Fail "Version sync failed." }

git add manifest.json
git commit -m "chore: sync version to manifest" --no-verify
if ($LASTEXITCODE -ne 0) {
    Write-Host "  (nothing to commit — manifest already in sync)" -ForegroundColor DarkGray
}

Step "Pushing to GitHub..."
git push --follow-tags origin main
if ($LASTEXITCODE -ne 0) { Fail "Push failed." }

$version = node -p "require('./package.json').version"
Write-Host "`n✓ v$version pushed. GitHub Actions will build and publish the release." -ForegroundColor Green
Write-Host "  Track progress at: https://github.com/JamesCliffordSpratt/macros/actions" -ForegroundColor DarkGray
