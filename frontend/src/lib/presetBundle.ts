import type { MapPriorityPreset, PresetBundle } from '../types/draft'
import { DEFAULT_MAPS, mapNamesMatch, normalizeMapName } from './maps'
import { normalizeTierEntries } from './tiers'

const BUNDLE_VERSION = 1 as const

export function createPresetBundle(
  presets: MapPriorityPreset[],
  customMaps: string[],
): PresetBundle {
  return {
    version: BUNDLE_VERSION,
    maps: collectKnownMaps(customMaps, presets),
    presets,
  }
}

export function collectKnownMaps(customMaps: string[], presets: MapPriorityPreset[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  const add = (name: string) => {
    const key = normalizeMapName(name)
    if (!key || seen.has(key)) return
    seen.add(key)
    result.push(name.trim())
  }

  for (const map of DEFAULT_MAPS) add(map)
  for (const map of customMaps) add(map)
  for (const preset of presets) add(preset.mapName)

  return result.sort((a, b) => a.localeCompare(b))
}

export function downloadPresetBundle(bundle: PresetBundle, filename = 'aoe-civ-presets.json'): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function parsePresetBundle(raw: unknown): PresetBundle {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid preset file.')
  }

  const data = raw as Partial<PresetBundle>
  if (!Array.isArray(data.presets)) {
    throw new Error('Preset file contains no presets.')
  }

  const presets = data.presets.map(normalizeImportedPreset)
  const maps = Array.isArray(data.maps)
    ? data.maps.filter((item): item is string => typeof item === 'string')
    : collectKnownMaps([], presets)

  return {
    version: BUNDLE_VERSION,
    maps: collectKnownMaps(maps, presets),
    presets,
  }
}

function normalizeImportedPreset(raw: unknown): MapPriorityPreset {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid preset entry in file.')
  }

  const item = raw as Partial<MapPriorityPreset> & {
    rankingMode?: string
    entries?: unknown[]
  }
  const mapName = (item.mapName ?? item.name ?? '').trim()
  if (!mapName) {
    throw new Error('Found a preset without a map name.')
  }

  const entries = Array.isArray(item.entries)
    ? normalizeTierEntries(
        item.entries.filter(
          (entry): entry is MapPriorityPreset['entries'][number] =>
            Boolean(
              entry &&
                typeof entry === 'object' &&
                typeof (entry as MapPriorityPreset['entries'][number]).civId === 'string',
            ),
        ),
      )
    : []

  return {
    id: item.id?.trim() || `import-${normalizeMapName(mapName).replace(/\s+/g, '-')}`,
    name: (item.name ?? mapName).trim() || mapName,
    mapName,
    entries,
    advancedMode: Boolean(item.advancedMode),
    pools: Array.isArray(item.pools)
      ? item.pools
          .filter(
            (pool): pool is NonNullable<MapPriorityPreset['pools']>[number] =>
              Boolean(pool && typeof pool === 'object' && typeof pool.id === 'string'),
          )
          .map((pool) => ({
            id: pool.id.trim(),
            name: typeof pool.name === 'string' ? pool.name.trim() : pool.id.trim(),
            maxPicks:
              typeof pool.maxPicks === 'number' && pool.maxPicks > 0
                ? Math.floor(pool.maxPicks)
                : undefined,
          }))
          .filter((pool) => pool.id && pool.name)
      : undefined,
    updatedAt: item.updatedAt ?? new Date().toISOString(),
  }
}

export function mergePresetBundles(
  existing: MapPriorityPreset[],
  imported: MapPriorityPreset[],
  overwrite = false,
): MapPriorityPreset[] {
  const next = [...existing]

  for (const preset of imported) {
    const index = next.findIndex((item) => mapNamesMatch(item.mapName, preset.mapName))
    if (index >= 0) {
      if (overwrite) next[index] = preset
      continue
    }
    next.push(preset)
  }

  return next
}

export function mergeImportedBundle(
  existingPresets: MapPriorityPreset[],
  existingCustomMaps: string[],
  bundle: PresetBundle,
): { presets: MapPriorityPreset[]; customMaps: string[] } {
  const presets = mergePresetBundles(existingPresets, bundle.presets, true)
  const customMaps = collectKnownMaps(
    [...existingCustomMaps, ...bundle.maps.filter((map) => !DEFAULT_MAPS.some((d) => mapNamesMatch(d, map)))],
    presets,
  ).filter((map) => !DEFAULT_MAPS.some((d) => mapNamesMatch(d, map)))

  return { presets, customMaps }
}
