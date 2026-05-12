# AI Bingo Monorepo

Full-stack Bingo web app for **host-run live rooms**: mock “AI” word lists, player join, cards, host calls, marking, Bingo validation, leaderboard, WebSockets, audit trail, and on-screen prize notices (MVP).

## Project structure

| Path | Role |
|------|------|
| `frontend/` | Next.js (App Router), TypeScript, Vitest |
| `backend/` | FastAPI, SQLAlchemy, SQLite, Pydantic, pytest |
| `backend/scripts/seed_demo_game.py` | Optional **demo seed** (Famous mountains + 3 players) |

---

## Workplace demo flow (step by step)

Use this order when presenting to colleagues. For a **pre-filled room**, run the [demo seed script](#demo-seed-script) first, then pick up from host **Start game**.

1. **Host creates a game** — Host dashboard → create title, **topic** (e.g. *Famous mountains*), player count, winning pattern, and **host PIN** (saved in this browser tab for MVP).
2. **Host generates items** — Live Gameplay → **Generate items**. The **mock generator** returns 25 words and short descriptions (curated list for *Famous mountains*, otherwise placeholder text).
3. **Players join** — Join page → display name + **game code** from the host. Each player gets a **session token** (stored locally) and a **card**.
4. **Cards appear** — Player **Game** page loads the grid after join (or manual game/player ID + valid session for API-backed loads).
5. **Host starts the round** — Live Gameplay → **Start game** (requires host PIN).
6. **Agent calls words** — **Call next item** (host PIN). The **Bingo Agent** panel shows history; with narration on, the **browser TTS** reads the word (and description when enabled).
7. **Players mark** — Only **called** squares can be toggled; marks sync over the WebSocket.
8. **Player claims Bingo** — When the card matches the configured pattern with **marked + called** cells → **Bingo**. The server **validates** the claim.
9. **Leaderboard updates** — Valid wins appear on the **Leaderboard** (and host preview); live updates use the WebSocket.
10. **Prize notice (MVP)** — Winners see an on-screen congratulations line; host sees **Prize notifications** (no email/gift cards yet).
11. **Game completes** — After **three** distinct winners, status becomes **COMPLETED**; further calls and new claims are blocked appropriately.

**Navigation:** use the top **Home · Host · Join · Game · Leaderboard** links for the demo path.

---

## Local setup

### Prerequisites

- **Python** 3.11+ (3.12/3.13 tested)
- **Node.js** 20+ and npm

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**Database:** SQLite file is created automatically on first API start (`DATABASE_URL`, default `sqlite:///./bingo.db` in the backend folder). It is **not** PostgreSQL in this repo (see [Production / future](#production--future-work-not-in-this-mvp)).

**Environment:** copy `backend/.env.example` to `backend/.env` if you need overrides, e.g.:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite (or future Postgres) connection string |
| `CORS_ORIGINS` | JSON list of allowed browser origins |

**Run API:**

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
```

**Environment (optional):**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | API base URL (default `http://localhost:8000`) |

**Run UI:**

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

### Running tests

**Backend** (isolated DB file under `backend/tests/`, not your dev `bingo.db`):

```bash
cd backend
source .venv/bin/activate
pytest
```

**Frontend** (Vitest + Testing Library):

```bash
cd frontend
npm run test
```

More detail: `backend/tests/README.md`, `frontend/tests/README.md`.

---

## Demo seed script

Seeds **one** waiting game with topic **Famous mountains**, **25** mock items, and **three** joined players (Alex Summit, Jordan Ridge, Sam Valley). Prints **game ID**, **game code**, **host PIN**, and each player’s **session token** for QA or scripted checks.

```bash
cd backend
source .venv/bin/activate
# Optional: DEMO_HOST_PIN=my-pin-1234 (min 4 characters; default demo-host-1234)
PYTHONPATH=. python scripts/seed_demo_game.py
```

Uses the same `DATABASE_URL` as the API (default `./bingo.db`). Use a **copy** of your DB or a disposable `DATABASE_URL` if you do not want to alter an existing file. Re-running against the same DB creates **another** game row (multiple demos).

---

## MVP-ready vs production / future work

### MVP-ready (good for a local or VPN demo)

- Full **local game flow**: create → items → join → cards → start → call → mark → claim → leaderboard → completion after three wins  
- **Mock AI** item generation (no paid LLM keys)  
- **Browser TTS** narration for calls (host voice settings)  
- **WebSocket** live updates (single-server in-memory fan-out)  
- **Leaderboard** and host **leaderboard preview**  
- **Audit trail** (host PIN required)  
- **Prize notification** on-screen MVP + host list  
- **Host PIN** + **player session tokens** for basic gatekeeping (not enterprise SSO)

### Production / future work (not in this MVP)

- **Real LLM** integration (keys in server env / secret manager only — never in the browser bundle)  
- **Real host authentication** (OAuth2 / SSO, rotating sessions, RBAC)  
- **PostgreSQL** (or other managed DB), backups, migrations (Alembic)  
- **Email** winner / prize notifications  
- **Gift card** or payment workflows  
- **Deployment** (containers, CDN, TLS, CI/CD)  
- **Logging, metrics, tracing** (e.g. OpenTelemetry)  
- **Security hardening** (rate limits, WAF, CSP, audit retention policies)  

---

## Tests (summary)

| Suite | Command | Covers |
|--------|---------|--------|
| Backend | `cd backend && pytest` | HTTP API: create, items, cards, join + token, call rules, marking, Bingo, leaderboard, 3-winner completion, bad code, duplicate name, short item pool, mock generator failure, audit PIN |
| Frontend | `cd frontend && npm run test` | `ErrorMessage`, `LoadingState`, preview card grid, create-game submit, join flow |

Internal demo scaffold; extend as needed for your organization’s policies.
