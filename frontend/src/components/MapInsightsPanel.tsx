import type { MapAnalysisResponse } from '../types/draft'

interface MapInsightsPanelProps {
  analysis: MapAnalysisResponse | null
  loading?: boolean
  error?: string | null
}

export function MapInsightsPanel({ analysis, loading, error }: MapInsightsPanelProps) {
  if (loading) {
    return (
      <section className="panel map-panel">
        <h2>Opponent analysis</h2>
        <p>Loading aoe2recs stats…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="panel map-panel">
        <h2>Opponent analysis</h2>
        <p className="error">{error}</p>
      </section>
    )
  }

  if (!analysis) {
    return (
      <section className="panel map-panel">
        <h2>Opponent analysis</h2>
        <p className="hint">Optional: set a tournament ID for priority hints and map counts from aoe2recs.</p>
      </section>
    )
  }

  const { draftAnalysis, mapInsights, ownSide, tournamentStatsAvailable } = analysis

  return (
    <section className="panel map-panel">
      <header className="board-header">
        <h2>Opponent analysis</h2>
        <span>You are {ownSide}</span>
      </header>

      {!tournamentStatsAvailable ? (
        <p className="hint">No tournament ID — tournament map counts (aoe2recs) are disabled.</p>
      ) : null}

      <div className="map-highlights">
        <HighlightBox title="Likely opponent picks" items={draftAnalysis.prioMaps} tone="prio" />
        <HighlightBox title="Likely opponent bans" items={draftAnalysis.antiPrioMaps} tone="anti" />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Map</th>
              <th>Played (tournament)</th>
              <th>Opponent picks</th>
              <th>Opponent bans</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {mapInsights.map((row) => (
              <tr key={row.map} className={row.tags.length ? 'highlight-row' : undefined}>
                <td>{row.map}</td>
                <td>{row.playedCount}</td>
                <td>{row.opponentPickCount}</td>
                <td>{row.opponentBanCount}</td>
                <td>
                  <div className="tag-list">
                    {row.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HighlightBox({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'prio' | 'anti'
}) {
  return (
    <div className={`highlight-box ${tone}`}>
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="hint">No data from the map draft yet.</p>
      )}
    </div>
  )
}
