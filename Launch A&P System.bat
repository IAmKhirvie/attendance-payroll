@echo off
REM =============================================
REM Attendance & Payroll System Launcher (Windows)
REM Double-click this file to start the system
REM =============================================

setlocal enabledelayedexpansion

REM Get the directory where this script is located
cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"

set FRONTEND_PORT=4000
set BACKEND_PORT=8000

cls
echo ==============================================
echo    Attendance ^& Payroll System Launcher
echo ==============================================
echo.

REM Get local IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set "LOCAL_IP=%%b"
    )
)
echo Your Local IP: %LOCAL_IP%
echo.

REM Check if Python virtual environment exists
if not exist "%SCRIPT_DIR%backend\venv" (
    echo ERROR: Python virtual environment not found!
    echo Please run "First Time Setup.bat" first.
    echo.
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "%SCRIPT_DIR%frontend\node_modules" (
    echo ERROR: Node modules not found!
    echo Please run "First Time Setup.bat" first.
    echo.
    pause
    exit /b 1
)

REM Kill any existing processes on the ports
echo Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%BACKEND_PORT%" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%FRONTEND_PORT%" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

REM Start Backend
echo Starting Backend API...
cd /d "%SCRIPT_DIR%backend"
start "A&P Backend" /min cmd /c "call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port %BACKEND_PORT%"
echo   Backend starting...

REM Wait for backend to be ready
timeout /t 3 /nobreak >nul

REM Start Frontend
echo Starting Frontend...
cd /d "%SCRIPT_DIR%frontend"
start "A&P Frontend" /min cmd /c "npm run build && npm run preview -- --host 0.0.0.0 --port %FRONTEND_PORT%"
echo   Frontend starting...

timeout /t 5 /nobreak >nul

echo.
echo ==============================================
echo    SYSTEM IS RUNNING!
echo ==============================================
echo.
echo Open in browser:
echo.
echo   From THIS computer:
echo     http://localhost:%FRONTEND_PORT%
echo.
echo   From OTHER devices on the network:
echo     http://%LOCAL_IP%:%FRONTEND_PORT%
echo.
echo   API Documentation:
echo     http://%LOCAL_IP%:%BACKEND_PORT%/docs
echo.
echo ==============================================
echo.
echo To STOP the system, run "Stop A&P System.bat"
echo or close the Backend and Frontend windows.
echo.
pause
