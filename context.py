"""
Context management for the HCI system.
Manages persistent connections and shared resources.
"""

import asyncio
import logging
from typing import Optional
from ollama_client import OllamaClient, MODEL_NAME, FALLBACK_MODEL

logger = logging.getLogger(__name__)

# Global AI client - singleton
_ai_client: Optional[OllamaClient] = None


async def initialize_ai_connection() -> bool:
    """
    Initialize the AI connection at server startup.
    This should only be called ONCE when the server starts.
    
    Returns:
        bool: True if connection successful, False otherwise
    """
    global _ai_client
    
    if _ai_client is not None:
        logger.warning("AI client already initialized")
        return True
    
    logger.info("Initializing AI connection...")
    try:
        _ai_client = OllamaClient()
        is_ready = await _ai_client.verify_model()
        
        if is_ready:
            logger.info(f"✓ AI connection established. Using model: {_ai_client.model}")
            return True
        else:
            logger.error("✗ Could not verify AI model availability")
            return False
            
    except Exception as e:
        logger.error(f"✗ Failed to initialize AI connection: {e}")
        return False


def get_ai_client() -> Optional[OllamaClient]:
    """
    Get the persistent AI client.
    Returns None if not initialized - call initialize_ai_connection() first.
    """
    return _ai_client


async def shutdown_ai_connection():
    """
    Cleanup AI connection on server shutdown.
    """
    global _ai_client
    
    if _ai_client is not None:
        logger.info("Shutting down AI connection...")
        try:
            await _ai_client.close()
        except Exception as e:
            logger.error(f"Error closing AI connection: {e}")
        _ai_client = None


def get_connection_status() -> dict:
    """Get current connection status."""
    if _ai_client is None:
        return {
            "connected": False,
            "model": None,
            "message": "AI connection not initialized"
        }
    
    return {
        "connected": True,
        "model": _ai_client.model,
        "message": f"Connected to {_ai_client.model}"
    }
