import { civIconUrl } from './civs'
import { mapNamesMatch, resolveMapDisplaysFromPicks, uniqueMapNames } from './maps'
import {
  compareCivBoardItems,
  getTopPicksPerMap,
  mergePriorityEntriesForMaps,
  type MapTopPickGroup,
} from './priorities'
import type { CivBoardItem, MapPickDisplay, MapPriorityPreset, PriorityReasonPart } from '../types/draft'
import type { CivDraftSettings } from '../types/settings'

export interface PortfolioCiv {
  id: string
  name: string
  imageUrl: string
  tier?: string
  reasonParts?: PriorityReasonPart[]
  /** Maps where this civ is especially strong (specialist). */
  specialistMaps?: string[]
}

export interface DraftPreviewModel {
  mapDisplays: MapPickDisplay[]
  uniqueMaps: string[]
  matchedMaps: string[]
  unmatchedMaps: string[]
  topPicksPerMap: MapTopPickGroup[]
  strongAcrossSet: PortfolioCiv[]
  mapSpecialists: PortfolioCiv[]
  advancedMapCount: number
}

function toBoardItem(entry: {
  civId: string
  tier?: string
  tierRank?: number
  poolOrder?: number
  reasonParts?: PriorityReasonPart[]
  reason?: string
}): CivBoardItem {
  return {
    id: entry.civId,
    name: entry.civId,
    imageUrl: civIconUrl(entry.civId),
    status: 'available',
    priorityTier: entry.tier as CivBoardItem['priorityTier'],
    priorityTierRank: entry.tierRank,
    priorityPoolOrder: entry.poolOrder,
    priorityReasonParts: entry.reasonParts,
    priorityReason: entry.reason,
  }
}

function portfolioFromItems(items: CivBoardItem[], mapCount: number): {
  strongAcrossSet: PortfolioCiv[]
  mapSpecialists: PortfolioCiv[]
} {
  const ranked = [...items].sort(compareCivBoardItems)

  const toPortfolio = (item: CivBoardItem, specialistMaps?: string[]): PortfolioCiv => ({
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl,
    tier: item.priorityTier,
    reasonParts: item.priorityReasonParts,
    specialistMaps,
  })

  // Single map: take the best ranked civs (S → A → …). Do not route S/A into
  // mapSpecialists — that list is cleared for 1-map previews and left only B/C.
  if (mapCount <= 1) {
    const strongAcrossSet: PortfolioCiv[] = []
    for (const item of ranked) {
      if (!item.priorityTier || !item.priorityReasonParts?.length) continue
      strongAcrossSet.push(toPortfolio(item))
      if (strongAcrossSet.length >= 8) break
    }
    return { strongAcrossSet, mapSpecialists: [] }
  }

  const strongAcrossSet: PortfolioCiv[] = []
  const mapSpecialists: PortfolioCiv[] = []

  for (const item of ranked) {
    const parts = item.priorityReasonParts ?? []
    if (!parts.length || !item.priorityTier) continue

    const strongMaps = parts.filter((part) => part.tier === 'S' || part.tier === 'A')
    const isMulti =
      strongMaps.length >= 2 && new Set(strongMaps.map((p) => p.mapName)).size >= 2

    if (isMulti) {
      if (strongAcrossSet.length < 8) strongAcrossSet.push(toPortfolio(item))
    } else if (strongMaps.length === 1 && strongMaps[0].tier === 'S') {
      if (mapSpecialists.length < 8) {
        mapSpecialists.push(toPortfolio(item, [strongMaps[0].mapName]))
      }
    }

    if (strongAcrossSet.length >= 8 && mapSpecialists.length >= 8) break
  }

  return { strongAcrossSet, mapSpecialists }
}

/** Build a read-only civ draft preview from locked maps + active presets (pre-ban). */
export function buildDraftPreviewModel(
  presets: MapPriorityPreset[],
  mapNames: string[],
  settings: CivDraftSettings,
): DraftPreviewModel | null {
  const cleaned = mapNames.map((name) => name.trim()).filter(Boolean)
  if (!cleaned.length) return null

  const mapDisplays = resolveMapDisplaysFromPicks(cleaned)
  const uniqueMaps = uniqueMapNames(cleaned)
  const merge = mergePriorityEntriesForMaps(presets, uniqueMaps, settings)
  const items = merge.entries.map(toBoardItem)
  // 1-map-only repeats the same map for BoX slots — preview one column, not N copies.
  const previewMapDisplays =
    uniqueMaps.length <= 1 ? mapDisplays.slice(0, 1) : resolveMapDisplaysFromPicks(uniqueMaps)
  const topPicksPerMap = getTopPicksPerMap(presets, previewMapDisplays, items, [])
  const { strongAcrossSet, mapSpecialists } = portfolioFromItems(items, uniqueMaps.length)
  const advancedMapCount = merge.matchedMaps.filter((mapName) => {
    const preset = presets.find((entry) => mapNamesMatch(entry.mapName, mapName))
    return Boolean(preset?.advancedMode && preset.pools?.length)
  }).length

  return {
    mapDisplays: previewMapDisplays,
    uniqueMaps,
    matchedMaps: merge.matchedMaps,
    unmatchedMaps: merge.unmatchedMaps,
    topPicksPerMap,
    strongAcrossSet,
    mapSpecialists: uniqueMaps.length <= 1 ? [] : mapSpecialists,
    advancedMapCount,
  }
}

export function formatExplainReason(parts?: PriorityReasonPart[], fusedTier?: string): string {
  if (!parts?.length) return 'No preset ranking for this civ on the locked maps.'
  const detail = parts.map((part) => `${part.mapName}=${part.tier}`).join(', ')
  if (fusedTier) return `Shown as ${fusedTier} from ${detail}.`
  return detail
}
