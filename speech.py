from faster_whisper import WhisperModel
import io
import logging
import threading
import struct

logger = logging.getLogger(__name__)

# Lazy-loaded model (only downloads when first needed)
model = None

# Progress tracking
progress_state = {
    "status": "idle",  # idle, downloading, transcribing, complete, error
    "progress": 0,  # 0-100
    "message": "",
}
progress_lock = threading.Lock()


def update_progress(status: str, progress: int, message: str = ""):
    """Thread-safe progress update"""
    with progress_lock:
        progress_state["status"] = status
        progress_state["progress"] = progress
        progress_state["message"] = message
        logger.info(f"Progress: {status} - {progress}% - {message}")


def get_progress():
    """Get current progress state"""
    with progress_lock:
        return progress_state.copy()


def get_model():
    """
    Get or initialize the Whisper model (lazy loading).
    Downloads on first call only.
    """
    global model
    if model is None:
        update_progress("downloading", 0, "Downloading Whisper model...")
        try:
            logger.info("Loading faster-whisper model (base, int8)...")
            model = WhisperModel("base", device="cpu", compute_type="int8")
            update_progress("idle", 100, "Model loaded successfully")
            logger.info("✓ Whisper model loaded successfully")
        except Exception as e:
            update_progress("error", 0, f"Model download failed: {str(e)}")
            logger.error(f"✗ Failed to load Whisper model: {e}", exc_info=True)
            raise
    return model


def validate_audio_data(audio_data: bytes) -> bool:
    """
    Validate that audio data appears to be valid WAV format.
    """
    if len(audio_data) < 44:  # Minimum WAV header size
        logger.warning(f"Audio data too small: {len(audio_data)} bytes")
        return False
    
    # Check for RIFF header
    if audio_data[:4] != b'RIFF':
        logger.warning(f"Audio data doesn't start with RIFF: {audio_data[:4]}")
        return False
    
    # Check for WAVE format
    if audio_data[8:12] != b'WAVE':
        logger.warning(f"Audio data doesn't have WAVE format: {audio_data[8:12]}")
        return False
    
    logger.info(f"✓ Audio data appears to be valid WAV format")
    return True


def transcribe_audio(audio_data: bytes) -> str:
    """
    Transcribe audio data to text using faster-whisper.

    Args:
        audio_data (bytes): Raw audio bytes (WAV format expected)

    Returns:
        str: Transcribed text
    """
    try:
        update_progress("transcribing", 5, "Validating audio...")
        
        # Validate audio
        if not validate_audio_data(audio_data):
            logger.warning("Audio validation failed, attempting transcription anyway...")

        update_progress("transcribing", 10, "Loading model...")

        # Get the model (lazy loads if needed)
        whisper_model = get_model()

        update_progress("transcribing", 20, "Preparing audio...")

        # Convert bytes to file-like object for whisper
        audio_file = io.BytesIO(audio_data)

        update_progress("transcribing", 30, "Transcribing audio...")
        logger.info(f"Starting transcription of {len(audio_data)} bytes...")

        # Transcribe with language specification
        segments, info = whisper_model.transcribe(
            audio_file, 
            language="en",
            beam_size=5,
            best_of=5
        )

        update_progress("transcribing", 75, "Processing results...")

        # Combine all segments into single text
        transcript_parts = []
        for segment in segments:
            if segment.text.strip():
                transcript_parts.append(segment.text)
        
        full_text = " ".join(transcript_parts).strip()

        logger.info(f"✓ Transcription completed")
        logger.info(f"  - Language detected: {info.language}")
        logger.info(f"  - Confidence: {info.language_probability:.2%}")
        logger.info(f"  - Result: {full_text[:100] if full_text else '[EMPTY]'}")

        update_progress("transcribing", 95, "Finalizing...")
        update_progress("complete", 100, "Transcription complete!")
        
        return full_text

    except Exception as e:
        update_progress("error", 0, f"Transcription error: {str(e)}")
        logger.error(f"✗ Error transcribing audio: {str(e)}", exc_info=True)
        raise
