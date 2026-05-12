"""API route modules."""

from app.routes.games import router as games_router
from app.routes.health import router as health_router
from app.routes.websocket import router as websocket_router

__all__ = ["games_router", "health_router", "websocket_router"]
