@echo off
echo ======================================================================
echo Launching Clean Kadal Research Backend (FastAPI + OpenCV)
echo ======================================================================
cd /d "%~dp0\.."

if not exist "venv\Scripts\python.exe" (
    echo [!] Virtual environment not found. Running setup first...
    call scripts\setup_windows.bat
)

echo [*] Starting FastAPI server on http://127.0.0.1:8000 ...
.\venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
pause
