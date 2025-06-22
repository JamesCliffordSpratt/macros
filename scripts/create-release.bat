@echo off
setlocal enabledelayedexpansion

echo.
echo === Step 1: Typechecking...
call npm run typecheck
if %errorlevel% neq 0 (
    echo ERROR: Typechecking failed
    exit /b %errorlevel%
)

echo.
echo === Step 2: Building plugin...
call node esbuild.config.mjs production
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    exit /b %errorlevel%
)

echo.
echo === Step 3: Getting version from package.json...
FOR /F "delims=" %%i IN ('node -p "require(\"./package.json\").version"') DO set VERSION=%%i
echo Detected version: %VERSION%

echo.
echo === Step 4: Prompting for release notes...
set /p NOTES=Enter release notes: 
echo Notes: %NOTES%

echo.
echo === Step 5: Creating GitHub release (published)...
gh release create %VERSION% main.js manifest.json styles.css --title "%VERSION%" --notes "%NOTES%"

echo.
echo Release v%VERSION% created and published!
pause
