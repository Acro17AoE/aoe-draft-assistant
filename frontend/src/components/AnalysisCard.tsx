export interface AnalysisStat {
  key: string
  label: string
  value: number
  displayValue?: string
  iconUrl?: string
}

export interface AnalysisSection {
  id: string
  title: string
  subtitle?: string
  stats: AnalysisStat[]
}

export function AnalysisCard({ section }: { section: AnalysisSection }) {
  if (!section.stats.length) {
    return (
      <article className="analysis-card panel">
        <header className="analysis-card-header">
          <h3>{section.title}</h3>
          {section.subtitle ? <p className="hint">{section.subtitle}</p> : null}
        </header>
        <p className="hint layer-empty-hint">No data for this analysis yet.</p>
      </article>
    )
  }

  const maxValue = Math.max(...section.stats.map((stat) => stat.value), 1)

  return (
    <article className="analysis-card panel">
      <header className="analysis-card-header">
        <h3>{section.title}</h3>
        {section.subtitle ? <p className="hint">{section.subtitle}</p> : null}
      </header>
      <ol className="analysis-stat-list">
        {section.stats.map((stat, index) => (
          <li key={stat.key} className="analysis-stat-row">
            <span className="analysis-rank">{index + 1}</span>
            {stat.iconUrl ? (
              <img src={stat.iconUrl} alt="" className="analysis-stat-icon" />
            ) : (
              <span className="analysis-stat-icon analysis-stat-icon-empty" aria-hidden />
            )}
            <span className="analysis-label" title={stat.label}>
              {stat.label}
            </span>
            <div className="analysis-bar-track" aria-hidden>
              <div
                className="analysis-bar-fill"
                style={{ width: `${Math.max(4, (stat.value / maxValue) * 100)}%` }}
              />
            </div>
            <span className="analysis-value">{stat.displayValue ?? String(stat.value)}</span>
          </li>
        ))}
      </ol>
    </article>
  )
}
