# Backend

FastAPI backend for the AI Bingo application.

## Folder Purpose

- `app/main.py` - FastAPI application factory and route registration entry point.
- `app/routes/` - HTTP API route modules grouped by resource or feature.
- `app/services/` - Application service layer for orchestration and business workflows.
- `app/models/` - Persistence models. Prepared for future SQLAlchemy ORM models.
- `app/database/` - Database session, engine, and migration-related utilities.
- `app/config.py` - Environment-driven application settings loaded from `.env`.
- `app/schemas/` - Pydantic request and response schemas.
- `app/utils/` - Shared backend helpers that are not tied to a single feature.

SQLite is the initial database target. The database package uses SQLAlchemy engine/session wiring so it can later point at PostgreSQL through `DATABASE_URL`.

## Local Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Copy `.env.example` to `.env` when local settings need to be customized.

## Tests

Automated API tests use **pytest** and a dedicated SQLite file (`tests/.pytest_bingo.db` — ignored by git). They never use your development `bingo.db`.

```bash
pip install -r requirements.txt
pytest
```

See `tests/README.md` for a table of what each test covers.

## Demo seed

For a pre-filled **Famous mountains** game with 25 mock items and three sample players, run from this directory:

```bash
source .venv/bin/activate
# Optional: DEMO_HOST_PIN=my-pin-1234 (default demo-host-1234)
PYTHONPATH=. python scripts/seed_demo_game.py
```

The script prints game ID, code, host PIN, and each player’s session token. See the root `README.md` for full demo flow and `DATABASE_URL` notes.
