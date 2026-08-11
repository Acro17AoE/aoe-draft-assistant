"""Tournament stats API — Liquipedia matches + aoe2cm drafts (cached)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_optional_user
from ..models import User
from ..tournament_dataset import (
    draft_stats,
    list_meta_events,
    list_tournament_teams,
    map_stats,
    meta_overview,
    resolve_tournament_stats,
    sync_tournament_dataset,
    team_tournament_analysis,
)

router = APIRouter(prefix="/api/tournament-stats", tags=["tournament-stats"])


@router.get("/resolve")
def resolve(
    name: str = Query(..., min_length=1, description="Preset or Liquipedia tournament name"),
    db: Session = Depends(get_db),
) -> dict:
    return resolve_tournament_stats(db, name)


@router.post("/sync")
async def sync(
    name: str = Query(..., min_length=1),
    force: bool = Query(
        False,
        description="Ignore date watermark and re-scan all stages (manual refresh)",
    ),
    db: Session = Depends(get_db),
    _user: User | None = Depends(get_optional_user),
) -> dict:
    try:
        return await sync_tournament_dataset(db, name, force=force)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/meta/events")
def get_meta_events(db: Session = Depends(get_db)) -> dict:
    """Tracked Tournament Meta events + sync status."""
    return list_meta_events(db)


@router.get("/meta/{slug}")
def get_meta_overview(slug: str, db: Session = Depends(get_db)) -> dict:
    """Full map/civ meta aggregates for a registry slug."""
    return meta_overview(db, slug)


@router.get("/{slug}/maps/{map_name}")
def get_map_stats(
    slug: str,
    map_name: str,
    limit: int = Query(8, ge=1, le=40),
    db: Session = Depends(get_db),
) -> dict:
    return map_stats(db, slug, map_name, limit=limit)


@router.get("/{slug}/drafts")
def get_draft_stats(
    slug: str,
    limit: int = Query(12, ge=1, le=80),
    db: Session = Depends(get_db),
) -> dict:
    return draft_stats(db, slug, full=False, limit=limit)


@router.get("/{slug}/drafts/full")
def get_draft_stats_full(
    slug: str,
    db: Session = Depends(get_db),
) -> dict:
    return draft_stats(db, slug, full=True, limit=80)


@router.get("/{slug}/teams")
def get_tournament_teams(slug: str, db: Session = Depends(get_db)) -> dict:
    return list_tournament_teams(db, slug)


@router.get("/{slug}/teams/{team_name}/analysis")
async def get_team_analysis(slug: str, team_name: str, db: Session = Depends(get_db)) -> dict:
    try:
        return await team_tournament_analysis(db, slug, team_name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
