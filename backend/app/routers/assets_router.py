"""Same-origin asset proxies for browser canvas / html-to-image capture."""

from __future__ import annotations

import re

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

router = APIRouter(prefix="/api/assets", tags=["assets"])

_MAP_OVERRIDES: dict[str, str] = {
    "frontline": "https://i.ibb.co/35sFFxSg/TL-Frontline.png",
    "menindee": "https://i.ibb.co/tT66jhSj/TL-Menindee.png",
    "fortress (regicide)": "https://i.ibb.co/LXv8wBMY/TL-Fortress.png",
    "fortress": "https://i.ibb.co/LXv8wBMY/TL-Fortress.png",
}

_KNOWN_MAPS = [
    "Acropolis",
    "Arabia",
    "Arena",
    "Black Forest",
    "Cape of Storms",
    "Crescent",
    "Enemy Archipelago",
    "Fortified Clearing",
    "Fortress",
    "Frontline",
    "Gold Rush",
    "Grand Bara",
    "Hideout",
    "Islands",
    "Land Nomad",
    "MegaRandom",
    "Menindee",
    "Migration",
    "Nomad",
    "Oasis",
    "Team Acropolis",
    "Team Islands",
    "Tres Leches",
    "Fortress (Regicide)",
]


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def _resolve_map_image_url(map_name: str) -> str | None:
    """Resolve emblem URL by exact normalized name only (no fuzzy substring matching)."""
    trimmed = map_name.strip()
    if not trimmed:
        return None
    key = _normalize(trimmed)
    if not key:
        return None

    for override_key, url in _MAP_OVERRIDES.items():
        if _normalize(override_key) == key:
            return url

    known = next((m for m in _KNOWN_MAPS if _normalize(m) == key), None)
    slug_source = known or trimmed
    slug = slug_source.lower().replace(" ", "-")
    slug = re.sub(r"[()]", "", slug)
    return f"https://aoe2cm.net/images/maps/{slug}.png"


@router.get("/map-image")
async def proxy_map_image(name: str = Query(..., min_length=1, max_length=120)) -> Response:
    url = _resolve_map_image_url(name)
    if not url:
        raise HTTPException(status_code=404, detail="Map image not found")

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            upstream = await client.get(
                url,
                headers={"User-Agent": "AoE-Draft-Assistant/1.0"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Failed to fetch map image") from exc

    if upstream.status_code >= 400:
        raise HTTPException(status_code=404, detail="Map image not found")

    content_type = upstream.headers.get("content-type", "image/png")
    if "image" not in content_type:
        content_type = "image/png"

    return Response(
        content=upstream.content,
        media_type=content_type,
        headers={
            # Avoid sticky wrong images after map-name resolution fixes.
            "Cache-Control": "public, max-age=3600, must-revalidate",
            "X-Map-Image-Source": url,
        },
    )
