import { useCallback, useEffect, useState } from 'react'
import {
  fetchAdminStats,
  type AdminPeriodStats,
  type AdminUserEntry,
} from '../lib/cloudStorage'

const PERIODS: { key: keyof typeof PERIOD_LABELS; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All time' },
]

const PERIOD_LABELS = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  all: 'All time',
} as const

const METRICS: { key: keyof AdminPeriodStats; label: string }[] = [
  { key: 'page_views', label: 'Page views' },
  { key: 'logins', label: 'Logins' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'civ_drafts', label: 'Civ drafts started' },
]

const EMPTY_PERIOD: AdminPeriodStats = {
  page_views: 0,
  logins: 0,
  registrations: 0,
  civ_drafts: 0,
}

function formatSignupDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminTab() {
  const [periods, setPeriods] = useState<Record<string, AdminPeriodStats>>({})
  const [users, setUsers] = useState<AdminUserEntry[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAdminStats()
      setPeriods(result.periods)
      setUsers(result.users)
      setTotalUsers(result.total_users)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="layout admin-page">
      <section className="panel admin-stats-panel">
        <div className="admin-users-head">
          <div>
            <h2>Usage stats</h2>
            <p className="hint">
              Calendar periods (UTC): today, this week (Mon–), this month, this year, and all time.
              Page views, logins, and civ drafts start counting after this deploy.
            </p>
          </div>
          <button type="button" className="compact-btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="admin-stats-table-wrap">
          <table className="admin-stats-table">
            <thead>
              <tr>
                <th>Metric</th>
                {PERIODS.map((period) => (
                  <th key={period.key}>{period.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((metric) => (
                <tr key={metric.key}>
                  <td>{metric.label}</td>
                  {PERIODS.map((period) => {
                    const stats = periods[period.key] ?? EMPTY_PERIOD
                    return (
                      <td key={period.key} className="admin-stats-num">
                        {stats[metric.key]}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel admin-users-panel">
        <div className="admin-users-head">
          <div>
            <h2>Registered users</h2>
            <p className="hint">{totalUsers} account{totalUsers === 1 ? '' : 's'} total.</p>
          </div>
        </div>

        {!error && !loading && users.length === 0 ? (
          <p className="hint">No registered users yet.</p>
        ) : null}

        {users.length > 0 ? (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Display name</th>
                  <th>Email</th>
                  <th>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => (
                  <tr key={entry.email}>
                    <td>{entry.display_name || '—'}</td>
                    <td>{entry.email}</td>
                    <td>{formatSignupDate(entry.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  )
}
