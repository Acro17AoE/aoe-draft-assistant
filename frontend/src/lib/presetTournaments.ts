import { getDefaultMapPresets } from './defaultPresets'
import {
  getStorageScope,
  LOCAL_STORAGE_KEYS,
  readLocalKey,
  writeLocalKey,
  type PresetImportOptions,
} from './cloudStorage'
import { DEFAULT_MAPS, mapNamesMatch, presetIdForMap } from './maps'
import { deletePresetForMap, loadCustomMaps, loadPresets, removeCustomMap } from './presets'
import { createId } from './results'
import type { PresetTournament, PresetTournamentStore } from '../types/presetTournament'
import type { MapPriorityPreset } from '../types/draft'
import type { TournamentFormat } from '../types/results'

export const PRESET_STORE_CHANGED = 'aoe-preset-store-changed'

export function getPresetStoreKey(): string {
  return getStorageScope() === 'workspace'
    ? LOCAL_STORAGE_KEYS.SHARED_PRESET_TOURNAMENTS
    : LOCAL_STORAGE_KEYS.PRESET_TOURNAMENTS
}

export function loadPersonalPresetStore(): PresetTournamentStore {
  const raw = readLocalKey(LOCAL_STORAGE_KEYS.PRESET_TOURNAMENTS)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PresetTournamentStore
      if (parsed.version === 2 && Array.isArray(parsed.tournaments)) {
        return parsed
      }
    } catch {
      // fall through
    }
  }
  return migrateLegacyPresetStore()
}

export function loadPresetStore(): PresetTournamentStore {
  const raw = readLocalKey(getPresetStoreKey())
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PresetTournamentStore
      if (parsed.version === 2 && Array.isArray(parsed.tournaments)) {
        return parsed
      }
    } catch {
      // fall through
    }
  }

  if (getPresetStoreKey() === LOCAL_STORAGE_KEYS.SHARED_PRESET_TOURNAMENTS) {
    const tournament = createPresetTournament('Shared', '1v1')
    return {
      version: 2,
      activeTournamentId: tournament.id,
      tournaments: [tournament],
    }
  }

  return migrateLegacyPresetStore()
}

export function savePresetStore(store: PresetTournamentStore): void {
  writeLocalKey(getPresetStoreKey(), JSON.stringify(store))
  window.dispatchEvent(new CustomEvent(PRESET_STORE_CHANGED))
}

export function buildSharedPresetStoreFromImport(
  personal: PresetTournamentStore,
  options: PresetImportOptions,
): PresetTournamentStore {
  if (options.mode === 'none') {
    const tournament = createPresetTournament('Shared', '1v1')
    return {
      version: 2,
      activeTournamentId: tournament.id,
      tournaments: [tournament],
    }
  }

  const selected =
    options.mode === 'all'
      ? personal.tournaments
      : personal.tournaments.filter((t) => options.tournamentIds?.includes(t.id))

  if (!selected.length) {
    const tournament = createPresetTournament('Shared', '1v1')
    return {
      version: 2,
      activeTournamentId: tournament.id,
      tournaments: [tournament],
    }
  }

  const tournaments = selected.map((source) => {
    const id = createId()
    return {
      ...source,
      id,
      presets: source.presets.map((preset) => ({
        ...preset,
        id: `${id}-${presetIdForMap(preset.mapName)}`,
        entries: preset.entries.map((entry) => ({ ...entry })),
      })),
      customMaps: [...source.customMaps],
      createdAt: new Date().toISOString(),
    }
  })

  return {
    version: 2,
    activeTournamentId: tournaments[0].id,
    tournaments,
  }
}

export function migrateLegacyPresetStore(): PresetTournamentStore {
  const legacyPresets = loadPresets()
  const customMaps = loadCustomMaps()
  const presets = legacyPresets.length > 0 ? legacyPresets : getDefaultMapPresets()
  const tournament = createPresetTournament('Default', '1v1', presets, customMaps)
  const store = {
    version: 2 as const,
    activeTournamentId: tournament.id,
    tournaments: [tournament],
  }
  savePresetStore(store)
  return store
}

function createArabiaPlaceholder(tournamentId: string): MapPriorityPreset {
  return createMapPlaceholder(tournamentId, 'Arabia')
}

export function createMapPlaceholder(tournamentId: string, mapName: string): MapPriorityPreset {
  const trimmed = mapName.trim() || 'Arabia'
  return {
    id: `${tournamentId}-${presetIdForMap(trimmed)}`,
    name: trimmed,
    mapName: trimmed,
    entries: [],
    updatedAt: new Date().toISOString(),
  }
}

export function createPresetsFromMapNames(
  tournamentId: string,
  mapNames: string[],
): MapPriorityPreset[] {
  const seen = new Set<string>()
  const presets: MapPriorityPreset[] = []
  for (const mapName of mapNames) {
    const trimmed = mapName.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    presets.push(createMapPlaceholder(tournamentId, trimmed))
  }
  return presets
}

export function customMapsFromMapNames(mapNames: string[]): string[] {
  return mapNames.filter(
    (mapName) =>
      mapName.trim() &&
      !DEFAULT_MAPS.some((item) => mapNamesMatch(item, mapName)),
  )
}

export function createPresetTournament(
  name: string,
  format: TournamentFormat,
  presets: MapPriorityPreset[] = [],
  customMaps: string[] = [],
  resultsId?: string,
): PresetTournament {
  const id = createId()
  const initialPresets = presets.length > 0 ? presets : [createArabiaPlaceholder(id)]
  return {
    id,
    name: name.trim() || 'Untitled tournament',
    format,
    resultsId,
    presets: initialPresets.map((preset) => ({
      ...preset,
      id: preset.id.startsWith(`${id}-`) ? preset.id : `${id}-${presetIdForMap(preset.mapName)}`,
    })),
    customMaps,
    createdAt: new Date().toISOString(),
  }
}

export function getActivePresetTournament(store: PresetTournamentStore): PresetTournament | null {
  if (!store.tournaments.length) return null
  const active = store.tournaments.find((t) => t.id === store.activeTournamentId)
  return active ?? store.tournaments[0]
}

export function updatePresetTournament(
  store: PresetTournamentStore,
  tournamentId: string,
  updater: (tournament: PresetTournament) => PresetTournament,
): PresetTournamentStore {
  return {
    ...store,
    tournaments: store.tournaments.map((tournament) =>
      tournament.id === tournamentId ? updater(tournament) : tournament,
    ),
  }
}

function clonePreset(preset: MapPriorityPreset, tournamentId: string): MapPriorityPreset {
  return {
    ...preset,
    id: `${tournamentId}-${presetIdForMap(preset.mapName)}`,
    entries: preset.entries.map((entry) => ({ ...entry })),
    pools: preset.pools?.map((pool) => ({ ...pool })),
    updatedAt: new Date().toISOString(),
  }
}

export function copyMapPresetsBetweenTournaments(
  store: PresetTournamentStore,
  targetId: string,
  sourceId: string,
  mapNames?: string[],
): PresetTournamentStore {
  if (targetId === sourceId) return store

  const source = store.tournaments.find((t) => t.id === sourceId)
  if (!source) return store

  const presetsToCopy = mapNames?.length
    ? source.presets.filter((preset) =>
        mapNames.some((mapName) => mapNamesMatch(mapName, preset.mapName)),
      )
    : source.presets

  if (!presetsToCopy.length) return store

  return updatePresetTournament(store, targetId, (target) => {
    const nextPresets = [...target.presets]
    const nextCustomMaps = [...target.customMaps]

    for (const imported of presetsToCopy) {
      const index = nextPresets.findIndex((preset) => mapNamesMatch(preset.mapName, imported.mapName))
      const cloned = clonePreset(imported, target.id)
      if (index >= 0) {
        nextPresets[index] = cloned
      } else {
        nextPresets.push(cloned)
      }

      if (
        !DEFAULT_MAPS.some((item) => mapNamesMatch(item, imported.mapName)) &&
        !nextCustomMaps.some((item) => mapNamesMatch(item, imported.mapName))
      ) {
        nextCustomMaps.push(imported.mapName)
      }
    }

    return {
      ...target,
      presets: nextPresets,
      customMaps: nextCustomMaps,
    }
  })
}

/** Copy civ priorities from sourceMap onto targetMap (usually the currently selected map). */
export function copyMapPresetWithinTournament(
  store: PresetTournamentStore,
  tournamentId: string,
  sourceMapName: string,
  targetMapName: string,
): PresetTournamentStore {
  if (mapNamesMatch(sourceMapName, targetMapName)) return store

  const tournament = store.tournaments.find((t) => t.id === tournamentId)
  if (!tournament) return store

  const source = tournament.presets.find((preset) => mapNamesMatch(preset.mapName, sourceMapName))
  if (!source) return store

  return updatePresetTournament(store, tournamentId, (target) => {
    const nextPresets = [...target.presets]
    const nextCustomMaps = [...target.customMaps]
    const mapName = targetMapName
    const index = nextPresets.findIndex((preset) => mapNamesMatch(preset.mapName, mapName))
    const cloned = {
      ...clonePreset(source, target.id),
      id: `${target.id}-${presetIdForMap(mapName)}`,
      name: mapName,
      mapName,
    }
    if (index >= 0) {
      nextPresets[index] = cloned
    } else {
      nextPresets.push(cloned)
    }

    if (
      !DEFAULT_MAPS.some((item) => mapNamesMatch(item, mapName)) &&
      !nextCustomMaps.some((item) => mapNamesMatch(item, mapName))
    ) {
      nextCustomMaps.push(mapName)
    }

    return { ...target, presets: nextPresets, customMaps: nextCustomMaps }
  })
}

export function removeMapFromTournament(
  store: PresetTournamentStore,
  tournamentId: string,
  mapName: string,
): PresetTournamentStore {
  return updatePresetTournament(store, tournamentId, (tournament) => {
    const mapsInTournament = new Set(
      [...tournament.customMaps, ...tournament.presets.map((p) => p.mapName)].map((m) =>
        m.toLowerCase(),
      ),
    )
    if (mapsInTournament.size <= 1) return tournament

    return {
      ...tournament,
      presets: deletePresetForMap(tournament.presets, mapName),
      customMaps: removeCustomMap(tournament.customMaps, mapName),
    }
  })
}

/** @deprecated Use copyMapPresetsBetweenTournaments without mapNames to copy all. */
export function copyPresetsBetweenTournaments(
  store: PresetTournamentStore,
  targetId: string,
  sourceId: string,
): PresetTournamentStore {
  return copyMapPresetsBetweenTournaments(store, targetId, sourceId)
}

export function deletePresetTournament(
  store: PresetTournamentStore,
  tournamentId: string,
): PresetTournamentStore {
  const tournaments = store.tournaments.filter((t) => t.id !== tournamentId)
  const activeTournamentId =
    store.activeTournamentId === tournamentId
      ? (tournaments[0]?.id ?? null)
      : store.activeTournamentId

  return { ...store, tournaments, activeTournamentId }
}
