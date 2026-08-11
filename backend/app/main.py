import asyncio
import json
import os
from pathlib import Path

import httpx
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Load local `.env` for development (does not override already-set process env).
# On Coolify / Docker the host injects the same variable names as secrets.
_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from .aoe2cm import extract_draft_id, extract_preset_id, fetch_draft, fetch_preset
from .database import init_db
from .auth_utils import decode_access_token
from .database import SessionLocal
from .draft_stream import get_subscription
from .models import User, WorkspaceMember
from .workspace_stream import get_workspace_subscription
from .aoe2recs import compute_map_play_counts, fetch_tournament, suggest_tournaments
from .map_analysis import analyze_map_draft_events, extract_own_map_picks, merge_map_insights
from .routers.aoe_data_router import router as aoe_data_router
from .routers.admin_router import analytics_router, router as admin_router
from .routers.aoestats_router import router as aoestats_router
from .routers.auth_router import router as auth_router
from .routers.user_documents import router as user_documents_router
from .routers.liquipedia_router import router as liquipedia_router
from .routers.pro_analysis_router import router as pro_analysis_router
from .routers.replay_router import router as replay_router
from .routers.tournament_stats_router import router as tournament_stats_router
from .routers.workspaces import router as workspaces_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db_url = os.getenv("DATABASE_URL", "sqlite:///./local-data/app.db")
    if db_url.startswith("sqlite:///"):
        db_path = db_url.replace("sqlite:///", "", 1)
        if db_path.startswith("/") or (len(db_path) > 1 and db_path[1] == ":"):
            db_dir = os.path.dirname(db_path)
        else:
            db_dir = os.path.dirname(os.path.abspath(db_path))
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
    init_db()
    yield


app = FastAPI(title="AoE Draft Assistant API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(aoe_data_router)
app.include_router(aoestats_router)
app.include_router(auth_router)
app.include_router(user_documents_router)
app.include_router(liquipedia_router)
app.include_router(pro_analysis_router)
app.include_router(replay_router)
app.include_router(tournament_stats_router)
app.include_router(workspaces_router)


class MapAnalysisRequest(BaseModel):
    map_draft_id: str
    civ_draft_id: str | None = None
    own_team_name: str
    tournament_id: str | None = Field(
        default=None,
        description="Optional aoe2recs tournament slug, e.g. king-of-the-desert-vi",
    )
    opponent_names: list[str] = Field(default_factory=list)


def _resolve_sides(own: str, host: str, guest: str) -> tuple[str, str]:
    if own.lower() == host.lower():
        return "HOST", "GUEST"
    if own.lower() == guest.lower():
        return "GUEST", "HOST"
    return "HOST", "GUEST"


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/draft/{draft_id}")
async def get_draft(draft_id: str) -> dict:
    try:
        return await fetch_draft(draft_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"aoe2cm.net unreachable: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/preset/{preset_id}")
async def get_preset(preset_id: str) -> dict:
    try:
        return await fetch_preset(extract_preset_id(preset_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"aoe2cm.net unreachable: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _user_from_ws_token(token: str) -> User | None:
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except Exception:
        return None
    if not user_id:
        return None
    db = SessionLocal()
    try:
        return db.get(User, user_id)
    finally:
        db.close()


@app.websocket("/api/workspaces/{workspace_id}/stream")
async def workspace_stream(
    websocket: WebSocket,
    workspace_id: str,
    token: str = Query(...),
) -> None:
    user = _user_from_ws_token(token)
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db = SessionLocal()
    try:
        member = (
            db.query(WorkspaceMember)
            .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id)
            .first()
        )
        if member is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    finally:
        db.close()

    await websocket.accept()
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=32)
    loop = asyncio.get_running_loop()
    sub = get_workspace_subscription(workspace_id)
    sub.add_listener(queue, loop)

    try:
        while True:
            message = await queue.get()
            await websocket.send_text(message)
    except WebSocketDisconnect:
        pass
    finally:
        sub.remove_listener(queue)


@app.websocket("/api/draft/{draft_id}/stream")
async def draft_stream(websocket: WebSocket, draft_id: str) -> None:
    await websocket.accept()
    draft_id = extract_draft_id(draft_id)
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=64)
    loop = asyncio.get_running_loop()
    sub = get_subscription(draft_id)
    sub.add_listener(queue, loop)

    try:
        try:
            initial = await asyncio.wait_for(queue.get(), timeout=5.0)
        except asyncio.TimeoutError:
            try:
                initial = json.dumps(await fetch_draft(draft_id, use_cache=False))
            except ValueError as exc:
                await websocket.send_json({"error": str(exc)})
                await websocket.close(code=1008)
                return

        await websocket.send_text(initial)

        while True:
            message = await queue.get()
            await websocket.send_text(message)
    except WebSocketDisconnect:
        pass
    finally:
        sub.remove_listener(queue)


@app.get("/api/tournament-suggestions")
async def tournament_suggestions(
    map_draft_id: str = Query(...),
    civ_draft_id: str | None = Query(None),
) -> dict:
    try:
        map_draft = await fetch_draft(extract_draft_id(map_draft_id))
        civ_draft = None
        if civ_draft_id:
            civ_draft = await fetch_draft(extract_draft_id(civ_draft_id))

        map_preset = (map_draft.get("preset") or {}).get("name") or ""
        civ_preset = ((civ_draft.get("preset") or {}).get("name") or "") if civ_draft else ""
        preset_name = map_preset or civ_preset
        host = (map_draft.get("nameHost") or (civ_draft or {}).get("nameHost") or "").strip()
        guest = (map_draft.get("nameGuest") or (civ_draft or {}).get("nameGuest") or "").strip()

        suggestions = suggest_tournaments(preset_name, host, guest)
        return {
            "presetName": preset_name,
            "nameHost": host,
            "nameGuest": guest,
            "suggestions": suggestions,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/tournament/{tournament_id}/map-stats")
async def tournament_map_stats(
    tournament_id: str,
    opponents: str = Query("", description="Comma-separated opponent player or team names"),
) -> dict:
    opponent_names = [name.strip() for name in opponents.split(",") if name.strip()]
    try:
        tournament = fetch_tournament(tournament_id)
        counts = compute_map_play_counts(tournament, opponent_names)
        return {"tournamentId": tournament_id, **counts}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/map-analysis")
async def map_analysis(body: MapAnalysisRequest) -> dict:
    try:
        map_draft = await fetch_draft(extract_draft_id(body.map_draft_id))
        civ_draft = None
        if body.civ_draft_id:
            civ_draft = await fetch_draft(extract_draft_id(body.civ_draft_id))

        own = body.own_team_name.strip()
        host = (map_draft.get("nameHost") or "").strip()
        guest = (map_draft.get("nameGuest") or "").strip()
        own_side, opponent_side = _resolve_sides(own, host, guest)

        opponent_names = body.opponent_names[:]
        if not opponent_names:
            opponent_names = [guest if own_side == "HOST" else host]

        events = map_draft.get("events", [])
        draft_analysis = analyze_map_draft_events(events, opponent_side)
        own_map_picks = extract_own_map_picks(events, own_side)

        map_pool = [
            option["name"]
            for option in map_draft.get("preset", {}).get("draftOptions", [])
            if isinstance(option, dict) and option.get("name")
        ]
        if not map_pool:
            map_pool = sorted(
                {
                    event.get("chosenOptionId")
                    for event in events
                    if event.get("chosenOptionId")
                }
            )

        tournament_id = (body.tournament_id or "").strip()
        if tournament_id:
            play_counts = compute_map_play_counts(fetch_tournament(tournament_id), opponent_names)
        else:
            play_counts = {"totalByMap": {}, "byOpponent": {}}

        insights = merge_map_insights(draft_analysis, play_counts, map_pool)

        return {
            "ownSide": own_side,
            "opponentSide": opponent_side,
            "nameHost": host,
            "nameGuest": guest,
            "ownMapPicks": own_map_picks,
            "tournamentStatsAvailable": bool(tournament_id),
            "draftAnalysis": draft_analysis,
            "playCounts": play_counts,
            "mapInsights": insights,
            "civDraft": {
                "draftId": extract_draft_id(body.civ_draft_id) if body.civ_draft_id else None,
                "nameHost": civ_draft.get("nameHost") if civ_draft else None,
                "nameGuest": civ_draft.get("nameGuest") if civ_draft else None,
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
