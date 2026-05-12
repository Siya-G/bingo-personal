"""
Pytest configuration for the Bingo API.

IMPORTANT: The test database URL must be set before any ``app.*`` import so
SQLAlchemy binds to the test file instead of your development ``bingo.db``.
"""

from __future__ import annotations

import os
from pathlib import Path

# Dedicated SQLite file for pytest (never the dev ./bingo.db from .env).
_TEST_DB_PATH = Path(__file__).resolve().parent / ".pytest_bingo.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH.as_posix()}"
# Tests never call OpenAI; keep deterministic mock generation unless a test overrides.
os.environ.setdefault("USE_MOCK_LLM", "true")

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def _remove_stale_test_db_file() -> None:
    """Start from a clean file once per test session."""
    if _TEST_DB_PATH.exists():
        _TEST_DB_PATH.unlink()
    yield


@pytest.fixture(autouse=True)
def reset_database_tables() -> None:
    """Each test runs against empty tables."""
    import app.models  # noqa: F401 - register ORM models
    from app.database.connection import Base, create_database_tables, engine

    Base.metadata.drop_all(bind=engine)
    create_database_tables()
    yield


@pytest.fixture
def client() -> TestClient:
    """HTTP client wired to the FastAPI app and test database."""
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Remove the SQLite file after the full test session."""
    if _TEST_DB_PATH.exists():
        try:
            _TEST_DB_PATH.unlink()
        except OSError:
            pass
