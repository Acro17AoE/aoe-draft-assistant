"""Idempotent demo community presets for local / first-run browsing."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from .auth_utils import hash_password, new_id
from .models import CommunityPreset, User

SEED_AUTHOR_EMAIL = "community-samples@draft.local"
SEED_AUTHOR_NAME = "DRAFT Samples"

# Stable IDs so restarts do not duplicate rows.
SEED_PRESETS: list[dict[str, Any]] = [
    {
        "id": "seed-arabia-open-meta",
        "title": "Arabia Open Meta (Sample)",
        "map_name": "Arabia",
        "entries": {
            "S": ["Mayans", "Huns"],
            "A": ["Chinese", "Vikings", "Malians", "Mongols"],
            "B": ["Aztecs", "Britons", "Ethiopians", "Gurjaras", "Hindustanis", "Poles"],
            "C": ["Berbers", "Bulgarians", "Franks", "Japanese", "Portuguese", "Tatars"],
            "D": ["Bohemians", "Burgundians", "Italians", "Slavs"],
        },
    },
    {
        "id": "seed-arabia-archer-focus",
        "title": "Arabia Archer Focus (Sample)",
        "map_name": "Arabia",
        "entries": {
            "S": ["Britons", "Ethiopians"],
            "A": ["Mayans", "Vietnamese", "Chinese", "Vikings"],
            "B": ["Aztecs", "Berbers", "Huns", "Japanese", "Malians", "Portuguese"],
            "C": ["Franks", "Gurjaras", "Hindustanis", "Italians", "Mongols", "Tatars"],
            "D": ["Bohemians", "Burgundians", "Byzantines", "Slavs"],
        },
    },
    {
        "id": "seed-arena-close-meta",
        "title": "Arena Close Meta (Sample)",
        "map_name": "Arena",
        "entries": {
            "S": ["Teutons", "Byzantines"],
            "A": ["Celts", "Slavs", "Vikings", "Japanese"],
            "B": ["Britons", "Chinese", "Franks", "Goths", "Koreans", "Malians"],
            "C": ["Aztecs", "Bulgarians", "Ethiopians", "Incas", "Magyars", "Persians"],
            "D": ["Bohemians", "Burgundians", "Italians", "Portuguese"],
        },
    },
    {
        "id": "seed-arena-monk-push",
        "title": "Arena Monk Push (Sample)",
        "map_name": "Arena",
        "entries": {
            "S": ["Aztecs", "Spanish"],
            "A": ["Byzantines", "Lithuanians", "Teutons", "Saracens"],
            "B": ["Britons", "Chinese", "Franks", "Japanese", "Mayans", "Slavs"],
            "C": ["Celts", "Ethiopians", "Goths", "Koreans", "Malians", "Vikings"],
            "D": ["Bohemians", "Burgundians", "Huns", "Portuguese"],
        },
    },
    {
        "id": "seed-bf-trash-wars",
        "title": "Black Forest Trash Wars (Sample)",
        "map_name": "Black Forest",
        "entries": {
            "S": ["Teutons", "Slavs"],
            "A": ["Franks", "Celts", "Byzantines", "Magyars"],
            "B": ["Britons", "Chinese", "Goths", "Japanese", "Koreans", "Malians"],
            "C": ["Aztecs", "Bulgarians", "Ethiopians", "Huns", "Incas", "Persians"],
            "D": ["Bohemians", "Burgundians", "Italians", "Portuguese"],
        },
    },
    {
        "id": "seed-bf-booming",
        "title": "Black Forest Boom (Sample)",
        "map_name": "Black Forest",
        "entries": {
            "S": ["Persians", "Spanish"],
            "A": ["Byzantines", "Celts", "Franks", "Teutons"],
            "B": ["Britons", "Chinese", "Goths", "Japanese", "Koreans", "Slavs"],
            "C": ["Aztecs", "Ethiopians", "Huns", "Incas", "Magyars", "Malians"],
            "D": ["Bohemians", "Burgundians", "Italians", "Portuguese"],
        },
    },
]


def _entries_payload(groups: dict[str, list[str]]) -> str:
    entries: list[dict[str, Any]] = []
    for tier, civs in groups.items():
        for index, civ_id in enumerate(civs):
            entries.append({"civId": civ_id, "tier": tier, "tierRank": index})
    return json.dumps({"entries": entries}, separators=(",", ":"), ensure_ascii=False)


def _ensure_seed_author(db: Session) -> User:
    user = db.query(User).filter(User.email == SEED_AUTHOR_EMAIL).first()
    if user:
        return user
    user = User(
        id=new_id(),
        email=SEED_AUTHOR_EMAIL,
        password_hash=hash_password(new_id()),
        display_name=SEED_AUTHOR_NAME,
    )
    db.add(user)
    db.flush()
    return user


def seed_community_presets(db: Session) -> int:
    """Insert missing sample community presets. Returns number of rows added."""
    author = _ensure_seed_author(db)
    created = 0
    for item in SEED_PRESETS:
        exists = db.query(CommunityPreset.id).filter(CommunityPreset.id == item["id"]).first()
        if exists:
            continue
        db.add(
            CommunityPreset(
                id=item["id"],
                author_id=author.id,
                title=item["title"],
                map_name=item["map_name"],
                format="1v1",
                payload_json=_entries_payload(item["entries"]),
                score=0,
                upvote_count=0,
                downvote_count=0,
            )
        )
        created += 1
    db.commit()
    return created
