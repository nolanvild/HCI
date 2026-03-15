#!/usr/bin/env pwsh
# HCI System Startup Script for PowerShell
# Run with: powershell -ExecutionPolicy Bypass -File start_server.ps1

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "   HCI System - Multi-Modal AI Interface" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# Check if Ollama is running
Write-Host "Checking Ollama connection on localhost:11434..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -Method GET -ErrorAction Stop
    Write-Host "[✓] Ollama is running and responding" -ForegroundColor Green
    
    $models = $response.Content | ConvertFrom-Json
    Write-Host "Available models:" -ForegroundColor Green
    $models.models | ForEach-Object { Write-Host "  - $($_.name)" }
} catch {
    Write-Host "[✗] Ollama is not responding on localhost:11434" -ForegroundColor Red
    Write-Host "`nPlease start Ollama first:" -ForegroundColor Yellow
    Write-Host "  1. Open a new PowerShell window" -ForegroundColor Gray
    Write-Host "  2. Navigate to F:\Ollama" -ForegroundColor Gray
    Write-Host "  3. Run your Ollama installation" -ForegroundColor Gray
    Write-Host "  4. Or run: ollama serve" -ForegroundColor Gray
    Write-Host "`nWaiting 10 seconds before starting server..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "Starting HCI Server..." -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "📍 Server: http://localhost:8000" -ForegroundColor Cyan
Write-Host "📍 API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Cyan

# Navigate to project directory
Set-Location $PSScriptRoot

# Activate virtual environment
& .\.venv\Scripts\Activate.ps1

# Start server
Write-Host "Initializing server..." -ForegroundColor Green
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000 --log-level info

# Keep window open on error
Read-Host "Press Enter to close"
