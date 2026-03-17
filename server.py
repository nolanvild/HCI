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
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("server.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
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
        "progress": get_progress(),
    }


@app.get("/status")
async def status():
    """Get comprehensive system status"""
    from context import get_connection_status

    ai_status = get_connection_status()
    return {
        "server_status": "running",
        "ai": ai_status,
        "transcription": get_progress(),
    }


@app.get("/test-ollama")
async def test_ollama():
    """Test Ollama connectivity and streaming"""
    ollama_client = get_ai_client()

    if ollama_client is None:
        logger.error("AI client not initialized")
        return {"status": "error", "message": "AI client not initialized"}

    try:
        logger.info("Testing Ollama connectivity with simple prompt...")

        tokens_received = []
        async for token in ollama_client.stream_response(
            prompt="Say 'Hello, I am working!' in one sentence only.",
            image_data=None,
            use_history=False,
        ):
            tokens_received.append(token)
            logger.info(f"  Token: {repr(token)}")

        full_response = "".join(tokens_received)
        return {
            "status": "success",
            "model": ollama_client.model,
            "tokens_count": len(tokens_received),
            "response": full_response,
        }
    except Exception as e:
        logger.error(f"✗ Ollama test failed: {e}", exc_info=True)
        return {
            "status": "error",
            "error": str(e),
            "model": ollama_client.model if ollama_client else None,
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

        logger.info(
            f"Received audio file: {file.filename} ({len(audio_data)} bytes, type: {file.content_type})"
        )

        # Run transcription in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        transcript = await loop.run_in_executor(executor, transcribe_audio, audio_data)

        logger.info(
            f"✓ Transcription successful: {transcript[:100] if transcript else 'EMPTY'}"
        )

        return JSONResponse(
            {"success": True, "transcript": transcript, "filename": file.filename}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"✗ Error in transcribe endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")


# WebSocket for real-time AI interaction
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Simple WebSocket endpoint for real-time AI conversation.
    No buffering - processes messages immediately.
    """
    await websocket.accept()
    logger.info("✓ WebSocket connection established")

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

    # Send connection confirmation
    await websocket.send_json(
        {
            "type": "status",
            "content": f"Connected. Using model: {ollama_client.model}",
        }
    )
    logger.info(f"✓ Client connected. Ready to receive messages.")

    try:
        # Simple message loop - process each message immediately
        while True:
            logger.info("🔄 Waiting for message (timeout=1s)...")
            try:
                # Wait for next message with short timeout to prevent hanging
                data = await asyncio.wait_for(websocket.receive_json(), timeout=1.0)
                logger.info(f"✅ MESSAGE RECEIVED! Data keys: {list(data.keys())}")
            except asyncio.TimeoutError:
                # No message received - just continue waiting
                logger.debug("⏱️ Timeout - no message received")
                continue
            except Exception as e:
                logger.error(f"💥 Error receiving message: {e}", exc_info=True)
                break

            msg_type = data.get("type")
            content = data.get("content", "")

            logger.info(
                f"📨 WebSocket received: type={msg_type}, content_length={len(str(content))}"
            )

            # Handle different message types
            if msg_type == "text":
                logger.info(f"💬 Processing text: {content[:100]}...")
                logger.info(f"   About to call stream_response...")

                try:
                    # Stream response directly from Ollama
                    token_count = 0
                    full_response = ""

                    logger.info(
                        f"🤖 Calling Ollama model with prompt: {content[:50]}..."
                    )
                    logger.info(f"   ⏳ Starting stream from Ollama...")

                    stream_iterator = ollama_client.stream_response(
                        prompt=content, image_data=None, use_history=True
                    )
                    logger.info(f"   ✓ Stream iterator created")

                    async for token in stream_iterator:
                        token_count += 1
                        logger.info(
                            f"   📥 Token {token_count}: {repr(token[:20] if token else 'EMPTY')}"
                        )
                        # Send each token immediately as it arrives
                        try:
                            payload = {"type": "response", "content": token}
                            logger.info(
                                f"   📤 Sending token {token_count} via WebSocket..."
                            )
                            await websocket.send_json(payload)
                            logger.info(f"   ✅ Token {token_count} sent successfully")
                        except Exception as e:
                            logger.error(f"Error sending token {token_count}: {e}")
                            break

                        full_response += token
                        if token_count % 5 == 0:
                            logger.info(f"   📊 Progress: {token_count} tokens sent")

                    logger.info(
                        f"✅ Response complete: {token_count} tokens total. Content: {full_response[:100]}..."
                    )

                except Exception as e:
                    logger.error(f"✗ Error calling Ollama: {e}", exc_info=True)
                    try:
                        await websocket.send_json(
                            {"type": "error", "content": f"Model error: {str(e)}"}
                        )
                    except Exception as send_err:
                        logger.error(f"Failed to send error message: {send_err}")

            elif msg_type == "transcript":
                logger.info(f"🎙️ Processing transcript: {content[:100]}...")
                await websocket.send_json(
                    {
                        "type": "status",
                        "content": f"Transcript received: {content[:50]}...",
                    }
                )

            elif msg_type == "image":
                logger.info(f"🖼️ Processing image...")
                try:
                    if content.startswith("data:"):
                        content = content.split(",")[1]
                    image_bytes = base64.b64decode(content)
                    logger.info(f"   ✓ Image decoded ({len(image_bytes)} bytes)")
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
                logger.info("🔄 Resetting conversation...")
                await ollama_client.reset_conversation()
                await websocket.send_json(
                    {"type": "status", "content": "Conversation reset"}
                )

            else:
                logger.warning(f"Unknown message type: {msg_type}")

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
