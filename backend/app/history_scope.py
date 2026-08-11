"""Historical analysis time window definitions."""

from __future__ import annotations

from dataclasses import dataclass

HISTORY_SCOPES = ("last_5_tournaments", "last_year", "last_5_years", "all_time")

SECONDS_PER_YEAR = 365 * 24 * 3600


@dataclass(frozen=True)
class HistoryScope:
    mode: str
    label: str
    window_seconds: int | None
    max_tournaments: int | None


def parse_history_scope(value: str | None) -> HistoryScope:
    mode = (value or "last_5_tournaments").strip().lower()
    if mode not in HISTORY_SCOPES:
        mode = "last_5_tournaments"

    if mode == "last_5_tournaments":
        return HistoryScope(
            mode=mode,
            label="last 5 tournaments",
            window_seconds=None,
            max_tournaments=5,
        )
    if mode == "last_year":
        return HistoryScope(
            mode=mode,
            label="last 12 months",
            window_seconds=SECONDS_PER_YEAR,
            max_tournaments=30,
        )
    if mode == "last_5_years":
        return HistoryScope(
            mode=mode,
            label="last 5 years",
            window_seconds=5 * SECONDS_PER_YEAR,
            max_tournaments=60,
        )
    return HistoryScope(
        mode="all_time",
        label="all time",
        window_seconds=None,
        max_tournaments=80,
    )


def tournament_in_scope(start_timestamp: int | None, scope: HistoryScope, *, now: float) -> bool:
    if scope.window_seconds is None:
        return True
    if not start_timestamp:
        return True
    return now - int(start_timestamp) <= scope.window_seconds
