from fastapi import APIRouter, HTTPException, Query

from .. import game_data

router = APIRouter(prefix="/api/aoe-data", tags=["aoe-data"])


@router.get("/overview")
async def aoe_data_overview() -> dict:
    try:
        return await game_data.overview_payload()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Game data unavailable: {exc}") from exc


@router.get("/civs")
async def aoe_data_civs() -> dict:
    try:
        return {"civs": await game_data.list_civs()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Game data unavailable: {exc}") from exc


@router.get("/entities/search")
async def aoe_data_search_entities(
    q: str = Query("", min_length=1),
    limit: int = Query(20, ge=1, le=50),
) -> dict:
    try:
        results = await game_data.search_entities(q, limit=limit)
        return {"query": q, "results": results}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Game data unavailable: {exc}") from exc


@router.get("/entities/intersection")
async def aoe_data_intersection(
    keys: str = Query(..., description="Comma-separated entity keys, e.g. tech:39,tech:437"),
) -> dict:
    entity_keys = [part.strip() for part in keys.split(",") if part.strip()]
    if not entity_keys:
        raise HTTPException(status_code=400, detail="No entity keys provided")
    try:
        return await game_data.entity_intersection(entity_keys)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Game data unavailable: {exc}") from exc


@router.get("/entities/{entity_type}/{entity_id}")
async def aoe_data_entity(entity_type: str, entity_id: str) -> dict:
    try:
        detail = await game_data.entity_detail(entity_type.lower(), entity_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Game data unavailable: {exc}") from exc
    if not detail:
        raise HTTPException(status_code=404, detail="Entity not found")
    return detail


@router.get("/civ-similarity/{civ_name}")
async def aoe_data_civ_similarity(
    civ_name: str,
    limit: int = Query(8, ge=1, le=20),
    mode: str = Query(
        "overall",
        description="overall | military | eco",
    ),
) -> dict:
    normalized = mode.lower().strip()
    if normalized not in {"overall", "military", "eco"}:
        raise HTTPException(status_code=400, detail="mode must be overall, military, or eco")
    try:
        return await game_data.civ_similarity(civ_name, limit=limit, mode=normalized)  # type: ignore[arg-type]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Game data unavailable: {exc}") from exc


@router.get("/civ-similarity-matrix")
async def aoe_data_civ_similarity_matrix(
    mode: str = Query("overall", description="overall | military | eco"),
) -> dict:
    normalized = mode.lower().strip()
    if normalized not in {"overall", "military", "eco"}:
        raise HTTPException(status_code=400, detail="mode must be overall, military, or eco")
    try:
        return await game_data.civ_similarity_matrix(mode=normalized)  # type: ignore[arg-type]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Game data unavailable: {exc}") from exc


@router.get("/synergies")
async def aoe_data_synergies(
    category: str | None = Query(None),
) -> dict:
    try:
        rows = await game_data.list_synergies(category=category)
        return {"synergies": rows}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Game data unavailable: {exc}") from exc
