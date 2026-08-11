import { useEffect, useMemo, useRef, useState } from 'react'
import { DraftPreview } from '../components/DraftPreview'
import { MapDraftBoard } from '../components/MapDraftBoard'
import {
  mapHintsFromAnalysis,
  OpponentAnalysisPanel,
} from '../components/OpponentAnalysisPanel'
import { isMapSessionReady, getSessionMapPicks } from '../lib/mapSession'
import { MapDraftSetup } from '../components/MapDraftSetup'
import { SelectMapsPanel } from '../components/SelectMapsPanel'
import { SingleMapPanel } from '../components/SingleMapPanel'
import { deriveMapBoard, extractAllMapPicks } from '../lib/draftState'
import { deriveDraftStatus } from '../lib/draftStatus'
import { useDraftStream } from '../lib/useDraftStream'
import {
  CLOUD_HYDRATED,
  cloudHydratedIncludesKey,
  DOC_KEYS,
  hasPendingCloudSave,
  isWorkspaceHydrating,
  LOCAL_STORAGE_KEYS,
} from '../lib/cloudStorage'
import {
  resetMapSessionMapsForPreset,
  sanitizeMapSessionForPresetPool,
} from '../lib/mapDraftSession'
import { loadMapSession, saveMapSession } from '../lib/presets'
import {
  useOpponentTeamAnalysis,
  useOpponentTournamentTeams,
} from '../lib/useOpponentAnalysis'
import type { MapPriorityPreset, MapSessionConfig } from '../types/draft'
import type { TournamentFormat } from '../types/results'

const DEFAULT_SESSION: MapSessionConfig = {
  mode: 'standard',
  mapDraftUrl: '',
  ownTeamName: '',
  opponentTeamName: '',
  singleMap: '',
  singleMapFormat: 'PA3',
}

interface MapDraftAssistantProps {
  presetMaps?: string[]
  activePresetId?: string | null
  presets?: MapPriorityPreset[]
  presetTournamentName?: string
  tournamentFormat?: TournamentFormat
  onOpenCivDraft?: () => void
}

function readMapSessionState(presetMaps: string[]): MapSessionConfig {
  const saved = loadMapSession<Partial<MapSessionConfig>>() ?? {}
  const session = { ...DEFAULT_SESSION, ...saved, mode: saved.mode ?? 'standard' }
  return sanitizeMapSessionForPresetPool(session, presetMaps)
}

export function MapDraftAssistant({
  presetMaps = [],
  activePresetId = null,
  presets = [],
  presetTournamentName,
  tournamentFormat,
  onOpenCivDraft,
}: MapDraftAssistantProps) {
  const [session, setSession] = useState<MapSessionConfig>(() => readMapSessionState(presetMaps))
  const presetIdRef = useRef<string | null>(activePresetId)
  const [error, setError] = useState<string | null>(null)

  const mode = session.mode ?? 'standard'
  const ready = isMapSessionReady(session)
  const streamActive = ready && mode === 'standard'

  const { draft: mapDraft, error: streamError } = useDraftStream(session.mapDraftUrl, streamActive)

  const {
    status: opponentStatus,
    teams: opponentTeams,
    busy: opponentTeamsBusy,
    error: opponentTeamsError,
  } = useOpponentTournamentTeams(presetTournamentName)

  const opponentSlug = opponentStatus?.found ? opponentStatus.slug : undefined
  const { analysis: opponentAnalysis, busy: opponentBusy, error: opponentError } =
    useOpponentTeamAnalysis(opponentSlug, session.opponentTeamName)

  const opponentTeamsHint = useMemo(() => {
    if (!presetTournamentName?.trim()) {
      return 'Set an active preset tournament that matches a tracked Liquipedia event.'
    }
    if (opponentTeamsBusy) return 'Loading teams…'
    if (opponentTeamsError) return opponentTeamsError
    if (!opponentStatus?.found) {
      return 'Active preset tournament is not a tracked Liquipedia event.'
    }
    if ((opponentStatus.matchCount ?? 0) <= 0) {
      return 'Sync Tournament Meta / Analysis first to load teams.'
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

  const mapHints = useMemo(() => mapHintsFromAnalysis(opponentAnalysis), [opponentAnalysis])

  useEffect(() => {
    if (streamError) setError(streamError)
  }, [streamError])

  useEffect(() => {
    setSession((current) => {
      const sanitized = sanitizeMapSessionForPresetPool(current, presetMaps)
      if (JSON.stringify(sanitized) === JSON.stringify(current)) return current
      if (!isWorkspaceHydrating()) {
        saveMapSession(sanitized)
      }
      return sanitized
    })
  }, [])

  useEffect(() => {
    const onHydrated = (event: Event) => {
      if (!cloudHydratedIncludesKey(event, DOC_KEYS.MAP_SESSION)) return
      if (hasPendingCloudSave(LOCAL_STORAGE_KEYS.MAP_SESSION)) return
      const next = sanitizeMapSessionForPresetPool(readMapSessionState(presetMaps), presetMaps)
      setSession((current) => {
        if (JSON.stringify(current) === JSON.stringify(next)) return current
        return next
      })
    }
    window.addEventListener(CLOUD_HYDRATED, onHydrated)
    return () => window.removeEventListener(CLOUD_HYDRATED, onHydrated)
  }, [presetMaps.join('|')])

  useEffect(() => {
    if (!activePresetId) return
    if (presetIdRef.current === activePresetId) return
    presetIdRef.current = activePresetId

    setSession((current) => {
      const next = resetMapSessionMapsForPreset(current, presetMaps)
      if (!isWorkspaceHydrating()) {
        saveMapSession(next)
      }
      return next
    })
  }, [activePresetId, presetMaps.join('|')])

  const updateSession = (next: MapSessionConfig) => {
    setSession(next)
    if (!isWorkspaceHydrating()) {
      saveMapSession(next)
    }
  }

  const mapItems = useMemo(() => {
    if (!mapDraft || mode !== 'standard') return []
    return deriveMapBoard(mapDraft, session.ownTeamName)
  }, [mapDraft, session.ownTeamName, mode])

  const draftStatus = useMemo(
    () => (mode === 'standard' ? deriveDraftStatus(mapDraft, streamError) : null),
    [mapDraft, streamError, mode],
  )

  const previewMapNames = useMemo(() => {
    const manual = getSessionMapPicks(session)
    if (manual.length) return manual
    if (mode === 'standard' && mapDraft) return extractAllMapPicks(mapDraft)
    return []
  }, [session, mode, mapDraft])

  const showOpponentReport = Boolean(session.opponentTeamName?.trim())

  return (
    <main className="layout assistant-layout">
      <MapDraftSetup
        value={session}
        presetMaps={presetMaps}
        onChange={updateSession}
        error={error}
        opponentTeams={opponentTeams}
        opponentTeamsBusy={opponentTeamsBusy}
        opponentTeamsHint={opponentTeamsHint}
      />

      {showOpponentReport ? (
        <OpponentAnalysisPanel
          analysis={opponentAnalysis}
          busy={opponentBusy}
          error={opponentError}
        />
      ) : null}

      {ready && mode === 'standard' ? (
        <MapDraftBoard
          items={mapItems}
          nameHost={mapDraft?.nameHost}
          nameGuest={mapDraft?.nameGuest}
          draftStatus={draftStatus}
          mapHints={showOpponentReport ? mapHints : undefined}
        />
      ) : null}

      {ready && mode === 'single-map' && session.singleMap && session.singleMapFormat ? (
        <SingleMapPanel
          mapName={session.singleMap}
          format={session.singleMapFormat}
          teamName={session.ownTeamName}
        />
      ) : null}

      {ready && mode === 'select' && session.selectFormat ? (
        <SelectMapsPanel
          maps={getSessionMapPicks(session)}
          format={session.selectFormat}
          teamName={session.ownTeamName}
        />
      ) : null}

      {ready ? (
        <DraftPreview
          presets={presets}
          mapNames={previewMapNames}
          presetTournamentName={presetTournamentName}
          tournamentFormat={tournamentFormat}
          showCivDraftHint
          onOpenCivDraft={onOpenCivDraft}
          opponentTeamName={session.opponentTeamName}
          opponentAnalysis={opponentAnalysis}
          opponentAnalysisBusy={opponentBusy}
          opponentAnalysisError={opponentError}
        />
      ) : (
        <DraftPreview
          presets={presets}
          mapNames={[]}
          presetTournamentName={presetTournamentName}
          opponentTeamName={session.opponentTeamName}
          opponentAnalysis={opponentAnalysis}
          opponentAnalysisBusy={opponentBusy}
          opponentAnalysisError={opponentError}
        />
      )}
    </main>
  )
}
