import { mapNamesMatch } from './maps'
import { maxGamesForSetFormat } from './results'
import type { MapSessionConfig } from '../types/draft'

export function buildPresetMapPool(presetMaps: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const map of presetMaps) {
    const trimmed = map.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result.sort((a, b) => a.localeCompare(b))
}

export function mapInPresetPool(mapName: string, pool: string[]): boolean {
  const trimmed = mapName.trim()
  if (!trimmed) return false
  return pool.some((entry) => mapNamesMatch(entry, trimmed))
}

export function freshSelectedMaps(count: number, pool: string[]): string[] {
  if (!pool.length) return Array.from({ length: count }, () => '')
  return Array.from({ length: count }, (_, index) => pool[index % pool.length] ?? pool[0] ?? '')
}

export function resizeSelectedMaps(
  maps: string[] | undefined,
  count: number,
  pool: string[],
): string[] {
  const clamped = (maps ?? [])
    .slice(0, count)
    .map((map) => {
      const trimmed = map.trim()
      if (!trimmed) return ''
      return mapInPresetPool(trimmed, pool) ? trimmed : ''
    })

  while (clamped.length < count) {
    clamped.push('')
  }

  return clamped.slice(0, count).map((map, index) => {
    if (map) return map
    return pool[index % pool.length] ?? pool[0] ?? ''
  })
}

export function sanitizeMapSessionForPresetPool(
  session: MapSessionConfig,
  presetMaps: string[],
): MapSessionConfig {
  const pool = buildPresetMapPool(presetMaps)
  const next: MapSessionConfig = { ...session }

  if (next.mode === 'single-map') {
    const singleMap = next.singleMap?.trim() ?? ''
    if (!singleMap || !mapInPresetPool(singleMap, pool)) {
      next.singleMap = pool[0] ?? ''
    }
    return next
  }

  if (next.mode === 'select' && next.selectFormat) {
    const count = maxGamesForSetFormat(next.selectFormat)
    next.selectedMaps = resizeSelectedMaps(next.selectedMaps, count, pool)
  }

  return next
}

export function resetMapSessionMapsForPreset(
  session: MapSessionConfig,
  presetMaps: string[],
): MapSessionConfig {
  const pool = buildPresetMapPool(presetMaps)
  const next: MapSessionConfig = { ...session }

  if (next.mode === 'single-map') {
    next.singleMap = pool[0] ?? ''
    return next
  }

  if (next.mode === 'select' && next.selectFormat) {
    const count = maxGamesForSetFormat(next.selectFormat)
    next.selectedMaps = freshSelectedMaps(count, pool)
  }

  return next
}
