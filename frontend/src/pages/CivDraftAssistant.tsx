import { useCallback, useEffect, useMemo, useState } from 'react'
import { CivDraftBoard } from '../components/CivDraftBoard'
import { CivDraftSetup } from '../components/CivDraftSetup'
import { DraftPreview } from '../components/DraftPreview'
import { PreparedBanList } from '../components/PreparedBanList'
import {
  deriveCivBoard,
  extractAllMapPicks,
  resolveMapPickDisplays,
} from '../lib/draftState'
import { deriveDraftStatus } from '../lib/draftStatus'
import { countOwnBanSlots, isBanPhaseComplete } from '../lib/draftBans'
import { mapNamesMatch, resolveMapDisplaysFromPicks, uniqueMapNames } from '../lib/maps'
import { getSaturatedMaps } from '../lib/civMapAssignments'
import { readReadyMapSession, useMapSessionSync, getSessionMapPicks } from '../lib/mapSession'
import { getTopPicksPerMap, mergePriorityEntriesForMaps, collectNemesisCivIds } from '../lib/priorities'
import { CLOUD_HYDRATED, cloudHydratedIncludesKey, DOC_KEYS, hasPendingCloudSave, isWorkspaceHydrating, LOCAL_STORAGE_KEYS } from '../lib/cloudStorage'
import { loadCivSession, saveCivSession } from '../lib/presets'
import { playersPerSide } from '../lib/results'
import { useCivDraftSettings } from '../lib/useCivDraftSettings'
import { useCivMapAssignments } from '../lib/useCivMapAssignments'
import { usePreparedBans } from '../lib/usePreparedBans'
import { useDraftStream } from '../lib/useDraftStream'
import { trackCivDraftStarted } from '../lib/analytics'
import { canUseOpponentAnalysis } from '../lib/admin'
import { useAuth } from '../contexts/AuthProvider'
import { OpponentAnalysisPanel } from '../components/OpponentAnalysisPanel'
import {
  useOpponentTeamAnalysis,
  useOpponentTournamentTeams,
} from '../lib/useOpponentAnalysis'
import { syncTournamentStats } from '../lib/tournamentStats'
import { extractDraftId } from '../lib/civs'
import type { CivSessionConfig, MapPriorityPreset } from '../types/draft'
import type { TournamentFormat } from '../types/results'

const DEFAULT_CIV_SESSION: CivSessionConfig = { civDraftUrl: '' }

interface CivDraftAssistantProps {
  presets: MapPriorityPreset[]
  tournamentFormat?: TournamentFormat
  visible?: boolean
  presetTournamentName?: string
}

export function CivDraftAssistant({
  presets,
  tournamentFormat = '1v1',
  visible = true,
  presetTournamentName,
}: CivDraftAssistantProps) {
  const { user } = useAuth()
  const showOpponentAnalysis = canUseOpponentAnalysis(user)
  const mapSession = useMapSessionSync(visible)
  const { settings } = useCivDraftSettings()

  const { status: opponentStatus, reload: reloadOpponentTeams } = useOpponentTournamentTeams(
    showOpponentAnalysis ? presetTournamentName : undefined,
  )
  const opponentSlug = opponentStatus?.found ? opponentStatus.slug : undefined
  const {
    analysis: opponentAnalysis,
    busy: opponentBusy,
    error: opponentError,
    reload: reloadOpponentAnalysis,
  } = useOpponentTeamAnalysis(
    showOpponentAnalysis ? opponentSlug : undefined,
    showOpponentAnalysis ? mapSession?.opponentTeamName : undefined,
  )
  const [opponentSyncBusy, setOpponentSyncBusy] = useState(false)

  const refreshOpponentTournamentData = async () => {
    const name = presetTournamentName?.trim()
    if (!name) return
    setOpponentSyncBusy(true)
    try {
      await syncTournamentStats(name, { force: true })
      await reloadOpponentTeams()
      await reloadOpponentAnalysis()
    } catch {
      // surfaced via analysis error / status line
    } finally {
      setOpponentSyncBusy(false)
    }
  }
  const [civSession, setCivSession] = useState<CivSessionConfig>(() => {
    const saved = loadCivSession<Partial<CivSessionConfig>>() ?? {}
    return {
      ...DEFAULT_CIV_SESSION,
      civDraftUrl: saved.civDraftUrl ?? '',
      started: saved.started ?? false,
    }
  })
  const [active, setActive] = useState(() => {
    const saved = loadCivSession<Partial<CivSessionConfig>>() ?? {}
    return Boolean(saved.started && saved.civDraftUrl?.trim())
  })
  const [error, setError] = useState<string | null>(null)

  const refreshCivSession = useCallback(() => {
    const saved = loadCivSession<Partial<CivSessionConfig>>() ?? {}
    setCivSession({
      ...DEFAULT_CIV_SESSION,
      civDraftUrl: saved.civDraftUrl ?? '',
      started: saved.started ?? false,
    })
    setActive(Boolean(saved.started && saved.civDraftUrl?.trim()))
  }, [])

  useEffect(() => {
    refreshCivSession()
    const onHydrated = (event: Event) => {
      if (!cloudHydratedIncludesKey(event, DOC_KEYS.CIV_SESSION)) return
      if (hasPendingCloudSave(LOCAL_STORAGE_KEYS.CIV_SESSION)) return
      refreshCivSession()
    }
    window.addEventListener(CLOUD_HYDRATED, onHydrated)
    return () => window.removeEventListener(CLOUD_HYDRATED, onHydrated)
  }, [refreshCivSession])

  const mapDraftUrl =
    mapSession?.mode === 'standard' ? (mapSession?.mapDraftUrl ?? '') : ''

  const civDraftLinkReady = extractDraftId(civSession.civDraftUrl).length >= 4

  const {
    draft: civDraft,
    error: civStreamError,
  } = useDraftStream(civSession.civDraftUrl, active || civDraftLinkReady)

  const {
    draft: mapDraft,
    error: mapStreamError,
  } = useDraftStream(
    mapDraftUrl,
    Boolean(mapSession?.mode === 'standard' && mapDraftUrl && (active || Boolean(mapSession))),
  )

  useEffect(() => {
    setError(civStreamError ?? mapStreamError ?? null)
  }, [civStreamError, mapStreamError])

  useEffect(() => {
    const started = Boolean(active || civSession.started)
    if (!started) return
    const draftId = extractDraftId(civSession.civDraftUrl)
    if (draftId.length < 4) return
    const mapDraftId =
      mapSession?.mode === 'standard' ? extractDraftId(mapSession.mapDraftUrl ?? '') : ''
    trackCivDraftStarted(draftId, mapDraftId.length >= 4 ? mapDraftId : undefined)
  }, [active, civSession.started, civSession.civDraftUrl, mapSession?.mode, mapSession?.mapDraftUrl])

  const ownTeamName = mapSession?.ownTeamName ?? ''
  const civsPerMap = playersPerSide(tournamentFormat)

  const allMapPicks = useMemo(() => {
    if (!mapSession) return []
    const manual = getSessionMapPicks(mapSession)
    if (manual.length) return manual
    if (!mapDraft) return []
    return extractAllMapPicks(mapDraft)
  }, [mapDraft, mapSession])

  const mapPickDisplays = useMemo(() => {
    if (mapSession?.mode === 'single-map' || mapSession?.mode === 'select') {
      return resolveMapDisplaysFromPicks(allMapPicks)
    }
    return resolveMapPickDisplays(mapDraft, allMapPicks)
  }, [mapDraft, allMapPicks, mapSession?.mode])

  const assignmentKeys = useMemo(
    () => mapPickDisplays.map((map) => map.id),
    [mapPickDisplays],
  )

  const presetMapNames = useMemo(() => uniqueMapNames(allMapPicks), [allMapPicks])

  const draftPickIds = useMemo(() => {
    if (!civDraft || !ownTeamName) return { own: [] as string[], opponent: [] as string[] }
    const board = deriveCivBoard(civDraft, ownTeamName, [])
    return {
      own: board.filter((item) => item.status === 'own_pick').map((item) => item.id),
      opponent: board.filter((item) => item.status === 'opponent_pick').map((item) => item.id),
    }
  }, [civDraft, ownTeamName])

  const { assignments, setOwnAssignment, setOpponentAssignment } = useCivMapAssignments(
    civSession.civDraftUrl,
    assignmentKeys,
    draftPickIds.own,
    draftPickIds.opponent,
  )

  const saturatedMaps = useMemo(
    () => getSaturatedMaps(assignmentKeys, draftPickIds.own, assignments.own, civsPerMap),
    [assignmentKeys, assignments.own, civsPerMap, draftPickIds.own],
  )

  const saturatedPresetMaps = useMemo(() => {
    const saturatedKeys = new Set(saturatedMaps)
    return uniqueMapNames(allMapPicks).filter((mapName) => {
      const instances = mapPickDisplays.filter((entry) => mapNamesMatch(entry.name, mapName))
      return (
        instances.length > 0 && instances.every((entry) => saturatedKeys.has(entry.id))
      )
    })
  }, [allMapPicks, mapPickDisplays, saturatedMaps])

  const priorityMerge = useMemo(() => {
    return mergePriorityEntriesForMaps(presets, presetMapNames, settings, saturatedPresetMaps)
  }, [presets, presetMapNames, settings, saturatedPresetMaps])

  const civItems = useMemo(() => {
    if (!civDraft || !ownTeamName) return []
    return deriveCivBoard(civDraft, ownTeamName, priorityMerge.entries)
  }, [civDraft, ownTeamName, priorityMerge.entries])

  const topPicksPerMap = useMemo(
    () =>
      getTopPicksPerMap(
        presets,
        mapPickDisplays,
        civItems,
        saturatedMaps,
        3,
        civItems.filter((item) => item.status === 'own_pick'),
        assignments.own,
        assignmentKeys,
      ),
    [presets, mapPickDisplays, civItems, saturatedMaps, assignments.own, assignmentKeys],
  )

  const civDraftStatus = useMemo(
    () => deriveDraftStatus(civDraft, civStreamError),
    [civDraft, civStreamError],
  )

  const ownBanSlots = useMemo(() => {
    if (!civDraft || !ownTeamName) return 0
    return countOwnBanSlots(civDraft, ownTeamName)
  }, [civDraft, ownTeamName])

  const preparedBanCapacity = ownBanSlots > 0 ? ownBanSlots * 2 : 0
  const showPreparedBans =
    civDraftLinkReady &&
    Boolean(mapSession) &&
    ownBanSlots > 0 &&
    !isBanPhaseComplete(civDraft)

  /**
   * Pre-Go: Prepared bans → Preview → Opponent analysis (OA no longer sits under the link).
   * After Go: Preview + OA collapse to the bottom (below Opponent Prediction).
   */
  const showPreGoOpponentAnalysis = showOpponentAnalysis && !active
  const showCollapsedPostGoExtras = active

  const prepPriorityMerge = useMemo(
    () => mergePriorityEntriesForMaps(presets, presetMapNames, settings),
    [presets, presetMapNames, settings],
  )

  const nemesisCivIds = useMemo(
    () => collectNemesisCivIds(presets, presetMapNames),
    [presets, presetMapNames],
  )

  const {
    preparedBanIds,
    preparedBansLocked,
    addPreparedBan,
    removePreparedBan,
    lockPreparedBans,
    unlockPreparedBans,
  } = usePreparedBans(civSession.civDraftUrl, preparedBanCapacity)

  const updateCivSession = (next: CivSessionConfig) => {
    setCivSession(next)
    if (!isWorkspaceHydrating()) {
      saveCivSession(next)
    }
  }

  const startSession = () => {
    const context = readReadyMapSession()
    if (!context) {
      setError('Configure map draft first (Map Draft tab).')
      return
    }

    setError(null)
    const nextSession = { ...civSession, started: true }
    setCivSession(nextSession)
    if (!isWorkspaceHydrating()) {
      saveCivSession(nextSession)
    }
    setActive(true)
    const mapDraftId =
      mapSession?.mode === 'standard' ? extractDraftId(mapSession.mapDraftUrl ?? '') : ''
    trackCivDraftStarted(
      extractDraftId(civSession.civDraftUrl),
      mapDraftId.length >= 4 ? mapDraftId : undefined,
    )
  }

  const opponentPanel = (collapsed: boolean) =>
    showOpponentAnalysis ? (
      <OpponentAnalysisPanel
        variant="civ"
        analysis={mapSession?.opponentTeamName?.trim() ? opponentAnalysis : null}
        busy={mapSession?.opponentTeamName?.trim() ? opponentBusy : false}
        error={mapSession?.opponentTeamName?.trim() ? opponentError : null}
        syncBusy={opponentSyncBusy}
        onRefreshSync={
          mapSession?.opponentTeamName?.trim()
            ? () => void refreshOpponentTournamentData()
            : undefined
        }
        emptyHint={
          mapSession?.opponentTeamName?.trim()
            ? null
            : 'Select an opponent under Pregame to see civ ban/pick tendencies and tournament sets here.'
        }
        currentMapNames={presetMapNames}
        collapsed={collapsed}
        defaultOpen={false}
      />
    ) : null

  return (
    <main className={`layout assistant-layout${active ? ' assistant-layout-civ-active' : ''}`}>
      <CivDraftSetup
        value={civSession}
        mapSession={mapSession}
        presetTournamentName={presetTournamentName}
        onChange={updateCivSession}
        onGo={startSession}
        error={error}
      />

      {showPreparedBans ? (
        <PreparedBanList
          preparedBanIds={preparedBanIds}
          maxSlots={preparedBanCapacity}
          ownBanSlots={ownBanSlots}
          locked={preparedBansLocked}
          nemesisCivIds={nemesisCivIds}
          priorityEntries={prepPriorityMerge.entries}
          onAdd={addPreparedBan}
          onRemove={removePreparedBan}
          onLock={lockPreparedBans}
          onUnlock={unlockPreparedBans}
        />
      ) : null}

      {!active ? (
        <DraftPreview
          presets={presets}
          mapNames={allMapPicks}
          presetTournamentName={presetTournamentName}
          tournamentFormat={tournamentFormat}
          compact
        />
      ) : null}

      {showPreGoOpponentAnalysis ? opponentPanel(false) : null}

      {active ? (
        <CivDraftBoard
          items={civItems}
          topPicksPerMap={topPicksPerMap}
          mapPicks={mapPickDisplays}
          mapNames={assignmentKeys}
          civsPerMap={civsPerMap}
          unmatchedMaps={priorityMerge.unmatchedMaps}
          draftStatus={civDraftStatus}
          presets={presets}
          assignments={assignments}
          saturatedMaps={saturatedMaps}
          onAssignOwn={setOwnAssignment}
          onAssignOpponent={setOpponentAssignment}
        />
      ) : null}

      {showCollapsedPostGoExtras ? (
        <div className="civ-draft-postgo-extras">
          <details className="panel draft-preview-collapsed">
            <summary>Civ Draft Preview</summary>
            <div className="draft-preview-collapsed-body">
              <DraftPreview
                presets={presets}
                mapNames={allMapPicks}
                presetTournamentName={presetTournamentName}
                tournamentFormat={tournamentFormat}
                compact
              />
            </div>
          </details>
          {opponentPanel(true)}
        </div>
      ) : null}
    </main>
  )
}
