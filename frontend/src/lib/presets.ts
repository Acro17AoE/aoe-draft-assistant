import type { MapPriorityPreset } from '../types/draft'
import { getDefaultMapPresets } from './defaultPresets'
import { readLocalKey, writeLocalKey } from './cloudStorage'
import { collectKnownMaps } from './presetBundle'
import { mapNamesMatch, presetIdForMap } from './maps'

const PRESETS_KEY = 'aoe-draft-assistant.presets'
const CUSTOM_MAPS_KEY = 'aoe-draft-assistant.custom-maps'
const MAP_SESSION_KEY = 'aoe-draft-assistant.map-session'
const CIV_SESSION_KEY = 'aoe-draft-assistant.civ-session'
const LEGACY_SESSION_KEY = 'aoe-draft-assistant.session'

export function loadPresets(): MapPriorityPreset[] {
  const raw = readLocalKey(PRESETS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as MapPriorityPreset[]
  } catch {
    return []
  }
}

export function initializePresets(): MapPriorityPreset[] {
  const saved = loadPresets()
  if (saved.length > 0) return saved
  const defaults = getDefaultMapPresets()
  savePresets(defaults)
  return defaults
}

export function savePresets(presets: MapPriorityPreset[]): void {
  writeLocalKey(PRESETS_KEY, JSON.stringify(presets))
}

export function loadCustomMaps(): string[] {
  const raw = readLocalKey(CUSTOM_MAPS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function saveCustomMaps(maps: string[]): void {
  writeLocalKey(CUSTOM_MAPS_KEY, JSON.stringify(maps))
}

export function getKnownMaps(customMaps: string[], presets: MapPriorityPreset[]): string[] {
  return collectKnownMaps(customMaps, presets)
}

/** Maps explicitly part of a tournament (not the full default pool). */
export function getTournamentMaps(customMaps: string[], presets: MapPriorityPreset[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  const add = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(trimmed)
  }

  for (const map of customMaps) add(map)
  for (const preset of presets) add(preset.mapName)
  if (!result.length) add('Arabia')
  return result.sort((a, b) => a.localeCompare(b))
}

export function removeCustomMap(customMaps: string[], mapName: string): string[] {
  return customMaps.filter((item) => !mapNamesMatch(item, mapName))
}

export function findPresetForMap(
  presets: MapPriorityPreset[],
  mapName: string,
): MapPriorityPreset | null {
  return presets.find((preset) => mapNamesMatch(preset.mapName, mapName)) ?? null
}

export function upsertPresetForMap(
  presets: MapPriorityPreset[],
  mapName: string,
  data: {
    entries: MapPriorityPreset['entries']
    advancedMode?: boolean
    pools?: MapPriorityPreset['pools']
  },
): MapPriorityPreset[] {
  const trimmedMap = mapName.trim()
  const existing = findPresetForMap(presets, trimmedMap)
  const preset: MapPriorityPreset = {
    id: existing?.id ?? presetIdForMap(trimmedMap),
    name: trimmedMap,
    mapName: trimmedMap,
    entries: data.entries,
    advancedMode: data.advancedMode ?? existing?.advancedMode ?? false,
    pools: data.pools ?? existing?.pools,
    updatedAt: new Date().toISOString(),
  }

  if (existing) {
    return presets.map((item) => (item.id === existing.id ? preset : item))
  }

  return [...presets, preset]
}

export function deletePresetForMap(presets: MapPriorityPreset[], mapName: string): MapPriorityPreset[] {
  return presets.filter((preset) => !mapNamesMatch(preset.mapName, mapName))
}

export function addCustomMap(customMaps: string[], mapName: string): string[] {
  const trimmed = mapName.trim()
  if (!trimmed) return customMaps
  if (customMaps.some((item) => mapNamesMatch(item, trimmed))) return customMaps
  return [...customMaps, trimmed]
}

export function loadStored<T>(key: string): T | null {
  const raw = readLocalKey(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function saveStored<T>(key: string, value: T): void {
  writeLocalKey(key, JSON.stringify(value))
}

export function loadMapSession<T>(): T | null {
  return loadStored<T>(MAP_SESSION_KEY) ?? loadStored<T>(LEGACY_SESSION_KEY)
}

export function saveMapSession<T>(session: T): void {
  saveStored(MAP_SESSION_KEY, session)
  window.dispatchEvent(new CustomEvent('aoe-map-session-changed'))
}

export function loadCivSession<T>(): T | null {
  const civ = loadStored<T>(CIV_SESSION_KEY)
  if (civ) return civ
  const legacy = loadStored<Record<string, string>>(LEGACY_SESSION_KEY)
  if (!legacy) return null
  return {
    civDraftUrl: legacy.civDraftUrl ?? '',
    mapDraftUrl: legacy.mapDraftUrl ?? '',
    ownTeamName: legacy.ownTeamName ?? '',
  } as T
}

export function saveCivSession<T>(session: T): void {
  saveStored(CIV_SESSION_KEY, session)
}
