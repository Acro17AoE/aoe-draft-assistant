import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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
const ICON = 28
const ICON_ACTIVE = 34

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const local = point.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

export function CivAtlasPanel() {
  const [gameCivs, setGameCivs] = useState<string[]>([])
  const [regionFilter, setRegionFilter] = useState<CivAtlasRegion | 'all'>('all')
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [metaByCiv, setMetaByCiv] = useState<Record<string, MetaCivRate>>({})
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{
    x: number
    y: number
    panX: number
    panY: number
    moved: boolean
  } | null>(null)

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

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY > 0 ? -0.12 : 0.12
      setZoom((prevZoom) => {
        const nextZoom = clamp(prevZoom + delta, 0.7, 5)
        const local = clientToSvg(svg, event.clientX, event.clientY)
        setPan((prevPan) => {
          const contentX = (local.x - prevPan.x) / prevZoom
          const contentY = (local.y - prevPan.y) / prevZoom
          return {
            x: local.x - contentX * nextZoom,
            y: local.y - contentY * nextZoom,
          }
        })
        return nextZoom
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
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

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    if (Math.hypot(dx, dy) > 3) dragRef.current.moved = true
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy })
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

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
              ref={svgRef}
              className="aoe-atlas-map"
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              role="img"
              aria-label="Civilization atlas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onDoubleClick={(event) => {
                event.preventDefault()
                resetView()
              }}
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
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
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
                  const size = active ? ICON_ACTIVE : ICON
                  const half = size / 2
                  return (
                    <g
                      key={entry.civ}
                      className={`aoe-atlas-marker${active ? ' is-active' : ''}`}
                      transform={`translate(${x}, ${y})`}
                      onMouseEnter={() => setHovered(entry.civ)}
                      onMouseLeave={() =>
                        setHovered((current) => (current === entry.civ ? null : current))
                      }
                      onClick={(event) => {
                        event.stopPropagation()
                        if (dragRef.current?.moved) return
                        setSelected(entry.civ)
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle r={half + 4} className="aoe-atlas-marker-ring" />
                      <image
                        href={civIconUrl(entry.civ)}
                        x={-half}
                        y={-half}
                        width={size}
                        height={size}
                        clipPath={`circle(${half}px at ${half}px ${half}px)`}
                      />
                      {active ? (
                        <text y={half + 16} textAnchor="middle" className="aoe-atlas-marker-label">
                          {entry.civ}
                        </text>
                      ) : null}
                    </g>
                  )
                })}
              </g>
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
