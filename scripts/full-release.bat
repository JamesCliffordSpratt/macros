@echo off
setlocal enabledelayedexpansion

REM === Step 1: Choose version bump type ===
echo.
set /p BUMP=Choose version bump (patch / minor / major): 

REM === Step 2: Run standard-version ===
echo.
echo === Bumping version with standard-version --release-as %BUMP%...
npx standard-version --release-as %BUMP%
if %errorlevel% neq 0 (
    echo ERROR: Version bump failed
    exit /b %errorlevel%
)

REM === Step 3: Sync version to manifest.json ===
echo.
echo === Syncing version to manifest.json...
node sync-version.js
if %errorlevel% neq 0 (
    echo ERROR: sync-version.js failed
    exit /b %errorlevel%
)

REM === Step 4: Commit manifest.json ===
git add manifest.json
git commit -m "chore: sync version to manifest" --no-verify

REM === Step 5: Push code and tags ===
git push --follow-tags origin main

REM === Step 6: Prompt for release notes ===
echo.
set /p NOTES=Enter release notes: 

REM === Step 7: Get version number from package.json ===
FOR /F "delims=" %%i IN ('node -p "require(\"./package.json\").version"') DO set VERSION=%%i
echo Detected version: v%VERSION%

REM === Step 8: Create GitHub release ===
gh release create v%VERSION% main.js manifest.json styles.css --title "v%VERSION%" --notes "%NOTES%"
if %errorlevel% neq 0 (
    echo ERROR: GitHub release failed
    exit /b %errorlevel%
)

echo.
echo ✅ Release v%VERSION% created and published!
pause
