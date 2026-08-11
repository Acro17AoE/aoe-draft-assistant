from fastapi import APIRouter, HTTPException, Query

from ..aoestats import (
    AOESTATS_DEFAULT_MAPS_1V1,
    AOESTATS_DEFAULT_MAPS_TG,
    build_aoestats_preset_bundle,
)

router = APIRouter(prefix="/api/aoestats", tags=["aoestats"])


@router.get("/preset-bundle")
async def aoestats_preset_bundle(
    maps: str = Query("", description="Comma-separated map names"),
    grouping: str = Query(
        "random_map",
        description="random_map (1v1) or team_random_map (4v4)",
    ),
) -> dict:
    map_names = [name.strip() for name in maps.split(",") if name.strip()]
    if not map_names:
        map_names = (
            AOESTATS_DEFAULT_MAPS_TG if grouping == "team_random_map" else AOESTATS_DEFAULT_MAPS_1V1
        )
    try:
        return await build_aoestats_preset_bundle(map_names, grouping=grouping)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"aoestats.io unavailable: {exc}") from exc
