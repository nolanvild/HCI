from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from speech import transcribe_audio, get_progress
from context import initialize_ai_connection, shutdown_ai_connection, get_ai_client
import os
from dotenv import load_dotenv
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import base64
from datetime import datetime
from contextlib import asynccontextmanager

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Thread pool for running transcriptions
executor = ThreadPoolExecutor(max_workers=2)


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle - initialize connections on startup,
    clean up on shutdown.
    """
    logger.info("=" * 60)
    logger.info("Starting HCI Server...")
    logger.info("=" * 60)
    
    # Startup
    ai_ready = await initialize_ai_connection()
    if not ai_ready:
        logger.warning("⚠ AI connection failed - continuing anyway. Check Ollama.")
    
    yield
    
    # Shutdown
    logger.info("Server shutting down...")
    await shutdown_ai_connection()
    logger.info("Shutdown complete.")


# Initialize FastAPI app with lifespan
app = FastAPI(lifespan=lifespan)

# Add CORS middleware to allow requests from the web interface
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================== DIAGNOSTIC ENDPOINTS ==================

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "Server is running", "version": "1.0"}


@app.get("/health")
async def health():
    """Detailed health check"""
    from context import get_connection_status
    
    status = get_connection_status()
    return {
        "status": "ok",
        "server": "running",
        "ai_connection": status,
        "progress": get_progress()
    }


@app.get("/status")
async def status():
    """Get comprehensive system status"""
    from context import get_connection_status
    
    ai_status = get_connection_status()
    return {
        "server_status": "running",
        "ai": ai_status,
        "transcription": get_progress()
    }


@app.get("/progress")
async def progress():
    """Get current transcription progress"""
    return get_progress()


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """
    Transcribe audio file to text.

    Expected: Audio file (WAV, MP3, FLAC, etc.)
    Returns: JSON with transcribed text
    """
    try:
        # Read the uploaded file
        audio_data = await file.read()

        if not audio_data:
            raise HTTPException(status_code=400, detail="No audio data provided")

        logger.info(f"Received audio file: {file.filename} ({len(audio_data)} bytes, type: {file.content_type})")

        # Run transcription in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        transcript = await loop.run_in_executor(executor, transcribe_audio, audio_data)
        
        logger.info(f"✓ Transcription successful: {transcript[:100] if transcript else 'EMPTY'}")

        return JSONResponse(
            {"success": True, "transcript": transcript, "filename": file.filename}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"✗ Error in transcribe endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")


# WebSocket for real-time AI interaction
class ConversationBuffer:
    """Manages input buffering for continuous conversation."""

    def __init__(self, flush_timeout: float = 2.0, buffer_timeout: float = 1.5):
        self.buffer = []
        self.latest_image = None
        self.flush_timeout = flush_timeout
        self.buffer_timeout = buffer_timeout
        self.last_activity = datetime.now()

    def add_text(self, text: str):
        """Add text to buffer."""
        if text.strip():
            self.buffer.append({"type": "text", "content": text})
            self.last_activity = datetime.now()
            logger.info(f"Added text to buffer: {text[:50]}...")

    def add_transcript(self, transcript: str):
        """Add transcribed audio to buffer."""
        if transcript.strip():
            self.buffer.append({"type": "transcript", "content": transcript})
            self.last_activity = datetime.now()
            logger.info(f"Added transcript: {transcript[:50]}...")

    def set_image(self, image_data: bytes):
        """Update the latest image."""
        self.latest_image = image_data
        self.last_activity = datetime.now()
        logger.info(f"Updated image (size: {len(image_data)} bytes)")

    def should_flush(self) -> bool:
        """Check if buffer should be sent to model."""
        if not self.buffer:
            return False

        time_since_activity = (datetime.now() - self.last_activity).total_seconds()
        # Flush if silence for buffer_timeout or if error state
        return time_since_activity >= self.buffer_timeout

    def get_prompt(self) -> tuple[str, bytes | None]:
        """Get buffered content as a prompt and return image if available."""
        if not self.buffer:
            return "", None

        # Combine all text
        parts = []
        for item in self.buffer:
            if item["type"] in ("text", "transcript"):
                parts.append(item["content"])

        prompt = " ".join(parts)
        self.buffer = []  # Clear after getting

        image = self.latest_image
        return prompt, image


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time AI conversation.

    Client should send JSON messages:
    {
        "type": "text",           # User typed text
        "content": "hello"
    }
    {
        "type": "transcript",     # Audio transcription result
        "content": "what did you say"
    }
    {
        "type": "image",          # Base64 encoded camera frame
        "content": "data:image/jpeg;base64,..."
    }
    {
        "type": "reset",          # Reset conversation history
    }
    """
    await websocket.accept()
    logger.info("WebSocket connection established")

    buffer = ConversationBuffer()
    
    # Use the persistent AI client initialized at startup
    ollama_client = get_ai_client()
    
    if ollama_client is None:
        logger.error("AI client not initialized!")
        await websocket.send_json(
            {
                "type": "error",
                "content": "AI system not ready. Server may still be initializing.",
            }
        )
        await websocket.close()
        return

    try:
        await websocket.send_json(
            {
                "type": "status",
                "content": f"Connected. Using model: {ollama_client.model}",
            }
        )

        # Process incoming messages
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            content = data.get("content", "")

            if msg_type == "text":
                buffer.add_text(content)
                logger.info(f"Received text: {content[:50]}...")

            elif msg_type == "transcript":
                buffer.add_transcript(content)
                logger.info(f"Received transcript: {content[:50]}...")

            elif msg_type == "image":
                # Decode base64 image
                try:
                    # Remove data URL prefix if present
                    if content.startswith("data:"):
                        content = content.split(",")[1]

                    image_bytes = base64.b64decode(content)
                    buffer.set_image(image_bytes)

                    await websocket.send_json(
                        {
                            "type": "status",
                            "content": f"Image received ({len(image_bytes)} bytes)",
                        }
                    )
                except Exception as e:
                    logger.error(f"Error decoding image: {e}")
                    await websocket.send_json(
                        {"type": "error", "content": f"Image decode error: {str(e)}"}
                    )

            elif msg_type == "reset":
                await ollama_client.reset_conversation()
                buffer.buffer = []
                buffer.latest_image = None
                await websocket.send_json(
                    {"type": "status", "content": "Conversation reset"}
                )

            # Check if should flush buffer and send to model
            if buffer.should_flush():
                prompt, image = buffer.get_prompt()

                if prompt.strip():
                    logger.info(f"Flushing buffer to model: {prompt[:100]}...")

                    await websocket.send_json(
                        {"type": "status", "content": "Processing..."}
                    )

                    try:
                        # Stream response from Ollama
                        full_response = ""
                        async for token in ollama_client.stream_response(
                            prompt=prompt, image_data=image, use_history=True
                        ):
                            # Send each token as it arrives
                            await websocket.send_json(
                                {"type": "response", "content": token}
                            )
                            full_response += token

                        logger.info(f"✓ Response complete: {full_response[:100]}...")

                    except Exception as e:
                        logger.error(f"✗ Error getting response: {e}", exc_info=True)
                        await websocket.send_json(
                            {"type": "error", "content": f"Model error: {str(e)}"}
                        )

            # Small delay to prevent busy-waiting
            await asyncio.sleep(0.1)

    except Exception as e:
        logger.error(f"✗ WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_json(
                {"type": "error", "content": f"Connection error: {str(e)}"}
            )
        except:
            pass


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
