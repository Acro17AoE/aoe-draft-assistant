import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { civIconUrl } from '../../lib/civs'
import {
  fetchAoeDataSimilarityMatrix,
  fetchAoeDataSynergies,
  type AoeDataDnaMode,
  type AoeDataSimilarityEdge,
  type AoeDataSynergy,
} from '../../lib/aoeData'
import { CIV_ATLAS, atlasEntryForCiv, projectLatLon } from '../../data/civRegions'
import { CivVizDetailPanel } from './CivVizDetailPanel'

const DNA_MODES: { id: AoeDataDnaMode; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'military', label: 'Military' },
  { id: 'eco', label: 'Eco' },
]

const WIDTH = 1100
const HEIGHT = 680

interface SimNode {
  civ: string
  x: number
  y: number
  vx: number
  vy: number
}

function seedPositions(civs: string[]): SimNode[] {
  return civs.map((civ, index) => {
    const atlas = atlasEntryForCiv(civ)
    if (atlas) {
      const projected = projectLatLon(atlas.lat, atlas.lon)
      return {
        civ,
        x: (projected.x / 950) * WIDTH,
        y: (projected.y / 620) * HEIGHT,
        vx: 0,
        vy: 0,
      }
    }
    const angle = (index / Math.max(1, civs.length)) * Math.PI * 2
    return {
      civ,
      x: WIDTH / 2 + Math.cos(angle) * 180,
      y: HEIGHT / 2 + Math.sin(angle) * 140,
      vx: 0,
      vy: 0,
    }
  })
}

export function SimilarityConstellationPanel() {
  const [mode, setMode] = useState<AoeDataDnaMode>('overall')
  const [threshold, setThreshold] = useState(62)
  const [showSynergies, setShowSynergies] = useState(true)
  const [edges, setEdges] = useState<AoeDataSimilarityEdge[]>([])
  const [civs, setCivs] = useState<string[]>([])
  const [synergies, setSynergies] = useState<AoeDataSynergy[]>([])
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const dragCiv = useRef<string | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setError(null)
    void (async () => {
      try {
        const data = await fetchAoeDataSimilarityMatrix(mode)
        if (cancelled) return
        setCivs(data.civs)
        setEdges(data.edges)
        const seeded = seedPositions(data.civs.length ? data.civs : CIV_ATLAS.map((e) => e.civ))
        nodesRef.current = seeded
        setNodes(seeded)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Matrix failed')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchAoeDataSynergies()
        if (!cancelled) setSynergies(rows)
      } catch {
        // optional layer
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleEdges = useMemo(
    () => edges.filter((edge) => edge.similarity >= threshold),
    [edges, threshold],
  )

  const neighborSet = useMemo(() => {
    const focus = selected ?? hovered
    if (!focus) return null
    const set = new Set<string>([focus])
    for (const edge of visibleEdges) {
      if (edge.a === focus) set.add(edge.b)
      if (edge.b === focus) set.add(edge.a)
    }
    return set
  }, [selected, hovered, visibleEdges])

  useEffect(() => {
    const tick = () => {
      const current = nodesRef.current
      if (!current.length) {
        frameRef.current = requestAnimationFrame(tick)
        return
      }

      const index = new Map(current.map((node, i) => [node.civ, i]))
      const forces = current.map(() => ({ fx: 0, fy: 0 }))

      // weak centering + repulsion
      for (let i = 0; i < current.length; i++) {
        const a = current[i]
        forces[i].fx += (WIDTH / 2 - a.x) * 0.004
        forces[i].fy += (HEIGHT / 2 - a.y) * 0.004
        for (let j = i + 1; j < current.length; j++) {
          const b = current[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          let dist = Math.hypot(dx, dy) || 0.01
          const minDist = 42
          if (dist < minDist) {
            const push = ((minDist - dist) / minDist) * 1.4
            dx /= dist
            dy /= dist
            forces[i].fx += dx * push
            forces[i].fy += dy * push
            forces[j].fx -= dx * push
            forces[j].fy -= dy * push
          }
        }
      }

      // spring along strong edges
      for (const edge of visibleEdges.slice(0, 180)) {
        const ia = index.get(edge.a)
        const ib = index.get(edge.b)
        if (ia == null || ib == null) continue
        const a = current[ia]
        const b = current[ib]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 0.01
        const ideal = 90 + (100 - edge.similarity) * 1.2
        const pull = ((dist - ideal) / dist) * 0.02 * (edge.similarity / 100)
        forces[ia].fx += dx * pull
        forces[ia].fy += dy * pull
        forces[ib].fx -= dx * pull
        forces[ib].fy -= dy * pull
      }

      const next = current.map((node, i) => {
        if (dragCiv.current === node.civ) {
          return { ...node, vx: 0, vy: 0 }
        }
        let vx = (node.vx + forces[i].fx) * 0.82
        let vy = (node.vy + forces[i].fy) * 0.82
        let x = Math.min(WIDTH - 24, Math.max(24, node.x + vx))
        let y = Math.min(HEIGHT - 24, Math.max(24, node.y + vy))
        return { ...node, x, y, vx, vy }
      })
      nodesRef.current = next
      setNodes(next)
      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [visibleEdges])

  const nodeByCiv = useMemo(() => {
    const map = new Map<string, SimNode>()
    for (const node of nodes) map.set(node.civ, node)
    return map
  }, [nodes])

  const synergyEdges = useMemo(() => {
    if (!showSynergies) return []
    return synergies
      .map((row) => {
        const a = nodeByCiv.get(row.civA)
        const b = nodeByCiv.get(row.civB)
        if (!a || !b) return null
        return { row, a, b }
      })
      .filter(Boolean) as { row: AoeDataSynergy; a: SimNode; b: SimNode }[]
  }, [showSynergies, synergies, nodeByCiv])

  const onNodePointerDown = (civ: string, event: ReactPointerEvent) => {
    event.stopPropagation()
    dragCiv.current = civ
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  const onSvgPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragCiv.current) return
    const svg = event.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT
    nodesRef.current = nodesRef.current.map((node) =>
      node.civ === dragCiv.current ? { ...node, x, y, vx: 0, vy: 0 } : node,
    )
    setNodes([...nodesRef.current])
  }

  const onSvgPointerUp = () => {
    dragCiv.current = null
  }

  return (
    <div className="aoe-constellation">
      <div className="aoe-constellation-toolbar panel">
        <div className="aoe-data-filter-row" role="tablist" aria-label="DNA mode">
          {DNA_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip${mode === item.id ? '' : ' muted'}`}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label>
          Edge threshold ({threshold}%)
          <input
            type="range"
            min={45}
            max={85}
            step={1}
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
        </label>
        <label className="aoe-constellation-check">
          <input
            type="checkbox"
            checked={showSynergies}
            onChange={(event) => setShowSynergies(event.target.checked)}
          />
          Show synergy links
        </label>
      </div>

      <p className="hint">
        {visibleEdges.length} DNA edges ≥ {threshold}%
        {busy ? ' · loading matrix…' : ''}
        {civs.length ? ` · ${civs.length} civs` : ''}
      </p>
      {error ? <p className="set-replay-error">{error}</p> : null}

      <div className="aoe-constellation-body">
        <div className="aoe-constellation-plot panel">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="aoe-constellation-svg"
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onPointerLeave={onSvgPointerUp}
          >
            {synergyEdges.map(({ row, a, b }) => (
              <line
                key={`syn-${row.id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="aoe-constellation-synergy"
              />
            ))}
            {visibleEdges.map((edge) => {
              const a = nodeByCiv.get(edge.a)
              const b = nodeByCiv.get(edge.b)
              if (!a || !b) return null
              const dim =
                neighborSet != null && (!neighborSet.has(edge.a) || !neighborSet.has(edge.b))
              return (
                <line
                  key={`${edge.a}-${edge.b}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={`aoe-constellation-edge${dim ? ' is-dim' : ''}`}
                  strokeOpacity={0.15 + (edge.similarity / 100) * 0.55}
                />
              )
            })}
            {nodes.map((node) => {
              const active = selected === node.civ || hovered === node.civ
              const dim = neighborSet != null && !neighborSet.has(node.civ)
              return (
                <g
                  key={node.civ}
                  transform={`translate(${node.x}, ${node.y})`}
                  className={`aoe-constellation-node${active ? ' is-active' : ''}${dim ? ' is-dim' : ''}`}
                  onPointerDown={(event) => onNodePointerDown(node.civ, event)}
                  onMouseEnter={() => setHovered(node.civ)}
                  onMouseLeave={() => setHovered((c) => (c === node.civ ? null : c))}
                  onClick={() => setSelected(node.civ)}
                  style={{ cursor: 'grab' }}
                >
                  <circle r={active ? 16 : 13} />
                  <image
                    href={civIconUrl(node.civ)}
                    x={-10}
                    y={-10}
                    width={20}
                    height={20}
                    clipPath="circle(10px at 10px 10px)"
                  />
                  {active ? (
                    <text y={28} textAnchor="middle" className="aoe-constellation-label">
                      {node.civ}
                    </text>
                  ) : null}
                </g>
              )
            })}
          </svg>
        </div>

        {selected ? (
          <CivVizDetailPanel
            civ={selected}
            onClose={() => setSelected(null)}
            onSelectCiv={setSelected}
          />
        ) : null}
      </div>
    </div>
  )
}
