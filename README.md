# HCI: Multi-Modal AI Interface

A real-time, multi-modal conversation system with integrated image capture, audio recording, and text input - all flowing through a single persistent AI connection.

## ✨ Key Features

- 📷 **Real-time Camera Feed** - Continuous webcam capture and analysis
- 🎙️ **Audio Recording** - Real-time voice recording with visual indicators  
- 📝 **Speech-to-Text** - Automatic transcription via Whisper (OpenAI)
- 🤖 **Multi-Modal AI** - LLaVA or Mistral models for vision + language understanding
- 🔄 **Unified Pipeline** - Text, audio, and camera all integrated into one conversation
- ⚡ **Single Connection** - One persistent AI connection shared across all inputs (not separate connections)
- 🏠 **100% Local** - Runs entirely on your machine using Ollama + Whisper

## System Architecture (NEW!)

```
Browser UI
├─ Camera → Buffer
├─ Audio → Transcribe → Buffer  
└─ Text → Buffer
    ↓
Unified Input Buffer
    ↓
Persistent AI Client (initialized once at startup)
    ↓
Ollama (Local LLM)
```

**Key Improvement**: Instead of creating a new AI connection for each WebSocket connection, we now:
1. Initialize ONE persistent Ollama client at server startup
2. Verify the connection is ready
3. Share that connection across ALL WebSocket clients
4. Buffer all inputs (text, transcriptions, images) together
5. Send them as a unified context to the AI

## 🚀 Quick Start

### Prerequisites

1. **Ollama** - Download from https://ollama.ai
   - Install or extract to `F:\Ollama`
   - Should run on `localhost:11434`

2. **Python** - 3.10+ (recommended 3.13+)

3. **A Model** - Pull a model in Ollama:
   ```powershell
   ollama pull llava        # Full vision support (recommended)
   # or
   ollama pull mistral      # Smaller, faster (fallback)
   ```

### Installation

```powershell
# Clone or navigate to project
cd F:\Projects\HCI

# Create virtual environment (if not already done)
python -m venv .venv

# Activate it
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### Start the System

**Terminal 1 - Start Ollama:**
```powershell
cd F:\Ollama
# Run Ollama (or use ollama serve if installed globally)
```

**Terminal 2 - Start HCI Server:**
```powershell
cd F:\Projects\HCI
.\.venv\Scripts\Activate.ps1
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Or use the convenience script:
```powershell
.\start_server.ps1
```

**Open Browser:**
```
http://localhost:8000
```

## 📱 How to Use

1. **Connect**: Click "Connect" to establish WebSocket connection
2. **Capture**: 
   - Take a picture (click video preview)
   - Record and transcribe audio (click "Start Recording")
   - Type messages directly
3. **Chat**: All inputs are combined and sent to the AI
4. **Reset**: Click "Reset" to clear conversation history

## 🔧 Configuration

Edit `.env` to customize:

```env
# Server
PORT=8000

# Ollama setup
OLLAMA_URL=http://localhost:11434
```

## 📊 Status Endpoints

- `GET /` - Health check
- `GET /health` - Detailed server status + AI connection status
- `GET /status` - Comprehensive diagnostics  
- `GET /progress` - Transcription progress
- `POST /transcribe` - Manual transcription endpoint
- `WS /ws` - WebSocket for real-time conversation

## 🐛 Troubleshooting

### "AI connection not available"
- ✓ Start Ollama first: `ollama serve`
- ✓ Verify it's running: `curl http://localhost:11434/api/tags`
- ✓ Check `.env` has correct `OLLAMA_URL`

### Audio transcription is empty
- ✓ First transcription downloads model (~140MB) - be patient
- ✓ Check server logs for "model.loaded successfully"
- ✓ Check browser console for upload errors

### Server won't start / hangs
- ✓ Ollama must be running BEFORE server starts
- ✓ Wait for "✓ AI connection established..." message
- ✓ Kill and restart if hung > 30 seconds

### Camera/Microphone permission denied
- ✓ Browser will ask for permissions - click "Allow"
- ✓ Check browser settings: Privacy → Camera/Microphone

### No models appear in Ollama
- ✓ While Ollama is running: `ollama pull llava`
- ✓ Verify: `ollama list`
- ✓ Restart HCI server

## 📁 Project Structure

```
F:\Projects\HCI
├─ server.py           # FastAPI backend (initialized once)
├─ context.py          # Persistent connection manager
├─ speech.py           # Whisper transcription
├─ ollama_client.py    # Ollama API wrapper
├─ vision.py           # (Future image processing)
├─ requirements.txt    # Python dependencies
├─ .env                # Configuration
├─ SETUP_GUIDE.md      # Detailed setup guide
├─ start_server.ps1    # Startup script (PowerShell)
├─ start_server.bat    # Startup script (Batch)
└─ web/
   ├─ index.html       # Frontend
   ├─ script.js        # Client logic
   └─ style.css        # Styling
```

## 📚 Recent Changes (March 2026)

### Persistent AI Connection ✓
- Ollama client now initialized **once** at server startup
- NOT created per WebSocket connection (old behavior)
- Shared across all clients
- See `context.py` for lifecycle management

### Unified Input Pipeline ✓
- Text, audio, and camera feed combined into single buffer
- All inputs sent together to AI
- No more separate connection streams

### Better Logging ✓  
- Detailed startup logs with timestamps
- Audio validation and format checking
- Transcription progress tracking
- Error messages with full context

### Configuration ✓
- Ollama URL configurable via `.env`
- Support for local F:\Ollama installation

See `SETUP_GUIDE.md` for comprehensive details.

## 🔌 API Documentation

### WebSocket Message Format

```javascript
// Text message
{ "type": "text", "content": "Hello AI" }

// Audio transcription
{ "type": "transcript", "content": "What time is it?" }

// Camera image (base64)
{ "type": "image", "content": "data:image/jpeg;base64,..." }

// Reset conversation
{ "type": "reset" }
```

### Response Format

```javascript
{ "type": "status", "content": "Processing..." }
{ "type": "response", "content": "Token stream..." }
{ "type": "error", "content": "Error message" }
```

## 📦 Dependencies

- **FastAPI** - Web framework
- **Uvicorn** - ASGI server
- **Ollama HTTP API** - Local LLM access
- **faster-whisper** - Speech-to-text
- **pillow** - Image processing
- **httpx** - Async HTTP client

See `requirements.txt` for versions.

## 🎯 Performance Notes

- **Startup**: ~2-3 seconds (Ollama verification)
- **First Transcription**: ~10-30 seconds (model download)
- **Subsequent Transcriptions**: ~2-5 seconds
- **AI Response**: Depends on model (typically 1-10 seconds for Mistral)
- **Image Analysis**: ~2-5 seconds with LLaVA

## 📝 License

See LICENSE file

---

**Questions?** Check `SETUP_GUIDE.md` for detailed troubleshooting and architecture explanation.

2. **Stop Recording**: Click "Stop Recording" to end the audio recording
3. **View Results**: Your captured image and audio will appear below with automatic transcription

## Security

- **API Keys**: Store sensitive information in `.env` file (never commit to git)
- **`.gitignore`**: Prevents accidental commit of `.env` and other sensitive files
- All API keys and secrets should be added to `.env`

## Configuration

Edit `.env` to configure:

- `PORT`: Server port (default: 8000)
- `DEBUG`: Enable debug mode (default: False)

## Architecture

- **Frontend**: HTML5, CSS3, JavaScript with Web APIs (MediaStream, Canvas, Web Audio)
- **Backend**: FastAPI with faster-whisper for speech-to-text
- **Model**: "base" Whisper model (can be changed in `speech.py`)

## Troubleshooting

### CORS Error

If you see CORS errors, ensure the frontend is accessing `http://localhost:8000`

### Audio Not Recording

Check browser permissions for microphone access

### Transcription Not Working

1. Ensure the backend server is running (`python server.py`)
2. Check the browser console for errors
3. Verify faster-whisper is installed correctly

## Future Enhancements

- [ ] Support for multiple languages
- [ ] Custom model selection (tiny, small, medium, large)
- [ ] Audio/video playback history
- [ ] Export transcripts to file
- [ ] Real-time transcription
