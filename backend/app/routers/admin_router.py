from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..admin_config import is_admin_email
from ..auth_utils import new_id
from ..database import get_db
from ..deps import get_current_user, get_optional_user
from ..models import AnalyticsEvent, TrackedDraft, User, Workspace

router = APIRouter(prefix="/api/admin", tags=["admin"])
analytics_router = APIRouter(prefix="/api/analytics", tags=["analytics"])

EVENT_PAGE_VIEW = "page_view"
EVENT_LOGIN = "login"
EVENT_CIV_DRAFT = "civ_draft"
EVENT_MAP_DRAFT = "map_draft"

ALLOWED_TRACK_EVENTS = {EVENT_PAGE_VIEW, EVENT_CIV_DRAFT, EVENT_MAP_DRAFT}

AOE2CM_DRAFT_URL = "https://aoe2cm.net/draft/{id}"


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not is_admin_email(user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def _clip_draft_id(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    if len(cleaned) < 4 or len(cleaned) > 64:
        return None
    if "/" in cleaned or " " in cleaned:
        return None
    return cleaned


def _host_from_user(user: User | None) -> tuple[str, str]:
    if not user:
        return ("", "")
    return (user.display_name or "", user.email or "")


def upsert_tracked_draft(
    db: Session,
    *,
    civ_draft_id: str | None,
    map_draft_id: str | None,
    user: User | None,
    workspace_id: str | None,
) -> None:
    civ_id = _clip_draft_id(civ_draft_id)
    map_id = _clip_draft_id(map_draft_id)
    if not civ_id and not map_id:
        return

    workspace: Workspace | None = None
    if workspace_id:
        workspace = (
            db.query(Workspace)
            .options(joinedload(Workspace.owner))
            .filter(Workspace.id == workspace_id)
            .first()
        )

    if workspace and workspace.owner:
        host_name, host_email = _host_from_user(workspace.owner)
        workspace_name = workspace.name or ""
        resolved_workspace_id = workspace.id
    else:
        host_name, host_email = _host_from_user(user)
        workspace_name = ""
        resolved_workspace_id = None

    row: TrackedDraft | None = None
    if civ_id:
        row = db.query(TrackedDraft).filter(TrackedDraft.civ_draft_id == civ_id).first()
    if row is None and map_id and not civ_id:
        row = (
            db.query(TrackedDraft)
            .filter(TrackedDraft.map_draft_id == map_id, TrackedDraft.civ_draft_id.is_(None))
            .first()
        )

    if row is None:
        db.add(
            TrackedDraft(
                id=new_id(),
                civ_draft_id=civ_id,
                map_draft_id=map_id,
                host_name=host_name,
                host_email=host_email,
                workspace_name=workspace_name,
                workspace_id=resolved_workspace_id,
            )
        )
        return

    if map_id and not row.map_draft_id:
        row.map_draft_id = map_id
    if civ_id and not row.civ_draft_id:
        row.civ_draft_id = civ_id
    if host_name and not row.host_name:
        row.host_name = host_name
        row.host_email = host_email
    if workspace_name and not row.workspace_name:
        row.workspace_name = workspace_name
        row.workspace_id = resolved_workspace_id


def record_event(
    db: Session,
    event_type: str,
    *,
    user_id: str | None = None,
    meta: str | None = None,
) -> None:
    clipped_meta = meta[:255] if meta else None
    if event_type in {EVENT_CIV_DRAFT, EVENT_MAP_DRAFT} and clipped_meta:
        exists = (
            db.query(AnalyticsEvent.id)
            .filter(
                AnalyticsEvent.event_type == event_type,
                AnalyticsEvent.meta == clipped_meta,
            )
            .first()
        )
        if exists:
            return
    db.add(
        AnalyticsEvent(
            id=new_id(),
            event_type=event_type,
            user_id=user_id,
            meta=clipped_meta,
        )
    )
    db.commit()


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _period_starts(now: datetime) -> dict[str, datetime | None]:
    now = _ensure_aware(now)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = day_start - timedelta(days=day_start.weekday())
    month_start = day_start.replace(day=1)
    year_start = day_start.replace(month=1, day=1)
    return {
        "day": day_start,
        "week": week_start,
        "month": month_start,
        "year": year_start,
        "all": None,
    }


def _count_events(
    db: Session,
    event_type: str,
    since: datetime | None,
) -> int:
    query = db.query(func.count(AnalyticsEvent.id)).filter(AnalyticsEvent.event_type == event_type)
    if since is not None:
        bound = _ensure_aware(since).replace(tzinfo=None)
        query = query.filter(AnalyticsEvent.created_at >= bound)
    return int(query.scalar() or 0)


def _count_registrations(db: Session, since: datetime | None) -> int:
    query = db.query(func.count(User.id))
    if since is not None:
        bound = _ensure_aware(since).replace(tzinfo=None)
        query = query.filter(User.created_at >= bound)
    return int(query.scalar() or 0)


def _legacy_tracked_drafts(db: Session, existing_civ_ids: set[str]) -> list["TrackedDraftEntry"]:
    rows = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.event_type == EVENT_CIV_DRAFT, AnalyticsEvent.meta.isnot(None))
        .order_by(AnalyticsEvent.created_at.desc())
        .all()
    )
    entries: list[TrackedDraftEntry] = []
    seen: set[str] = set(existing_civ_ids)
    for row in rows:
        civ_id = _clip_draft_id(row.meta)
        if not civ_id or civ_id in seen:
            continue
        seen.add(civ_id)
        entries.append(
            TrackedDraftEntry(
                id=row.id,
                created_at=row.created_at,
                civ_draft_id=civ_id,
                map_draft_id=None,
                civ_draft_url=AOE2CM_DRAFT_URL.format(id=civ_id),
                map_draft_url=None,
                host_name="",
                host_email="",
                workspace_name="",
            )
        )
    return entries


class AdminUserEntry(BaseModel):
    display_name: str
    email: str
    created_at: datetime | None


class PeriodStats(BaseModel):
    page_views: int
    logins: int
    registrations: int
    civ_drafts: int


class TrackedDraftEntry(BaseModel):
    id: str
    created_at: datetime | None
    civ_draft_id: str | None
    map_draft_id: str | None
    civ_draft_url: str | None
    map_draft_url: str | None
    host_name: str
    host_email: str
    workspace_name: str


class AdminStatsResponse(BaseModel):
    periods: dict[str, PeriodStats]
    users: list[AdminUserEntry]
    total_users: int
    tracked_drafts: list[TrackedDraftEntry] = Field(default_factory=list)


class TrackEventRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=32)
    meta: str | None = Field(default=None, max_length=255)
    civ_draft_id: str | None = Field(default=None, max_length=64)
    map_draft_id: str | None = Field(default=None, max_length=64)
    workspace_id: str | None = Field(default=None, max_length=36)


class TrackEventResponse(BaseModel):
    ok: bool = True


@analytics_router.post("/event", response_model=TrackEventResponse)
def track_event(
    body: TrackEventRequest,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> TrackEventResponse:
    event_type = body.event_type.strip().lower()
    if event_type not in ALLOWED_TRACK_EVENTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported event type")

    civ_id = _clip_draft_id(body.civ_draft_id) or (
        _clip_draft_id(body.meta) if event_type == EVENT_CIV_DRAFT else None
    )
    map_id = _clip_draft_id(body.map_draft_id) or (
        _clip_draft_id(body.meta) if event_type == EVENT_MAP_DRAFT else None
    )
    event_meta = civ_id if event_type == EVENT_CIV_DRAFT else map_id if event_type == EVENT_MAP_DRAFT else body.meta

    record_event(db, event_type, user_id=user.id if user else None, meta=event_meta)
    if event_type in {EVENT_CIV_DRAFT, EVENT_MAP_DRAFT}:
        upsert_tracked_draft(
            db,
            civ_draft_id=civ_id,
            map_draft_id=map_id,
            user=user,
            workspace_id=body.workspace_id,
        )
        db.commit()
    return TrackEventResponse()


@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminStatsResponse:
    starts = _period_starts(datetime.now(timezone.utc))
    periods: dict[str, PeriodStats] = {}
    for key, since in starts.items():
        periods[key] = PeriodStats(
            page_views=_count_events(db, EVENT_PAGE_VIEW, since),
            logins=_count_events(db, EVENT_LOGIN, since),
            registrations=_count_registrations(db, since),
            civ_drafts=_count_events(db, EVENT_CIV_DRAFT, since),
        )

    rows = db.query(User).order_by(User.created_at.asc()).all()
    users = [
        AdminUserEntry(
            display_name=row.display_name,
            email=row.email,
            created_at=row.created_at,
        )
        for row in rows
    ]

    tracked_rows = db.query(TrackedDraft).order_by(TrackedDraft.created_at.desc()).all()
    tracked = [
        TrackedDraftEntry(
            id=row.id,
            created_at=row.created_at,
            civ_draft_id=row.civ_draft_id,
            map_draft_id=row.map_draft_id,
            civ_draft_url=AOE2CM_DRAFT_URL.format(id=row.civ_draft_id) if row.civ_draft_id else None,
            map_draft_url=AOE2CM_DRAFT_URL.format(id=row.map_draft_id) if row.map_draft_id else None,
            host_name=row.host_name,
            host_email=row.host_email,
            workspace_name=row.workspace_name,
        )
        for row in tracked_rows
    ]
    existing_civ = {row.civ_draft_id for row in tracked_rows if row.civ_draft_id}
    tracked.extend(_legacy_tracked_drafts(db, existing_civ))
    tracked.sort(key=lambda entry: entry.created_at or datetime.min, reverse=True)

    return AdminStatsResponse(
        periods=periods,
        users=users,
        total_users=len(users),
        tracked_drafts=tracked,
    )


@router.get("/users")
def list_users(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    rows = db.query(User).order_by(User.created_at.asc()).all()
    users = [
        {
            "display_name": row.display_name,
            "email": row.email,
            "created_at": row.created_at,
        }
        for row in rows
    ]
    return {"users": users, "total": len(users)}
