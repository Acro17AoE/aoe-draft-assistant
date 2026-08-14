# DRAFT — Feature & Architecture Documentation

> **Audience:** Contributors, researchers, and operators  
> **Product:** DRAFT (*Decision-support for Ranking, Assignment, and Forecasting under Time constraints*)  
> **Language:** English

---

## 1. Problem and scope

**Age of Empires II: Definitive Edition** competitive play uses **Captain’s Mode**: map draft then civ draft on [aoe2cm.net](https://aoe2cm.net). Captains must track availability, apply map-specific civ knowledge, plan assignments, and often coordinate with teammates under time pressure.

**DRAFT** is a web companion that combines live draft state with prepared tier lists, Key / Nemesis markers, ban planning, assignment UI, results logging, and analysis.

### In scope

| Active | Notes |
|--------|--------|
| Map Draft tracking (live + manual modes) | Standard / 1-Map-Only / Select |
| Civ Draft board + recommendations | Tiers, pressure, Top 3, Key civs, Prepared bans, assignment, Draft Preview |
| Preset tier management | TierMaker + Key / Nemesis markers + Advanced pools + optional max picks per pool |
| Results + Analysis | From saved games / draft links; Tournament Meta from Liquipedia |
| AoE in Data | Patch-based civ/tech visualizations + tournament meta charts |
| Cloud sync + shared sessions | Optional login |

### Out of scope (current UI)

- **Pro Analysis tab** — backend route exists (`/api/pro-analysis`) but the tab is **disabled in the SPA** for now  
- Automated drafting / bots  
- Official aoe2cm affiliation  
- Betting or Liquipedia feature clones  
- Guaranteed verification that drafted civs were played in-game  

---

## 2. Architecture

```
Browser (React SPA)
  Tabs: Presets | Map | Civ | Results | Analysis | AoE in Data | Settings
  localStorage + optional cloud docs + shared workspace
        │ REST / WebSocket
        ▼
FastAPI backend
  Auth (JWT), user documents, workspaces
  Draft WebSocket relay (aoe2cm)
  aoestats preset import
  Tournament stats + Liquipedia LPDB client (optional key)
  Pro Analysis aggregation (API only; UI tab commented out)
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
| `frontend/src/lib/` | Domain logic (tiers, drafts, storage, priorities) |
| `frontend/src/components/TierMakerEditor.tsx` | TierMaker + Key / Nemesis marker cycle |
| `frontend/src/components/PreparedBanList.tsx` | Prepared ban planning UI |
| `frontend/src/components/CivDraftMapHub.tsx` | Live map hub (Top 3, Key civs, pools) |
| `backend/app/main.py` | App entry, draft WS, map analysis |
| `backend/app/liquipedia.py` | Official LPDB v3 client |
| `backend/app/pro_analysis.py` | Pro Analysis aggregation (API; UI disabled) |
| `backend/app/aoe2cm.py` / `draft_stream.py` | Live draft fetch/stream |
| `backend/app/aoestats.py` | Ranked WR/PR → preset bundles |

---

## 3. Ranking model

- Tiers: **S, A, B, C, D, F** (`frontend/src/lib/tiers.ts`)
- Within-tier order: `tierRank` (left = stronger)
- Multi-map merge: settings (average / best / worst + override rules)
- Advanced pools: second sort key (`poolOrder`) within a tier; optional `maxPicks` per pool filters Top picks when saturated
- **Key civ** (`keyCiv`) and **Nemesis civ** (`nemesisCiv`) markers per entry — cycled via double-click (`cycleCivMarker`: none → key → nemesis → none)
- Legacy `points` entries normalize to tiers on import

Data model (simplified):

```ts
MapPriorityPreset { id, name, mapName, entries[], advancedMode?, pools[], updatedAt }
CivPriorityEntry { civId, tier?, tierRank?, poolIds?, keyCiv?, nemesisCiv? }
CivPoolDefinition { id, name, icon?, maxPicks? }
PresetTournament { id, name, format, presets[], customMaps[], active? }
```

---

## 4. Feature modules

### 4.1 Presets

- Multiple tournaments; one **ACTIVE** drives Civ Draft
- TierMaker drag-and-drop; copy map↔map and tournament↔tournament
- **Key / Nemesis markers** on civ chips (saved in preset JSON)
- JSON import/export; aoestats “Test 1v1 / TG” seed tournaments
- Advanced pools (Halb SO / Paladin / Flank defaults) with optional **Max** picks per pool

### 4.2 Map Draft

- **Standard:** aoe2cm map draft URL + exact team name
- **1-Map-Only / Select:** manual map slots without a map draft
- Session readiness gates Civ Draft
- **Draft Preview:** portfolio + pressure; single unique map is not repeated BoX times
- **Tournament stats:** auto-sync when preset name resolves via `config/tournament-registry.json`

### 4.3 Civ Draft

- Derives board from live civ draft + merged preset entries
- **Prepared bans** (`frontend/src/lib/preparedBans.ts`, `usePreparedBans.ts`):
  - Shown when civ draft link is valid, map session exists, own ban slots > 0, ban phase incomplete
  - Capacity = `2 × ownBanSlots` (from draft turn order)
  - Per-draft localStorage; Set / Change lock state
  - Nemesis civ IDs from presets highlighted red with ☠
- Map hub per column: assignment → map → pressure or pool meters → Top 3 (+ **Key civs** column when preset has key civs for that map)
- **Your picks** flex column on the right of the map strip
- Single-map layout: Available list + simplified pool display
- Available pool sorted by tier/pool; drag-and-drop assignment
- Preferences: colorblind, hide banned, hide opponent prediction, Top 3 mode

Key logic:

| Function / module | Role |
|-------------------|------|
| `getTopPicksPerMap` | Top 3; respects pool `maxPicks` saturation |
| `getKeyCivsForMap` / `mapPresetHasKeyCivs` | Key civ column visibility and items |
| `collectNemesisCivIds` | Prepared ban nemesis styling |
| `countOwnBanSlots` / `isBanPhaseComplete` | Prepared ban panel visibility |

### 4.4 Results & Analysis

- Tournament → sets → games
- Analysis cards from saved games and optional linked drafts
- **Tournament Meta** — Liquipedia + aoe2cm aggregates for tracked events

### 4.5 AoE in Data

- Patch-sourced civ / tech / unit datasets via backend AoE data routes
- Visual panels: Tech Explorer, Civ DNA, Civ Atlas, Draft Orbit, Similarity Constellation, Synergies, Meta Explorer
- Reuses tournament meta where relevant (`tournamentMeta.ts`)

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
| aoe-elo.com | HTTPS | Pro Analysis API (UI disabled) |
| aoe2recs.com | WebSocket dashboard API | Pro Analysis tournament cache |
| **Liquipedia LPDB v3** | `Authorization: Apikey …` | Tournament Meta; Draft Preview match games |
| aoe2cm drafts (via LP `\|draft=`) | Public draft API | Ban/pick rates + pick order for tournament insights |

### Tournament stats cache

- Registry: `config/tournament-registry.json` maps preset aliases → Liquipedia parent + stage pages.
- Sync: `POST /api/tournament-stats/sync?name=` (incremental LPDB matches + missing aoe2cm drafts).
- Read: `/api/tournament-stats/resolve`, `…/{slug}/maps/{map}`, `…/{slug}/drafts` (+ `/full`).
- UI: Draft Preview tournament strip + ban/pick rates modal (CC-BY-SA attribution).

### Liquipedia compliance

- **API only** — never scrape HTML wiki pages  
- Free plan ≈ **60 requests/hour** — sliding-window limiter + multi-hour response cache + incremental tournament sync  
- Custom **User-Agent** with contact (`LIQUIPEDIA_USER_AGENT` / `LIQUIPEDIA_CONTACT`)  
- **CC-BY-SA** attribution with backlink in Draft Preview, Analysis, and AoE in Data where Liquipedia data is shown  
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
| Prepared bans | yes (keyed by civ draft id) | — |
| Settings / UI prefs | yes | — |
| Auth token | local | local |

Prepared ban entry shape: `{ civIds: string[], locked?: boolean }`.

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
6. Prepared bans require a valid civ draft link before ban phase ends  
7. Pro Analysis UI is disabled; API may still be invoked directly for development  

---

## 10. Implementation index

### Frontend
- `App.tsx` — main tabs (Pro Analysis import commented out)  
- `lib/tiers.ts` — `cycleCivMarker`, tier normalization  
- `lib/priorities.ts` — Top picks, Key civs, nemesis collection, pool max filtering  
- `lib/preparedBans.ts`, `lib/usePreparedBans.ts`, `lib/draftBans.ts`  
- `lib/draftPreview.ts`, `lib/pools.ts`  
- `components/TierMakerEditor.tsx`, `PreparedBanList.tsx`, `CivDraftMapHub.tsx`, `DraftPreview.tsx`  
- `pages/AoeDataTab.tsx` + `components/aoeData/*`  
- `pages/ProAnalysisTab.tsx` — present but not mounted in `App.tsx`  

### Backend
- `liquipedia.py`, `routers/liquipedia_router.py`  
- `routers/tournament_stats_router.py`, `tournament_dataset.py`  
- `pro_analysis.py`, `routers/pro_analysis_router.py` (API only)  
- `aoe2cm.py`, `draft_stream.py`, `aoestats.py`  
- `admin_config.py` — env-driven admin emails  

---

## 11. Related docs

- [USER-MANUAL.md](USER-MANUAL.md)  
- [../README.md](../README.md)  
- [../CONTRIBUTING.md](../CONTRIBUTING.md)  
- [../LICENSE](../LICENSE)  

Age of Empires © Microsoft Corporation. DRAFT is unofficial.  
Liquipedia data is **CC-BY-SA** — credit with backlink when displayed.
