"""List civ drafts where Persians were picked (Qualifier 1+2)."""
import asyncio
import re
import sys

import httpx

from app.aoe2cm import fetch_draft
from app.tournament_dataset import (
    _normalize_civ_count_dict,
    analyze_draft_events_all_sides,
)

UA = "DRAFT-AoE2/1.0 (AoE Draft Assistant)"


async def civ_draft_ids_for_qualifier(page: str) -> list[str]:
    params = {
        "action": "parse",
        "page": page,
        "prop": "wikitext",
        "format": "json",
        "formatversion": 2,
    }
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        response = await client.get(
            "https://liquipedia.net/ageofempires/api.php",
            params=params,
            headers={"User-Agent": UA},
        )
        response.raise_for_status()
        wikitext = response.json()["parse"]["wikitext"]
    return list(dict.fromkeys(re.findall(r"civdraft=([A-Za-z0-9_-]+)", wikitext)))


async def main() -> None:
    qualifiers = [
        ("Q1", "The_League/Qualifier/1"),
        ("Q2", "The_League/Qualifier/2"),
    ]
    results: list[dict[str, object]] = []

    for label, page in qualifiers:
        draft_ids = await civ_draft_ids_for_qualifier(page)
        print(f"{label}: {len(draft_ids)} civ drafts", file=sys.stderr)
        for draft_id in draft_ids:
            try:
                draft = await fetch_draft(draft_id, use_cache=False)
            except Exception as exc:
                print(f"  SKIP {draft_id}: {exc}", file=sys.stderr)
                continue

            analysis = analyze_draft_events_all_sides(
                draft.get("events") or [],
                normalize_civ=True,
            )
            picks = _normalize_civ_count_dict(analysis["pickCounts"])
            if picks.get("Persians", 0) <= 0:
                continue

            pick_no = analysis["pickOrderAvg"].get("Persians")
            results.append(
                {
                    "qualifier": label,
                    "id": draft_id,
                    "url": f"https://aoe2cm.net/draft/{draft_id}",
                    "pick_no": pick_no,
                    "host": (draft.get("nameHost") or "").strip(),
                    "guest": (draft.get("nameGuest") or "").strip(),
                }
            )

    for row in results:
        print(
            f"{row['qualifier']}\tPick #{row['pick_no']}\t{row['host']} vs {row['guest']}\t{row['url']}"
        )
    print(f"\nTotal: {len(results)} drafts", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
