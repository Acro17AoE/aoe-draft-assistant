import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { civIconUrl } from '../lib/civs'
import { resolveMapDisplay } from '../lib/maps'
import { syncTournamentStats, formatTournamentDatasetStatus } from '../lib/tournamentStats'
import {
  fetchMetaEvents,
  fetchMetaOverview,
  type MetaCivRate,
  type MetaEventSummary,
  type MetaNamedCount,
  type MetaPerMap,
  type TournamentMetaOverview,
} from '../lib/tournamentMeta'

function MapEmblem({ name }: { name: string }) {
  const display = resolveMapDisplay(name)
  if (!display.imageUrl) return null
  return <img src={display.imageUrl} alt="" className="tournament-meta-icon" />
}

function CivIcon({ name }: { name: string }) {
  return <img src={civIconUrl(name)} alt="" className="tournament-meta-icon" />
}

function RankingList({
  title,
  items,
  kind,
}: {
  title: string
  items: MetaNamedCount[] | undefined
  kind: 'map' | 'civ'
}) {
  const rows = items ?? []
  return (
    <section className="tournament-meta-rank panel">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="hint">No data yet</p>
      ) : (
        <ol className="tournament-meta-rank-list">
          {rows.map((row, index) => (
            <li key={`${row.name}-${index}`}>
              <span className="tournament-meta-rank-pos">{index + 1}</span>
              {kind === 'map' ? <MapEmblem name={row.name} /> : <CivIcon name={row.name} />}
              <span className="tournament-meta-rank-name">{row.name}</span>
              <span className="tournament-meta-rank-count">
                {row.winRate != null ? `${row.winRate}%` : row.count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function PerMapBlock({ entry }: { entry: MetaPerMap }) {
  const renderCivs = (label: string, rows: MetaCivRate[]) => (
    <div className="tournament-meta-permap-col">
      <em>{label}</em>
      {rows.length === 0 ? (
        <p className="hint">—</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={`${label}-${row.civ}`}>
              <CivIcon name={row.civ} />
              <span>
                {row.civ} {row.winRate ?? 0}% ({row.plays ?? 0})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <article className="tournament-meta-permap panel">
      <header>
        <MapEmblem name={entry.mapName} />
        <h4>{entry.mapName}</h4>
      </header>
      <div className="tournament-meta-permap-grid">
        {renderCivs('Top 3 WR', entry.topPicks)}
        {renderCivs('Bottom 3 WR', entry.bottomPicks)}
      </div>
    </article>
  )
}

function needsAutoSync(overview: TournamentMetaOverview | null): boolean {
  if (!overview?.found) return true
  const status = overview.status?.status
  if (status === 'idle' || status === 'error') return true
  if ((overview.status?.matchCount ?? 0) === 0) return true
  if ((overview.status?.pendingDraftCount ?? 0) > 0) return true
  if (overview.status?.statusDetail?.includes('Partial sync')) return true
  return false
}

function formatSyncLabel(
  event: MetaEventSummary | null,
  overview: TournamentMetaOverview | null,
  busy: boolean,
) {
  return formatTournamentDatasetStatus(
    overview?.status ?? (event ? { status: event.status, matchCount: event.matchCount, draftCount: event.draftCount, draftPairCount: event.draftPairCount } : null),
    busy,
  )
}

type RateSortKey =
  | 'civ'
  | 'banRate'
  | 'pickRate'
  | 'avgBanOrder'
  | 'avgPickOrder'
  | 'winRate'
  | 'plays'

function CivRatesTable({ rates }: { rates: MetaCivRate[] }) {
  const [sortKey, setSortKey] = useState<RateSortKey>('banRate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const rows = [...rates]
    rows.sort((left, right) => {
      if (sortKey === 'civ') {
        const cmp = left.civ.localeCompare(right.civ)
        return sortDir === 'asc' ? cmp : -cmp
      }
      const leftVal = left[sortKey]
      const rightVal = right[sortKey]
      const leftNum = typeof leftVal === 'number' ? leftVal : -1
      const rightNum = typeof rightVal === 'number' ? rightVal : -1
      const cmp = leftNum - rightNum
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp
      return left.civ.localeCompare(right.civ)
    })
    return rows
  }, [rates, sortDir, sortKey])

  const toggleSort = (key: RateSortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'civ' ? 'asc' : 'desc')
  }

  const header = (key: RateSortKey, label: string) => (
    <th>
      <button type="button" className="tournament-meta-sort-btn" onClick={() => toggleSort(key)}>
        {label}
        {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )

  return (
    <table className="tournament-meta-table">
      <thead>
        <tr>
          {header('civ', 'Civ')}
          {header('banRate', 'Ban %')}
          {header('avgBanOrder', 'Ban #')}
          {header('pickRate', 'Pick %')}
          {header('avgPickOrder', 'Pick #')}
          {header('winRate', 'WR')}
          {header('plays', 'Plays')}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.civ}>
            <td>
              <span className="tournament-meta-civ-cell">
                <CivIcon name={row.civ} />
                {row.civ}
              </span>
            </td>
            <td>{row.banRate ?? 0}%</td>
            <td>{row.avgBanOrder ?? '—'}</td>
            <td>{row.pickRate ?? 0}%</td>
            <td>{row.avgPickOrder ?? '—'}</td>
            <td>{row.winRate != null ? `${row.winRate}%` : '—'}</td>
            <td>{row.plays ?? 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TournamentMetaPanel() {
  const [events, setEvents] = useState<MetaEventSummary[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [overview, setOverview] = useState<TournamentMetaOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoSynced = useRef<Set<string>>(new Set())

  const selected = events.find((event) => event.slug === selectedSlug) ?? null

  const reloadEvents = useCallback(async () => {
    const response = await fetchMetaEvents()
    setEvents(response.events)
    return response.events
  }, [])

  const reloadOverview = useCallback(async (slug: string) => {
    const data = await fetchMetaOverview(slug)
    setOverview(data)
    return data
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        const list = await reloadEvents()
        if (cancelled) return
        setSelectedSlug((prev) => {
          if (prev && list.some((event) => event.slug === prev)) return prev
          return list[0]?.slug ?? null
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load meta events')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadEvents])

  useEffect(() => {
    if (!selectedSlug || !selected) return
    let cancelled = false
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        let data = await reloadOverview(selectedSlug)
        if (cancelled) return
        if (needsAutoSync(data) && !autoSynced.current.has(selectedSlug)) {
          autoSynced.current.add(selectedSlug)
          await syncTournamentStats(selected.displayName || selected.slug, { force: false })
          if (cancelled) return
          await reloadEvents()
          data = await reloadOverview(selectedSlug)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tournament meta')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSlug, selected, reloadEvents, reloadOverview])

  const onRefresh = async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await syncTournamentStats(selected.displayName || selected.slug, { force: true })
      await reloadEvents()
      await reloadOverview(selected.slug)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Meta sync failed')
    } finally {
      setBusy(false)
    }
  }

  const maps = overview?.maps ?? {}
  const civs = overview?.civs ?? {}
  const rates = civs.rates ?? []

  return (
    <div className="tournament-meta">
      <div className="tournament-meta-toolbar">
        <label className="tournament-meta-event-picker">
          <span>Event</span>
          <select
            value={selected?.slug ?? ''}
            onChange={(event) => setSelectedSlug(event.target.value || null)}
            disabled={busy || events.length === 0}
          >
            {events.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.displayName}
              </option>
            ))}
          </select>
        </label>
        <p className="hint tournament-meta-status">{formatSyncLabel(selected, overview, busy)}</p>
        <button
          type="button"
          className="compact-btn linkish-btn draft-preview-tour-resync"
          onClick={() => void onRefresh()}
          disabled={busy || !selected}
        >
          Refresh
        </button>
      </div>

      {error ? <p className="set-replay-error">{error}</p> : null}
      {busy && !overview?.found ? <p className="hint">Loading tournament meta…</p> : null}

      {overview?.found ? (
        <>
          <section className="tournament-meta-section">
            <h3>Map rankings</h3>
            <div className="tournament-meta-rank-grid">
              <RankingList title="Most played" items={maps.mostPlayed} kind="map" />
              <RankingList title="Least played" items={maps.leastPlayed} kind="map" />
              <RankingList title="Most banned" items={maps.mostBanned} kind="map" />
              <RankingList title="Most picked" items={maps.mostPicked} kind="map" />
              <RankingList title="Admin pick (neutral)" items={maps.mostNeutral} kind="map" />
            </div>
          </section>

          <section className="tournament-meta-section">
            <h3>Civ rankings</h3>
            <div className="tournament-meta-rank-grid">
              <RankingList title="Most played" items={civs.mostPlayed} kind="civ" />
              <RankingList title="Least played" items={civs.leastPlayed} kind="civ" />
              <RankingList title="Most banned" items={civs.mostBanned} kind="civ" />
              <RankingList title="Most picked" items={civs.mostPicked} kind="civ" />
              <RankingList title="Highest WR" items={civs.highestWinRate} kind="civ" />
            </div>

            <div className="tournament-meta-table-wrap panel">
              <h4>Ban / pick / win rates</h4>
              {rates.length === 0 ? (
                <p className="hint">No civ draft rates yet (needs `|civdraft=` on Liquipedia matches).</p>
              ) : (
                <CivRatesTable rates={rates} />
              )}
            </div>
          </section>

          <section className="tournament-meta-section">
            <h3>Per-map civ WR</h3>
            <div className="tournament-meta-permap-list">
              {(overview.perMap ?? []).map((entry) => (
                <PerMapBlock key={entry.mapName} entry={entry} />
              ))}
              {(overview.perMap ?? []).length === 0 ? (
                <p className="hint">No per-map civ data yet.</p>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
