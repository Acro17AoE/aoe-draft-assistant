from collections import Counter


def _normalize_map_name(name: str) -> str:
    return " ".join(name.lower().split())


def _side_from_event(event: dict) -> str:
    return (event.get("executingPlayer") or event.get("player") or "").upper()


def extract_own_map_picks(events: list[dict], own_side: str) -> list[str]:
    own = own_side.upper()
    picks: list[str] = []

    for event in events:
        action = (event.get("actionType") or event.get("action") or "").lower()
        if action not in ("pick", "steal"):
            continue
        if _side_from_event(event) != own:
            continue
        option = event.get("chosenOptionId")
        if option:
            picks.append(option)

    return picks


def analyze_map_draft_events(events: list[dict], opponent_side: str) -> dict[str, object]:
    opponent = opponent_side.upper()
    picks: list[str] = []
    bans: list[str] = []
    pick_order: Counter[str] = Counter()
    ban_targets: Counter[str] = Counter()

    for event in events:
        action = (event.get("actionType") or event.get("action") or "").lower()
        player = _side_from_event(event)
        option = event.get("chosenOptionId")
        if not option or player == "NONE":
            continue

        if action == "pick" and player == opponent:
            picks.append(option)
            pick_order[option] += 1
        elif action == "ban" and player == opponent:
            bans.append(option)
            ban_targets[option] += 1

    frequently_picked = [name for name, _ in pick_order.most_common(5)]
    frequently_banned = [name for name, _ in ban_targets.most_common(5)]

    return {
        "opponentPicks": picks,
        "opponentBans": bans,
        "prioMaps": frequently_picked,
        "antiPrioMaps": frequently_banned,
        "pickCounts": dict(pick_order),
        "banCounts": dict(ban_targets),
    }


def merge_map_insights(
    draft_analysis: dict[str, object],
    play_counts: dict[str, object],
    map_pool: list[str],
) -> list[dict[str, object]]:
    pool = {_normalize_map_name(name): name for name in map_pool}
    pick_counts = draft_analysis.get("pickCounts", {})
    ban_counts = draft_analysis.get("banCounts", {})
    total_by_map = play_counts.get("totalByMap", {})
    by_opponent = play_counts.get("byOpponent", {})

    opponent_totals: Counter[str] = Counter()
    for counts in by_opponent.values():
        if isinstance(counts, dict):
            opponent_totals.update(counts)

    results: list[dict[str, object]] = []
    seen: set[str] = set()

    def add_map(raw_name: str) -> str | None:
        normalized = _normalize_map_name(raw_name)
        if normalized in pool:
            return pool[normalized]
        if raw_name in map_pool:
            return raw_name
        return None

    for raw_name in map_pool:
        normalized = _normalize_map_name(raw_name)
        seen.add(normalized)
        played = int(total_by_map.get(raw_name, 0) or opponent_totals.get(raw_name, 0))
        picked = int(pick_counts.get(raw_name, 0))
        banned = int(ban_counts.get(raw_name, 0))

        tags: list[str] = []
        if picked > 0:
            tags.append("Opponent pick")
        if banned > 0:
            tags.append("Opponent ban")
        if played >= 2:
            tags.append("Frequently played")
        if raw_name in draft_analysis.get("prioMaps", []):
            tags.append("Likely pick")
        if raw_name in draft_analysis.get("antiPrioMaps", []):
            tags.append("Likely ban")

        results.append(
            {
                "map": raw_name,
                "playedCount": played,
                "opponentPickCount": picked,
                "opponentBanCount": banned,
                "tags": tags,
                "score": played * 2 + picked * 3 + banned * 2,
            }
        )

    for raw_name, count in total_by_map.items():
        normalized = _normalize_map_name(raw_name)
        if normalized in seen:
            continue
        display = add_map(raw_name)
        if not display:
            continue
        results.append(
            {
                "map": display,
                "playedCount": int(count),
                "opponentPickCount": 0,
                "opponentBanCount": 0,
                "tags": ["Frequently played"] if int(count) >= 2 else [],
                "score": int(count) * 2,
            }
        )

    results.sort(key=lambda item: item["score"], reverse=True)
    return results
