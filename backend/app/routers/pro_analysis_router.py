from fastapi import APIRouter, HTTPException, Query

from ..pro_analysis import build_pro_analysis

router = APIRouter(prefix="/api/pro-analysis", tags=["pro-analysis"])

ANALYSIS_TIMEOUT_SECONDS = 180.0


def _is_timeout_message(message: str) -> bool:
    lowered = message.lower()
    return any(
        token in lowered
        for token in (
            "timed out",
            "timeout",
            "time-out",
            "connection timed out",
            "connecttimeout",
            "readtimeout",
        )
    )


@router.get("")
async def pro_analysis(
    reference: str = Query(..., description="Your player name (reference profile)"),
    opponent: str = Query(..., description="Opponent player name"),
    tournament: str = Query("", description="Tournament name or aoe2recs slug"),
    history_scope: str = Query(
        "last_5_tournaments",
        description="last_5_tournaments | last_year | last_5_years | all_time",
    ),
) -> dict:
    import asyncio

    try:
        return await asyncio.wait_for(
            build_pro_analysis(reference, opponent, tournament or None, history_scope),
            timeout=ANALYSIS_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                f"Analysis timed out after {int(ANALYSIS_TIMEOUT_SECONDS)}s. "
                "Try scope 'Last 5 tournaments' first (faster). Later runs reuse the local cache."
            ),
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        message = str(exc).strip() or exc.__class__.__name__
        status = 504 if _is_timeout_message(message) else 502
        raise HTTPException(status_code=status, detail=message) from exc
