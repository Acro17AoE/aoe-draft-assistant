import { useEffect, useMemo, useState } from 'react'
import {
  fetchLiquipediaStatus,
  fetchProAnalysis,
  HISTORY_SCOPE_OPTIONS,
  type LiquipediaEnrichment,
  type ProAnalysisDraftPatterns,
  type ProAnalysisHistoryScope,
  type ProAnalysisReport,
} from '../lib/proAnalysis'

function barWidth(value: number, max: number): string {
  if (max <= 0) return '0%'
  return `${Math.max(8, Math.round((value / max) * 100))}%`
}

function formatArchetype(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function LiquipediaCredit({
  liquipedia,
  serverConfigured,
}: {
  liquipedia?: LiquipediaEnrichment
  serverConfigured: boolean | null
}) {
  const attribution = liquipedia?.attribution
  const configured = liquipedia?.configured ?? serverConfigured

  if (!configured) {
    return (
      <p className="hint liquipedia-credit">
        Liquipedia enrichment is off on <strong>this server</strong>. Set{' '}
        <code>LIQUIPEDIA_API_KEY</code> as an environment variable on the host that runs the API
        (Coolify / Docker secrets / VPS env) — not in GitHub. A local <code>.env</code> only affects
        your machine. Credit under{' '}
        <a href="https://liquipedia.net/commons/Liquipedia:Copyrights" target="_blank" rel="noreferrer">
          CC-BY-SA
        </a>
        .
      </p>
    )
  }

  if (!attribution) {
    return null
  }

  const links = [
    liquipedia?.reference
      ? { label: liquipedia.reference.name || 'You', href: liquipedia.reference.url }
      : null,
    liquipedia?.opponent
      ? { label: liquipedia.opponent.name || 'Opponent', href: liquipedia.opponent.url }
      : null,
    liquipedia?.tournament
      ? { label: liquipedia.tournament.name, href: liquipedia.tournament.url }
      : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>

  return (
    <aside className="liquipedia-credit panel" aria-label="Liquipedia attribution">
      <p>
        {attribution.text}. Source:{' '}
        <a href={attribution.url} target="_blank" rel="noreferrer">
          Liquipedia
        </a>{' '}
        (
        <a href={attribution.licenseUrl} target="_blank" rel="noreferrer">
          {attribution.license}
        </a>
        ).
      </p>
      {links.length ? (
        <p className="liquipedia-credit-links">
          Pages:{' '}
          {links.map((link, index) => (
            <span key={link.href}>
              {index > 0 ? ' · ' : null}
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </span>
          ))}
        </p>
      ) : (
        <p className="hint">No matching Liquipedia pages for this query yet.</p>
      )}
    </aside>
  )
}

function PlayerCard({
  label,
  career,
  accent,
}: {
  label: string
  career: ProAnalysisReport['opponent']['career'] | null
  accent: 'you' | 'opp'
}) {
  if (!career) {
    return (
      <div className={`pro-player-card pro-player-card-${accent}`}>
        <p className="pro-player-label">{label}</p>
        <p className="hint">Player not found on aoe-elo.com</p>
      </div>
    )
  }

  return (
    <div className={`pro-player-card pro-player-card-${accent}`}>
      <p className="pro-player-label">{label}</p>
      <h3 className="pro-player-name">{career.name}</h3>
      {career.teamName ? <p className="pro-player-team">{career.teamName}</p> : null}
      <div className="pro-player-stats">
        <div>
          <span className="pro-stat-value">{career.elo ?? '—'}</span>
          <span className="pro-stat-label">Tournament Elo</span>
        </div>
        <div>
          <span className="pro-stat-value">{career.rank ? `#${career.rank}` : '—'}</span>
          <span className="pro-stat-label">Rank</span>
        </div>
        <div>
          <span className="pro-stat-value">{career.seriesWinRate != null ? `${career.seriesWinRate}%` : '—'}</span>
          <span className="pro-stat-label">Series WR</span>
        </div>
        <div>
          <span className="pro-stat-value">{career.tournamentsPlayed ?? '—'}</span>
          <span className="pro-stat-label">Tournaments</span>
        </div>
      </div>
      <p className="pro-player-meta">
        Peak {career.peakElo ?? '—'} ({career.peakTime ?? '?'}) · Career since {career.firstSeriesTime ?? '?'}
      </p>
    </div>
  )
}

function CountBars({
  title,
  counts,
  variant,
  subtitle,
}: {
  title: string
  counts: Record<string, number>
  variant: 'pick' | 'ban'
  subtitle?: string
}) {
  const entries = useMemo(
    () => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [counts],
  )
  const max = entries[0]?.[1] ?? 0

  if (!entries.length) {
    return (
      <div className="pro-chart-panel">
        <h4>{title}</h4>
        {subtitle ? <p className="hint pro-chart-subtitle">{subtitle}</p> : null}
        <p className="hint">No draft data in scope.</p>
      </div>
    )
  }

  return (
    <div className="pro-chart-panel">
      <h4>{title}</h4>
      {subtitle ? <p className="hint pro-chart-subtitle">{subtitle}</p> : null}
      <ul className="pro-bar-list">
        {entries.map(([name, count]) => (
          <li key={name}>
            <span className="pro-bar-label">{name}</span>
            <div className="pro-bar-track">
              <div className={`pro-bar-fill pro-bar-${variant}`} style={{ width: barWidth(count, max) }} />
            </div>
            <span className="pro-bar-count">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ArchetypeBars({
  title,
  picks,
  bans,
  subtitle,
}: {
  title: string
  picks: Record<string, number>
  bans: Record<string, number>
  subtitle?: string
}) {
  const merged = useMemo(() => {
    const keys = new Set([...Object.keys(picks), ...Object.keys(bans)])
    return [...keys]
      .map((key) => ({ key, pick: picks[key] ?? 0, ban: bans[key] ?? 0, total: (picks[key] ?? 0) + (bans[key] ?? 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [picks, bans])

  if (!merged.length) {
    return (
      <div className="pro-chart-panel">
        <h4>{title}</h4>
        {subtitle ? <p className="hint pro-chart-subtitle">{subtitle}</p> : null}
        <p className="hint">No archetype data.</p>
      </div>
    )
  }

  const max = merged[0]?.total ?? 0

  return (
    <div className="pro-chart-panel">
      <h4>{title}</h4>
      {subtitle ? <p className="hint pro-chart-subtitle">{subtitle}</p> : null}
      <ul className="pro-bar-list pro-archetype-list">
        {merged.map(({ key, pick, ban }) => (
          <li key={key}>
            <span className="pro-bar-label">{formatArchetype(key)}</span>
            <div className="pro-bar-track pro-archetype-track">
              {pick > 0 ? (
                <div className="pro-bar-fill pro-bar-pick" style={{ width: barWidth(pick, max) }} title={`${pick} picks`} />
              ) : null}
              {ban > 0 ? (
                <div className="pro-bar-fill pro-bar-ban" style={{ width: barWidth(ban, max) }} title={`${ban} bans`} />
              ) : null}
            </div>
            <span className="pro-bar-count">
              {pick}/{ban}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint pro-archetype-legend">Counts shown as pick/ban</p>
    </div>
  )
}

function PatternSection({
  title,
  patterns,
  scopeLabel,
  note,
}: {
  title: string
  patterns: { map: ProAnalysisDraftPatterns; civ: ProAnalysisDraftPatterns }
  scopeLabel: string
  note?: string
}) {
  const mapDrafts = patterns.map.draftCount ?? 0
  const civDrafts = patterns.civ.draftCount ?? 0
  const mapCounts = patterns.map.playedCounts ?? patterns.map.pickCounts ?? {}
  const civCounts = patterns.civ.playedCounts ?? patterns.civ.pickCounts ?? {}
  const isEmpty = mapDrafts + civDrafts === 0

  return (
    <section className="panel pro-pattern-section">
      <h2>{title}</h2>
      <p className="hint">
        {scopeLabel} · {mapDrafts} map drafts · {civDrafts} civ drafts
      </p>
      {note ? <p className="hint pro-pattern-note">{note}</p> : null}
      {isEmpty ? (
        <p className="hint">
          No aoe2cm draft data in this scope. Many aoe-elo events are not on aoe2recs — data fills in as
          tournaments are cached locally.
        </p>
      ) : (
        <div className="pro-draft-grid">
          <CountBars title="Maps played (draft picks)" counts={mapCounts} variant="pick" />
          <CountBars title="Map bans" counts={patterns.map.banCounts ?? {}} variant="ban" />
          <ArchetypeBars
            title="Map archetypes played / banned"
            picks={patterns.map.archetypePlayed ?? patterns.map.archetypePicks ?? {}}
            bans={patterns.map.archetypeBans ?? {}}
          />
          <CountBars title="Civs played (draft picks)" counts={civCounts} variant="pick" />
          <CountBars title="Civ bans" counts={patterns.civ.banCounts ?? {}} variant="ban" />
        </div>
      )}
    </section>
  )
}

function TakeawaysPanel({ takeaways }: { takeaways: ProAnalysisReport['keyTakeaways'] }) {
  if (!takeaways.length) return null

  return (
    <section className="pro-takeaways panel">
      <h2>Key Takeaways</h2>
      <p className="hint">Matchup-focused prep notes — historical H2H excludes the current event.</p>
      <ul className="pro-takeaway-list">
        {takeaways.map((item, index) => (
          <li key={`${item.category}-${index}`} className={`pro-takeaway pro-takeaway-${item.severity}`}>
            <span className="pro-takeaway-badge">{item.category}</span>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

const LOADING_STEPS = [
  'Resolving players on aoe-elo.com…',
  'Matching aoe-elo events to aoe2recs tournaments (this is the slow part on first run)…',
  'Loading aoe2cm drafts for map/civ picks…',
  'Building historical H2H and takeaways…',
]

export function ProAnalysisTab() {
  const [reference, setReference] = useState('')
  const [opponent, setOpponent] = useState('')
  const [tournament, setTournament] = useState('')
  const [historyScope, setHistoryScope] = useState<ProAnalysisHistoryScope>('last_5_tournaments')
  const [busy, setBusy] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ProAnalysisReport | null>(null)
  const [liquipediaConfigured, setLiquipediaConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchLiquipediaStatus()
      .then((status) => {
        if (!cancelled) setLiquipediaConfigured(status.configured)
      })
      .catch(() => {
        if (!cancelled) setLiquipediaConfigured(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!busy) {
      setLoadingStep(0)
      return
    }
    const timer = window.setInterval(() => {
      setLoadingStep((current) => (current + 1) % LOADING_STEPS.length)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [busy])

  const runAnalysis = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await fetchProAnalysis({ reference, opponent, tournament, historyScope })
      setReport(result)
    } catch (err) {
      setReport(null)
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setBusy(false)
    }
  }

  const h2h = report?.headToHead.summary

  return (
    <div className="pro-analysis-layout">
      <section className="panel pro-setup">
        <h2>Pro Analysis</h2>
        <p className="hint pro-setup-intro">
          Matchup profile from aoe-elo career data, cached aoe2recs brackets, aoe2cm drafts, and optional
          Liquipedia (LPDB) player/tournament pages. Completed tournaments are stored locally after the
          first fetch and reused for historical trends.
        </p>
        <div className="pro-form-grid">
          <label>
            Your name
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Acro17"
              disabled={busy}
            />
          </label>
          <label>
            Opponent
            <input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="e.g. FreakinAndy"
              disabled={busy}
            />
          </label>
          <label className="pro-form-wide">
            Tournament (name or aoe2recs slug)
            <input
              value={tournament}
              onChange={(e) => setTournament(e.target.value)}
              placeholder="e.g. Brazilian Dynasty"
              disabled={busy}
            />
          </label>
          <label className="pro-form-wide">
            Historical scope
            <select
              value={historyScope}
              onChange={(e) => setHistoryScope(e.target.value as ProAnalysisHistoryScope)}
              disabled={busy}
            >
              {HISTORY_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="pro-form-actions">
          <button type="button" disabled={busy || !reference.trim() || !opponent.trim()} onClick={() => void runAnalysis()}>
            {busy ? 'Analyzing…' : 'Run analysis'}
          </button>
        </div>
        {busy ? (
          <div className="pro-loading panel">
            <p className="pro-loading-title">{LOADING_STEPS[loadingStep]}</p>
            <p className="hint">
              First run can take 1–3 minutes while tournaments are matched and cached. Later runs are faster.
              Prefer <strong>Last 5 tournaments</strong>. If you see connection timeouts, the API host may
              not reach aoe-elo.com / aoe2recs.com — retry or check outbound network from the server.
            </p>
          </div>
        ) : null}
        {error ? <p className="pro-error">{error}</p> : null}
        {!report ? <LiquipediaCredit serverConfigured={liquipediaConfigured} /> : null}
      </section>

      {report ? (
        <>
          <LiquipediaCredit liquipedia={report.liquipedia} serverConfigured={liquipediaConfigured} />
          {report.sourceWarnings?.length ? (
            <p className="hint pro-source-warnings">
              Partial data: {report.sourceWarnings[0]}
              {report.sourceWarnings.length > 1 ? ` (+${report.sourceWarnings.length - 1} more)` : ''}
            </p>
          ) : null}
          <TakeawaysPanel takeaways={report.keyTakeaways} />

          <section className="pro-compare-grid">
            <PlayerCard label="You" career={report.reference.career} accent="you" />
            <div className="pro-vs-badge">VS</div>
            <PlayerCard label="Opponent" career={report.opponent.career} accent="opp" />
          </section>

          {report.tournament ? (
            <section className="panel pro-tournament-panel">
              <h2>{report.tournament.name}</h2>
              <p className="hint">
                Current event slice · aoe2recs: <code>{report.tournament.tournamentId}</code>
              </p>

              {report.opponentTournament ? (
                <div className="pro-tournament-summary">
                  <div className="pro-record-chip">
                    <span className="pro-record-label">{report.opponent.career.name} in event</span>
                    <span className="pro-record-value">
                      {report.opponentTournament.record.wins}-{report.opponentTournament.record.losses}
                      {report.opponentTournament.record.pending > 0
                        ? ` (+${report.opponentTournament.record.pending} pending)`
                        : ''}
                    </span>
                  </div>
                </div>
              ) : null}

              {report.opponentTournament?.matches.length ? (
                <ul className="pro-match-list">
                  {report.opponentTournament.matches.map((match) => (
                    <li key={match.matchId}>
                      <span className="pro-match-round">{match.round}</span>
                      <span className="pro-match-players">
                        {(match.participants || []).map((p) => p.name).join(' vs ')}
                      </span>
                      <span className="pro-match-score">
                        {(match.participants || [])
                          .map((p) => (p.score != null ? String(p.score) : '—'))
                          .join(' – ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <PatternSection
            title="Historical tendencies"
            patterns={report.historicalPatterns}
            scopeLabel={`${report.historyScope.label} · ${report.cacheStats.eloTournamentsInScope ?? 0} aoe-elo events · ${report.cacheStats.recsTournamentsResolved ?? 0} resolved on aoe2recs · ${report.cacheStats.historicalTournamentsSampled ?? 0} with draft data`}
            note={report.historicalPatternsNote}
          />

          {report.tournament ? (
            <PatternSection
              title={`${report.tournament.name} — event tendencies`}
              patterns={report.tournamentPatterns}
              scopeLabel="Current tournament only"
            />
          ) : null}

          <section className="panel pro-h2h-panel">
            <h2>Historical Head-to-Head</h2>
            <p className="hint">
              Direct series in {report.headToHead.windowLabel}, excluding the current event.
            </p>
            {h2h && h2h.total > 0 ? (
              <>
                <p className="pro-h2h-score">
                  {report.reference.career?.name ?? report.reference.query}{' '}
                  <strong>{h2h.referenceWins}</strong> – <strong>{h2h.opponentWins}</strong>{' '}
                  {report.opponent.career.name}
                  {h2h.pending > 0 ? ` (${h2h.pending} pending)` : ''}
                </p>
                <ul className="pro-match-list">
                  {report.headToHead.historical.map((match) => (
                    <li key={`${match.tournamentId ?? 't'}-${match.matchId}`}>
                      <span className="pro-match-round">{match.tournamentName ?? match.round}</span>
                      <span className="pro-match-players">
                        {(match.participants || []).map((p) => p.name).join(' vs ')}
                      </span>
                      <span className="pro-match-score">
                        {(match.participants || [])
                          .map((p) => (p.score != null ? String(p.score) : '—'))
                          .join(' – ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="hint">No historical head-to-head found for {report.headToHead.windowLabel}.</p>
            )}
          </section>

          {report.analysisMeta?.durationMs ? (
            <p className="hint pro-analysis-timing">
              Analysis completed in {(report.analysisMeta.durationMs / 1000).toFixed(1)}s
              {report.analysisMeta.phases?.length
                ? ` · ${report.analysisMeta.phases.map((p) => p.detail).join(' · ')}`
                : ''}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
