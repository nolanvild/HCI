# AI Agent Interface

A simple web interface for interacting with an AI agent, featuring image capture and audio recording with automatic speech-to-text transcription.

## Features

- 📷 **Image Capture**: Capture images from your webcam at the click of a button
- 🎙️ **Audio Recording**: Record audio with visual recording indicator
- 📝 **Speech-to-Text**: Automatic audio transcription using faster-whisper
- 🎨 **Minimalist UI**: Clean, sleek design with rose gold accents

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

Or if using `uv`:

```bash
uv pip install -r requirements.txt
```

### 2. Start the Backend Server

```bash
python server.py
```

The server will run on `http://localhost:8000`

### 3. Open the Web Interface

Open `web/index.html` in your browser or serve it with a local server:

```bash
# Using Python 3
python -m http.server 8001 --directory web

# Or using uv
uv run python -m http.server 8001 --directory web
```

Then navigate to `http://localhost:8001`

## How to Use

1. **Start Recording**: Click the "Start" button to capture an image and begin recording audio
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
