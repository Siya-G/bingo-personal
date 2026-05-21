import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import BACKEND_ENV_FILE, settings
from app.database.connection import create_database_tables
from app.routes import (
    admin_router,
    chat_router,
    games_router,
    health_router,
    prize_router,
    voice_audio_router,
    voice_router,
    websocket_router,
)
from app.services.smtp_mailer import log_smtp_startup_status
from app.services.websocket_manager import set_broadcast_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Run startup tasks for the API application."""
    logger.info(
        "Config snapshot (no secrets): use_mock_llm=%s openai_model=%s "
        "openai_api_key_present=%s bingo_item_pool_size=%s bingo_card_cell_count=%s "
        "env_file=%s env_file_exists=%s",
        settings.use_mock_llm,
        settings.openai_model,
        bool(settings.openai_api_key.strip()),
        settings.bingo_item_pool_size,
        settings.bingo_card_cell_count,
        str(BACKEND_ENV_FILE),
        BACKEND_ENV_FILE.is_file(),
    )
    create_database_tables()
    log_smtp_startup_status(settings)
    set_broadcast_loop(asyncio.get_running_loop())
    yield


def _format_validation_detail(errors: list) -> str:
    parts: list[str] = []
    for err in errors:
        loc = err.get("loc") or ()
        tail = [str(x) for x in loc if str(x) not in ("body",)]
        ctx = ".".join(tail) if tail else "request"
        msg = err.get("msg", "Invalid value")
        parts.append(f"{ctx}: {msg}")
    return "; ".join(parts) if parts else "Request could not be validated."


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    The app entry point owns cross-cutting HTTP concerns such as CORS and route
    registration. Feature behavior should live in routes and services.

    Before production: replace header PIN/session checks with a real identity
    provider, short-lived tokens, rate limits, and audited admin APIs.
    """
    app = FastAPI(
        title=settings.app_name,
        description="Backend API for the AI-powered Bingo web application.",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": _format_validation_detail(exc.errors())},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(games_router)
    app.include_router(admin_router)
    app.include_router(prize_router)
    app.include_router(voice_router)
    app.include_router(voice_audio_router)
    app.include_router(chat_router)
    app.include_router(websocket_router)

    return app


app = create_app()
