"""
Ollama client for interfacing with local LLM models.
Handles streaming responses and multi-modal input (text + images).
"""

import httpx
import json
import logging
import base64
from typing import AsyncIterator, Optional, List
from io import BytesIO
from PIL import Image

logger = logging.getLogger(__name__)

# Ollama API endpoint (running locally)
OLLAMA_BASE_URL = "http://localhost:11434"

# Model selection - LLaVA for vision capabilities
MODEL_NAME = (
    "llava"  # Change to "mistral" or "neural-chat" if you don't have llava installed
)
FALLBACK_MODEL = "mistral"

# System prompt for the AI
SYSTEM_PROMPT = """You are a helpful AI assistant in a real-time conversation. 
You have access to the user's camera feed, audio transcriptions, and typed text.
If the user shows you an image, analyze it and provide context-aware responses.
Keep responses concise and natural - as if you're talking to a human.
When appropriate, ask clarifying questions about what the user is showing you.
Maintain awareness of the conversation context."""


class OllamaClient:
    """Client for interacting with Ollama locally running models."""

    def __init__(self, base_url: str = OLLAMA_BASE_URL, model: str = MODEL_NAME):
        self.base_url = base_url
        self.model = model
        self.client = httpx.AsyncClient(timeout=180.0)
        self.conversation_history = []

        # Verify model is available on init
        self._model_verified = False

    async def verify_model(self) -> bool:
        """Check if the model is available, fallback if needed."""
        if self._model_verified:
            return True

        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            if response.status_code != 200:
                logger.warning(
                    f"Could not verify model availability: {response.status_code}"
                )
                return False

            tags = response.json().get("models", [])
            available_models = [m["name"].split(":")[0] for m in tags]

            logger.info(f"Available models: {available_models}")

            # Check if preferred model is available
            if any(self.model in m for m in available_models):
                self._model_verified = True
                logger.info(f"Using model: {self.model}")
                return True

            # Fallback to first available model or default
            if available_models:
                self.model = available_models[0].split(":")[0]
                logger.info(f"Falling back to model: {self.model}")
                self._model_verified = True
                return True
            else:
                logger.error("No models available in Ollama")
                return False

        except Exception as e:
            logger.error(f"Error verifying model: {e}")
            return False

    def _encode_image(self, image_data: bytes) -> str:
        """
        Encode image bytes to base64 string for API.

        Args:
            image_data: Raw image bytes (JPEG)

        Returns:
            Base64 encoded string
        """
        return base64.b64encode(image_data).decode("utf-8")

    def _prepare_image_for_llava(self, image_data: bytes) -> bytes:
        """
        Prepare image for LLaVA model (ensure proper format and size).

        Args:
            image_data: Raw image bytes

        Returns:
            Processed image bytes in JPEG format
        """
        try:
            # Open image
            img = Image.open(BytesIO(image_data))

            # Convert to RGB if needed (remove alpha channel)
            if img.mode in ("RGBA", "LA", "P"):
                rgb_img = Image.new("RGB", img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = rgb_img

            # Resize if too large (keep aspect ratio)
            max_size = 1024
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # Convert to JPEG bytes
            output = BytesIO()
            img.save(output, format="JPEG", quality=85)
            return output.getvalue()

        except Exception as e:
            logger.error(f"Error processing image: {e}")
            # Return original if processing fails
            return image_data

    async def stream_response(
        self,
        prompt: str,
        image_data: Optional[bytes] = None,
        use_history: bool = True,
    ) -> AsyncIterator[str]:
        """
        Stream a response from the model token-by-token.

        Args:
            prompt: User's text input
            image_data: Optional image bytes (JPEG)
            use_history: Whether to include conversation history

        Yields:
            Response tokens as they arrive
        """
        try:
            # Verify model is available
            if not self._model_verified:
                if not await self.verify_model():
                    yield "ERROR: Could not connect to Ollama. Please ensure Ollama is running on localhost:11434"
                    return

            # Build messages with history
            messages = []

            if use_history:
                messages.extend(self.conversation_history)

            # Create user message
            user_message = {"role": "user", "content": prompt}

            # Add image if provided and model supports it
            if image_data is not None and self.model == "llava":
                try:
                    processed_image = self._prepare_image_for_llava(image_data)
                    encoded_image = self._encode_image(processed_image)
                    user_message["images"] = [encoded_image]
                    logger.info(
                        f"Added image to message (encoded size: {len(encoded_image)} chars)"
                    )
                except Exception as e:
                    logger.warning(f"Could not include image: {e}")

            messages.append(user_message)

            # Stream response
            full_response = ""
            async with self.client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": True,
                    "system": SYSTEM_PROMPT,
                },
            ) as response:
                if response.status_code != 200:
                    yield f"ERROR: Model request failed ({response.status_code})"
                    return

                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            token = data.get("message", {}).get("content", "")
                            if token:
                                full_response += token
                                yield token
                        except json.JSONDecodeError:
                            continue

            # Add to history for context
            self.conversation_history.append(user_message)
            self.conversation_history.append(
                {"role": "assistant", "content": full_response}
            )

            # Keep only last 10 exchanges (to manage memory)
            if len(self.conversation_history) > 20:
                self.conversation_history = self.conversation_history[-20:]

        except Exception as e:
            logger.error(f"Error streaming response: {e}")
            yield f"ERROR: {str(e)}"

    async def reset_conversation(self):
        """Clear conversation history."""
        self.conversation_history = []
        logger.info("Conversation history cleared")

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


# Global client instance
_ollama_client: Optional[OllamaClient] = None


def get_ollama_client() -> OllamaClient:
    """Get or create the global Ollama client."""
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = OllamaClient()
    return _ollama_client
