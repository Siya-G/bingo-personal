# Running on Windows

## Prerequisites

1. Install **Docker Desktop** from [docker.com](https://www.docker.com/products/docker-desktop/)
2. **Restart your laptop** after installation so Docker's virtualization backend activates

## Setup

3. Clone the repo or copy the project folder to your machine
4. Copy your `.env` file into the `backend/` folder:
   ```
   backend\.env
   ```
   *(The backend needs this for OpenAI, ElevenLabs, and SMTP keys)*

## Run

5. Open **PowerShell** in the project root (the folder that contains `docker-compose.yml`)
6. Run:
   ```powershell
   docker-compose up --build
   ```
   The first build takes a few minutes — Docker is installing Python/Node packages.
   Subsequent starts are fast because layers are cached.

7. Open your browser at **http://localhost:3000**

The API is available at **http://localhost:8000** (e.g. http://localhost:8000/docs for Swagger UI).

## Stop

Press **Ctrl + C** in the PowerShell window, then run:
```powershell
docker-compose down
```

## Data Persistence

| What | Where it lives |
|---|---|
| SQLite database (`bingo.db`) | Docker named volume `bingo_db` — survives `docker-compose down` |
| Voice samples & TTS cache | `backend/storage/` folder on your machine — always there |

To **wipe the database** and start fresh:
```powershell
docker-compose down -v
```

## Troubleshooting

- **Port already in use** — something else is using 3000 or 8000. Stop that process or change the ports in `docker-compose.yml`.
- **Docker Desktop not starting** — make sure Hyper-V / WSL 2 is enabled (Docker Desktop will prompt you during installation).
- **`.env` missing errors** — the app works without `.env` for basic features, but AI item generation and voice cloning require valid API keys in `backend/.env`.
