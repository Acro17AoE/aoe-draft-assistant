from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..admin_config import is_admin_email
from ..auth_utils import new_id
from ..database import get_db
from ..deps import get_current_user, get_optional_user
from ..models import AnalyticsEvent, User

router = APIRouter(prefix="/api/admin", tags=["admin"])
analytics_router = APIRouter(prefix="/api/analytics", tags=["analytics"])

EVENT_PAGE_VIEW = "page_view"
EVENT_LOGIN = "login"
EVENT_CIV_DRAFT = "civ_draft"

ALLOWED_TRACK_EVENTS = {EVENT_PAGE_VIEW, EVENT_CIV_DRAFT}


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not is_admin_email(user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def record_event(
    db: Session,
    event_type: str,
    *,
    user_id: str | None = None,
    meta: str | None = None,
) -> None:
    db.add(
        AnalyticsEvent(
            id=new_id(),
            event_type=event_type,
            user_id=user_id,
            meta=(meta[:255] if meta else None),
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
        # SQLite often returns naive datetimes; compare in UTC without tzinfo.
        bound = _ensure_aware(since).replace(tzinfo=None)
        query = query.filter(AnalyticsEvent.created_at >= bound)
    return int(query.scalar() or 0)


def _count_registrations(db: Session, since: datetime | None) -> int:
    query = db.query(func.count(User.id))
    if since is not None:
        bound = _ensure_aware(since).replace(tzinfo=None)
        query = query.filter(User.created_at >= bound)
    return int(query.scalar() or 0)


class AdminUserEntry(BaseModel):
    display_name: str
    email: str
    created_at: datetime | None


class PeriodStats(BaseModel):
    page_views: int
    logins: int
    registrations: int
    civ_drafts: int


class AdminStatsResponse(BaseModel):
    periods: dict[str, PeriodStats]
    users: list[AdminUserEntry]
    total_users: int


class TrackEventRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=32)
    meta: str | None = Field(default=None, max_length=255)


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
    record_event(db, event_type, user_id=user.id if user else None, meta=body.meta)
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
    return AdminStatsResponse(periods=periods, users=users, total_users=len(users))


# Keep /users for compatibility with the earlier signup panel.
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
