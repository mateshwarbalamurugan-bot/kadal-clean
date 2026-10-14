@echo off
echo ======================================================================
echo Launching Clean Kadal React Research Interface (Vite)
echo ======================================================================
cd /d "%~dp0\..\frontend"

echo [*] Starting Vite development server on http://localhost:3000 ...
call npm run dev -- --port 3000
pause
