"""Shared admin gate — ADMIN_EMAIL comes from the environment (never hardcode)."""

from __future__ import annotations

import os


def admin_emails() -> set[str]:
    raw = (os.getenv("ADMIN_EMAIL") or os.getenv("ADMIN_EMAILS") or "").strip()
    if not raw:
        return set()
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def is_admin_email(email: str | None) -> bool:
    if not email:
        return False
    allowed = admin_emails()
    if not allowed:
        return False
    return email.strip().lower() in allowed
