@echo off
REM =============================================
REM Attendance & Payroll System - First Time Setup (Windows)
REM Run this ONCE when moving to a new device
REM =============================================

setlocal enabledelayedexpansion

REM Get the directory where this script is located
cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"

cls
echo ==============================================
echo    A^&P System - First Time Setup (Windows)
echo ==============================================
echo.
echo This will install all required dependencies.
echo Make sure you have the following installed:
echo   - Python 3.8+ (with pip)
echo   - Node.js 18+ (with npm)
echo.
echo Download links if needed:
echo   Python: https://www.python.org/downloads/
echo   Node.js: https://nodejs.org/
echo.
pause
echo.

REM =============================================
REM Setup Backend
REM =============================================
echo ==============================================
echo Setting up Backend...
echo ==============================================
cd /d "%SCRIPT_DIR%backend"

REM Check Python
where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH!
    echo Please install Python 3.8+ first.
    echo Download: https://www.python.org/downloads/
    echo.
    echo IMPORTANT: During installation, check "Add Python to PATH"
    pause
    exit /b 1
)

echo Python found:
python --version
echo.

echo Creating Python virtual environment...
python -m venv venv
if errorlevel 1 (
    echo ERROR: Failed to create virtual environment!
    pause
    exit /b 1
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing Python dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies!
    pause
    exit /b 1
)

echo.
echo Backend setup complete!
echo.

REM =============================================
REM Setup Frontend
REM =============================================
echo ==============================================
echo Setting up Frontend...
echo ==============================================
cd /d "%SCRIPT_DIR%frontend"

REM Check Node
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH!
    echo Please install Node.js 18+ first.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js found:
node --version
echo.

echo Installing Node.js dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install Node.js dependencies!
    pause
    exit /b 1
)

echo Building frontend...
call npm run build
if errorlevel 1 (
    echo WARNING: Frontend build had issues, but may still work.
)

echo.
echo Frontend setup complete!
echo.

echo ==============================================
echo    SETUP COMPLETE!
echo ==============================================
echo.
echo You can now run "Launch A&P System.bat"
echo to start the system.
echo.
pause
