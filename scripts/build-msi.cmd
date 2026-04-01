@echo off
REM BitGit MSI Build Script (CMD wrapper)
REM Calls the PowerShell build script

echo ===================================================
echo BitGit MSI Builder
echo ===================================================
echo.

REM Check if PowerShell is available
where powershell >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: PowerShell not found!
    echo Please install PowerShell or use build-msi.ps1 directly
    pause
    exit /b 1
)

REM Run the PowerShell build script
powershell -ExecutionPolicy Bypass -File "%~dp0build-msi.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo Build complete!
pause
