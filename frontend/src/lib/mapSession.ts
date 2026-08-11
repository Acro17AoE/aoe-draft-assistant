import { useCallback, useEffect, useState } from 'react'
import { extractDraftId } from './civs'
import { loadMapSession } from './presets'
import { maxGamesForSetFormat } from './results'
import { CLOUD_HYDRATED, cloudHydratedIncludesKey, DOC_KEYS } from './cloudStorage'
import type { MapSessionConfig } from '../types/draft'

export const MAP_SESSION_CHANGED = 'aoe-map-session-changed'

function filledSelectMaps(session: MapSessionConfig): string[] {
  const format = session.selectFormat
  if (!format) return []
  const count = maxGamesForSetFormat(format)
  const maps = session.selectedMaps ?? []
  return maps.slice(0, count).map((map) => map.trim()).filter(Boolean)
}

export function isMapSessionReady(session: MapSessionConfig): boolean {
  if (!session.ownTeamName.trim()) return false
  const mode = session.mode ?? 'standard'
  if (mode === 'single-map') {
    return Boolean(session.singleMap?.trim() && session.singleMapFormat)
  }
  if (mode === 'select') {
    const format = session.selectFormat
    if (!format) return false
    return filledSelectMaps(session).length >= maxGamesForSetFormat(format)
  }
  return extractDraftId(session.mapDraftUrl).length >= 4
}

export function getSessionMapPicks(session: MapSessionConfig): string[] {
  const mode = session.mode ?? 'standard'
  if (mode === 'single-map' && session.singleMap?.trim()) {
    const mapName = session.singleMap.trim()
    const format = session.singleMapFormat
    const count = format ? maxGamesForSetFormat(format) : 1
    return Array.from({ length: count }, () => mapName)
  }
  if (mode === 'select') {
    return filledSelectMaps(session)
  }
  return []
}

export function readReadyMapSession(): MapSessionConfig | null {
  const saved = loadMapSession<MapSessionConfig>()
  if (!saved || !isMapSessionReady(saved)) return null
  return saved
}

export function useMapSessionSync(visible = true): MapSessionConfig | null {
  const [mapSession, setMapSession] = useState<MapSessionConfig | null>(() => readReadyMapSession())

  const refresh = useCallback(() => {
    setMapSession(readReadyMapSession())
  }, [])

  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    const onHydrated = (event: Event) => {
      if (!cloudHydratedIncludesKey(event, DOC_KEYS.MAP_SESSION)) return
      refresh()
    }
    window.addEventListener(MAP_SESSION_CHANGED, onChange)
    window.addEventListener(CLOUD_HYDRATED, onHydrated)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(MAP_SESSION_CHANGED, onChange)
      window.removeEventListener(CLOUD_HYDRATED, onHydrated)
      window.removeEventListener('storage', onChange)
    }
  }, [refresh])

  useEffect(() => {
    if (visible) refresh()
  }, [visible, refresh])

  return mapSession
}
