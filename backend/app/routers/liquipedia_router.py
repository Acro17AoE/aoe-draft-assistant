"""Liquipedia configuration / status endpoints."""

from fastapi import APIRouter

from ..liquipedia import liquipedia_status

router = APIRouter(prefix="/api/liquipedia", tags=["liquipedia"])


@router.get("/status")
async def status() -> dict:
    return liquipedia_status()
