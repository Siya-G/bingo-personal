# Backend tests (pytest)

These tests exercise the **real HTTP API** against a **separate SQLite file** so your day-to-day `bingo.db` is never touched.

## How to run

From the `backend/` directory:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest
```

Verbose output:

```bash
pytest -v
```

## What gets tested

The file `test_game_flow.py` walks through the main Bingo lifecycle:

| Test | What it checks |
|------|----------------|
| `test_01_*` | Creating a game returns an ID and joinable `game_code`. |
| `test_02_*` | Host can generate **25** Bingo items (with `X-Host-Pin`). |
| `test_03_*` | Card generation needs players + items; succeeds when both exist. |
| `test_04_*` | Player join returns a **session token** and card payload. |
| `test_05_*` | `call-next` is rejected until the host **starts** the game. |
| `test_06_*` | Players cannot toggle a cell until that item has been **called**. |
| `test_07_*` | Bingo claim returns **400** before the pattern is complete, then **200** when valid. |
| `test_08_*` | Leaderboard lists the winner after a successful claim. |
| `test_09_*` | After **three** different players win, the game status is **COMPLETED**. |
| `test_10_*` | Unknown game code on join → **404**. |
| `test_11_*` | Duplicate display name in the same room → **409**. |
| `test_12_*` | Generating cards without 25 items → **400** mentioning the requirement. |
| `test_item_generation_mock_failure_*` | Reserved topic simulates generator failure → **503**. |
| `test_audit_trail_requires_host_pin` | Audit list requires `X-Host-Pin`. |

Configuration lives in `conftest.py` (database URL + clean tables per test) and `pytest.ini` (Python path).
