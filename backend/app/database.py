import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./local-data/app.db")

if DATABASE_URL.startswith("sqlite:///"):
    _sqlite_path = DATABASE_URL.replace("sqlite:///", "", 1)
    _sqlite_dir = os.path.dirname(os.path.abspath(_sqlite_path))
    if _sqlite_dir:
        os.makedirs(_sqlite_dir, exist_ok=True)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_sqlite_columns() -> None:
    """Add columns create_all cannot alter on existing SQLite tables."""
    if not DATABASE_URL.startswith("sqlite"):
        return
    from sqlalchemy import text

    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(tournament_draft_rows)")).fetchall()
        if not rows:
            return
        names = {row[1] for row in rows}
        if "neutral_counts_json" not in names:
            conn.execute(
                text(
                    "ALTER TABLE tournament_draft_rows "
                    "ADD COLUMN neutral_counts_json TEXT DEFAULT '{}'"
                )
            )


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
