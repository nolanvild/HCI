from faster_whisper import WhisperModel
import io
import logging
import threading

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
            model = WhisperModel("base", device="cpu", compute_type="int8")
            update_progress("idle", 100, "Model loaded successfully")
            logger.info("Whisper model loaded successfully")
        except Exception as e:
            update_progress("error", 0, f"Model download failed: {str(e)}")
            raise
    return model


def transcribe_audio(audio_data: bytes) -> str:
    """
    Transcribe audio data to text using faster-whisper.

    Args:
        audio_data (bytes): Raw audio bytes (WAV format expected)

    Returns:
        str: Transcribed text
    """
    try:
        update_progress("transcribing", 5, "Loading model...")

        # Get the model (lazy loads if needed)
        whisper_model = get_model()

        update_progress("transcribing", 15, "Preparing audio...")

        # Convert bytes to file-like object for whisper
        audio_file = io.BytesIO(audio_data)

        update_progress("transcribing", 25, "Transcribing audio...")

        # Transcribe
        segments, info = whisper_model.transcribe(audio_file, language="en")

        update_progress("transcribing", 75, "Processing results...")

        # Combine all segments into single text
        full_text = " ".join(segment.text for segment in segments)

        update_progress("transcribing", 95, "Finalizing...")
        logger.info(f"Transcription completed. Detected language: {info.language}")

        update_progress("complete", 100, "Transcription complete!")
        return full_text

    except Exception as e:
        update_progress("error", 0, f"Transcription error: {str(e)}")
        logger.error(f"Error transcribing audio: {str(e)}")
        raise
