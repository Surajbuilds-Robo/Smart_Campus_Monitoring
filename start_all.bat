@echo off
setlocal enabledelayedexpansion

title Smart Campus Launcher
echo ===================================================
echo     SMART CAMPUS CCTV - SYSTEM LAUNCHER
echo ===================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: Determine Python executable for ai-service (.venv if present, otherwise system python)
set "PYTHON_EXE=python"
if exist "%ROOT_DIR%ai-service\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%ROOT_DIR%ai-service\.venv\Scripts\python.exe"
    echo [AI Service] Using virtual environment: !PYTHON_EXE!
) else (
    echo [AI Service] Using system Python
)

echo.
echo [1/3] Starting Backend API (Port 5000)...
start "Smart Campus - Backend (Port 5000)" /D "%ROOT_DIR%backend" cmd /k "echo [Backend] Running on http://localhost:5000 ... && node server.js"

echo [2/3] Starting AI Vision Edge Service (Port 8000)...
start "Smart Campus - AI Vision Service (Port 8000)" /D "%ROOT_DIR%ai-service" cmd /k "echo [AI Service] Running on http://localhost:8000 ... && "!PYTHON_EXE!" main.py"

echo [3/3] Starting Frontend Dashboard (Port 5173)...
start "Smart Campus - Frontend (Port 5173)" /D "%ROOT_DIR%frontend" cmd /k "echo [Frontend] Running on http://localhost:5173 ... && npm.cmd run dev"

echo.
echo ===================================================
echo  All 3 services have been launched!
echo    - Frontend UI:    http://localhost:5173
echo    - Backend API:    http://localhost:5000
echo    - AI Service:     http://localhost:8000
echo ===================================================
echo Opening frontend in browser in 3 seconds...
timeout /t 3 /nobreak >nul
start http://localhost:5173
