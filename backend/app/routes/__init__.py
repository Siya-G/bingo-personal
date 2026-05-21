"""API route modules."""

from app.routes.admin import router as admin_router
from app.routes.chat import router as chat_router
from app.routes.games import router as games_router
from app.routes.health import router as health_router
from app.routes.prize import router as prize_router
from app.routes.voice import router as voice_router
from app.routes.voice_audio import router as voice_audio_router
from app.routes.websocket import router as websocket_router

__all__ = [
    "admin_router",
    "chat_router",
    "games_router",
    "health_router",
    "prize_router",
    "voice_router",
    "voice_audio_router",
    "websocket_router",
]
