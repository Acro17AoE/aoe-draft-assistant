export type ProAnalysisHistoryScope =
  | 'last_5_tournaments'
  | 'last_year'
  | 'last_5_years'
  | 'all_time'

export const HISTORY_SCOPE_OPTIONS: Array<{ value: ProAnalysisHistoryScope; label: string }> = [
  { value: 'last_5_tournaments', label: 'Last 5 tournaments' },
  { value: 'last_year', label: 'Last year' },
  { value: 'last_5_years', label: 'Last 5 years' },
  { value: 'all_time', label: 'All time' },
]

export interface ProAnalysisCareer {
  id?: number
  name?: string
  elo?: number
  peakElo?: number
  rank?: number | null
  teamName?: string | null
  seriesPlayed?: number
  seriesWon?: number
  seriesWinRate?: number | null
  gamesPlayed?: number
  tournamentsPlayed?: number
  firstSeriesTime?: string | null
  peakTime?: string | null
  lastSeriesTime?: string | null
  inactive?: boolean
  retired?: boolean
  url?: string
}

export interface ProAnalysisTakeaway {
  category: string
  severity: 'high' | 'medium' | 'low'
  text: string
}

export interface ProAnalysisMatch {
  round: string
  matchId: string
  participants: Array<{ name: string; score?: number | null; winner?: boolean | null }>
  finished: boolean
  drafts?: Array<{ type: string; url: string; preset: string }>
  played?: number
  tournamentId?: string
  tournamentName?: string
}

export interface ProAnalysisDraftPatterns {
  draftCount?: number
  pickCounts?: Record<string, number>
  banCounts?: Record<string, number>
  topPicks?: string[]
  topBans?: string[]
  archetypePicks?: Record<string, number>
  archetypeBans?: Record<string, number>
  topArchetypePicks?: string[]
  topArchetypeBans?: string[]
  topArchetypePlayed?: string[]
  playedCounts?: Record<string, number>
  topPlayed?: string[]
  archetypePlayed?: Record<string, number>
}

export interface LiquipediaAttribution {
  text: string
  url: string
  license: string
  licenseUrl: string
}

export interface LiquipediaPlayerRef {
  pagename: string
  id?: string
  name?: string
  status?: string
  team?: string
  nationality?: string
  url: string
  source: string
}

export interface LiquipediaTournamentRef {
  pagename: string
  name: string
  startDate?: string
  endDate?: string
  series?: string
  url: string
  source: string
}

export interface LiquipediaEnrichment {
  configured: boolean
  attribution: LiquipediaAttribution | null
  reference: LiquipediaPlayerRef | null
  opponent: LiquipediaPlayerRef | null
  tournament: LiquipediaTournamentRef | null
}

export interface ProAnalysisReport {
  reference: {
    query: string
    found: boolean
    career: ProAnalysisCareer | null
  }
  opponent: {
    query: string
    found: boolean
    career: ProAnalysisCareer
  }
  historyScope: {
    mode: ProAnalysisHistoryScope
    label: string
  }
  tournament: {
    tournamentId: string
    name: string
    url?: string
  } | null
  referenceInTournament: boolean
  opponentTournament: {
    inTournament: boolean
    record: { wins: number; losses: number; pending: number }
    matches: ProAnalysisMatch[]
  } | null
  headToHead: {
    historical: ProAnalysisMatch[]
    summary: {
      referenceWins: number
      opponentWins: number
      pending: number
      total: number
    }
    windowLabel: string
  }
  tournamentPatterns: {
    map: ProAnalysisDraftPatterns
    civ: ProAnalysisDraftPatterns
  }
  historicalPatterns: {
    map: ProAnalysisDraftPatterns
    civ: ProAnalysisDraftPatterns
  }
  historicalPatternsNote?: string
  cacheStats: {
    cachedTournamentsForOpponent?: number
    historicalTournamentsSampled?: number
    historicalDraftsParsed?: number
    eloTournamentsInScope?: number
    recsTournamentsResolved?: number
  }
  tournamentSuggestions: Array<{
    tournamentId: string
    name: string
    score: number
  }>
  keyTakeaways: ProAnalysisTakeaway[]
  liquipedia?: LiquipediaEnrichment
  sourceWarnings?: string[]
  analysisMeta?: {
    durationMs?: number
    phases?: Array<{ name: string; detail: string; elapsedMs?: number }>
  }
}

export async function fetchProAnalysis(payload: {
  reference: string
  opponent: string
  tournament?: string
  historyScope?: ProAnalysisHistoryScope
}): Promise<ProAnalysisReport> {
  const params = new URLSearchParams({
    reference: payload.reference.trim(),
    opponent: payload.opponent.trim(),
  })
  if (payload.tournament?.trim()) {
    params.set('tournament', payload.tournament.trim())
  }
  if (payload.historyScope) {
    params.set('history_scope', payload.historyScope)
  }

  const response = await fetch(`/api/pro-analysis?${params}`)
  if (!response.ok) {
    let message = 'Pro analysis failed'
    try {
      const parsed = (await response.json()) as { detail?: string }
      if (parsed.detail) message = parsed.detail
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return response.json() as Promise<ProAnalysisReport>
}

export interface LiquipediaStatus {
  configured: boolean
  wiki: string
  api: string
  rateLimitHint?: string
  attributionRequired?: boolean
  copyrightUrl?: string
}

export async function fetchLiquipediaStatus(): Promise<LiquipediaStatus> {
  const response = await fetch('/api/liquipedia/status')
  if (!response.ok) {
    return { configured: false, wiki: 'ageofempires', api: 'lpdb-v3' }
  }
  return response.json() as Promise<LiquipediaStatus>
}
