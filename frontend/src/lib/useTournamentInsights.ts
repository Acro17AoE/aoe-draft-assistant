import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchDraftTournamentStats,
  fetchMapTournamentStats,
  resolveTournamentStats,
  syncTournamentStats,
  type DraftTournamentStats,
  type MapTournamentStats,
  type TournamentStatsStatus,
} from '../lib/tournamentStats'

function uniqueMapNames(mapNames: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of mapNames) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function needsAutoSync(status: TournamentStatsStatus | null): boolean {
  if (!status?.found || !status.slug) return false
  if (status.status === 'syncing') return false
  if (status.status === 'idle' || status.status === 'error') return true
  if ((status.matchCount ?? 0) === 0) return true
  const stages = status.stages?.length ?? 0
  // The League registry has 4 tabs; 1 stage means Div1-only cache and must restage.
  if (stages > 0 && stages < 4 && (status.slug === 'the-league' || /league/i.test(status.displayName || ''))) {
    return true
  }
  if (stages > 1 && (status.draftPairCount ?? status.draftCount ?? 0) === 0) return true
  if ((status.pendingDraftCount ?? 0) > 0) return true
  if (status.statusDetail?.includes('Partial sync')) return true
  return false
}

export function useTournamentInsights(tournamentName: string | undefined, mapNames: string[]) {
  const [status, setStatus] = useState<TournamentStatsStatus | null>(null)
  const [mapStats, setMapStats] = useState<Record<string, MapTournamentStats>>({})
  const [draftSummary, setDraftSummary] = useState<DraftTournamentStats | null>(null)
  const [fullDrafts, setFullDrafts] = useState<DraftTournamentStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoSyncedFor = useRef<string | null>(null)

  const uniqueMaps = useMemo(() => uniqueMapNames(mapNames), [mapNames])
  const uniqueMapsKey = uniqueMaps.join('|')

  const loadInsights = useCallback(async (slug: string, maps: string[]) => {
    const [draft, ...mapResults] = await Promise.all([
      fetchDraftTournamentStats(slug, false),
      ...maps.map((mapName) => fetchMapTournamentStats(slug, mapName)),
    ])
    setDraftSummary(draft)
    const next: Record<string, MapTournamentStats> = {}
    maps.forEach((mapName, index) => {
      next[mapName] = mapResults[index]!
    })
    setMapStats(next)
  }, [])

  const loadCached = useCallback(
    async (name: string) => {
      setError(null)
      const maps = uniqueMapNames(mapNames)
      const resolved = await resolveTournamentStats(name)
      setStatus(resolved)
      if (!resolved.found || resolved.status !== 'ready' || !resolved.slug || (resolved.matchCount ?? 0) <= 0) {
        setMapStats({})
        setDraftSummary(null)
        return resolved
      }
      await loadInsights(resolved.slug, maps)
      return resolved
    },
    [mapNames, loadInsights],
  )

  const runSync = useCallback(
    async (name: string, options?: { force?: boolean }) => {
      setBusy(true)
      setError(null)
      try {
        const synced = await syncTournamentStats(name, options)
        setStatus(synced)
        setFullDrafts(null)
        if (synced.found && synced.slug && (synced.matchCount ?? 0) > 0) {
          await loadInsights(synced.slug, uniqueMapNames(mapNames))
        } else {
          setMapStats({})
          setDraftSummary(null)
        }
        return synced
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed'
        setError(message)
        try {
          const latest = await resolveTournamentStats(name)
          setStatus(latest)
        } catch {
          setStatus((prev) =>
            prev
              ? { ...prev, status: 'error', statusDetail: message }
              : {
                  found: false,
                  slug: '',
                  status: 'error',
                  statusDetail: message,
                  attribution: {
                    text: 'Tournament and team data provided by Liquipedia',
                    url: 'https://liquipedia.net/ageofempires/Main_Page',
                    license: 'CC-BY-SA',
                    licenseUrl: 'https://liquipedia.net/commons/Liquipedia:Copyrights',
                  },
                },
          )
        }
        return null
      } finally {
        setBusy(false)
      }
    },
    [mapNames, loadInsights],
  )

  const refresh = useCallback(async () => {
    if (!tournamentName?.trim()) return
    await runSync(tournamentName.trim(), { force: true })
  }, [tournamentName, runSync])

  useEffect(() => {
    if (!tournamentName?.trim() || !uniqueMaps.length) {
      setStatus(null)
      setMapStats({})
      setDraftSummary(null)
      autoSyncedFor.current = null
      return
    }

    let cancelled = false
    const name = tournamentName.trim()

    void (async () => {
      try {
        const resolved = await loadCached(name)
        if (cancelled || !resolved) return

        const syncKey = `${resolved.slug || name}|${uniqueMapsKey}`
        if (needsAutoSync(resolved) && autoSyncedFor.current !== syncKey) {
          autoSyncedFor.current = syncKey
          await runSync(name)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tournament stats')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tournamentName, uniqueMapsKey, uniqueMaps.length, loadCached, runSync])

  const loadFullDrafts = useCallback(async () => {
    if (!status?.slug) return null
    if (fullDrafts?.slug === status.slug) return fullDrafts
    const full = await fetchDraftTournamentStats(status.slug, true)
    setFullDrafts(full)
    return full
  }, [status?.slug, fullDrafts])

  const ready = Boolean(status?.status === 'ready' && (status.matchCount ?? 0) > 0)

  return {
    status,
    mapStats,
    draftSummary,
    fullDrafts,
    busy,
    error,
    setError,
    ready,
    uniqueMaps,
    loadFullDrafts,
    refresh,
  }
}
