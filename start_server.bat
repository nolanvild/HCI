@echo off
REM HCI System Startup Script for Windows
REM This script helps start both Ollama and the HCI server

echo.
echo ============================================
echo    HCI System - Multi-Modal AI Interface
echo ============================================
echo.

REM Check if Ollama is already running
echo Checking if Ollama is running on localhost:11434...
timeout /t 1 /nobreak >nul

curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Ollama is running
) else (
    echo [WARNING] Ollama does not appear to be running
    echo.
    echo Please start Ollama first. You can:
    echo 1. Navigate to F:\Ollama and run your Ollama installation
    echo 2. Or run: ollama serve
    echo.
    echo Waiting for Ollama to start...
    timeout /t 5
)

echo.
echo Starting HCI Server...
echo Server will be available at: http://localhost:8000
echo.

cd /d "%~dp0"

REM Activate virtual environment and start server
call .venv\Scripts\activate.bat
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000

pause
