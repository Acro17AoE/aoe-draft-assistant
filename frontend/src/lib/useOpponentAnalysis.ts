import { useCallback, useEffect, useState } from 'react'
import {
  fetchOpponentTeamAnalysis,
  resolveAndFetchTeams,
  type OpponentTeamAnalysis,
  type TournamentTeamSummary,
} from './opponentAnalysis'
import type { TournamentStatsStatus } from './tournamentStats'

export function useOpponentTournamentTeams(tournamentName: string | undefined) {
  const [status, setStatus] = useState<TournamentStatsStatus | null>(null)
  const [teams, setTeams] = useState<TournamentTeamSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const name = tournamentName?.trim()
    if (!name) {
      setStatus(null)
      setTeams([])
      setError(null)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await resolveAndFetchTeams(name)
      setStatus(result.status)
      setTeams(result.teams)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load teams')
      setTeams([])
    } finally {
      setBusy(false)
    }
  }, [tournamentName])

  useEffect(() => {
    void reload()
  }, [reload])

  return { status, teams, busy, error, reload }
}

export function useOpponentTeamAnalysis(slug: string | undefined, teamName: string | undefined) {
  const [analysis, setAnalysis] = useState<OpponentTeamAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cleanSlug = slug?.trim()
    const cleanTeam = teamName?.trim()
    if (!cleanSlug || !cleanTeam) {
      setAnalysis(null)
      setError(null)
      setBusy(false)
      return
    }
    let cancelled = false
    setBusy(true)
    setError(null)
    void (async () => {
      try {
        const data = await fetchOpponentTeamAnalysis(cleanSlug, cleanTeam)
        if (!cancelled) setAnalysis(data)
      } catch (err) {
        if (!cancelled) {
          setAnalysis(null)
          setError(err instanceof Error ? err.message : 'Opponent analysis failed')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, teamName])

  const reload = useCallback(async () => {
    const cleanSlug = slug?.trim()
    const cleanTeam = teamName?.trim()
    if (!cleanSlug || !cleanTeam) {
      setAnalysis(null)
      setError(null)
      setBusy(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const data = await fetchOpponentTeamAnalysis(cleanSlug, cleanTeam)
      setAnalysis(data)
    } catch (err) {
      setAnalysis(null)
      setError(err instanceof Error ? err.message : 'Opponent analysis failed')
    } finally {
      setBusy(false)
    }
  }, [slug, teamName])

  return { analysis, busy, error, reload }
}
