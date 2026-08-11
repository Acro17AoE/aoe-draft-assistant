import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { civIconUrl } from '../../lib/civs'
import {
  fetchMetaEvents,
  fetchMetaOverview,
  type MetaCivRate,
  type MetaEventSummary,
} from '../../lib/tournamentMeta'
import { CivVizDetailPanel } from './CivVizDetailPanel'

const PLOT_W = 720
const PLOT_H = 420
const PAD = { top: 24, right: 28, bottom: 48, left: 52 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function DraftOrbitPanel() {
  const [events, setEvents] = useState<MetaEventSummary[]>([])
  const [slug, setSlug] = useState('')
  const [rates, setRates] = useState<MetaCivRate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState(1)
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const payload = await fetchMetaEvents()
        if (cancelled) return
        setEvents(payload.events)
        const preferred =
          payload.events.find((event) => event.slug.includes('league')) ?? payload.events[0]
        if (preferred) setSlug(preferred.slug)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load events')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setBusy(true)
    setError(null)
    void (async () => {
      try {
        const meta = await fetchMetaOverview(slug)
        if (cancelled) return
        setRates(meta.civs?.rates ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load meta')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rates.filter((row) => {
      if (row.banRate == null || row.pickRate == null) return false
      if (!needle) return true
      return row.civ.toLowerCase().includes(needle)
    })
  }, [rates, query])

  const maxPlays = useMemo(
    () => Math.max(1, ...filtered.map((row) => row.plays ?? 1)),
    [filtered],
  )

  const points = useMemo(() => {
    const innerW = PLOT_W - PAD.left - PAD.right
    const innerH = PLOT_H - PAD.top - PAD.bottom
    return filtered.map((row) => {
      const ban = row.banRate ?? 0
      const pick = row.pickRate ?? 0
      const x = PAD.left + (ban / 100) * innerW
      const y = PAD.top + (1 - pick / 100) * innerH
      const r = 8 + ((row.plays ?? 0) / maxPlays) * 14
      const win = row.winRate
      const hue =
        win == null ? 40 : clamp(Math.round((win / 100) * 120), 0, 120)
      return { row, x, y, r, color: `hsla(${hue}, 70%, 48%, 0.85)` }
    })
  }, [filtered, maxPlays])

  const selectedRate = selected ? rates.find((row) => row.civ === selected) : null
  const hoverPoint = hovered ? points.find((point) => point.row.civ === hovered) : null

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy })
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  return (
    <div className="aoe-orbit">
      <div className="aoe-orbit-toolbar panel">
        <label>
          Tournament
          <select value={slug} onChange={(event) => setSlug(event.target.value)}>
            {events.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filter civ
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. Georgians"
          />
        </label>
        <label>
          Zoom
          <input
            type="range"
            min={0.8}
            max={2.2}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          className="compact-btn"
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
        >
          Reset view
        </button>
      </div>

      <p className="hint">
        X = ban rate · Y = pick rate · size = plays · color = win rate (red→green). Drag to pan.
      </p>
      {busy ? <p className="hint">Loading draft orbit…</p> : null}
      {error ? <p className="set-replay-error">{error}</p> : null}

      <div className="aoe-orbit-body">
        <div className="aoe-orbit-plot panel">
          <svg
            viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
            className="aoe-orbit-svg"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              <rect
                x={PAD.left}
                y={PAD.top}
                width={PLOT_W - PAD.left - PAD.right}
                height={PLOT_H - PAD.top - PAD.bottom}
                className="aoe-orbit-plot-bg"
              />
              {[0, 25, 50, 75, 100].map((tick) => {
                const x =
                  PAD.left + ((PLOT_W - PAD.left - PAD.right) * tick) / 100
                const y =
                  PAD.top +
                  (PLOT_H - PAD.top - PAD.bottom) * (1 - tick / 100)
                return (
                  <g key={tick}>
                    <line
                      x1={x}
                      y1={PAD.top}
                      x2={x}
                      y2={PLOT_H - PAD.bottom}
                      className="aoe-orbit-grid"
                    />
                    <line
                      x1={PAD.left}
                      y1={y}
                      x2={PLOT_W - PAD.right}
                      y2={y}
                      className="aoe-orbit-grid"
                    />
                    <text x={x} y={PLOT_H - 18} textAnchor="middle" className="aoe-orbit-axis">
                      {tick}%
                    </text>
                    <text x={18} y={y + 4} className="aoe-orbit-axis">
                      {tick}%
                    </text>
                  </g>
                )
              })}
              <text
                x={PLOT_W / 2}
                y={PLOT_H - 4}
                textAnchor="middle"
                className="aoe-orbit-axis-title"
              >
                Ban rate
              </text>
              <text
                x={14}
                y={PLOT_H / 2}
                textAnchor="middle"
                transform={`rotate(-90 14 ${PLOT_H / 2})`}
                className="aoe-orbit-axis-title"
              >
                Pick rate
              </text>

              {points.map((point) => {
                const active = selected === point.row.civ || hovered === point.row.civ
                return (
                  <g
                    key={point.row.civ}
                    transform={`translate(${point.x}, ${point.y})`}
                    className={`aoe-orbit-point${active ? ' is-active' : ''}`}
                    onMouseEnter={() => setHovered(point.row.civ)}
                    onMouseLeave={() =>
                      setHovered((current) => (current === point.row.civ ? null : current))
                    }
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelected(point.row.civ)
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle r={point.r} fill={point.color} />
                    <image
                      href={civIconUrl(point.row.civ)}
                      x={-8}
                      y={-8}
                      width={16}
                      height={16}
                      clipPath="circle(8px at 8px 8px)"
                    />
                  </g>
                )
              })}
            </g>
          </svg>
          {hoverPoint ? (
            <p className="hint aoe-orbit-tooltip">
              {hoverPoint.row.civ}: ban {hoverPoint.row.banRate}% · pick {hoverPoint.row.pickRate}%
              {hoverPoint.row.winRate != null ? ` · win ${hoverPoint.row.winRate}%` : ''}
              {hoverPoint.row.plays != null ? ` · ${hoverPoint.row.plays} plays` : ''}
            </p>
          ) : (
            <p className="hint aoe-orbit-tooltip">
              {filtered.length} civs plotted
              {!rates.length && !busy ? ' — sync Tournament Meta if empty' : ''}
            </p>
          )}
        </div>

        {selectedRate ? (
          <CivVizDetailPanel
            civ={selectedRate.civ}
            metaRate={selectedRate}
            onClose={() => setSelected(null)}
            onSelectCiv={setSelected}
          />
        ) : (
          <aside className="aoe-viz-detail panel aoe-viz-detail-empty">
            <h3>Pick a point</h3>
            <p className="hint">High ban / high pick civs sit top-right — polarizing draft staples.</p>
          </aside>
        )}
      </div>
    </div>
  )
}
