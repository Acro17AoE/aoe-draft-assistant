export interface LiquipediaAttribution {
  text: string
  url: string
  license: string
  licenseUrl: string
}

export interface TournamentStatsStatus {
  found: boolean
  slug: string
  displayName?: string
  liquipediaParent?: string
  liquipediaUrl?: string
  stages?: string[]
  status?: string
  statusDetail?: string | null
  lastSyncedAt?: string | null
  lastMatchDate?: string | null
  matchCount?: number
  draftCount?: number
  draftPairCount?: number
  pendingDraftCount?: number
  registryHit?: boolean
  aliases?: string[]
  attribution: LiquipediaAttribution
}

export interface CivRateStat {
  civ: string
  plays?: number
  wins?: number
  winRate?: number
  picks?: number
  bans?: number
  avgPickOrder?: number | null
}

export interface MapTournamentStats {
  slug: string
  mapName: string
  mostPicked: CivRateStat[]
  highestWinRate: CivRateStat[]
  lowestWinRate: CivRateStat[]
  attribution: LiquipediaAttribution
}

export interface DraftTournamentStats {
  slug: string
  mostBanned: CivRateStat[]
  mostPicked: CivRateStat[]
  earliestPicks: CivRateStat[]
  all?: CivRateStat[]
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

export async function resolveTournamentStats(name: string): Promise<TournamentStatsStatus> {
  const params = new URLSearchParams({ name: name.trim() })
  const response = await fetch(`/api/tournament-stats/resolve?${params}`)
  if (!response.ok) throw new Error(await readError(response, 'Could not resolve tournament'))
  return response.json() as Promise<TournamentStatsStatus>
}

export async function syncTournamentStats(
  name: string,
  options?: { force?: boolean },
): Promise<TournamentStatsStatus> {
  const params = new URLSearchParams({ name: name.trim() })
  if (options?.force) params.set('force', 'true')
  const response = await fetch(`/api/tournament-stats/sync?${params}`, { method: 'POST' })
  if (!response.ok) throw new Error(await readError(response, 'Tournament sync failed'))
  return response.json() as Promise<TournamentStatsStatus>
}

export async function fetchMapTournamentStats(
  slug: string,
  mapName: string,
): Promise<MapTournamentStats> {
  const response = await fetch(
    `/api/tournament-stats/${encodeURIComponent(slug)}/maps/${encodeURIComponent(mapName)}`,
  )
  if (!response.ok) throw new Error(await readError(response, 'Map stats failed'))
  return response.json() as Promise<MapTournamentStats>
}

export async function fetchDraftTournamentStats(
  slug: string,
  full = false,
): Promise<DraftTournamentStats> {
  const path = full ? 'drafts/full' : 'drafts'
  const response = await fetch(`/api/tournament-stats/${encodeURIComponent(slug)}/${path}`)
  if (!response.ok) throw new Error(await readError(response, 'Draft stats failed'))
  return response.json() as Promise<DraftTournamentStats>
}

export function formatTournamentDatasetStatus(
  status: Pick<
    TournamentStatsStatus,
    'status' | 'statusDetail' | 'matchCount' | 'draftCount' | 'draftPairCount' | 'pendingDraftCount'
  > | null,
  busy = false,
): string {
  if (!status) return ''
  if (busy || status.status === 'syncing') {
    return status.statusDetail || 'Syncing…'
  }
  if (status.status === 'error') {
    return status.statusDetail || 'Sync error'
  }
  if (status.statusDetail && status.status !== 'ready') {
    return status.statusDetail
  }
  const matches = status.matchCount ?? 0
  const pairs = status.draftPairCount ?? status.draftCount ?? 0
  const pairLabel = pairs === 1 ? 'draft pair' : 'draft pairs'
  let line = `Ready. ${matches} played matches, ${pairs} ${pairLabel}`
  if (status.statusDetail) {
    line += `. ${status.statusDetail}`
  }
  return line
}
