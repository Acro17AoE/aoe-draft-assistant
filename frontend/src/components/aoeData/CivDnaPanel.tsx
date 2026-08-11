import { useEffect, useState } from 'react'
import { civIconUrl } from '../../lib/civs'
import {
  fetchAoeDataCivs,
  fetchAoeDataSimilarity,
  type AoeDataSimilarityNeighbor,
} from '../../lib/aoeData'

export function CivDnaPanel() {
  const [civs, setCivs] = useState<string[]>([])
  const [selected, setSelected] = useState('Magyars')
  const [neighbors, setNeighbors] = useState<AoeDataSimilarityNeighbor[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await fetchAoeDataCivs()
        if (!cancelled) {
          setCivs(list)
          if (list.includes('Magyars')) setSelected('Magyars')
          else if (list[0]) setSelected(list[0])
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load civs')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setBusy(true)
    setError(null)
    void (async () => {
      try {
        const data = await fetchAoeDataSimilarity(selected)
        if (cancelled) return
        setNeighbors(data.neighbors)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Similarity failed')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected])

  return (
    <div className="aoe-data-dna">
      <div className="aoe-data-dna-controls panel">
        <label>
          Reference civilization
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            {civs.map((civ) => (
              <option key={civ} value={civ}>
                {civ}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="set-replay-error">{error}</p> : null}
      {busy ? <p className="hint">Calculating neighbors…</p> : null}

      <div className="aoe-data-dna-grid">
        <article className="aoe-data-dna-center panel">
          <img src={civIconUrl(selected)} alt="" className="aoe-data-dna-icon" />
          <h4>{selected}</h4>
        </article>
        <section className="aoe-data-dna-neighbors panel">
          <h4>Closest structural neighbors</h4>
          {neighbors.length === 0 ? (
            <p className="hint">No neighbors loaded.</p>
          ) : (
            <ul className="aoe-data-similarity-list">
              {neighbors.map((row) => (
                <li key={row.civ}>
                  <button type="button" onClick={() => setSelected(row.civ)}>
                    <img src={civIconUrl(row.civ)} alt="" />
                    <span>{row.civ}</span>
                  </button>
                  <div className="aoe-data-sim-bar-wrap">
                    <div className="aoe-data-sim-bar" style={{ width: `${row.similarity}%` }} />
                    <span>{row.similarity}%</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="hint aoe-data-footnote">
        Playstyle similarity (openings, observed meta) will be a separate layer in a later version.
      </p>
    </div>
  )
}
