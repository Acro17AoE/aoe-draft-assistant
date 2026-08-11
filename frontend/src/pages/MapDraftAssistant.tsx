import { useEffect, useMemo, useRef, useState } from 'react'
import { DraftPreview } from '../components/DraftPreview'
import { MapDraftBoard } from '../components/MapDraftBoard'
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
import type { MapPriorityPreset, MapSessionConfig } from '../types/draft'
import type { TournamentFormat } from '../types/results'

const DEFAULT_SESSION: MapSessionConfig = {
  mode: 'standard',
  mapDraftUrl: '',
  ownTeamName: '',
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

  return (
    <main className="layout assistant-layout">
      <MapDraftSetup value={session} presetMaps={presetMaps} onChange={updateSession} error={error} />

      {ready && mode === 'standard' ? (
        <MapDraftBoard
          items={mapItems}
          nameHost={mapDraft?.nameHost}
          nameGuest={mapDraft?.nameGuest}
          draftStatus={draftStatus}
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
        />
      ) : (
        <DraftPreview presets={presets} mapNames={[]} presetTournamentName={presetTournamentName} />
      )}
    </main>
  )
}
