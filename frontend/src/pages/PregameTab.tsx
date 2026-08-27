import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  OpponentAnalysisPanel,
  OpponentTeamSelect,
} from '../components/OpponentAnalysisPanel'
import { canUseOpponentAnalysis } from '../lib/admin'
import { useAuth } from '../contexts/AuthProvider'
import {
  CLOUD_HYDRATED,
  cloudHydratedIncludesKey,
  DOC_KEYS,
  hasPendingCloudSave,
  isWorkspaceHydrating,
  LOCAL_STORAGE_KEYS,
} from '../lib/cloudStorage'
import { loadMapSession, saveMapSession } from '../lib/presets'
import { syncTournamentStats } from '../lib/tournamentStats'
import {
  useOpponentTeamAnalysis,
  useOpponentTournamentTeams,
} from '../lib/useOpponentAnalysis'
import type { MapSessionConfig } from '../types/draft'

const DEFAULT_SESSION: Pick<MapSessionConfig, 'opponentTeamName'> = {
  opponentTeamName: '',
}

interface PregameTabProps {
  presetTournamentName?: string
}

function readOpponentName(): string {
  const saved = loadMapSession<Partial<MapSessionConfig>>() ?? {}
  return saved.opponentTeamName?.trim() ?? ''
}

export function PregameTab({ presetTournamentName }: PregameTabProps) {
  const { user } = useAuth()
  const enabled = canUseOpponentAnalysis(user)
  const [opponentTeamName, setOpponentTeamName] = useState(readOpponentName)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    const onHydrated = (event: Event) => {
      if (!cloudHydratedIncludesKey(event, DOC_KEYS.MAP_SESSION)) return
      if (hasPendingCloudSave(LOCAL_STORAGE_KEYS.MAP_SESSION)) return
      setOpponentTeamName(readOpponentName())
    }
    window.addEventListener(CLOUD_HYDRATED, onHydrated)
    return () => window.removeEventListener(CLOUD_HYDRATED, onHydrated)
  }, [])

  const persistOpponent = useCallback((team: string) => {
    setOpponentTeamName(team)
    if (isWorkspaceHydrating()) return
    const saved = loadMapSession<Partial<MapSessionConfig>>() ?? {}
    saveMapSession({ ...DEFAULT_SESSION, ...saved, opponentTeamName: team })
  }, [])

  const {
    status: opponentStatus,
    teams: opponentTeams,
    busy: opponentTeamsBusy,
    error: opponentTeamsError,
    reload: reloadOpponentTeams,
  } = useOpponentTournamentTeams(enabled ? presetTournamentName : undefined)

  const opponentSlug = opponentStatus?.found ? opponentStatus.slug : undefined
  const {
    analysis,
    busy: analysisBusy,
    error: analysisError,
    reload: reloadAnalysis,
  } = useOpponentTeamAnalysis(
    enabled ? opponentSlug : undefined,
    enabled ? opponentTeamName : undefined,
  )

  const teamsHint = useMemo(() => {
    if (!presetTournamentName?.trim()) {
      return 'Set an active preset tournament that matches a tracked Liquipedia event.'
    }
    if (opponentTeamsBusy) return 'Loading teams…'
    if (opponentTeamsError) return opponentTeamsError
    if (!opponentStatus?.found) {
      return 'Active preset tournament is not a tracked Liquipedia event.'
    }
    if ((opponentStatus.matchCount ?? 0) <= 0) {
      return 'Sync tournament data (Refresh below or Analysis → Tournament Meta) to load teams.'
    }
    if (!opponentTeams.length) return 'No teams found in synced matches yet.'
    return null
  }, [
    presetTournamentName,
    opponentTeamsBusy,
    opponentTeamsError,
    opponentStatus,
    opponentTeams.length,
  ])

  const refresh = async () => {
    const name = presetTournamentName?.trim()
    if (!name) return
    setSyncBusy(true)
    setSyncError(null)
    try {
      await syncTournamentStats(name, { force: true })
      await reloadOpponentTeams()
      await reloadAnalysis()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Tournament sync failed')
    } finally {
      setSyncBusy(false)
    }
  }

  if (!enabled) {
    return (
      <main className="layout">
        <section className="panel">
          <h2>Pregame</h2>
          <p className="hint">Opponent analysis is not enabled for this account.</p>
        </section>
      </main>
    )
  }

  const hasOpponent = Boolean(opponentTeamName.trim())

  return (
    <main className="layout pregame-layout">
      <section className="panel pregame-intro">
        <h2>Pregame</h2>
        <p>
          Pick your next opponent from the active Liquipedia tournament. DRAFT builds a scouting report
          from synced match and draft history: map/civ ban and pick tendencies, civs by map, and per-set
          draft timelines.
        </p>
        <p className="hint">
          Map Draft and Civ Draft each show the slice that matters for that phase. Keep this tab for the
          full picture and to change the selected opponent. Data comes from the tournament cache — use
          Refresh data after new matches are played.
        </p>

        <OpponentTeamSelect
          value={opponentTeamName}
          teams={opponentTeams}
          busy={opponentTeamsBusy}
          hint={teamsHint}
          onChange={persistOpponent}
        />
      </section>

      {hasOpponent ? (
        <OpponentAnalysisPanel
          variant="full"
          analysis={analysis}
          busy={analysisBusy}
          error={analysisError ?? syncError}
          syncBusy={syncBusy}
          onRefreshSync={() => void refresh()}
        />
      ) : (
        <section className="panel">
          <p className="hint">Select an opponent above to load the full analysis.</p>
        </section>
      )}
    </main>
  )
}
