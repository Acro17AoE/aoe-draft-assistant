import { useMemo } from 'react'
import type { MapPickDisplay } from '../types/draft'
import { normalizeMapName } from '../lib/maps'

export function MapPickChips({ picks, emptyLabel }: { picks: MapPickDisplay[]; emptyLabel?: string }) {
  const displayPicks = useMemo(() => {
    if (!picks.length) return picks
    const uniqueNames = new Set(picks.map((pick) => normalizeMapName(pick.name)))
    // 1-map-only / same map repeated for BoX: show the map once in the header.
    if (uniqueNames.size === 1) return [picks[0]!]
    return picks
  }, [picks])

  if (!displayPicks.length) {
    return emptyLabel ? <span className="hint">{emptyLabel}</span> : null
  }

  return (
    <div className="map-pick-chips">
      {displayPicks.map((pick) => (
        <span key={pick.id} className="map-pick-chip" title={pick.name}>
          {pick.imageUrl ? (
            <img src={pick.imageUrl} alt="" loading="lazy" />
          ) : (
            <span className="map-pick-fallback">{pick.name.charAt(0)}</span>
          )}
          <em>{pick.name}</em>
        </span>
      ))}
    </div>
  )
}
