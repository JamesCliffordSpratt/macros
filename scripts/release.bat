@echo off
setlocal enabledelayedexpansion

echo.
echo ================================================
echo    Obsidian Macros Plugin Release Script
echo ================================================
echo.

REM === Step 1: Choose version bump type ===
echo ================================================
echo           VERSION BUMP GUIDELINES
echo ================================================
echo.
echo 🔧 PATCH (x.x.X) - Bug fixes and small improvements:
echo   • 🐛 Bug fixes
echo   • 🔧 Performance improvements  
echo   • 📝 Documentation updates
echo   • 🎨 UI/UX tweaks (no functionality changes)
echo   • 🌐 Adding translations/localization
echo   • 🧹 Code cleanup/refactoring
echo   • 🔒 Security patches
echo.
echo ✨ MINOR (x.X.0) - New features (backward compatible):
echo   • ✨ New features or commands
echo   • 🎛️ New settings/configuration options
echo   • 📊 New chart types or visualization options
echo   • 🔌 New integrations (APIs, plugins)
echo   • ⚡ New shortcuts or hotkeys
echo   • 📱 New UI components or views
echo   • 🎯 Enhancements to existing features
echo.
echo 💥 MAJOR (X.0.0) - Breaking changes:
echo   • 💥 Removing features or commands
echo   • 🔄 Changing existing behavior significantly
echo   • 📝 Changing data formats or file structures
echo   • ⚙️ Changing configuration format
echo   • 🔧 Changing how the plugin is used fundamentally
echo   • 🚫 Dropping support for Obsidian versions
echo.
echo ================================================
echo Quick Decision: Breaking changes? → MAJOR
echo                 New features? → MINOR
echo                 Fixes/improvements? → PATCH
echo ================================================
echo.
set /p BUMP=Choose version bump type (patch/minor/major): 

REM Validate input
if /i "%BUMP%"=="patch" goto :valid_bump
if /i "%BUMP%"=="minor" goto :valid_bump
if /i "%BUMP%"=="major" goto :valid_bump
echo ERROR: Invalid bump type. Please use 'patch', 'minor', or 'major'
pause
exit /b 1

:valid_bump
echo.
echo ================================================
echo Step 1/8: Running type check...
echo ================================================
call npm run typecheck
if %errorlevel% neq 0 (
    echo ERROR: Type checking failed. Please fix errors before releasing.
    pause
    exit /b %errorlevel%
)

echo.
echo ================================================
echo Step 2/8: Bumping version (%BUMP%)...
echo ================================================
npx standard-version --release-as %BUMP%
if %errorlevel% neq 0 (
    echo ERROR: Version bump failed
    pause
    exit /b %errorlevel%
)

echo.
echo ================================================
echo Step 3/8: Syncing version to manifest.json...
echo ================================================
node sync-version.js
if %errorlevel% neq 0 (
    echo ERROR: Failed to sync version to manifest.json
    pause
    exit /b %errorlevel%
)

echo.
echo ================================================
echo Step 4/8: Building plugin for production...
echo ================================================
call node esbuild.config.mjs production
if %errorlevel% neq 0 (
    echo ERROR: Production build failed
    pause
    exit /b %errorlevel%
)

echo.
echo ================================================
echo Step 5/8: Committing manifest.json...
echo ================================================
git add manifest.json
git commit -m "chore: sync version to manifest" --no-verify
if %errorlevel% neq 0 (
    echo WARNING: Commit may have failed (might be nothing to commit)
)

echo.
echo ================================================
echo Step 6/8: Getting version information...
echo ================================================
FOR /F "delims=" %%i IN ('node -p "require(\"./package.json\").version"') DO set VERSION=%%i
echo Current version: %VERSION%

echo.
echo ================================================
echo Step 7/8: Pushing to GitHub...
echo ================================================
echo Pushing code and tags to origin/main...
git push --follow-tags origin main
if %errorlevel% neq 0 (
    echo ERROR: Failed to push to GitHub
    pause
    exit /b %errorlevel%
)

echo.
echo ================================================
echo Step 8/8: Creating GitHub release...
echo ================================================
echo.
echo Please provide release notes for version %VERSION%:
echo (Press Enter twice when finished)
echo.

REM Collect multi-line release notes
set "NOTES="
set "line="
:input_loop
set /p line="> "
if "!line!"=="" (
    if defined NOTES (
        goto :done_input
    )
) else (
    if defined NOTES (
        set "NOTES=!NOTES! !line!"
    ) else (
        set "NOTES=!line!"
    )
)
goto :input_loop
:done_input

echo.
echo Creating GitHub release %VERSION%...
gh release create %VERSION% main.js manifest.json styles.css --title "%VERSION%" --notes "!NOTES!"
if %errorlevel% neq 0 (
    echo ERROR: Failed to create GitHub release
    echo You can manually create it later with:
    echo gh release create %VERSION% main.js manifest.json styles.css --title "%VERSION%" --notes "!NOTES!"
    pause
    exit /b %errorlevel%
)

echo.
echo ================================================
echo           🎉 RELEASE SUCCESSFUL! 🎉
echo ================================================
echo.
echo ✅ Version bumped to: %VERSION%
echo ✅ Plugin built for production
echo ✅ Code pushed to GitHub
echo ✅ GitHub release created
echo.
echo Your plugin release v%VERSION% is now live!
echo Users can update through Obsidian's Community Plugins tab.
echo.
pause