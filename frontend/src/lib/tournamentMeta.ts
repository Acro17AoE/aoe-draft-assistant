import type { LiquipediaAttribution, TournamentStatsStatus } from './tournamentStats'

export interface MetaNamedCount {
  name: string
  count: number
  winRate?: number | null
}

export interface MetaCivRate {
  civ: string
  plays?: number
  wins?: number
  winRate?: number | null
  picks?: number
  bans?: number
  pickRate?: number | null
  banRate?: number | null
}

export interface MetaPerMap {
  mapName: string
  topPicks: MetaCivRate[]
  bottomPicks: MetaCivRate[]
}

export interface MetaEventSummary {
  slug: string
  displayName: string
  liquipediaParent?: string
  liquipediaUrl?: string
  stages?: string[]
  aliases?: string[]
  status?: string
  statusDetail?: string | null
  lastSyncedAt?: string | null
  matchCount?: number
  draftCount?: number
  draftPairCount?: number
  pendingDraftCount?: number
}

export interface TournamentMetaOverview {
  found: boolean
  slug: string
  status?: TournamentStatsStatus
  maps: {
    mostPlayed?: MetaNamedCount[]
    leastPlayed?: MetaNamedCount[]
    mostBanned?: MetaNamedCount[]
    mostPicked?: MetaNamedCount[]
    mostNeutral?: MetaNamedCount[]
    mapDraftCount?: number
  }
  civs: {
    mostPlayed?: MetaNamedCount[]
    leastPlayed?: MetaNamedCount[]
    mostBanned?: MetaNamedCount[]
    mostPicked?: MetaNamedCount[]
    mostNeutral?: MetaNamedCount[]
    highestWinRate?: MetaNamedCount[]
    rates?: MetaCivRate[]
    civDraftCount?: number
  }
  perMap: MetaPerMap[]
  attribution: LiquipediaAttribution
}

export interface MetaEventsResponse {
  events: MetaEventSummary[]
  attribution: LiquipediaAttribution
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

export async function fetchMetaEvents(): Promise<MetaEventsResponse> {
  const response = await fetch('/api/tournament-stats/meta/events')
  if (!response.ok) throw new Error(await readError(response, 'Could not load meta events'))
  return response.json() as Promise<MetaEventsResponse>
}

export async function fetchMetaOverview(slug: string): Promise<TournamentMetaOverview> {
  const response = await fetch(`/api/tournament-stats/meta/${encodeURIComponent(slug)}`)
  if (!response.ok) throw new Error(await readError(response, 'Could not load tournament meta'))
  return response.json() as Promise<TournamentMetaOverview>
}
