import { useEffect, useMemo, useState } from 'react'
import { civIconUrl } from '../../lib/civs'
import { fetchAoeDataCivs } from '../../lib/aoeData'
import {
  CIV_ATLAS,
  CIV_ATLAS_REGIONS,
  projectLatLon,
  type CivAtlasEntry,
  type CivAtlasRegion,
} from '../../data/civRegions'
import { fetchMetaEvents, fetchMetaOverview, type MetaCivRate } from '../../lib/tournamentMeta'
import { CivVizDetailPanel } from './CivVizDetailPanel'

const MAP_W = 950
const MAP_H = 620

export function CivAtlasPanel() {
  const [gameCivs, setGameCivs] = useState<string[]>([])
  const [regionFilter, setRegionFilter] = useState<CivAtlasRegion | 'all'>('all')
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [metaByCiv, setMetaByCiv] = useState<Record<string, MetaCivRate>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await fetchAoeDataCivs()
        if (!cancelled) setGameCivs(list)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load civs')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const events = await fetchMetaEvents()
        const league =
          events.events.find((event) => event.slug.includes('league')) ?? events.events[0]
        if (!league) return
        const meta = await fetchMetaOverview(league.slug)
        if (cancelled) return
        const map: Record<string, MetaCivRate> = {}
        for (const row of meta.civs?.rates ?? []) {
          map[row.civ] = row
        }
        setMetaByCiv(map)
      } catch {
        // optional
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const entries = useMemo(() => {
    const known = new Set(gameCivs.map((civ) => civ.toLowerCase()))
    return CIV_ATLAS.filter((entry) => {
      if (known.size && !known.has(entry.civ.toLowerCase())) return false
      if (regionFilter !== 'all' && entry.region !== regionFilter) return false
      return true
    })
  }, [gameCivs, regionFilter])

  const selectedEntry: CivAtlasEntry | undefined = selected
    ? entries.find((entry) => entry.civ === selected) ?? CIV_ATLAS.find((e) => e.civ === selected)
    : undefined

  return (
    <div className="aoe-atlas">
      <div className="aoe-atlas-toolbar panel">
        <div className="aoe-data-filter-row" role="tablist" aria-label="Region filter">
          <button
            type="button"
            className={`chip${regionFilter === 'all' ? '' : ' muted'}`}
            onClick={() => setRegionFilter('all')}
          >
            All regions
          </button>
          {CIV_ATLAS_REGIONS.map((region) => (
            <button
              key={region}
              type="button"
              className={`chip${regionFilter === region ? '' : ' muted'}`}
              onClick={() => setRegionFilter(region)}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="set-replay-error">{error}</p> : null}

      <div className="aoe-atlas-body">
        <div className="aoe-atlas-scroll panel">
          <div className="aoe-atlas-scroll-inner">
            <svg
              className="aoe-atlas-map"
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              role="img"
              aria-label="Civilization atlas"
            >
              <defs>
                <filter id="aoe-atlas-parchment" x="-2%" y="-2%" width="104%" height="104%">
                  <feColorMatrix
                    type="matrix"
                    values="0.55 0.35 0.1 0 0.18
                            0.28 0.42 0.12 0 0.1
                            0.12 0.2 0.28 0 0.05
                            0 0 0 1 0"
                  />
                </filter>
              </defs>
              <image
                href="/maps/world.svg"
                width={MAP_W}
                height={MAP_H}
                preserveAspectRatio="xMidYMid meet"
                filter="url(#aoe-atlas-parchment)"
                className="aoe-atlas-basemap"
              />
              {entries.map((entry) => {
                const { x, y } = projectLatLon(entry.lat, entry.lon, MAP_W, MAP_H)
                const active = selected === entry.civ || hovered === entry.civ
                return (
                  <g
                    key={entry.civ}
                    className={`aoe-atlas-marker${active ? ' is-active' : ''}`}
                    transform={`translate(${x}, ${y})`}
                    onMouseEnter={() => setHovered(entry.civ)}
                    onMouseLeave={() =>
                      setHovered((current) => (current === entry.civ ? null : current))
                    }
                    onClick={() => setSelected(entry.civ)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle r={active ? 16 : 13} className="aoe-atlas-marker-ring" />
                    <image
                      href={civIconUrl(entry.civ)}
                      x={-10}
                      y={-10}
                      width={20}
                      height={20}
                      clipPath="circle(10px at 10px 10px)"
                    />
                    {active ? (
                      <text y={28} textAnchor="middle" className="aoe-atlas-marker-label">
                        {entry.civ}
                      </text>
                    ) : null}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {selectedEntry ? (
          <CivVizDetailPanel
            civ={selectedEntry.civ}
            metaRate={metaByCiv[selectedEntry.civ]}
            onClose={() => setSelected(null)}
            onSelectCiv={setSelected}
          />
        ) : null}
      </div>
    </div>
  )
}
