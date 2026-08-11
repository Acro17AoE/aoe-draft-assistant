# DRAFT — Feature & Architecture Documentation

> **Audience:** Contributors, researchers, and operators  
> **Product:** DRAFT (*Decision-support for Ranking, Assignment, and Forecasting under Time constraints*)  
> **Language:** English

---

## 1. Problem and scope

**Age of Empires II: Definitive Edition** competitive play uses **Captain’s Mode**: map draft then civ draft on [aoe2cm.net](https://aoe2cm.net). Captains must track availability, apply map-specific civ knowledge, plan assignments, and often coordinate with teammates under time pressure.

**DRAFT** is a web companion that combines live draft state with prepared tier lists, assignment UI, results logging, local analysis, and optional **Pro Analysis** scouting.

### In scope

| Active | Notes |
|--------|--------|
| Map Draft tracking (live + manual modes) | Standard / 1-Map-Only / Select |
| Civ Draft board + recommendations | Tiers, pressure, assignment, Draft Preview |
| Preset tier management | TierMaker + Advanced pools |
| Results + Analysis | From saved games / draft links |
| Pro Analysis | Career, H2H, draft tendencies, Liquipedia enrichment |
| Cloud sync + shared sessions | Optional login |

### Out of scope

- Automated drafting / bots  
- Official aoe2cm affiliation  
- Betting or Liquipedia feature clones  
- Guaranteed verification that drafted civs were played in-game  

---

## 2. Architecture

```
Browser (React SPA)
  Tabs: Presets | Map | Civ | Results | Analysis | Pro Analysis | Settings
  localStorage + optional cloud docs + shared workspace
        │ REST / WebSocket
        ▼
FastAPI backend
  Auth (JWT), user documents, workspaces
  Draft WebSocket relay (aoe2cm)
  aoestats preset import
  Pro Analysis aggregation
  Liquipedia LPDB client (optional key)
        │
        ▼
SQLite (local) or PostgreSQL (production)
```

### Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, custom CSS |
| Backend | Python 3, FastAPI, SQLAlchemy, httpx |
| Auth | JWT + bcrypt |
| Live drafts | Backend Socket.IO → frontend WebSocket relay |
| Deploy | Docker Compose (`web` + `api`) |

### Key paths

| Path | Role |
|------|------|
| `frontend/src/pages/` | Main tabs |
| `frontend/src/lib/` | Domain logic (tiers, drafts, storage) |
| `backend/app/main.py` | App entry, draft WS, map analysis |
| `backend/app/liquipedia.py` | Official LPDB v3 client |
| `backend/app/pro_analysis.py` | Pro Analysis aggregation |
| `backend/app/aoe2cm.py` / `draft_stream.py` | Live draft fetch/stream |
| `backend/app/aoestats.py` | Ranked WR/PR → preset bundles |

---

## 3. Ranking model

- Tiers: **S, A, B, C, D, F** (`frontend/src/lib/tiers.ts`)
- Within-tier order: `tierRank` (left = stronger)
- Multi-map merge: settings (average / best / worst + override rules)
- Advanced pools: second sort key (`poolOrder`) within a tier
- Legacy `points` entries normalize to tiers on import

Data model (simplified):

```ts
MapPriorityPreset { id, name, mapName, entries[], advancedMode?, pools[], updatedAt }
CivPriorityEntry { civId, tier?, tierRank?, poolIds? }
PresetTournament { id, name, format, presets[], customMaps[], active? }
```

---

## 4. Feature modules

### 4.1 Presets

- Multiple tournaments; one **ACTIVE** drives Civ Draft
- TierMaker drag-and-drop; copy map↔map and tournament↔tournament
- JSON import/export; aoestats “Test 1v1 / TG” seed tournaments
- Advanced pools (Halb SO / Paladin / Flank defaults)

### 4.2 Map Draft

- **Standard:** aoe2cm map draft URL + exact team name
- **1-Map-Only / Select:** manual map slots without a map draft
- Session readiness gates Civ Draft
- **Draft Preview:** portfolio + pressure; single unique map is not repeated BoX times

### 4.3 Civ Draft

- Derives board from live civ draft + merged preset entries
- Map hub: assignment slots, pressure, Top 3 (hidden for single unique map)
- Available pool sorted by tier/pool; drag-and-drop assignment
- Preferences: colorblind, hide banned, hide opponent prediction, Top 3 mode

### 4.4 Results & Analysis

- Tournament → sets → games
- Analysis cards from saved games and optional linked drafts

### 4.5 Pro Analysis

Inputs: reference player, opponent, optional tournament, history scope.

Pipeline:

1. Resolve players on **aoe-elo**
2. Optionally enrich with **Liquipedia** player/tournament pages (LPDB)
3. Discover / cache tournaments via **aoe2recs** (+ local DB cache)
4. Pull linked **aoe2cm** drafts → pick/ban patterns
5. Build H2H, takeaways, cache stats

API: `GET /api/pro-analysis`

### 4.6 Auth, sync, workspaces

- Register/login → JWT
- User documents sync presets/results/settings
- Shared workspaces: invite link, Shared Presets, live draft docs
- Admin: `ADMIN_EMAIL` env → `user.is_admin` on `/api/auth/me` (no hardcoded emails in source)

---

## 5. External data sources

| Source | Access | Used for |
|--------|--------|----------|
| aoe2cm.net | Public draft/preset APIs + Socket.IO | Live drafts |
| aoestats.io | HTTPS API | Seed tier lists |
| aoe-elo.com | HTTPS | Pro career / events |
| aoe2recs.com | WebSocket dashboard API | Tournament brackets |
| **Liquipedia LPDB v3** | `Authorization: Apikey …` | Player/tournament metadata; tournament match games for Draft Preview cache |
| aoe2cm drafts (via LP `|draft=`) | Public draft API | Ban/pick rates + pick order for tournament insights |

### Tournament stats cache

- Registry: `config/tournament-registry.json` maps preset aliases → Liquipedia parent + stage pages.
- Sync: `POST /api/tournament-stats/sync?name=` (incremental LPDB matches + missing aoe2cm drafts).
- Read: `/api/tournament-stats/resolve`, `…/{slug}/maps/{map}`, `…/{slug}/drafts` (+ `/full`).
- UI: Draft Preview tournament strip + ban/pick rates modal (CC-BY-SA attribution).

### Liquipedia compliance

- **API only** — never scrape HTML wiki pages  
- Free plan ≈ **60 requests/hour** — sliding-window limiter + multi-hour response cache + incremental tournament sync  
- Custom **User-Agent** with contact (`LIQUIPEDIA_USER_AGENT` / `LIQUIPEDIA_CONTACT`)  
- **CC-BY-SA** attribution with backlink in Pro Analysis UI and Draft Preview tournament insights  
- Key via `LIQUIPEDIA_API_KEY` in local `.env` only  
- Status: `GET /api/liquipedia/status`  

When a deployment is public, operators should send Liquipedia a project link for verification (API terms).

---

## 6. Storage keys (browser)

| Domain | Personal | Shared session |
|--------|----------|----------------|
| Presets | yes | Shared Presets document |
| Results | yes | — |
| Map / civ session | yes | yes |
| Assignments | yes | yes |
| Settings / UI prefs | yes | — |
| Auth token | local | local |

---

## 7. Security notes

- Passwords: bcrypt  
- API auth: JWT Bearer  
- Workspace WS: token + membership check  
- Secrets: `.env` gitignored; ship `.env.example` only  
- CORS is permissive for self-host flexibility — tighten for production if needed  
- Draft IDs are effectively shared secrets when links are private  

---

## 8. Deployment

```bash
cp .env.example .env   # set AUTH_SECRET, optional LIQUIPEDIA_API_KEY / ADMIN_EMAIL
docker compose up --build
```

- `web` serves the SPA and proxies `/api` (and websockets) to `api`  
- Production: strong `AUTH_SECRET`; PostgreSQL recommended for multi-user  

---

## 9. Known limitations

1. Team name typos flip own/opponent sides  
2. Unmatched map names → empty recommendations  
3. Shared sessions are last-write-wins (no CRDT)  
4. Draft picks ≠ guaranteed played civs/maps  
5. Liquipedia free quota is tight — prefer cache; enrichment is optional  
6. Pro Analysis first run can be slow while tournaments are resolved and cached  

---

## 10. Implementation index

### Frontend
- `App.tsx` — tabs including Pro Analysis  
- `pages/ProAnalysisTab.tsx` — matchup UI + Liquipedia credit  
- `lib/draftPreview.ts`, `lib/priorities.ts`, `lib/tiers.ts`, `lib/pools.ts`  
- `components/CivDraftMapHub.tsx`, `DraftPreview.tsx`  

### Backend
- `liquipedia.py`, `routers/liquipedia_router.py`  
- `pro_analysis.py`, `routers/pro_analysis_router.py`  
- `aoe2cm.py`, `draft_stream.py`, `aoestats.py`, `aoe_elo.py`, `aoe2recs.py`  
- `admin_config.py` — env-driven admin emails  

---

## 11. Related docs

- [USER-MANUAL.md](USER-MANUAL.md)  
- [../README.md](../README.md)  
- [../CONTRIBUTING.md](../CONTRIBUTING.md)  
- [../LICENSE](../LICENSE)  

Age of Empires © Microsoft Corporation. DRAFT is unofficial.  
Liquipedia data is **CC-BY-SA** — credit with backlink when displayed.
