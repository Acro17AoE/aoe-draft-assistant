import { useEffect, useMemo, useState } from 'react'
import { civIconUrl } from '../../lib/civs'
import { fetchAoeDataCivs } from '../../lib/aoeData'
import {
  CIV_ATLAS,
  CIV_ATLAS_REGIONS,
  type CivAtlasEntry,
  type CivAtlasRegion,
} from '../../data/civRegions'
import { fetchMetaEvents, fetchMetaOverview, type MetaCivRate } from '../../lib/tournamentMeta'
import { CivVizDetailPanel } from './CivVizDetailPanel'

/** Simplified continent silhouettes for a stylized atlas (viewBox 0 0 1000 520). */
function AtlasContinents() {
  return (
    <g className="aoe-atlas-continents" aria-hidden>
      <path
        d="M120 180 C160 120 240 100 280 140 C320 110 360 150 340 210 C300 280 220 300 160 270 C120 240 100 210 120 180 Z"
        className="aoe-atlas-land"
      />
      <path
        d="M200 300 C240 290 270 320 280 360 C270 420 240 450 210 430 C180 400 170 340 200 300 Z"
        className="aoe-atlas-land"
      />
      <path
        d="M250 360 C290 350 320 380 330 420 C310 470 270 480 250 450 C235 420 230 380 250 360 Z"
        className="aoe-atlas-land"
      />
      <path
        d="M420 120 C480 90 560 100 590 140 C620 120 660 140 650 180 C680 200 670 240 630 250 C600 280 540 270 510 240 C470 250 430 220 420 180 C400 150 400 130 420 120 Z"
        className="aoe-atlas-land"
      />
      <path
        d="M450 260 C500 250 540 280 530 320 C510 360 470 370 450 340 C430 310 430 280 450 260 Z"
        className="aoe-atlas-land"
      />
      <path
        d="M560 200 C620 180 700 190 760 220 C820 200 880 210 920 250 C940 290 900 320 850 310 C800 340 740 330 700 300 C650 310 600 280 580 250 C560 230 550 210 560 200 Z"
        className="aoe-atlas-land"
      />
      <path
        d="M780 300 C820 290 860 310 870 350 C850 390 800 390 780 360 C760 330 760 310 780 300 Z"
        className="aoe-atlas-land"
      />
      <circle cx="200" cy="90" r="55" className="aoe-atlas-land aoe-atlas-land-ice" />
      <circle cx="520" cy="480" r="70" className="aoe-atlas-land aoe-atlas-land-ice" />
    </g>
  )
}

export function CivAtlasPanel() {
  const [gameCivs, setGameCivs] = useState<string[]>([])
  const [regionFilter, setRegionFilter] = useState<CivAtlasRegion | 'all'>('all')
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [metaByCiv, setMetaByCiv] = useState<Record<string, MetaCivRate>>({})
  const [metaLabel, setMetaLabel] = useState<string | null>(null)
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
        setMetaLabel(league.displayName)
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
        <p className="hint">
          {entries.length} civilizations
          {metaLabel ? ` · meta from ${metaLabel}` : ''}
        </p>
      </div>

      {error ? <p className="set-replay-error">{error}</p> : null}

      <div className="aoe-atlas-body">
        <div className="aoe-atlas-map-wrap panel">
          <svg
            className="aoe-atlas-map"
            viewBox="0 0 1000 520"
            role="img"
            aria-label="Civilization atlas"
          >
            <defs>
              <radialGradient id="aoe-atlas-ocean" cx="50%" cy="40%" r="70%">
                <stop offset="0%" stopColor="rgba(40, 72, 110, 0.55)" />
                <stop offset="100%" stopColor="rgba(12, 22, 38, 0.9)" />
              </radialGradient>
            </defs>
            <rect width="1000" height="520" fill="url(#aoe-atlas-ocean)" rx="12" />
            <AtlasContinents />
            {entries.map((entry) => {
              const active = selected === entry.civ || hovered === entry.civ
              return (
                <g
                  key={entry.civ}
                  className={`aoe-atlas-marker${active ? ' is-active' : ''}`}
                  transform={`translate(${entry.x}, ${entry.y})`}
                  onMouseEnter={() => setHovered(entry.civ)}
                  onMouseLeave={() => setHovered((current) => (current === entry.civ ? null : current))}
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
          {hovered && !selected ? (
            <p className="hint aoe-atlas-hover-hint">
              {hovered}
              {metaByCiv[hovered]?.banRate != null
                ? ` · ban ${metaByCiv[hovered].banRate}%`
                : ''}
              {metaByCiv[hovered]?.pickRate != null
                ? ` · pick ${metaByCiv[hovered].pickRate}%`
                : ''}
            </p>
          ) : (
            <p className="hint aoe-atlas-hover-hint">Hover a civ, click for DNA + meta detail.</p>
          )}
        </div>

        {selectedEntry ? (
          <CivVizDetailPanel
            civ={selectedEntry.civ}
            metaRate={metaByCiv[selectedEntry.civ]}
            onClose={() => setSelected(null)}
            onSelectCiv={setSelected}
          />
        ) : (
          <aside className="aoe-viz-detail panel aoe-viz-detail-empty">
            <h3>Select a civilization</h3>
            <p className="hint">
              Markers sit near historical heartlands on a stylized map — not exact borders.
            </p>
          </aside>
        )}
      </div>
    </div>
  )
}
