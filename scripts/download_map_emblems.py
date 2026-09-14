"""Download map emblems into frontend/public/maps/emblems for reliable PNG export."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "maps" / "emblems"

MAPS = [
    "Acropolis",
    "Arabia",
    "Arena",
    "Black Forest",
    "Cape of Storms",
    "Crescent",
    "Enemy Archipelago",
    "Fortified Clearing",
    "Fortress",
    "Fortress (Regicide)",
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
]

OVERRIDES = {
    "frontline": "https://i.ibb.co/35sFFxSg/TL-Frontline.png",
    "menindee": "https://i.ibb.co/tT66jhSj/TL-Menindee.png",
    "fortress regicide": "https://i.ibb.co/LXv8wBMY/TL-Fortress.png",
    "fortress": "https://i.ibb.co/LXv8wBMY/TL-Fortress.png",
}


def normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def slugify(name: str) -> str:
    slug = name.lower().replace(" ", "-")
    return re.sub(r"[()]", "", slug)


def resolve_url(name: str) -> str:
    key = normalize(name)
    if key in OVERRIDES:
        return OVERRIDES[key]
    return f"https://aoe2cm.net/images/maps/{slugify(name)}.png"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    hashes: dict[str, str] = {}
    with httpx.Client(timeout=30.0, follow_redirects=True, headers={"User-Agent": "AoE-Draft-Assistant/1.0"}) as client:
        for name in MAPS:
            url = resolve_url(name)
            slug = slugify(name)
            # Fortress and Fortress (Regicide) share art → same file name for regicide slug
            path = OUT / f"{slug}.png"
            print(f"GET {name} <- {url}")
            r = client.get(url)
            if r.status_code >= 400 or "image" not in r.headers.get("content-type", "image"):
                print(f"  FAIL status={r.status_code} ctype={r.headers.get('content-type')}")
                continue
            path.write_bytes(r.content)
            digest = hashlib.sha256(r.content).hexdigest()[:12]
            hashes[name] = digest
            print(f"  OK {path.name} bytes={len(r.content)} sha={digest}")

    # Detect accidental duplicates of Arabia
    arabia = hashes.get("Arabia")
    if arabia:
        for name, digest in hashes.items():
            if name != "Arabia" and digest == arabia:
                print(f"WARNING: {name} has same hash as Arabia!")


if __name__ == "__main__":
    main()
