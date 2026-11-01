@echo off
title Smart Campus - Stop Services
echo ===================================================
echo     SMART CAMPUS CCTV - STOPPING ALL SERVICES
echo ===================================================
echo.

echo Terminating running services on ports 5000, 8000, 5173...

for %%P in (5000 8000 5173) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%P" ^| findstr "LISTENING"') do (
        echo Stopping process on port %%P (PID %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo.
echo ===================================================
echo  All services on ports 5000, 8000, 5173 stopped!
echo ===================================================
timeout /t 3
