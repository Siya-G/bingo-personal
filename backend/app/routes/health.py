from fastapi import APIRouter, HTTPException, status

from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Confirm that the API process is running."""
    return {"status": "ok"}


@router.get("/debug/config")
async def debug_config() -> dict[str, bool | str | int]:
    """Local dev only: OpenAI-related flags (never exposes the API key)."""
    if settings.environment != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    return {
        "use_mock_llm": settings.use_mock_llm,
        "openai_model": settings.openai_model,
        "openai_api_key_present": bool(settings.openai_api_key.strip()),
        "bingo_item_pool_size": settings.bingo_item_pool_size,
        "bingo_card_cell_count": settings.bingo_card_cell_count,
    }
