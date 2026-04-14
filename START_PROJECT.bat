@echo off
title AI-Powered Scientific Research Assistant

echo =========================================
echo  AI-Powered Scientific Research Assistant
echo =========================================
echo.

:: Kill any old server processes on ports 8002 and 5173
echo [0/2] Stopping any running servers...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8002 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: --- Start Backend ---
echo [1/2] Starting Backend (FastAPI)...
start "Backend - FastAPI" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate && uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload"

:: Wait before launching frontend
timeout /t 4 /nobreak >nul

:: --- Start Frontend ---
echo [2/2] Starting Frontend (React/Vite)...
start "Frontend - Vite" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo =========================================
echo  Both servers are starting!
echo.
echo  Backend:  http://localhost:8002
echo  Frontend: http://localhost:5173
echo  API Docs: http://localhost:8002/docs
echo =========================================
echo.
echo You can close this window.
pause
