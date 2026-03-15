# HCI System - Setup & Troubleshooting Guide

## What Was Fixed

### 1. **Persistent AI Connection ✓**
- **Before**: New Ollama connection created for EACH WebSocket connection (inefficient)
- **After**: Single persistent AI connection initialized at server startup, shared by all clients
- Created `context.py` to manage the AI connection lifecycle
- Server now verifies Ollama availability ONCE on startup

### 2. **Unified Multi-Modal Pipeline ✓**  
- Text input, camera feed, and audio transcription all flow through the SAME persistent AI connection
- No more separate connections for different input types
- All inputs buffered together and sent to AI as a cohesive context

### 3. **Improved Audio Transcription ✓**
- Added better logging and debugging to `speech.py`
- Audio validation to detect format issues early
- Better error messages with full stack traces
- Supports multiple beam search parameters for better accuracy

### 4. **Better Configuration ✓**
- Ollama URL is now configurable via `.env` file
- Environment variable: `OLLAMA_URL=http://localhost:11434`
- Fallback to environment defaults if not specified

---

## BEFORE YOU START: Prerequisites

### Step 1: Make Sure Ollama is Running

Ollama needs to be running on `localhost:11434` before the server starts.

**Option A: Run Ollama from F:/Ollama (your local installation)**
```powershell
# Navigate to your Ollama directory
cd F:\Ollama

# Run Ollama (it starts on port 11434)
# Exact command depends on your Ollama installation structure
```

**Option B: Start Ollama if installed globally**
```powershell
ollama serve
```

**Option C: Check if running**
```powershell
curl http://localhost:11434/api/tags
```

If you see a JSON response with available models, Ollama is running ✓

---

### Step 2: Make Sure You Have a Model

The system looks for **LLaVA** (with vision support) by default.

```powershell
# While Ollama is running, pull a model:
ollama pull llava

# Or use mistral as fallback:
ollama pull mistral
```

Check available models:
```powershell
curl http://localhost:11434/api/tags | findstr -i "name"
```

---

## How to Start

### Start Ollama First (in one terminal):
```powershell
cd F:\Ollama
# Run your Ollama installation
```

### Start the HCI Server (in another terminal):
```powershell
cd F:\Projects\HCI
.\.venv\Scripts\python.exe -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Or use the simplified run:
```powershell
cd F:\Projects\HCI
.\.venv\Scripts\python.exe server.py
```

### Open the Web Interface:
```
http://localhost:8000
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│           Web Browser (Frontend)                     │
│  - Camera capture                                    │
│  - Audio recording                                   │
│  - Text input                                        │
└────────────────────┬────────────────────────────────┘
                     │
                     │ WebSocket /ws
                     │
┌────────────────────▼────────────────────────────────┐
│        FastAPI Server (server.py)                    │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  Persistent AI Connection (initialized once)   │ │
│  │  ├─ Ollama Client (context.py)                │ │
│  │  ├─ Shared conversation history               │ │
│  │  └─ Single model instance                     │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  Three input types → ONE pipeline             │ │
│  │  ├─ Text input (typed)                        │ │
│  │  ├─ Transcript (from audio via Whisper)       │ │
│  │  ├─ Camera image (base64 encoded)             │ │
│  │  └─ All combined in conversation buffer       │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  Endpoints:                                          │
│  ├─ GET  /         - Health check                   │
│  ├─ GET  /health   - Detailed status                │
│  ├─ GET  /status   - Comprehensive diagnostics      │
│  ├─ GET  /progress - Transcription progress         │
│  ├─ POST /transcribe - Audio to text (Whisper)      │
│  └─ WS   /ws       - Real-time AI conversation      │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┴────────────┬─────────────┐
        │                         │             │
        ▼                         ▼             ▼
    Ollama                  Whisper          Vision
   (Local LLM)         (Audio to Text)    (Image Analysis)
   localhost:11434                          (via LLaVA)
```

---

## Troubleshooting

### Issue: "AI connection not available"
**Cause**: Ollama isn't running or isn't accessible on `localhost:11434`
**Solution**: 
1. Start Ollama in terminal: `ollama serve`
2. Verify: `curl http://localhost:11434/api/tags`
3. Restart the HCI server

### Issue: Audio transcription returns empty
**Cause**: Whisper model not downloaded, or audio format issue
**Solution**:
1. Check server logs for "Model loading..." messages
2. First transcription downloads the model (takes time)
3. Try again - should work after model is cached
4. Check server output for audio validation errors

### Issue: Server won't start / hangs
**Cause**: Usually waiting for Ollama connection verification
**Solution**:
1. Make sure Ollama is running FIRST
2. Check that port 11434 is accessible: `curl http://localhost:11434/api/tags`
3. Kill server and try again

### Issue: "No models available in Ollama"
**Cause**: No models downloaded yet
**Solution**:
1. While Ollama is running, pull a model: `ollama pull llava` (or `mistral`)
2. Verify: `curl http://localhost:11434/api/tags`
3. Restart HCI server

### Issue: Camera/microphone permission denied
**Cause**: Browser permissions
**Solution**:
1. When browser asks for camera/microphone permission, click "Allow"
2. Or check: Settings → Privacy → Camera/Microphone → Allow localhost

---

## Key Improvements Made

| Aspect | Before | After |
|--------|--------|-------|
| AI Connections | One per WebSocket | One persistent |
| Startup Time | Verification per connection | Verification once at startup |
| Configuration | Hardcoded URLs | Environment variables |
| Error Messages | Minimal logging | Detailed with timestamps |
| Audio Debug | Silent failures | Full debug output |
| Status Endpoints | Basic only | ✓ `/health` ✓ `/status` ✓ `/progress` |
| Architecture | Multiple pipelines | Single unified pipeline |

---

## File Changes Summary

- ✅ `context.py` - Created (manages AI connection lifecycle)
- ✅ `server.py` - Refactored (uses persistent connection, better logging)
- ✅ `speech.py` - Enhanced (better audio validation & debugging)
- ✅ `ollama_client.py` - Updated (environment variables)
- ✅ `.env` - Updated (OLLAMA_URL configuration)

---

## Next Steps

1. **Start Ollama**: Open terminal 1 and run Ollama
2. **Start Server**: Open terminal 2 and run the HCI server
3. **Test**: Open browser to `http://localhost:8000`
4. **Check Logs**: Watch server terminal for status messages
5. **First transcription**: Will download Whisper model on first use (be patient)

---

*Last updated: March 14, 2026*
