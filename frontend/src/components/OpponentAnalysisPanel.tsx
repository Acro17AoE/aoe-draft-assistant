import { civIconUrl } from '../lib/civs'
import { resolveMapDisplay } from '../lib/maps'
import type {
  OpponentNamedCount,
  OpponentTeamAnalysis,
} from '../lib/opponentAnalysis'

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
              {kind === 'map' ? <MapIcon name={row.name} /> : <img src={civIconUrl(row.name)} alt="" className="opponent-analysis-icon" />}
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

interface OpponentAnalysisPanelProps {
  analysis: OpponentTeamAnalysis | null
  busy?: boolean
  error?: string | null
}

export function OpponentAnalysisPanel({ analysis, busy, error }: OpponentAnalysisPanelProps) {
  if (!analysis && !busy && !error) return null

  return (
    <section className="panel opponent-analysis-panel">
      <header className="opponent-analysis-header">
        <h2>Opponent analysis</h2>
        {analysis?.team ? (
          <p className="hint">
            {analysis.team} · {analysis.matchCount ?? 0} match(es) in tournament cache
            {analysis.mapDraftCount != null ? ` · ${analysis.mapDraftCount} map drafts` : ''}
            {analysis.civDraftCount != null ? ` · ${analysis.civDraftCount} civ drafts` : ''}
          </p>
        ) : null}
      </header>
      {busy ? <p className="hint">Loading opponent tendencies…</p> : null}
      {error ? <p className="set-replay-error">{error}</p> : null}
      {analysis?.found ? (
        <>
          {(analysis.priorities ?? []).length ? (
            <ul className="opponent-analysis-priorities">
              {(analysis.priorities ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <div className="opponent-analysis-grid">
            <NamedList title="Map bans" rows={analysis.maps?.mostBanned} kind="map" />
            <NamedList title="Map picks" rows={analysis.maps?.mostPicked} kind="map" />
            <NamedList title="Civ bans" rows={analysis.civs?.mostBanned} kind="civ" />
            <NamedList title="Civ picks" rows={analysis.civs?.mostPicked} kind="civ" />
          </div>
          {(analysis.mapCivs ?? []).length ? (
            <div className="opponent-analysis-mapcivs">
              <h3>Civs by map</h3>
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
    add(row.name, 'Likely ban')
  }
  for (const row of analysis?.maps?.mostPicked ?? []) {
    add(row.name, 'Likely pick')
  }
  return hints
}
