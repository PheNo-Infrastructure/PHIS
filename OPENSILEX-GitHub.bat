@echo off
:: OpenSILEX GitHub Installation Launcher
:: Simple Windows batch file to launch the PowerShell script

echo ============================================
echo    OpenSILEX GitHub Installation Manager   
echo ============================================
echo.

:: Check if PowerShell is available
powershell -Command "Write-Host 'PowerShell is available'" >nul 2>&1
if errorlevel 1 (
    echo ERROR: PowerShell is not available or not working properly.
    echo Please ensure PowerShell is installed and functioning.
    pause
    exit /b 1
)

:: Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

:: Launch the PowerShell script with menu
echo Starting OpenSILEX GitHub Installation Manager...
echo.

:: Launch PowerShell script
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%OPENSILEX-GitHub.ps1" -Command Menu

:: Keep window open if there was an error
if errorlevel 1 (
    echo.
    echo An error occurred. Check the output above for details.
    pause
)

:: End of script