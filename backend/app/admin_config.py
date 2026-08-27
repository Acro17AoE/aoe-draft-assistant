"""Env-driven account gates — never hardcode emails in source."""

from __future__ import annotations

import os


def _emails_from_env(*names: str) -> set[str]:
    combined: set[str] = set()
    for name in names:
        raw = (os.getenv(name) or "").strip()
        if not raw:
            continue
        combined.update(part.strip().lower() for part in raw.split(",") if part.strip())
    return combined


def admin_emails() -> set[str]:
    return _emails_from_env("ADMIN_EMAIL", "ADMIN_EMAILS")


def is_admin_email(email: str | None) -> bool:
    if not email:
        return False
    allowed = admin_emails()
    if not allowed:
        return False
    return email.strip().lower() in allowed


def opponent_analysis_emails() -> set[str]:
    """Allowlist for Opponent Analysis UI + team analysis API."""
    return _emails_from_env("OPPONENT_ANALYSIS_EMAIL", "OPPONENT_ANALYSIS_EMAILS")


def is_opponent_analysis_email(email: str | None) -> bool:
    """Admins always have access; otherwise require the opponent-analysis allowlist."""
    if not email:
        return False
    if is_admin_email(email):
        return True
    allowed = opponent_analysis_emails()
    if not allowed:
        return False
    return email.strip().lower() in allowed
