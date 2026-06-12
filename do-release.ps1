Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Step([string]$msg) { Write-Host "`n→ $msg" -ForegroundColor Cyan }
function Fail([string]$msg) { Write-Host "`n✗ $msg" -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }

Set-Location $PSScriptRoot

# ── 1. Stage all changes ────────────────────────────────────────────────────
Step "Staging all changes..."
git add .

# ── 2. Commit the feature work ──────────────────────────────────────────────
Step "Committing feature changes..."
$commitMsg = @"
feat: add micronutrient tracking foundation

Add a micronutrient tracking system covering vitamins, minerals and other
commonly tracked nutrients, with targets derived from age/sex/life-stage DRIs.

- Add micronutrient catalogue (32 nutrients) with an RDA/AI database keyed
  by standard life-stage groups, including pregnancy/lactation, plus profile
  resolution, target/override helpers and frontmatter extraction/scaling
- Add a "Micronutrients" settings tab with a master enable toggle, a personal
  profile (sex/age/life stage), and per-nutrient editable targets that default
  to the recommended value and can be overridden or reset
- Add an optional, collapsible micronutrient section to the manual food entry
  modal: pick nutrients from a category-grouped dropdown and save them to the
  food's frontmatter and body
- Append a micronutrient summary table beneath the macros processor output
  (consumed vs target with progress bars), shown only when tracking is enabled
  and the foods carry micronutrient data
- Register a no-op handler for the deprecated macrosmicro block so any
  leftover blocks render nothing instead of their raw source
- Add styles for the new UI and fix the obscured manual-entry dropdown by
  restoring native select rendering
- Add Spanish and Chinese translations for all new strings
- Add GitHub Actions release workflow

Persisted settings: micronutrientTrackingEnabled, micronutrientProfile,
micronutrientTargets (with load-time migration guards).

API fetching of micronutrient data is intentionally deferred; the frontmatter
key scheme is the shared contract future fetchers will write into.
"@

git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) { Fail "Commit failed" }

# ── 3. Type check ───────────────────────────────────────────────────────────
Step "Type checking..."
npm run typecheck
if ($LASTEXITCODE -ne 0) { Fail "Type check failed. Fix errors before releasing." }

# ── 4. Bump version (minor — new feature) + update CHANGELOG ────────────────
Step "Bumping minor version and updating CHANGELOG..."
npx standard-version --release-as minor
if ($LASTEXITCODE -ne 0) { Fail "Version bump failed." }

# ── 5. Sync version to manifest.json ────────────────────────────────────────
Step "Syncing version to manifest.json..."
node sync-version.js
if ($LASTEXITCODE -ne 0) { Fail "Version sync failed." }

git add manifest.json
git commit -m "chore: sync version to manifest" --no-verify

# ── 6. Push (triggers GitHub Actions release) ───────────────────────────────
Step "Pushing to GitHub..."
git push --follow-tags origin main
if ($LASTEXITCODE -ne 0) { Fail "Push failed." }

$version = node -p "require('./package.json').version"
Write-Host "`n✓ v$version released! GitHub Actions is now building and publishing." -ForegroundColor Green
Write-Host "  https://github.com/JamesCliffordSpratt/macros/actions" -ForegroundColor DarkGray
Write-Host ""
Read-Host "Press Enter to close"
