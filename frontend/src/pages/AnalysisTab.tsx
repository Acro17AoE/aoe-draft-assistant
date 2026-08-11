import { useEffect, useMemo, useState } from 'react'
import { AnalysisCard } from '../components/AnalysisCard'
import { TournamentMetaPanel } from '../components/TournamentMetaPanel'
import { CLOUD_HYDRATED } from '../lib/cloudStorage'
import { fetchDraft } from '../lib/api'
import { extractDraftId } from '../lib/civs'
import { buildTournamentAnalysisSections } from '../lib/tournamentAnalysis'
import { loadTournaments, tournamentsWithResults } from '../lib/results'
import type { Aoe2cmDraft } from '../types/draft'
import type { Tournament } from '../types/results'

const TOURNAMENT_ICON = '/tournament-icon.png'

type AnalysisMode = 'own' | 'meta'

export function useAnalysisTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>(() => loadTournaments())

  useEffect(() => {
    const refresh = () => setTournaments(loadTournaments())
    window.addEventListener('aoe-results-changed', refresh)
    window.addEventListener(CLOUD_HYDRATED, refresh)
    window.addEventListener('storage', (event) => {
      if (event.key === 'aoe-draft-assistant.results') refresh()
    })
    return () => {
      window.removeEventListener('aoe-results-changed', refresh)
      window.removeEventListener(CLOUD_HYDRATED, refresh)
    }
  }, [])

  return tournamentsWithResults(tournaments)
}

function collectDraftIdsFromTournament(tournament: Tournament): string[] {
  const ids = new Set<string>()
  for (const set of tournament.sets) {
    const context = set.draftContext ?? {}
    const civId = extractDraftId(context.civDraftUrl ?? '')
    if (civId.length >= 4) ids.add(civId)
    if (context.mapSource === 'draft') {
      const mapId = extractDraftId(context.mapDraftUrl ?? '')
      if (mapId.length >= 4) ids.add(mapId)
    }
  }
  return [...ids]
}

function tournamentHasSetDraftLinks(tournament: Tournament): boolean {
  return tournament.sets.some((set) => {
    const context = set.draftContext ?? {}
    return !!(
      context.civDraftUrl?.trim() ||
      context.mapDraftUrl?.trim() ||
      context.singleMap?.trim() ||
      (context.selectedMaps ?? []).some((map) => map.trim())
    )
  })
}

interface AnalysisTabProps {
  tournaments: Tournament[]
}

export function AnalysisTab({ tournaments }: AnalysisTabProps) {
  const [mode, setMode] = useState<AnalysisMode>('own')
  const [selectedId, setSelectedId] = useState<string | null>(() => tournaments[0]?.id ?? null)
  const [draftsByUrl, setDraftsByUrl] = useState<Record<string, Aoe2cmDraft>>({})
  const [draftError, setDraftError] = useState<string | null>(null)
  const [loadingDrafts, setLoadingDrafts] = useState(false)

  useEffect(() => {
    if (selectedId && !tournaments.some((tournament) => tournament.id === selectedId)) {
      setSelectedId(tournaments[0]?.id ?? null)
    }
  }, [tournaments, selectedId])

  const selected = tournaments.find((tournament) => tournament.id === selectedId) ?? null
  const draftIds = useMemo(
    () => (selected ? collectDraftIdsFromTournament(selected) : []),
    [selected],
  )
  const draftIdsKey = draftIds.join(',')

  useEffect(() => {
    if (mode !== 'own' || !selected || draftIds.length === 0) {
      setDraftsByUrl({})
      setDraftError(null)
      return
    }

    let cancelled = false
    setLoadingDrafts(true)
    setDraftError(null)

    void (async () => {
      try {
        const entries = await Promise.all(
          draftIds.map(async (id) => [id, await fetchDraft(id)] as const),
        )
        if (cancelled) return
        setDraftsByUrl(Object.fromEntries(entries))
      } catch (error) {
        if (cancelled) return
        setDraftsByUrl({})
        setDraftError(error instanceof Error ? error.message : 'Failed to load draft data')
      } finally {
        if (!cancelled) setLoadingDrafts(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mode, selected, draftIdsKey])

  const sections = useMemo(() => {
    if (!selected) return []
    return buildTournamentAnalysisSections({
      tournament: selected,
      draftsByUrl,
    })
  }, [selected, draftsByUrl])

  return (
    <div className="results-layout analysis-layout">
      <aside className="panel results-sidebar">
        <div className="results-sidebar-header">
          <h2>
            <img src={TOURNAMENT_ICON} alt="" className="results-entity-icon" aria-hidden />
            Analysis
          </h2>
        </div>

        <div className="analysis-mode-toggle" role="tablist" aria-label="Analysis mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'own'}
            className={mode === 'own' ? 'active' : ''}
            onClick={() => setMode('own')}
          >
            Own Results
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'meta'}
            className={mode === 'meta' ? 'active' : ''}
            onClick={() => setMode('meta')}
          >
            Tournament Meta
          </button>
        </div>

        {mode === 'own' ? (
          tournaments.length === 0 ? (
            <p className="hint">No tournaments with saved results yet. Import results first.</p>
          ) : (
            <ul className="tournament-list">
              {tournaments.map((tournament) => (
                <li key={tournament.id}>
                  <button
                    type="button"
                    className={`tournament-list-item ${selectedId === tournament.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(tournament.id)}
                  >
                    <img src={TOURNAMENT_ICON} alt="" className="results-entity-icon" aria-hidden />
                    <span className="tournament-list-copy">
                      <span className="tournament-list-name">{tournament.name}</span>
                      <span className="tournament-list-meta">
                        {tournament.format} · {tournament.sets.length} sets
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </aside>

      <main className="panel results-main">
        {mode === 'meta' ? (
          <>
            <div className="analysis-main-header">
              <h2>Tournament Meta</h2>
              <p className="hint">
                Map and civ rankings from Liquipedia match results and linked aoe2cm drafts.
              </p>
            </div>
            <TournamentMetaPanel />
          </>
        ) : !selected ? (
          <p className="hint">Select a tournament with saved results.</p>
        ) : (
          <>
            <div className="analysis-main-header">
              <h2>{selected.name}</h2>
              <p className="hint">
                Analysis is generated from saved results
                {tournamentHasSetDraftLinks(selected)
                  ? ' and optional per-set draft links from the Results tab'
                  : ''}
                .
              </p>
            </div>

            {loadingDrafts ? <p className="hint">Loading linked drafts…</p> : null}
            {draftError ? <p className="set-replay-error">{draftError}</p> : null}

            <div className="analysis-grid">
              {sections.map((section) => (
                <AnalysisCard key={section.id} section={section} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
