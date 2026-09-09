from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..admin_config import is_admin_email
from ..auth_utils import new_id
from ..database import get_db
from ..deps import get_current_user, get_optional_user
from ..models import CommunityPreset, CommunityPresetVote, User

router = APIRouter(prefix="/api/community", tags=["community"])

SortMode = Literal["popular", "newest", "featured"]


class CommunityPayload(BaseModel):
    entries: list[dict[str, Any]] = Field(default_factory=list)
    advancedMode: bool | None = None
    pools: list[dict[str, Any]] | None = None


class PublishCommunityPresetRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    map_name: str = Field(min_length=1, max_length=120)
    format: str = Field(default="1v1", max_length=8)
    payload: CommunityPayload


class VoteRequest(BaseModel):
    value: Literal[-1, 0, 1]


class FeaturedRequest(BaseModel):
    featured: bool


class CommunityPresetSummary(BaseModel):
    id: str
    title: str
    map_name: str
    format: str
    author_id: str
    author_name: str
    score: int
    upvote_count: int
    downvote_count: int
    entry_count: int
    created_at: str
    featured: bool = False
    my_vote: int | None = None
    can_delete: bool = False
    can_feature: bool = False


class CommunityPresetDetail(CommunityPresetSummary):
    payload: dict[str, Any]


class CommunityPresetListResponse(BaseModel):
    items: list[CommunityPresetSummary]
    total: int
    offset: int
    limit: int


class CommunityMapsResponse(BaseModel):
    maps: list[str]


class CommunityAuthor(BaseModel):
    id: str
    display_name: str
    preset_count: int


class CommunityAuthorsResponse(BaseModel):
    authors: list[CommunityAuthor]


def _entry_count(payload_raw: str) -> int:
    try:
        data = json.loads(payload_raw)
    except json.JSONDecodeError:
        return 0
    entries = data.get("entries") if isinstance(data, dict) else None
    return len(entries) if isinstance(entries, list) else 0


def _parse_payload(payload_raw: str) -> dict[str, Any]:
    try:
        data = json.loads(payload_raw)
    except json.JSONDecodeError:
        return {"entries": []}
    if not isinstance(data, dict):
        return {"entries": []}
    entries = data.get("entries")
    if not isinstance(entries, list):
        data["entries"] = []
    return data


def _serialize_payload(payload: CommunityPayload) -> str:
    body: dict[str, Any] = {"entries": payload.entries}
    if payload.advancedMode is not None:
        body["advancedMode"] = payload.advancedMode
    if payload.pools is not None:
        body["pools"] = payload.pools
    return json.dumps(body, separators=(",", ":"), ensure_ascii=False)


def _my_vote(preset: CommunityPreset, user: User | None) -> int | None:
    if user is None:
        return None
    for vote in preset.votes:
        if vote.user_id == user.id:
            return vote.value
    return None


def _to_summary(preset: CommunityPreset, user: User | None = None) -> CommunityPresetSummary:
    can_delete = False
    can_feature = False
    if user is not None:
        can_delete = preset.author_id == user.id or is_admin_email(user.email)
        can_feature = is_admin_email(user.email)
    return CommunityPresetSummary(
        id=preset.id,
        title=preset.title,
        map_name=preset.map_name,
        format=preset.format,
        author_id=preset.author_id,
        author_name=preset.author.display_name if preset.author else "Unknown",
        score=preset.score,
        upvote_count=preset.upvote_count,
        downvote_count=preset.downvote_count,
        entry_count=_entry_count(preset.payload_json),
        created_at=preset.created_at.isoformat(),
        featured=bool(preset.featured),
        my_vote=_my_vote(preset, user),
        can_delete=can_delete,
        can_feature=can_feature,
    )


def _to_detail(preset: CommunityPreset, user: User | None = None) -> CommunityPresetDetail:
    summary = _to_summary(preset, user)
    return CommunityPresetDetail(**summary.model_dump(), payload=_parse_payload(preset.payload_json))


def _recompute_score(preset: CommunityPreset, db: Session) -> None:
    ups = (
        db.query(func.count(CommunityPresetVote.id))
        .filter(CommunityPresetVote.preset_id == preset.id, CommunityPresetVote.value == 1)
        .scalar()
        or 0
    )
    downs = (
        db.query(func.count(CommunityPresetVote.id))
        .filter(CommunityPresetVote.preset_id == preset.id, CommunityPresetVote.value == -1)
        .scalar()
        or 0
    )
    preset.upvote_count = int(ups)
    preset.downvote_count = int(downs)
    preset.score = int(ups) - int(downs)


@router.get("/presets", response_model=CommunityPresetListResponse)
def list_community_presets(
    sort: SortMode = Query(default="popular"),
    map_name: str | None = Query(default=None, alias="map"),
    author: str | None = Query(default=None),
    q: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> CommunityPresetListResponse:
    query = db.query(CommunityPreset).options(
        joinedload(CommunityPreset.author),
        joinedload(CommunityPreset.votes),
    )

    if map_name and map_name.strip():
        query = query.filter(func.lower(CommunityPreset.map_name) == map_name.strip().lower())
    if author and author.strip():
        author_term = author.strip()
        query = query.join(User, User.id == CommunityPreset.author_id).filter(
            or_(User.id == author_term, func.lower(User.display_name) == author_term.lower())
        )
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.filter(func.lower(CommunityPreset.title).like(like))
    if sort == "featured":
        query = query.filter(CommunityPreset.featured.is_(True))

    total = query.count()
    if sort == "featured":
        query = query.order_by(CommunityPreset.score.desc(), CommunityPreset.created_at.desc())
    elif sort == "newest":
        query = query.order_by(CommunityPreset.created_at.desc())
    else:
        query = query.order_by(
            CommunityPreset.featured.desc(),
            CommunityPreset.score.desc(),
            CommunityPreset.created_at.desc(),
        )

    rows = query.offset(offset).limit(limit).all()
    return CommunityPresetListResponse(
        items=[_to_summary(row, user) for row in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/presets/{preset_id}", response_model=CommunityPresetDetail)
def get_community_preset(
    preset_id: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> CommunityPresetDetail:
    preset = (
        db.query(CommunityPreset)
        .options(joinedload(CommunityPreset.author), joinedload(CommunityPreset.votes))
        .filter(CommunityPreset.id == preset_id)
        .first()
    )
    if preset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")
    return _to_detail(preset, user)


@router.post("/presets", response_model=CommunityPresetDetail, status_code=status.HTTP_201_CREATED)
def publish_community_preset(
    body: PublishCommunityPresetRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunityPresetDetail:
    title = body.title.strip()
    map_name = body.map_name.strip()
    if not title or not map_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title and map are required")

    fmt = (body.format or "1v1").strip() or "1v1"
    preset = CommunityPreset(
        id=new_id(),
        author_id=user.id,
        title=title[:160],
        map_name=map_name[:120],
        format=fmt[:8],
        payload_json=_serialize_payload(body.payload),
    )
    db.add(preset)
    db.commit()
    preset = (
        db.query(CommunityPreset)
        .options(joinedload(CommunityPreset.author), joinedload(CommunityPreset.votes))
        .filter(CommunityPreset.id == preset.id)
        .first()
    )
    assert preset is not None
    return _to_detail(preset, user)


@router.delete("/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_community_preset(
    preset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    preset = db.query(CommunityPreset).filter(CommunityPreset.id == preset_id).first()
    if preset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")
    if preset.author_id != user.id and not is_admin_email(user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    db.delete(preset)
    db.commit()


@router.post("/presets/{preset_id}/vote", response_model=CommunityPresetSummary)
def vote_community_preset(
    preset_id: str,
    body: VoteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunityPresetSummary:
    preset = (
        db.query(CommunityPreset)
        .options(joinedload(CommunityPreset.author), joinedload(CommunityPreset.votes))
        .filter(CommunityPreset.id == preset_id)
        .first()
    )
    if preset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")

    existing = (
        db.query(CommunityPresetVote)
        .filter(CommunityPresetVote.preset_id == preset_id, CommunityPresetVote.user_id == user.id)
        .first()
    )

    if body.value == 0:
        if existing:
            db.delete(existing)
    elif existing:
        existing.value = body.value
    else:
        db.add(
            CommunityPresetVote(
                id=new_id(),
                preset_id=preset_id,
                user_id=user.id,
                value=body.value,
            )
        )

    db.flush()
    _recompute_score(preset, db)
    db.commit()

    preset = (
        db.query(CommunityPreset)
        .options(joinedload(CommunityPreset.author), joinedload(CommunityPreset.votes))
        .filter(CommunityPreset.id == preset_id)
        .first()
    )
    assert preset is not None
    return _to_summary(preset, user)


@router.post("/presets/{preset_id}/featured", response_model=CommunityPresetSummary)
def set_community_preset_featured(
    preset_id: str,
    body: FeaturedRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunityPresetSummary:
    if not is_admin_email(user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    preset = (
        db.query(CommunityPreset)
        .options(joinedload(CommunityPreset.author), joinedload(CommunityPreset.votes))
        .filter(CommunityPreset.id == preset_id)
        .first()
    )
    if preset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")

    preset.featured = bool(body.featured)
    db.commit()
    preset = (
        db.query(CommunityPreset)
        .options(joinedload(CommunityPreset.author), joinedload(CommunityPreset.votes))
        .filter(CommunityPreset.id == preset_id)
        .first()
    )
    assert preset is not None
    return _to_summary(preset, user)


@router.get("/maps", response_model=CommunityMapsResponse)
def list_community_maps(db: Session = Depends(get_db)) -> CommunityMapsResponse:
    rows = (
        db.query(CommunityPreset.map_name)
        .distinct()
        .order_by(CommunityPreset.map_name.asc())
        .all()
    )
    return CommunityMapsResponse(maps=[row[0] for row in rows if row[0]])


@router.get("/authors", response_model=CommunityAuthorsResponse)
def list_community_authors(db: Session = Depends(get_db)) -> CommunityAuthorsResponse:
    rows = (
        db.query(User.id, User.display_name, func.count(CommunityPreset.id))
        .join(CommunityPreset, CommunityPreset.author_id == User.id)
        .group_by(User.id, User.display_name)
        .order_by(func.count(CommunityPreset.id).desc(), User.display_name.asc())
        .all()
    )
    return CommunityAuthorsResponse(
        authors=[
            CommunityAuthor(id=row[0], display_name=row[1], preset_count=int(row[2])) for row in rows
        ]
    )
