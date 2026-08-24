"""Quick manual test for /api/replay/parse-set."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

REPLAY = Path(r"c:\Users\Kai\Downloads\Nocturna eSports_SalzZ_game_2.aoe2record")
API = "http://127.0.0.1:8000/api/replay/parse-set?players_per_side=3"


def main() -> None:
    if not REPLAY.is_file():
        print(f"Missing replay: {REPLAY}", file=sys.stderr)
        sys.exit(1)

    with REPLAY.open("rb") as handle:
        response = httpx.post(
            API,
            files={"files": (REPLAY.name, handle, "application/octet-stream")},
            timeout=120.0,
        )
    response.raise_for_status()
    payload = response.json()
    print("parser revision:", payload.get("parser", {}).get("revision"))
    game = payload["games"][0]
    print("error:", game.get("error"))
    for index, team in enumerate(game.get("teams") or []):
        members = [(member["name"], member["civ"]) for member in team.get("members") or []]
        print(f"team {index}:", members)


if __name__ == "__main__":
    main()
