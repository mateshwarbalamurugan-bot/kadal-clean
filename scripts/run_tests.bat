@echo off
echo ======================================================================
echo Running Clean Kadal Backend Test Suite
echo ======================================================================
cd /d "%~dp0\.."

.\venv\Scripts\python.exe -m pytest -v
pause
