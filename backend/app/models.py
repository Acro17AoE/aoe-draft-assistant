from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_share_slug() -> str:
    return secrets.token_urlsafe(9)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    documents: Mapped[list[UserDocument]] = relationship(back_populates="user", cascade="all, delete-orphan")
    owned_workspaces: Mapped[list[Workspace]] = relationship(back_populates="owner")
    memberships: Mapped[list[WorkspaceMember]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserDocument(Base):
    __tablename__ = "user_documents"
    __table_args__ = (UniqueConstraint("user_id", "doc_key", name="uq_user_doc"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    doc_key: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="documents")


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    share_slug: Mapped[str] = mapped_column(String(32), unique=True, index=True, default=new_share_slug)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(back_populates="owned_workspaces")
    members: Mapped[list[WorkspaceMember]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    documents: Mapped[list[WorkspaceDocument]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
    )


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16), default="editor")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    workspace: Mapped[Workspace] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class WorkspaceDocument(Base):
    __tablename__ = "workspace_documents"
    __table_args__ = (UniqueConstraint("workspace_id", "doc_key", name="uq_workspace_doc"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    doc_key: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text, default="{}")
    updated_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    workspace: Mapped[Workspace] = relationship(back_populates="documents")


class CachedTournament(Base):
    __tablename__ = "cached_tournaments"

    tournament_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    data_json: Mapped[str] = mapped_column(Text)
    player_names_json: Mapped[str] = mapped_column(Text, default="[]")
    is_live: Mapped[bool] = mapped_column(Boolean, default=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class CachedDraftAnalysis(Base):
    __tablename__ = "cached_draft_analyses"
    __table_args__ = (UniqueConstraint("draft_id", "player_name", "draft_type", name="uq_draft_player_type"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    draft_id: Mapped[str] = mapped_column(String(32), index=True)
    draft_type: Mapped[str] = mapped_column(String(16))
    player_name: Mapped[str] = mapped_column(String(120), index=True)
    pick_counts_json: Mapped[str] = mapped_column(Text, default="{}")
    ban_counts_json: Mapped[str] = mapped_column(Text, default="{}")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AnalyticsEvent(Base):
    """Anonymous usage events for the admin dashboard (page views, logins, civ drafts)."""

    __tablename__ = "analytics_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    meta: Mapped[str | None] = mapped_column(String(255), nullable=True)


class TournamentDataset(Base):
    """Cached Liquipedia + aoe2cm tournament analytics for Draft Preview."""

    __tablename__ = "tournament_datasets"

    slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255), default="")
    liquipedia_parent: Mapped[str] = mapped_column(String(255), default="")
    stages_json: Mapped[str] = mapped_column(Text, default="[]")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_match_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    match_count: Mapped[int] = mapped_column(Integer, default=0)
    draft_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="idle")
    status_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class TournamentMatchRow(Base):
    __tablename__ = "tournament_match_rows"
    __table_args__ = (UniqueConstraint("dataset_slug", "match_key", name="uq_dataset_match"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dataset_slug: Mapped[str] = mapped_column(String(64), index=True)
    match_key: Mapped[str] = mapped_column(String(160))
    stage: Mapped[str] = mapped_column(String(255), default="")
    match_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    opponent1: Mapped[str | None] = mapped_column(String(160), nullable=True)
    opponent2: Mapped[str | None] = mapped_column(String(160), nullable=True)
    winner: Mapped[str | None] = mapped_column(String(16), nullable=True)
    games_json: Mapped[str] = mapped_column(Text, default="[]")
    civ_draft_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    map_draft_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TournamentDraftRow(Base):
    __tablename__ = "tournament_draft_rows"
    __table_args__ = (UniqueConstraint("draft_id", "draft_type", name="uq_tour_draft_type"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    draft_id: Mapped[str] = mapped_column(String(64), index=True)
    draft_type: Mapped[str] = mapped_column(String(16), default="civ")
    pick_counts_json: Mapped[str] = mapped_column(Text, default="{}")
    ban_counts_json: Mapped[str] = mapped_column(Text, default="{}")
    pick_order_json: Mapped[str] = mapped_column(Text, default="{}")
    ban_order_json: Mapped[str] = mapped_column(Text, default="{}")
    neutral_counts_json: Mapped[str] = mapped_column(Text, default="{}")
    event_count: Mapped[int] = mapped_column(Integer, default=0)
    analysis_revision: Mapped[int] = mapped_column(Integer, default=0)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TournamentMapCivAgg(Base):
    __tablename__ = "tournament_map_civ_aggs"
    __table_args__ = (UniqueConstraint("dataset_slug", "map_name", "civ_name", name="uq_map_civ_agg"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dataset_slug: Mapped[str] = mapped_column(String(64), index=True)
    map_name: Mapped[str] = mapped_column(String(120), index=True)
    civ_name: Mapped[str] = mapped_column(String(64), index=True)
    plays: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)


class TournamentCivDraftAgg(Base):
    __tablename__ = "tournament_civ_draft_aggs"
    __table_args__ = (UniqueConstraint("dataset_slug", "civ_name", name="uq_civ_draft_agg"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dataset_slug: Mapped[str] = mapped_column(String(64), index=True)
    civ_name: Mapped[str] = mapped_column(String(64), index=True)
    picks: Mapped[int] = mapped_column(Integer, default=0)
    bans: Mapped[int] = mapped_column(Integer, default=0)
    pick_order_sum: Mapped[float] = mapped_column(Float, default=0.0)
    pick_order_count: Mapped[int] = mapped_column(Integer, default=0)
