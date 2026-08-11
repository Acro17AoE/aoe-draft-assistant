import { useEffect, useMemo, useState } from 'react'
import { civIconUrl } from '../../lib/civs'
import { fetchAoeDataSynergies, type AoeDataSynergy } from '../../lib/aoeData'

const CATEGORIES = ['all', 'economic', 'military', 'opening', 'team'] as const

function partnerLabel(row: AoeDataSynergy): string {
  return row.partnerLabel ?? row.civB
}

export function SynergiesPanel() {
  const [rows, setRows] = useState<AoeDataSynergy[]>([])
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await fetchAoeDataSynergies(category === 'all' ? undefined : category)
        if (!cancelled) setRows(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load synergies')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [category])

  const sorted = useMemo(
    () =>
      [...rows].sort((left, right) => {
        const strengthOrder = { high: 0, medium: 1, low: 2 }
        return (
          (strengthOrder[left.strength as keyof typeof strengthOrder] ?? 9) -
          (strengthOrder[right.strength as keyof typeof strengthOrder] ?? 9)
        )
      }),
    [rows],
  )

  return (
    <div className="aoe-data-synergies">
      <div className="aoe-data-filter-row">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            className={`chip${category === item ? '' : ' muted'}`}
            onClick={() => setCategory(item)}
          >
            {item === 'all' ? 'All' : item}
          </button>
        ))}
      </div>
      {error ? <p className="set-replay-error">{error}</p> : null}
      <div className="aoe-data-synergy-list">
        {sorted.map((row) => (
          <article key={row.id} className="aoe-data-synergy-card panel">
            <header>
              <div className="aoe-data-synergy-civs">
                <img src={civIconUrl(row.civA)} alt="" />
                <span>+</span>
                <img src={civIconUrl(row.civB)} alt="" />
              </div>
              <div>
                <h4>{row.title}</h4>
                <p className="hint">
                  {row.civA} + {partnerLabel(row)}
                </p>
              </div>
            </header>
            <p>{row.explanation}</p>
          </article>
        ))}
        {sorted.length === 0 ? <p className="hint">No synergies in this category yet.</p> : null}
      </div>
    </div>
  )
}
