import { useCallback, useEffect, useMemo, useState } from 'react'
import { civIconUrl } from '../../lib/civs'
import {
  fetchAoeDataEntity,
  fetchAoeDataIntersection,
  searchAoeDataEntities,
  type AoeDataEntity,
} from '../../lib/aoeData'

function entityKey(entity: AoeDataEntity): string {
  return `${entity.type}:${entity.id}`
}

export function TechExplorerPanel() {
  const [query, setQuery] = useState('Husbandry')
  const [results, setResults] = useState<AoeDataEntity[]>([])
  const [selected, setSelected] = useState<AoeDataEntity[]>([])
  const [intersection, setIntersection] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (trimmed.length < 2) {
      setResults([])
      return
    }
    setBusy(true)
    setError(null)
    try {
      const rows = await searchAoeDataEntities(trimmed)
      setResults(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void runSearch(query)
  }, []) // initial sample search

  useEffect(() => {
    if (selected.length === 0) {
      setIntersection([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const data = await fetchAoeDataIntersection(selected.map(entityKey))
        if (!cancelled) setIntersection(data.civs)
      } catch {
        if (!cancelled) setIntersection([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected])

  const active = selected[0] ?? null
  const [activeDetail, setActiveDetail] = useState<AoeDataEntity | null>(null)

  useEffect(() => {
    if (!active) {
      setActiveDetail(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const detail = await fetchAoeDataEntity(active.type, active.id)
        if (!cancelled) setActiveDetail(detail)
      } catch {
        if (!cancelled) setActiveDetail(active)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active])

  const missingPreview = useMemo(() => activeDetail?.missingCivs?.slice(0, 8) ?? [], [activeDetail])

  const toggleSelected = (entity: AoeDataEntity) => {
    const key = entityKey(entity)
    setSelected((prev) => {
      if (prev.some((row) => entityKey(row) === key)) {
        return prev.filter((row) => entityKey(row) !== key)
      }
      return [...prev, entity]
    })
  }

  return (
    <div className="aoe-data-tech">
      <form
        className="aoe-data-search-row"
        onSubmit={(event) => {
          event.preventDefault()
          void runSearch(query)
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tech, unit, or building…"
          aria-label="Search game entities"
        />
        <button type="submit" className="compact-btn" disabled={busy}>
          Search
        </button>
      </form>
      {error ? <p className="set-replay-error">{error}</p> : null}

      <div className="aoe-data-tech-layout">
        <section className="aoe-data-tech-results panel">
          <h4>Results</h4>
          {results.length === 0 ? (
            <p className="hint">{busy ? 'Searching…' : 'No matches yet.'}</p>
          ) : (
            <ul className="aoe-data-entity-list">
              {results.map((entity) => {
                const key = entityKey(entity)
                const isSelected = selected.some((row) => entityKey(row) === key)
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={`aoe-data-entity-btn${isSelected ? ' active' : ''}`}
                      onClick={() => toggleSelected(entity)}
                    >
                      <span className="aoe-data-entity-type">{entity.type}</span>
                      <span>{entity.name}</span>
                      <span className="aoe-data-entity-count">
                        {entity.civCount}/{entity.totalCivs}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="aoe-data-tech-detail panel">
          {activeDetail ? (
            <>
              <h4>{activeDetail.name}</h4>
              <p className="hint">
                {activeDetail.civCount}/{activeDetail.totalCivs} civilizations have access
              </p>
              <div className="aoe-data-civ-chip-grid">
                {(activeDetail.civs ?? []).map((civ) => (
                  <span key={civ} className="aoe-data-civ-chip">
                    <img src={civIconUrl(civ)} alt="" />
                    {civ}
                  </span>
                ))}
              </div>
              {missingPreview.length > 0 ? (
                <p className="hint aoe-data-missing">
                  Missing from (sample): {missingPreview.join(', ')}
                  {(activeDetail.missingCivs?.length ?? 0) > missingPreview.length ? '…' : ''}
                </p>
              ) : null}
            </>
          ) : (
            <p className="hint">Select an entity to inspect civilization access.</p>
          )}

          {selected.length > 1 ? (
            <div className="aoe-data-intersection">
              <h4>
                Intersection ({intersection.length} civs)
              </h4>
              <p className="hint">{selected.map((row) => row.name).join(' + ')}</p>
              <div className="aoe-data-civ-chip-grid compact">
                {intersection.map((civ) => (
                  <span key={civ} className="aoe-data-civ-chip">
                    <img src={civIconUrl(civ)} alt="" />
                    {civ}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
