# DRAFT — User Manual

Companion tool **DRAFT** (*Decision-support for Ranking, Assignment, and Forecasting under Time constraints*) for **Age of Empires II Captain’s Mode** drafts on [aoe2cm.net](https://aoe2cm.net).  
This guide covers the current version: how each tab works and a walkthrough from prep to live draft.

In the app, open **FAQ** in the footer for the product definition; use **White mode** / **Dark mode** to switch theme.

---

## 1. What you can do

| Area | Purpose |
|------|---------|
| **Presets** | TierMaker-style civ rankings per map (optional Advanced pools) |
| **Map Draft** | Live aoe2cm map draft, or manual maps (1-Map / Select) |
| **Civ Draft** | Live civ board with tiers, pressure, Top 3 (multi-map), assignment |
| **Results** | Log tournaments, sets, and games |
| **Analysis** | Own Results from saved games, or Tournament Meta from Liquipedia |
| **Pro Analysis** | Opponent matchup report (career, H2H, draft tendencies, Liquipedia) |
| **Settings** | Account, cloud sync, shared draft sessions |

Ranking is **tier-only**: **S / A / B / C / D / F**.

---

## 2. Data storage and accounts

### Without login
Data lives in the **browser** (`localStorage`). Clearing site data or switching devices loses it.

### With login (Settings)
Presets, results, sessions, and settings can **sync across devices**. You can create a **shared session** so teammates share one draft board.

### Team name (critical)
In Map Draft, enter **Your team** exactly as on aoe2cm. A wrong name breaks side detection.

---

## 3. Recommended workflow

1. **Presets** — create/select a tournament, tier maps (optional Advanced pools).
2. **Map Draft** — set team name; paste map draft link **or** use 1-Map-Only / Select.
3. **Civ Draft** — paste civ draft → **Go** → ban/pick with tiers & pressure → assign civs to maps.
4. **Results** (optional) — log the set after the match.
5. **Analysis** (optional) — review patterns from saved results.
6. **Pro Analysis** (optional) — scout an opponent before a series.

First visit? Click **New Here?** for a guided walkthrough.

Export a preset JSON backup before large meta changes.

---

## 4. Presets tab

Map-specific civ knowledge for one **preset tournament**. Civ Draft uses the **active** tournament.

In a shared session this tab is labeled **Shared Presets**.

### 4.1 Manage tournaments

- Create / rename / delete tournaments.
- Format: **1v1 / 2v2 / 3v3 / 4v4** (civs per map in Civ Draft).
- Mark one tournament **ACTIVE**.
- Optionally link to Results on create.
- Add **custom map names** if needed.

Helpers when creating a tournament:

- Seed maps from an **aoe2cm map-draft preset URL**.
- **Test 1v1 / Test Teamgame** — create a starter tournament from **aoestats.io** tiers (good starting point; refine by hand).

You can also **copy maps** from another tournament (selected or all).

### 4.2 TierMaker editor (per map)

1. Select a map.  
2. Drag civs into **S / A / B / C / D / F**.  
3. Unranked civs stay unranked.  
4. Order **within** a tier matters (left = stronger).  
5. Save.

Copy tiers from another map in the same tournament via **Import ratings from**.

### 4.3 Advanced pools (optional)

Turn on **Advanced**. Default pools: **Halb SO**, **Paladin**, **Flank**.

Assign already-ranked civs into pools. Pool names drive icons. In Civ Draft, Advanced maps show pool **Available / Already picked** instead of plain S/A pressure.

### 4.4 Import / Export

Export/import JSON preset bundles for backup and sharing.

---

## 5. Map Draft tab

Always set **Your team** first.

### 5.1 Standard (live aoe2cm)

Paste the map draft URL; live picks/bans update automatically.

### 5.2 1-Map-Only

Pick one map + series format. The map is repeated for set length and passed to Civ Draft.  
Draft Preview and Civ Draft header show that map **once** (not once per game).

### 5.3 Select (manual multi-map)

Choose series format and fill each slot from the active preset pool.

### 5.4 Draft Preview

When maps are known:

- Portfolio civs (strong across set / specialists, or priorities for a single map)
- Per-map Top 3 + pressure (multi-map); single-map shows pressure once without repeating Top 3
- Click a civ for map contribution explain

---

## 6. Civ Draft tab

### 6.1 Start

Finish Map Draft setup → paste civ draft URL → **Go**.  
Pre-Go Draft Preview appears under setup.

### 6.2 Ranking

Tiers from the **active preset** for locked maps. Multi-map merge uses settings (average / best / worst + override rules). Advanced pools add pool order within a tier.

### 6.3 Map hub

Per map: assignment slots, map identity, pressure, Top 3 (multi-map only; on 1-map, use the Available list ranking).  
**Your picks** holds unassigned own civs.

### 6.4 Drag & drop

Assign / unassign between Your picks and map slots. Full maps reject extras.

### 6.5 Preferences (Civ Draft bottom bar)

Colorblind mode, hide banned, hide opponent prediction, Top 3 hide/show/dim when a map is full.

---

## 7. Results tab

1. Create/open a tournament.  
2. Add sets (BO/PA formats).  
3. Fill games: map, civs, winner, notes.  
4. Optional draft context and replay import.

---

## 8. Analysis tab

Two modes:

- **Own Results** — cards for your tournaments with saved games: civ WR, maps played, civ×map, and draft-derived views when draft links exist.
- **Tournament Meta** — Liquipedia + aoe2cm aggregates for tracked events (**The League Qualifiers** = Qualifier 1+2 only; **Warlords 5**). Shows map rankings (played / banned / picked / neutral leftover / least played), civ rankings + ban/pick/WR rates, and per-map Top 3 / Bottom 3 civs. **Refresh** force-syncs (respect Liquipedia free quota). Ban/pick quality depends on `|civdraft=` / `|mapdraft=` on wiki matches; data is credited to Liquipedia (CC-BY-SA).

---

## 9. Pro Analysis tab

Opponent scouting report:

1. Enter **your name**, **opponent**, optional **tournament**, historical scope.  
2. **Run analysis**.  
3. Review takeaways, career cards, H2H, map/civ draft tendencies.

### Data sources

| Source | Role |
|--------|------|
| aoe-elo.com | Career Elo / tournament history |
| aoe2recs.com | Brackets / matches (cached locally) |
| aoe2cm.net | Past map/civ draft events |
| **Liquipedia LPDB** | Player/tournament page enrichment (official API) |

### Liquipedia setup

1. Request a free API key: [liquipedia.net/api](https://liquipedia.net/api).  
2. **Do not put the key in GitHub.**  
3. Configure it where the **API process** runs:
   - **Local:** `LIQUIPEDIA_API_KEY=...` in `.env` next to `docker-compose.yml`
   - **Deployed site:** same name in Coolify / Docker / VPS environment for the **api** service, then restart/redeploy
4. Check: `GET /api/liquipedia/status` → `"configured": true`

The website (browser) never holds the key. Only the server-side API uses it. A local `.env` does **not** automatically apply to production.

When Liquipedia data appears, the UI shows **credit + backlinks** (CC-BY-SA). Free plan ≈ **60 requests/hour**; responses are cached. Without a key, Pro Analysis still runs on aoe-elo / aoe2recs / aoe2cm — only Liquipedia enrichment stays off.

### Tournament stats (Draft Preview)

When the **active preset** name maps to a Liquipedia tournament (e.g. “The League”, “TheLeague”, “Brazilian Dynasty”), Draft Preview **loads automatically** once maps are set:

- Per locked map: most-picked civ, highest / lowest win rate (from Liquipedia match games)
- Tournament-wide: most banned civs and early-pick priority (from **aoe2cm** drafts linked on Liquipedia)
- Compact status line (sync progress / match counts) + optional **Ban / pick rates** popout

Preset names that aren’t an exact wiki title still resolve when possible (CamelCase → underscores, registry aliases, Ongoing tournaments preferred). Large events may need several syncs because of the Liquipedia free quota. Name aliases live in `config/tournament-registry.json`.

---

## 10. Settings tab

- Register / log in (password min. 8 characters).  
- Cloud sync when logged in.  
- Shared sessions: create, invite, collaborate on Shared Presets + draft board.

---

## 11. End-to-end walkthrough

### Prep
1. Presets → ACTIVE tournament → tier maps → optional Advanced → optional export / login / share.

### Map phase
2. Map Draft → team name → Standard / 1-Map / Select.

### Civ phase
3. Civ Draft → paste link → Go → Available + pressure (+ Top 3 on multi-map) → assign civs.

### After / scouting
4. Results → Analysis.  
5. Pro Analysis before the next series.

---

## 12. Troubleshooting

| Problem | Check |
|---------|--------|
| Wrong own/opponent | Team name must match aoe2cm |
| Empty tiers | Active preset + saved tiers + matching map names |
| Top 3 missing | Finished draft, full map + hide preference, or **1-map mode** (by design) |
| Can’t drop on map | Assignment slots full |
| “Configure map draft first” | Map Draft incomplete |
| Teammate can’t join | They must log in first |
| Pro Analysis / Liquipedia off | `LIQUIPEDIA_API_KEY` in `.env`; check `/api/liquipedia/status` |
| Rate limit | Free Liquipedia plan; wait / rely on cache |
| Draft Preview shows 0 matches | Often an **invalid/expired API key** — registry can still resolve the page name. Sync now fails with a clear error; update the key and restart the API |
| Draft Preview tournament empty | Preset name must resolve (aliases / CamelCase / Ongoing); wait for auto-sync; check Liquipedia key |
| Ban/pick rates thin | Many matches lack `|draft=` on Liquipedia — only linked drafts are counted |

---

## 13. Best practices

- One preset tournament per league / meta patch.  
- Confirm **ACTIVE** before every draft.  
- Export before big rewrites.  
- Prefer login + export for long-term data.  
- Keep secrets in `.env` only.

---

## 14. Related docs

- Overview: [../README.md](../README.md)  
- Architecture / features: [FEATURE-DOCUMENTATION.md](FEATURE-DOCUMENTATION.md)  
- Contributing: [../CONTRIBUTING.md](../CONTRIBUTING.md)  
- License & data attribution: [../LICENSE](../LICENSE)

Age of Empires © Microsoft Corporation. DRAFT is an unofficial community companion for aoe2cm drafts.  
Liquipedia content is **CC-BY-SA** — credit Liquipedia when that data is shown.
