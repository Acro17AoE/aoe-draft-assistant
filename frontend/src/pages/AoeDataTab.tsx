import { useEffect, useMemo, useState } from 'react'
import { civIconUrl } from '../lib/civs'
import {
  AOE_DATA_SECTIONS,
  fetchAoeDataOverview,
  type AoeDataOverview,
  type AoeDataSection,
} from '../lib/aoeData'
import { fetchMetaEvents, fetchMetaOverview } from '../lib/tournamentMeta'
import { TechExplorerPanel } from '../components/aoeData/TechExplorerPanel'
import { CivDnaPanel } from '../components/aoeData/CivDnaPanel'
import { SynergiesPanel } from '../components/aoeData/SynergiesPanel'
import { MetaExplorerPanel } from '../components/aoeData/MetaExplorerPanel'

function OverviewPanel({
  overview,
  onNavigate,
}: {
  overview: AoeDataOverview | null
  onNavigate: (section: AoeDataSection) => void
}) {
  const [spotlight, setSpotlight] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const events = await fetchMetaEvents()
        const league = events.events.find((event) => event.slug.includes('league'))
        if (!league) return
        const meta = await fetchMetaOverview(league.slug)
        const persians = meta.civs?.rates?.find((row) => row.civ === 'Persians')
        if (!persians || cancelled) return
        const banRate = persians.banRate ?? 0
        const avgBan = persians.avgBanOrder
        setSpotlight(
          `Persians were banned in ${banRate}% of tracked civ drafts (${league.displayName}).` +
            (avgBan != null ? ` Average ban slot: #${avgBan}.` : ''),
        )
      } catch {
        // optional headline
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const cards = useMemo(
    () => AOE_DATA_SECTIONS.filter((section) => section.id !== 'overview'),
    [],
  )

  const funFacts = useMemo(
    () => [
      {
        id: 'permanent-guest',
        title: 'Permanent Guest',
        civs: ['Celts', 'Huns', 'Slavs'] as const,
        body: 'Celts were banned in 0.0% of tracked civ drafts (The League Qualifiers). They made it through every draft untouched. So did Huns and Slavs.',
      },
      {
        id: 'waiting-chinese',
        title: 'Waiting for you to ban Chinese',
        civs: ['Chinese'] as const,
        body: 'Chinese were banned in 51.8% of tracked civ drafts (The League Qualifiers), but usually only after surviving most of the ban phase. Average ban slot: #9.55 of 14.',
      },
      {
        id: 'not-spanish',
        title: 'Definitely not Spanish',
        civs: ['Spanish'] as const,
        body: 'Spanish were banned in 73.2% of tracked civ drafts (The League Qualifiers) and tended to disappear early. Average ban slot: #5.59 of 14.',
      },
    ],
    [],
  )

  return (
    <div className="aoe-data-overview">
      <article className="aoe-data-spotlight panel">
        <div className="aoe-data-spotlight-icon">
          <img src={civIconUrl('Persians')} alt="" />
        </div>
        <div>
          <h3>The elephant in the draft</h3>
          <p>
            {spotlight ??
              'Asian elephants are endangered in the wild — in AoE2, War Elephants remain a Persian trademark while ban rates tell another story. Sync Tournament Meta for live draft headlines.'}
          </p>
        </div>
      </article>

      <section className="aoe-data-funfacts">
        {funFacts.map((fact) => (
          <article key={fact.id} className="aoe-data-funfact panel">
            <div className="aoe-data-funfact-icons">
              {fact.civs.map((civ) => (
                <img key={civ} src={civIconUrl(civ)} alt="" title={civ} />
              ))}
            </div>
            <div>
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </div>
          </article>
        ))}
      </section>

      {overview ? (
        <div className="aoe-data-stat-grid">
          <div className="aoe-data-stat panel">
            <strong>{overview.civCount}</strong>
            <span>Civilizations</span>
          </div>
          <div className="aoe-data-stat panel">
            <strong>{overview.techCount}</strong>
            <span>Technologies</span>
          </div>
          <div className="aoe-data-stat panel">
            <strong>{overview.unitCount}</strong>
            <span>Units</span>
          </div>
          <div className="aoe-data-stat panel">
            <strong>{overview.synergyCount}</strong>
            <span>Curated synergies</span>
          </div>
        </div>
      ) : null}

      <div className="aoe-data-entry-grid">
        {cards.map((section) => (
          <button
            key={section.id}
            type="button"
            className="aoe-data-entry-card panel"
            onClick={() => onNavigate(section.id)}
          >
            <h4>{section.label}</h4>
            <p>{section.blurb}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

export function AoeDataTab() {
  const [section, setSection] = useState<AoeDataSection>('overview')
  const [overview, setOverview] = useState<AoeDataOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await fetchAoeDataOverview()
        if (!cancelled) setOverview(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load game data')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const active = AOE_DATA_SECTIONS.find((item) => item.id === section)

  return (
    <div className="results-layout aoe-data-layout">
      <aside className="panel results-sidebar aoe-data-sidebar">
        <div className="results-sidebar-header">
          <h2>AoE in Data</h2>
          <p className="hint">Browse relationships in the AoE2 universe.</p>
        </div>
        <ul className="tournament-list">
          {AOE_DATA_SECTIONS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`tournament-list-item${section === item.id ? ' active' : ''}`}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        {overview ? (
          <p className="hint aoe-data-sidebar-foot">
            {overview.civCount} civs · {overview.techCount} techs
          </p>
        ) : null}
      </aside>

      <main className="panel results-main aoe-data-main">
        <header className="aoe-data-main-header">
          <h2>{active?.label ?? 'AoE in Data'}</h2>
          {active?.blurb ? <p className="hint">{active.blurb}</p> : null}
        </header>
        {error ? <p className="set-replay-error">{error}</p> : null}
        {section === 'overview' ? (
          <OverviewPanel overview={overview} onNavigate={setSection} />
        ) : null}
        {section === 'tech' ? <TechExplorerPanel /> : null}
        {section === 'dna' ? <CivDnaPanel /> : null}
        {section === 'synergies' ? <SynergiesPanel /> : null}
        {section === 'meta' ? <MetaExplorerPanel /> : null}
      </main>
    </div>
  )
}
