@echo off
echo ======================================================================
echo Clean Kadal — Windows Setup Script (Python 3.10 & Node.js)
echo ======================================================================

echo [1/4] Checking Python 3.10 installation...
py -3.10 --version
if errorlevel 1 (
    echo [!] Python 3.10 launcher not found. Trying 'python --version'...
    python --version
)

echo [2/4] Setting up Python virtual environment...
if not exist "venv" (
    echo [*] Creating virtual environment 'venv'...
    py -3.10 -m venv venv
) else (
    echo [✓] Virtual environment 'venv' already exists.
)

echo [3/4] Installing backend dependencies...
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r backend\requirements.txt

echo [4/4] Installing frontend dependencies...
cd frontend
call npm install
cd ..

echo ======================================================================
echo [✓] Clean Kadal setup completed successfully!
echo To start the backend:  run scripts\start_backend.bat
echo To start the frontend: run scripts\start_frontend.bat
echo ======================================================================
pause
