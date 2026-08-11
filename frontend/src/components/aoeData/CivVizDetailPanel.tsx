import { useEffect, useState } from 'react'
import { civIconUrl } from '../../lib/civs'
import {
  fetchAoeDataSimilarity,
  type AoeDataDnaMode,
  type AoeDataSimilarityNeighbor,
} from '../../lib/aoeData'
import type { MetaCivRate } from '../../lib/tournamentMeta'
import { atlasEntryForCiv } from '../../data/civRegions'

interface CivVizDetailPanelProps {
  civ: string
  metaRate?: MetaCivRate | null
  onClose: () => void
  onSelectCiv?: (civ: string) => void
}

export function CivVizDetailPanel({
  civ,
  metaRate,
  onClose,
  onSelectCiv,
}: CivVizDetailPanelProps) {
  const [neighbors, setNeighbors] = useState<AoeDataSimilarityNeighbor[]>([])
  const [busy, setBusy] = useState(false)
  const atlas = atlasEntryForCiv(civ)

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    void (async () => {
      try {
        const data = await fetchAoeDataSimilarity(civ, 'overall' satisfies AoeDataDnaMode)
        if (!cancelled) setNeighbors(data.neighbors.slice(0, 5))
      } catch {
        if (!cancelled) setNeighbors([])
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [civ])

  return (
    <aside className="aoe-viz-detail panel">
      <header className="aoe-viz-detail-header">
        <div className="aoe-viz-detail-title">
          <img src={civIconUrl(civ)} alt="" />
          <div>
            <h3>{civ}</h3>
            {atlas ? <p className="hint">{atlas.region}</p> : null}
          </div>
        </div>
        <button type="button" className="compact-btn" onClick={onClose}>
          Close
        </button>
      </header>

      {metaRate ? (
        <dl className="aoe-viz-detail-stats">
          <div>
            <dt>Ban</dt>
            <dd>{metaRate.banRate != null ? `${metaRate.banRate}%` : '—'}</dd>
          </div>
          <div>
            <dt>Pick</dt>
            <dd>{metaRate.pickRate != null ? `${metaRate.pickRate}%` : '—'}</dd>
          </div>
          <div>
            <dt>Win</dt>
            <dd>{metaRate.winRate != null ? `${metaRate.winRate}%` : '—'}</dd>
          </div>
          <div>
            <dt>Plays</dt>
            <dd>{metaRate.plays ?? '—'}</dd>
          </div>
        </dl>
      ) : (
        <p className="hint">No tournament meta rates loaded for this civ.</p>
      )}

      <h4>Closest DNA neighbors</h4>
      {busy ? <p className="hint">Loading…</p> : null}
      <ul className="aoe-viz-detail-neighbors">
        {neighbors.map((row) => (
          <li key={row.civ}>
            <button type="button" onClick={() => onSelectCiv?.(row.civ)}>
              <img src={civIconUrl(row.civ)} alt="" />
              <span>{row.civ}</span>
              <em>{row.similarity}%</em>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
