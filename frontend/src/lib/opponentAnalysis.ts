import {
  resolveTournamentStats,
  type LiquipediaAttribution,
  type TournamentStatsStatus,
} from './tournamentStats'
import { getAuthToken } from './cloudStorage'

export interface OpponentNamedCount {
  name: string
  count: number
  avgOrder?: number | null
}

export interface OpponentMapCiv {
  civ: string
  plays: number
  wins?: number
  winRate?: number | null
}

export interface OpponentMapCivGroup {
  mapName: string
  civs: OpponentMapCiv[]
}

export interface OpponentDraftEvent {
  action: 'pick' | 'ban'
  optionId: string
  name: string
  side: string
  isTeam: boolean
  order?: number | null
}

export interface OpponentSetGame {
  map?: string | null
  teamCivs: string[]
  opponentCivs: string[]
  winner?: 'team' | 'opponent' | null
}

export interface OpponentSetSummary {
  matchKey: string
  stage?: string
  date?: string | null
  opponent?: string | null
  winner?: 'team' | 'opponent' | null
  mapDraftId?: string | null
  civDraftId?: string | null
  mapDraftUrl?: string | null
  civDraftUrl?: string | null
  mapTimeline: OpponentDraftEvent[]
  civTimeline: OpponentDraftEvent[]
  games: OpponentSetGame[]
}

export interface OpponentUncertainActions {
  mapsBannedAgainst?: OpponentNamedCount[]
  mapsPickedByOpponent?: OpponentNamedCount[]
  civsBannedAgainst?: OpponentNamedCount[]
  note?: string
}

export interface OpponentTeamAnalysis {
  found: boolean
  slug: string
  team: string
  matchCount?: number
  mapDraftCount?: number
  civDraftCount?: number
  maps?: {
    mostBanned?: OpponentNamedCount[]
    mostPicked?: OpponentNamedCount[]
  }
  civs?: {
    mostBanned?: OpponentNamedCount[]
    mostPicked?: OpponentNamedCount[]
  }
  /** Foe-side draft actions — may or may not reflect this team's priorities. */
  uncertain?: OpponentUncertainActions
  mapCivs?: OpponentMapCivGroup[]
  priorities?: string[]
  sets?: OpponentSetSummary[]
  attribution?: LiquipediaAttribution
  status?: TournamentStatsStatus
}

export interface TournamentTeamSummary {
  name: string
  matchCount: number
}

export interface TournamentTeamsResponse {
  found: boolean
  slug: string
  teams: TournamentTeamSummary[]
  attribution?: LiquipediaAttribution
  status?: TournamentStatsStatus
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const parsed = (await response.json()) as { detail?: string }
    if (parsed.detail) return parsed.detail
  } catch {
    // ignore
  }
  return fallback
}

function authHeaders(): HeadersInit {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchTournamentTeams(slug: string): Promise<TournamentTeamsResponse> {
  const response = await fetch(`/api/tournament-stats/${encodeURIComponent(slug)}/teams`, {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(await readError(response, 'Could not load teams'))
  return response.json() as Promise<TournamentTeamsResponse>
}

export async function fetchOpponentTeamAnalysis(
  slug: string,
  teamName: string,
): Promise<OpponentTeamAnalysis> {
  const response = await fetch(
    `/api/tournament-stats/${encodeURIComponent(slug)}/teams/${encodeURIComponent(teamName)}/analysis`,
    { headers: authHeaders() },
  )
  if (!response.ok) throw new Error(await readError(response, 'Could not load opponent analysis'))
  return response.json() as Promise<OpponentTeamAnalysis>
}

export async function resolveAndFetchTeams(tournamentName: string): Promise<{
  status: TournamentStatsStatus
  teams: TournamentTeamSummary[]
}> {
  const status = await resolveTournamentStats(tournamentName)
  if (!status.found || !status.slug || (status.matchCount ?? 0) <= 0) {
    return { status, teams: [] }
  }
  const payload = await fetchTournamentTeams(status.slug)
  return { status, teams: payload.teams ?? [] }
}
