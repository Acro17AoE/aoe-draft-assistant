export const DEFAULT_MAPS = [
  'Acropolis',
  'Arabia',
  'Arena',
  'Black Forest',
  'Cape of Storms',
  'Crescent',
  'Enemy Archipelago',
  'Fortified Clearing',
  'Fortress',
  'Frontline',
  'Gold Rush',
  'Grand Bara',
  'Hideout',
  'Islands',
  'Land Nomad',
  'MegaRandom',
  'Menindee',
  'Migration',
  'Nomad',
  'Oasis',
  'Team Acropolis',
  'Team Islands',
  'Tres Leches',
] as const

/** Map pool used by The League (aoe2cm preset EivsT / The League Pa4 maps). */
export const THE_LEAGUE_MAPS = [
  'Arabia',
  'Arena',
  'Black Forest',
  'Cape of Storms',
  'Crescent',
  'Enemy Archipelago',
  'Fortified Clearing',
  'Fortress (Regicide)',
  'Frontline',
  'Grand Bara',
  'Menindee',
  'Migration',
  'Nomad',
  'Team Acropolis',
  'Tres Leches',
] as const

export const THE_LEAGUE_AOE2CM_PRESET_ID = 'EivsT'

/** Filename slug under /maps/emblems/{slug}.png */
export function mapEmblemSlug(mapName: string): string {
  return mapName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[()]/g, '')
}

/**
 * Bundled emblem files in frontend/public/maps/emblems.
 * Keep in sync with scripts/download_map_emblems.py output.
 */
export const LOCAL_MAP_EMBLEM_SLUGS = new Set([
  'acropolis',
  'arabia',
  'arena',
  'black-forest',
  'cape-of-storms',
  'crescent',
  'enemy-archipelago',
  'fortified-clearing',
  'fortress',
  'fortress-regicide',
  'frontline',
  'gold-rush',
  'grand-bara',
  'hideout',
  'islands',
  'land-nomad',
  'megarandom',
  'menindee',
  'migration',
  'nomad',
  'oasis',
  'team-acropolis',
  'team-islands',
  'tres-leches',
])

/** Same-origin placeholder used when no emblem is bundled for a map. */
export const MAP_EMBLEM_PLACEHOLDER_URL = '/units/question.svg'

/** Local bundled emblem URL, or null if not available. */
export function localMapEmblemUrl(mapName: string): string | null {
  const trimmed = mapName.trim()
  if (!trimmed) return null
  const key = normalizeMapName(trimmed)
  const known =
    DEFAULT_MAPS.find((map) => normalizeMapName(map) === key) ??
    THE_LEAGUE_MAPS.find((map) => normalizeMapName(map) === key)
  const slug = mapEmblemSlug(known ?? trimmed)
  if (!LOCAL_MAP_EMBLEM_SLUGS.has(slug)) return null
  return `/maps/emblems/${slug}.png`
}

/**
 * Maps without working aoe2cm.net/images/maps/{slug}.png.
 * Emblem URLs from aoe2cm preset EivsT (The League).
 */
const MAP_EMBLEM_OVERRIDES: Record<string, string> = {
  Frontline: 'https://i.ibb.co/35sFFxSg/TL-Frontline.png',
  Menindee: 'https://i.ibb.co/tT66jhSj/TL-Menindee.png',
  'Fortress (Regicide)': 'https://i.ibb.co/LXv8wBMY/TL-Fortress.png',
  Fortress: 'https://i.ibb.co/LXv8wBMY/TL-Fortress.png',
}

function mapEmblemOverride(mapName: string): string | undefined {
  const trimmed = mapName.trim()
  if (!trimmed) return undefined
  for (const [key, url] of Object.entries(MAP_EMBLEM_OVERRIDES)) {
    if (mapNamesMatch(key, trimmed)) return url
  }
  return undefined
}

interface MapDraftOption {
  id: string
  name: string
  imageUrls?: {
    unit?: string
    emblem?: string
  }
}

export function mapIconUrl(option: MapDraftOption): string | undefined {
  const fromDraft = option.imageUrls?.emblem ?? option.imageUrls?.unit
  if (fromDraft) {
    if (fromDraft.startsWith('http')) return fromDraft
    return `https://aoe2cm.net${fromDraft}`
  }
  const local = localMapEmblemUrl(option.name) ?? localMapEmblemUrl(option.id)
  if (local) return local
  const override = mapEmblemOverride(option.name) ?? mapEmblemOverride(option.id)
  if (override) return override
  const slug = mapEmblemSlug(option.id || option.name)
  return `https://aoe2cm.net/images/maps/${slug}.png`
}

export function normalizeMapName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function mapNamesMatch(a: string, b: string): boolean {
  const left = normalizeMapName(a)
  const right = normalizeMapName(b)
  if (!left || !right) return false
  return left === right
}

const MAP_INSTANCE_SEP = '::'

export function mapSlotId(mapName: string, instanceIndex: number): string {
  return `${mapName.trim()}${MAP_INSTANCE_SEP}${instanceIndex}`
}

export function assignmentTargetMatches(stored: string, slotKey: string): boolean {
  if (stored === slotKey) return true
  if (stored.includes(MAP_INSTANCE_SEP) || slotKey.includes(MAP_INSTANCE_SEP)) return false
  return mapNamesMatch(stored, slotKey)
}

export function resolveMapDisplaysFromPicks(mapNames: string[]): { id: string; name: string; imageUrl?: string }[] {
  const instanceCount = new Map<string, number>()

  return mapNames.map((rawName) => {
    const trimmed = rawName.trim()
    const norm = normalizeMapName(trimmed)
    const duplicateTotal = mapNames.filter((name) => mapNamesMatch(name, trimmed)).length
    let id = trimmed
    if (duplicateTotal > 1) {
      const next = (instanceCount.get(norm) ?? 0) + 1
      instanceCount.set(norm, next)
      id = mapSlotId(trimmed, next)
    }
    const base = resolveMapDisplay(trimmed)
    return { ...base, id }
  })
}

export function uniqueMapNames(mapNames: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of mapNames) {
    const norm = normalizeMapName(name)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    result.push(name.trim())
  }
  return result
}

export function resolveMapImageUrl(mapName: string): string | null {
  const trimmed = mapName.trim()
  if (!trimmed) return null

  const local = localMapEmblemUrl(trimmed)
  if (local) return local

  const override = mapEmblemOverride(trimmed)
  if (override) return override

  const key = normalizeMapName(trimmed)
  const known =
    DEFAULT_MAPS.find((map) => normalizeMapName(map) === key) ??
    THE_LEAGUE_MAPS.find((map) => normalizeMapName(map) === key)
  if (!known) return null
  const slug = mapEmblemSlug(known)
  return `https://aoe2cm.net/images/maps/${slug}.png`
}

export function resolveMapDisplay(mapName: string): { id: string; name: string; imageUrl?: string } {
  const trimmed = mapName.trim()
  const imageUrl =
    resolveMapImageUrl(trimmed) ??
    mapIconUrl({ id: trimmed.toLowerCase().replace(/\s+/g, '-'), name: trimmed })
  return { id: trimmed, name: trimmed, imageUrl }
}

export function presetIdForMap(mapName: string): string {
  const slug = normalizeMapName(mapName).replace(/\s+/g, '-')
  return `map-${slug || 'unknown'}`
}
