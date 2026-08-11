import { DEFAULT_MAPS, normalizeMapName, THE_LEAGUE_MAPS } from './maps'
import type { Aoe2cmPreset } from '../types/mapDraftPreset'

/** Dedupe map names; keep aoe2cm labels as-is (exact known match only). */
export function normalizeMaps(maps: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const map of maps) {
    const trimmed = map.trim()
    if (!trimmed) continue
    const key = normalizeMapName(trimmed)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const exact =
      DEFAULT_MAPS.find((item) => normalizeMapName(item) === key) ??
      THE_LEAGUE_MAPS.find((item) => normalizeMapName(item) === key)
    result.push(exact ?? trimmed)
  }
  return result
}

export function extractPresetId(urlOrId: string): string {
  const match = urlOrId.trim().match(/\/preset\/([^/?#]+)/i)
  return match ? match[1] : urlOrId.trim()
}

export function mapsFromAoe2cmPreset(preset: Aoe2cmPreset): string[] {
  const options = preset.draftOptions ?? []
  return normalizeMaps(
    options.map((option) => (option.name?.trim() || option.id?.trim() || '')).filter(Boolean),
  )
}
