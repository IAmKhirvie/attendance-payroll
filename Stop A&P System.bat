@echo off
REM =============================================
REM Attendance & Payroll System - Stop Script (Windows)
REM Double-click this file to stop the system
REM =============================================

set FRONTEND_PORT=4000
set BACKEND_PORT=8000

cls
echo ==============================================
echo    Stopping Attendance ^& Payroll System
echo ==============================================
echo.

echo Stopping Backend (port %BACKEND_PORT%)...
set "found=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%BACKEND_PORT%" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    set "found=1"
)
if "%found%"=="1" (
    echo   Backend stopped.
) else (
    echo   Backend was not running.
)

echo Stopping Frontend (port %FRONTEND_PORT%)...
set "found=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%FRONTEND_PORT%" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    set "found=1"
)
if "%found%"=="1" (
    echo   Frontend stopped.
) else (
    echo   Frontend was not running.
)

echo.
echo ==============================================
echo    System has been stopped.
echo ==============================================
echo.
pause
