import { useState } from 'react'
import { civIconUrl } from '../lib/civs'
import type {
  CivRateStat,
  DraftTournamentStats,
  MapTournamentStats,
  TournamentStatsStatus,
} from '../lib/tournamentStats'
import { formatTournamentDatasetStatus } from '../lib/tournamentStats'

function formatCivLine(stat: CivRateStat, mode: 'pick' | 'wr' | 'ban' | 'order'): string {
  if (mode === 'wr') return `${stat.civ} ${stat.winRate ?? 0}%`
  if (mode === 'ban') return `${stat.civ} (${stat.bans ?? 0})`
  if (mode === 'order' && stat.avgPickOrder != null) return `${stat.civ} #${stat.avgPickOrder}`
  return `${stat.civ} (${stat.plays ?? stat.picks ?? 0})`
}

export function MapTournamentInsightStrip({ stats }: { stats?: MapTournamentStats | null }) {
  if (!stats) return null
  const top = stats.mostPicked[0]
  const high = stats.highestWinRate[0]
  const low = stats.lowestWinRate[0]
  if (!top && !high && !low) return null
  return (
    <div className="draft-preview-tour-map-stats">
      <ul className="draft-preview-tour-stat-list">
        {top ? (
          <li>
            <em>Most picked</em>
            <img src={civIconUrl(top.civ)} alt="" />
            <span>{formatCivLine(top, 'pick')}</span>
          </li>
        ) : null}
        {high ? (
          <li>
            <em>Highest WR</em>
            <img src={civIconUrl(high.civ)} alt="" />
            <span>{formatCivLine(high, 'wr')}</span>
          </li>
        ) : null}
        {low ? (
          <li>
            <em>Lowest WR</em>
            <img src={civIconUrl(low.civ)} alt="" />
            <span>{formatCivLine(low, 'wr')}</span>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

function DraftRatesModal({
  open,
  onClose,
  stats,
}: {
  open: boolean
  onClose: () => void
  stats: DraftTournamentStats | null
}) {
  if (!open) return null
  const rows = stats?.all ?? []
  return (
    <div className="draft-preview-tour-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="draft-preview-tour-modal panel"
        role="dialog"
        aria-modal="true"
        aria-label="Tournament ban and pick rates"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="draft-preview-tour-modal-header">
          <h3>Ban &amp; pick rates</h3>
          <button type="button" className="compact-btn" onClick={onClose}>
            Close
          </button>
        </header>
        {rows.length ? (
          <div className="draft-preview-tour-table-wrap">
            <table className="draft-preview-tour-table">
              <thead>
                <tr>
                  <th>Civ</th>
                  <th>Picks</th>
                  <th>Bans</th>
                  <th>Avg pick #</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.civ}>
                    <td>
                      <span className="draft-preview-tour-civ-cell">
                        <img src={civIconUrl(row.civ)} alt="" />
                        {row.civ}
                      </span>
                    </td>
                    <td>{row.picks ?? 0}</td>
                    <td>{row.bans ?? 0}</td>
                    <td>{row.avgPickOrder ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">No draft rates yet.</p>
        )}
        {stats?.attribution ? (
          <p className="draft-preview-tour-credit">
            {stats.attribution.text}.{' '}
            <a href={stats.attribution.url} target="_blank" rel="noreferrer">
              Liquipedia
            </a>
            .
          </p>
        ) : null}
      </div>
    </div>
  )
}

function statusLine(status: TournamentStatsStatus, busy: boolean): string {
  return formatTournamentDatasetStatus(status, busy)
}
export function TournamentInsightsPanel({
  status,
  draftSummary,
  fullDrafts,
  busy,
  error,
  ready,
  loadFullDrafts,
  refresh,
  setError,
}: {
  status: TournamentStatsStatus | null
  draftSummary: DraftTournamentStats | null
  fullDrafts: DraftTournamentStats | null
  busy: boolean
  error: string | null
  ready: boolean
  loadFullDrafts: () => Promise<DraftTournamentStats | null>
  refresh: () => Promise<void>
  setError: (message: string | null) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)

  const openFullRates = async () => {
    setModalOpen(true)
    try {
      await loadFullDrafts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load full draft rates')
    }
  }

  if (!status && !error && !busy) return null

  return (
    <div className="draft-preview-tour is-compact">
      {status ? (
        <p className="draft-preview-tour-status">
          {status.liquipediaUrl ? (
            <a href={status.liquipediaUrl} target="_blank" rel="noreferrer">
              Liquipedia
            </a>
          ) : (
            <span>Liquipedia</span>
          )}
          <span> · {statusLine(status, busy)}</span>
          {ready ? (
            <>
              {' · '}
              <button type="button" className="linkish-btn" onClick={() => void openFullRates()}>
                Ban / pick rates
              </button>
            </>
          ) : null}
          {' · '}
          <button
            type="button"
            className="linkish-btn draft-preview-tour-resync"
            disabled={busy}
            title="Re-scan all tournament stages from Liquipedia"
            onClick={() => void refresh()}
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </p>
      ) : busy ? (
        <p className="draft-preview-tour-status">Syncing Liquipedia…</p>
      ) : null}

      {error ? <p className="pro-error">{error}</p> : null}

      {ready && draftSummary ? (
        <div className="draft-preview-tour-teaser-grid">
          <div>
            <em>Most banned</em>
            <ul>
              {draftSummary.mostBanned.slice(0, 3).map((row) => (
                <li key={`ban-${row.civ}`}>{formatCivLine(row, 'ban')}</li>
              ))}
            </ul>
          </div>
          <div>
            <em>Early picks</em>
            <ul>
              {draftSummary.earliestPicks.slice(0, 3).map((row) => (
                <li key={`early-${row.civ}`}>{formatCivLine(row, 'order')}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <DraftRatesModal open={modalOpen} onClose={() => setModalOpen(false)} stats={fullDrafts} />
    </div>
  )
}
