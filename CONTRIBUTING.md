# Contributing

Thanks for helping improve **DRAFT**.

## Local setup

1. Copy `.env.example` → `.env` and fill secrets locally (never commit `.env`).
2. Backend: create a venv, `pip install -r backend/requirements.txt`, run uvicorn from `backend/`.
3. Frontend: `cd frontend && npm install && npm run dev`.

Docker: `docker compose up --build` (reads the same `.env`).

### Environment variables

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | JWT signing secret (required in production) |
| `DATABASE_URL` | SQLite (default) or PostgreSQL |
| `ADMIN_EMAIL` | Comma-separated emails for the Admin tab |
| `OPPONENT_ANALYSIS_EMAILS` | Comma-separated emails for Opponent Analysis (dropdown + report) |
| `LIQUIPEDIA_API_KEY` | Liquipedia LPDB v3 key (Pro Analysis enrichment) |
| `LIQUIPEDIA_USER_AGENT` / `LIQUIPEDIA_CONTACT` | Identifying User-Agent (Liquipedia ToS) |

**Secrets never go into GitHub.**

- **Local:** `.env` next to `docker-compose.yml`
- **Deployed site:** set the same names on the **api** service (Coolify / host secrets), then restart

Optional: `LIQUIPEDIA_CONTACT=https://github.com/you/repo` builds a default User-Agent if `LIQUIPEDIA_USER_AGENT` is unset.

## Liquipedia rules (important)

- Use the **API**, never scrape HTML pages.
- Credit Liquipedia (CC-BY-SA) next to displayed Liquipedia data, with a backlink (footer + Pro Analysis + Draft Preview tournament insights).
- Keep API keys out of git; each deployer uses their own key.
- Free LPDB plan is rate-limited (~60 requests/hour) — prefer cache reuse and **incremental** tournament sync (`POST /api/tournament-stats/sync`).
- When the project is live, send Liquipedia a link so they can verify attribution.

### Tournament registry & sync

- Preset → Liquipedia mapping: [`config/tournament-registry.json`](config/tournament-registry.json) (`aliases`, `liquipediaParent`, `stages`).
- Server cache tables store matches, aoe2cm draft IDs from Liquipedia, and map/civ + ban/pick aggregates.
- Sync is incremental (new/changed matches + missing draft IDs only) and capped per run so free LPDB quota is not exhausted in one shot.
- Ban/pick quality depends on editors filling `|draft=` / `|mapdraft=` on Liquipedia match templates.
- Docker API image includes `config/` (compose build context is the repo root).

## Pull requests

- Keep changes focused.
- Update `docs/USER-MANUAL.md` / `docs/FEATURE-DOCUMENTATION.md` when behavior changes.
- Do not commit secrets, local databases, or personal `.env` files.
