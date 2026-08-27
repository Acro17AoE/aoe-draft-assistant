import { useState } from 'react'
import { civIconUrl } from '../lib/civs'
import { resolveMapDisplay } from '../lib/maps'
import type {
  OpponentNamedCount,
  OpponentTeamAnalysis,
  TournamentTeamSummary,
} from '../lib/opponentAnalysis'
import { formatTournamentDatasetStatus } from '../lib/tournamentStats'
import { OpponentSetDraftModal } from './OpponentSetDraftModal'

export type OpponentAnalysisVariant = 'map' | 'civ' | 'full'

function MapIcon({ name }: { name: string }) {
  const display = resolveMapDisplay(name)
  if (!display.imageUrl) return null
  return <img src={display.imageUrl} alt="" className="opponent-analysis-icon" />
}

function NamedList({
  title,
  rows,
  kind,
}: {
  title: string
  rows: OpponentNamedCount[] | undefined
  kind: 'map' | 'civ'
}) {
  const items = rows ?? []
  return (
    <section className="opponent-analysis-list">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="hint">No data yet</p>
      ) : (
        <ol>
          {items.map((row) => (
            <li key={`${title}-${row.name}`}>
              {kind === 'map' ? (
                <MapIcon name={row.name} />
              ) : (
                <img src={civIconUrl(row.name)} alt="" className="opponent-analysis-icon" />
              )}
              <span>{row.name}</span>
              <span className="opponent-analysis-meta">
                {row.count}
                {row.avgOrder != null ? ` · #${row.avgOrder}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function TournamentSetsList({
  analysis,
}: {
  analysis: OpponentTeamAnalysis
}) {
  const [openSetKey, setOpenSetKey] = useState<string | null>(null)
  const sets = analysis.sets ?? []
  const openSet = sets.find((row) => row.matchKey === openSetKey) ?? null

  return (
    <div className="opponent-analysis-sets">
      <h3 className="opponent-analysis-section-title">Tournament sets</h3>
      {sets.length === 0 ? (
        <p className="hint">
          No played sets in the local tournament cache yet. Use Refresh data (or Analysis → Tournament
          Meta) to sync Liquipedia matches.
        </p>
      ) : (
        <ul className="draft-preview-set-list opponent-analysis-set-list">
          {sets.map((set) => {
            const firstMap = set.games?.[0]?.map
            const mapImg = firstMap ? resolveMapDisplay(firstMap).imageUrl : null
            return (
              <li key={set.matchKey}>
                <button type="button" onClick={() => setOpenSetKey(set.matchKey)}>
                  {mapImg ? <img src={mapImg} alt="" /> : null}
                  <span>
                    vs {set.opponent ?? '—'}
                    {set.date ? ` · ${set.date}` : ''}
                    {set.stage ? ` · ${set.stage}` : ''}
                  </span>
                  <span className="hint">View drafts</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {openSet && analysis.team ? (
        <OpponentSetDraftModal
          set={openSet}
          teamName={analysis.team}
          onClose={() => setOpenSetKey(null)}
        />
      ) : null}
    </div>
  )
}

function MapDraftAnalysisBody({ analysis }: { analysis: OpponentTeamAnalysis }) {
  const uncertain = analysis.uncertain
  const hasUncertainMaps =
    (uncertain?.mapsBannedAgainst?.length ?? 0) > 0 ||
    (uncertain?.mapsPickedByOpponent?.length ?? 0) > 0

  return (
    <>
      <h3 className="opponent-analysis-section-title">Their map actions (confirmed)</h3>
      <div className="opponent-analysis-grid">
        <NamedList title="Map bans" rows={analysis.maps?.mostBanned} kind="map" />
        <NamedList title="Map picks" rows={analysis.maps?.mostPicked} kind="map" />
      </div>
      {hasUncertainMaps ? (
        <div className="opponent-analysis-uncertain">
          <h3 className="opponent-analysis-section-title">Denied by opponents (uncertain)</h3>
          <p className="hint opponent-analysis-uncertain-note">
            Map actions by the other side in these drafts — may overlap with this team’s priorities, or
            just reflect opponent choices.
          </p>
          <div className="opponent-analysis-grid">
            <NamedList title="Maps banned vs them" rows={uncertain?.mapsBannedAgainst} kind="map" />
            <NamedList
              title="Maps picked by opponents"
              rows={uncertain?.mapsPickedByOpponent}
              kind="map"
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

function CivDraftAnalysisBody({ analysis }: { analysis: OpponentTeamAnalysis }) {
  const uncertain = analysis.uncertain
  const hasUncertainCivs = (uncertain?.civsBannedAgainst?.length ?? 0) > 0

  return (
    <>
      <h3 className="opponent-analysis-section-title">Their civ actions (confirmed)</h3>
      <div className="opponent-analysis-grid">
        <NamedList title="Civ bans" rows={analysis.civs?.mostBanned} kind="civ" />
        <NamedList title="Civ picks" rows={analysis.civs?.mostPicked} kind="civ" />
      </div>
      {hasUncertainCivs ? (
        <div className="opponent-analysis-uncertain">
          <h3 className="opponent-analysis-section-title">Denied by opponents (uncertain)</h3>
          <p className="hint opponent-analysis-uncertain-note">
            Civ bans by the other side in these drafts — may overlap with this team’s priorities, or just
            reflect opponent choices.
          </p>
          <div className="opponent-analysis-grid">
            <NamedList title="Civs banned vs them" rows={uncertain?.civsBannedAgainst} kind="civ" />
          </div>
        </div>
      ) : null}
      {(analysis.mapCivs ?? []).length ? (
        <div className="opponent-analysis-mapcivs">
          <h3>Civs by map (their games)</h3>
          <div className="opponent-analysis-mapciv-grid">
            {(analysis.mapCivs ?? []).map((group) => (
              <article key={group.mapName} className="opponent-analysis-mapciv panel">
                <header>
                  <MapIcon name={group.mapName} />
                  <h4>{group.mapName}</h4>
                </header>
                <ul>
                  {group.civs.map((row) => (
                    <li key={`${group.mapName}-${row.civ}`}>
                      <img src={civIconUrl(row.civ)} alt="" className="opponent-analysis-icon" />
                      <span>
                        {row.civ} {row.plays}
                        {row.winRate != null ? ` · ${row.winRate}%` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

function titleForVariant(variant: OpponentAnalysisVariant): string {
  if (variant === 'map') return 'Opponent analysis — Map Draft'
  if (variant === 'civ') return 'Opponent analysis — Civ Draft'
  return 'Opponent analysis'
}

export function OpponentTeamSelect({
  value,
  teams,
  busy,
  hint,
  onChange,
}: {
  value: string
  teams: TournamentTeamSummary[]
  busy?: boolean
  hint?: string | null
  onChange: (team: string) => void
}) {
  return (
    <label className="opponent-team-select">
      Opponent (tournament)
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={busy || (!teams.length && !value)}
      >
        <option value="">No opponent selected</option>
        {teams.map((team) => (
          <option key={team.name} value={team.name}>
            {team.name} ({team.matchCount})
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}

interface OpponentAnalysisPanelProps {
  variant: OpponentAnalysisVariant
  analysis: OpponentTeamAnalysis | null
  busy?: boolean
  error?: string | null
  syncBusy?: boolean
  onRefreshSync?: () => void
  emptyHint?: string | null
}

export function OpponentAnalysisPanel({
  variant,
  analysis,
  busy,
  error,
  syncBusy,
  onRefreshSync,
  emptyHint,
}: OpponentAnalysisPanelProps) {
  if (!analysis && !busy && !error && !emptyHint) return null

  const statusLine = analysis?.status ? formatTournamentDatasetStatus(analysis.status) : null
  const showMap = variant === 'map' || variant === 'full'
  const showCiv = variant === 'civ' || variant === 'full'

  return (
    <section className={`panel opponent-analysis-panel variant-${variant}`}>
      <header className="opponent-analysis-header">
        <div>
          <h2>{titleForVariant(variant)}</h2>
          {analysis?.team ? (
            <p className="hint">
              {analysis.team} · {analysis.matchCount ?? 0} played set(s)
              {analysis.mapDraftCount != null ? ` · ${analysis.mapDraftCount} map drafts` : ''}
              {analysis.civDraftCount != null ? ` · ${analysis.civDraftCount} civ drafts` : ''}
            </p>
          ) : null}
          {statusLine ? <p className="hint opponent-analysis-sync-status">{statusLine}</p> : null}
        </div>
        {onRefreshSync ? (
          <button
            type="button"
            className="compact-btn"
            disabled={syncBusy || busy}
            onClick={onRefreshSync}
            title="Re-sync Liquipedia matches and linked drafts for this tournament"
          >
            {syncBusy ? 'Syncing…' : 'Refresh data'}
          </button>
        ) : null}
      </header>

      {emptyHint && !analysis?.team ? <p className="hint">{emptyHint}</p> : null}
      {busy ? <p className="hint">Loading opponent tendencies…</p> : null}
      {error ? <p className="set-replay-error">{error}</p> : null}

      {analysis?.found ? (
        <>
          {(analysis.priorities ?? []).length && variant === 'full' ? (
            <ul className="opponent-analysis-priorities">
              {(analysis.priorities ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}

          {variant === 'full' ? (
            <>
              <div className="opponent-analysis-full-block">
                <h3 className="opponent-analysis-block-title">Map Draft</h3>
                <MapDraftAnalysisBody analysis={analysis} />
              </div>
              <div className="opponent-analysis-full-block">
                <h3 className="opponent-analysis-block-title">Civ Draft</h3>
                <CivDraftAnalysisBody analysis={analysis} />
              </div>
            </>
          ) : (
            <>
              {showMap ? <MapDraftAnalysisBody analysis={analysis} /> : null}
              {showCiv ? <CivDraftAnalysisBody analysis={analysis} /> : null}
            </>
          )}

          <TournamentSetsList analysis={analysis} />
        </>
      ) : null}
    </section>
  )
}

/** Tag maps for live board hints from opponent map tendencies. */
export function mapHintsFromAnalysis(
  analysis: OpponentTeamAnalysis | null,
): Record<string, string[]> {
  const hints: Record<string, string[]> = {}
  const add = (name: string, tag: string) => {
    const key = name.trim().toLowerCase()
    if (!key) return
    const bucket = hints[key] ?? []
    if (!bucket.includes(tag)) bucket.push(tag)
    hints[key] = bucket
  }
  for (const row of analysis?.maps?.mostBanned ?? []) {
    add(row.name, 'Their ban')
  }
  for (const row of analysis?.maps?.mostPicked ?? []) {
    add(row.name, 'Their pick')
  }
  for (const row of analysis?.uncertain?.mapsBannedAgainst ?? []) {
    add(row.name, 'Denied vs them?')
  }
  return hints
}
