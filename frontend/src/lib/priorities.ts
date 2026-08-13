import type {
  CivBoardItem,
  CivPriorityEntry,
  MapPickDisplay,
  MapPriorityPreset,
  PriorityReasonPart,
  PriorityTier,
} from '../types/draft'
import type { CivDraftSettings } from '../types/settings'
import type { MapAssignmentTarget } from './civMapAssignments'
import { picksForMap } from './civMapAssignments'
import { reasonPartsToPlainText } from './priorityReason'
import { mapNamesMatch } from './maps'
import { applyTierOverrideRules } from './tierAggregation'
import { TIER_ORDER, compareTierRank, normalizeTierEntries } from './tiers'
import { entryPoolIds, entryPoolOrder, primaryPoolId } from './pools'

const TIER_SCORE: Record<PriorityTier, number> = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 }

export function comparePriorityTier(a?: PriorityTier, b?: PriorityTier): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return TIER_ORDER[a] - TIER_ORDER[b]
}

export function findPresetForMap(
  presets: MapPriorityPreset[],
  mapName: string,
): MapPriorityPreset | null {
  return presets.find((preset) => mapNamesMatch(preset.mapName, mapName)) ?? null
}

function buildReasonPart(
  preset: MapPriorityPreset,
  entry: CivPriorityEntry,
): PriorityReasonPart | null {
  if (!entry.tier) return null
  return {
    mapName: preset.mapName,
    tier: entry.tier,
    note: entry.reason?.trim() || undefined,
  }
}

interface CivMapScore {
  mapName: string
  tier: PriorityTier
  tierRank?: number
  poolIds?: string[]
  poolId?: string
  poolOrder?: number
  reasonPart: PriorityReasonPart
}

function compareMapScore(a: CivMapScore, b: CivMapScore): number {
  const tierCmp = comparePriorityTier(a.tier, b.tier)
  if (tierCmp !== 0) return tierCmp

  const poolOrderA = a.poolOrder ?? Number.MAX_SAFE_INTEGER
  const poolOrderB = b.poolOrder ?? Number.MAX_SAFE_INTEGER
  if (poolOrderA !== poolOrderB) return poolOrderA - poolOrderB

  return compareTierRank(a.tierRank, b.tierRank)
}

export function civAggregateTierScore(reasonParts?: PriorityReasonPart[]): number {
  if (!reasonParts?.length) return 0
  return reasonParts.reduce((sum, part) => sum + TIER_SCORE[part.tier], 0)
}

export function civAggregatePresetScore(
  presets: MapPriorityPreset[],
  civKeys: { id: string; name?: string },
  mapNames: string[],
): number {
  let total = 0
  for (const mapName of mapNames) {
    const tier = civTierOnPresetMap(findPresetForMap(presets, mapName), civKeys)
    if (tier) total += TIER_SCORE[tier]
  }
  return total
}

export function compareCivBoardItems(
  a: Pick<
    CivBoardItem,
    | 'name'
    | 'priorityTier'
    | 'priorityTierRank'
    | 'priorityPoolOrder'
    | 'priorityReasonParts'
  >,
  b: Pick<
    CivBoardItem,
    | 'name'
    | 'priorityTier'
    | 'priorityTierRank'
    | 'priorityPoolOrder'
    | 'priorityReasonParts'
  >,
): number {
  const tierCmp = comparePriorityTier(a.priorityTier, b.priorityTier)
  if (tierCmp !== 0) return tierCmp

  const poolOrderA = a.priorityPoolOrder ?? Number.MAX_SAFE_INTEGER
  const poolOrderB = b.priorityPoolOrder ?? Number.MAX_SAFE_INTEGER
  if (poolOrderA !== poolOrderB) return poolOrderA - poolOrderB

  const rankCmp = compareTierRank(a.priorityTierRank, b.priorityTierRank)
  if (rankCmp !== 0) return rankCmp

  const scoreDiff =
    civAggregateTierScore(b.priorityReasonParts) - civAggregateTierScore(a.priorityReasonParts)
  if (scoreDiff !== 0) return scoreDiff

  return a.name.localeCompare(b.name)
}

function finalizeBestMapEntry(
  civId: string,
  scores: CivMapScore[],
  settings: CivDraftSettings,
): CivPriorityEntry {
  const sorted = [...scores].sort((a, b) => compareMapScore(a, b))
  const best = sorted[0]
  const reasonParts = sorted.map((score) => score.reasonPart)
  const allTiers = reasonParts.map((part) => part.tier)
  const tier = applyTierOverrideRules(best.tier, allTiers, settings.tierRules)

  return {
    civId,
    tier,
    tierRank: best.tierRank,
    poolIds: best.poolIds,
    poolId: best.poolId,
    poolOrder: best.poolOrder,
    reasonParts,
    reason: reasonPartsToPlainText(reasonParts),
  }
}

export function mergePriorityEntriesForMaps(
  presets: MapPriorityPreset[],
  pickedMaps: string[],
  settings: CivDraftSettings,
  excludedMaps: string[] = [],
): {
  entries: CivPriorityEntry[]
  matchedMaps: string[]
  unmatchedMaps: string[]
} {
  const matchedMaps: string[] = []
  const unmatchedMaps: string[] = []
  const matchedPresets: MapPriorityPreset[] = []

  for (const mapName of pickedMaps) {
    const preset = findPresetForMap(presets, mapName)
    if (!preset) {
      unmatchedMaps.push(mapName)
      continue
    }

    if (excludedMaps.some((excluded) => mapNamesMatch(excluded, mapName))) {
      continue
    }

    matchedMaps.push(mapName)
    matchedPresets.push(preset)
  }

  const byCiv = new Map<string, CivMapScore[]>()

  for (const preset of matchedPresets) {
    const normalized = normalizeTierEntries(preset.entries)
    for (const entry of normalized) {
      const reasonPart = buildReasonPart(preset, entry)
      if (!reasonPart) continue

      const existing = byCiv.get(entry.civId) ?? []
      existing.push({
        mapName: preset.mapName,
        tier: reasonPart.tier,
        tierRank: entry.tierRank,
        poolIds: preset.advancedMode ? entryPoolIds(entry) : undefined,
        poolId: preset.advancedMode ? primaryPoolId(preset.pools, entry) : undefined,
        poolOrder: preset.advancedMode ? entryPoolOrder(preset.pools, entry) : undefined,
        reasonPart,
      })
      byCiv.set(entry.civId, existing)
    }
  }

  const entries = [...byCiv.entries()].map(([civId, scores]) =>
    finalizeBestMapEntry(civId, scores, settings),
  )

  return { entries, matchedMaps, unmatchedMaps }
}

export interface MapTierPressure {
  s: { gone: number; total: number }
  a: { gone: number; total: number }
}

export interface MapPoolPressureEntry {
  id: string
  name: string
  gone: number
  total: number
  ownPicked: number
  maxPicks?: number
}

export interface MapTopPickGroup {
  mapId: string
  mapName: string
  imageUrl?: string
  picks: CivBoardItem[]
  keyCivs: CivBoardItem[]
  tierPressure: MapTierPressure
  poolPressure: MapPoolPressureEntry[]
  advancedMode: boolean
}

export interface MapPoolPressureContext {
  mapId?: string
  ownPicks?: CivBoardItem[]
  assignments?: Record<string, MapAssignmentTarget>
  mapNames?: string[]
  /** draft-wide counts (1-map) vs per-map assignment counts (multi-map). */
  mode?: 'draft-wide' | 'map-assigned'
}

interface CivMapRankScore {
  civId: string
  onMapTier?: PriorityTier
  onMapTierRank?: number
  onMapPoolOrder?: number
  otherBestTier?: PriorityTier
  aggregateScore: number
}

function findPresetEntry(
  preset: MapPriorityPreset,
  primaryKey: string,
  secondaryKey?: string,
): CivPriorityEntry | undefined {
  return normalizeTierEntries(preset.entries).find(
    (entry) =>
      entry.civId === primaryKey || (secondaryKey != null && entry.civId === secondaryKey),
  )
}

function civTierOnPresetMap(
  preset: MapPriorityPreset | null,
  civKeys: { id: string; name?: string },
): PriorityTier | undefined {
  if (!preset) return undefined
  return findPresetEntry(preset, civKeys.id, civKeys.name)?.tier
}

function bestTierOnOtherMaps(
  presets: MapPriorityPreset[],
  civKeys: { id: string; name?: string },
  targetMapName: string,
  allMapNames: string[],
): PriorityTier | undefined {
  let best: PriorityTier | undefined

  for (const mapName of allMapNames) {
    if (mapNamesMatch(mapName, targetMapName)) continue
    const preset = findPresetForMap(presets, mapName)
    const tier = civTierOnPresetMap(preset, civKeys)
    if (!tier) continue
    if (!best || comparePriorityTier(tier, best) < 0) best = tier
  }

  return best
}

function civTierRankOnPresetMap(
  preset: MapPriorityPreset | null,
  civKeys: { id: string; name?: string },
): number | undefined {
  if (!preset) return undefined
  return findPresetEntry(preset, civKeys.id, civKeys.name)?.tierRank
}

function civPoolOrderOnPresetMap(
  preset: MapPriorityPreset | null,
  civKeys: { id: string; name?: string },
): number | undefined {
  if (!preset?.advancedMode) return undefined
  const entry = findPresetEntry(preset, civKeys.id, civKeys.name)
  if (!entry) return undefined
  const order = entryPoolOrder(preset.pools, entry)
  return order === Number.MAX_SAFE_INTEGER ? undefined : order
}

function compareCivMapRank(a: CivMapRankScore, b: CivMapRankScore): number {
  const primary = comparePriorityTier(a.onMapTier, b.onMapTier)
  if (primary !== 0) return primary

  const poolOrderA = a.onMapPoolOrder ?? Number.MAX_SAFE_INTEGER
  const poolOrderB = b.onMapPoolOrder ?? Number.MAX_SAFE_INTEGER
  if (poolOrderA !== poolOrderB) return poolOrderA - poolOrderB

  const rankCmp = compareTierRank(a.onMapTierRank, b.onMapTierRank)
  if (rankCmp !== 0) return rankCmp
  const scoreDiff = b.aggregateScore - a.aggregateScore
  if (scoreDiff !== 0) return scoreDiff
  return comparePriorityTier(a.otherBestTier, b.otherBestTier)
}

function isCivGone(item: CivBoardItem): boolean {
  return item.status !== 'available'
}

function findBoardItem(allItems: CivBoardItem[], civId: string): CivBoardItem | undefined {
  return allItems.find((item) => item.id === civId || item.name === civId)
}

export function getMapTierPressure(
  presets: MapPriorityPreset[],
  mapName: string,
  allItems: CivBoardItem[],
): MapTierPressure {
  const preset = findPresetForMap(presets, mapName)
  return computeMapTierPressure(preset, allItems)
}

export function getMapPoolPressure(
  presets: MapPriorityPreset[],
  mapName: string,
  allItems: CivBoardItem[],
  context?: MapPoolPressureContext,
): MapPoolPressureEntry[] {
  const preset = findPresetForMap(presets, mapName)
  return computeMapPoolPressure(preset, allItems, context)
}

export function presetsHaveKeyCivs(presets: MapPriorityPreset[], mapNames: string[]): boolean {
  return mapNames.some((mapName) => mapPresetHasKeyCivs(presets, mapName))
}

export function mapPresetHasKeyCivs(presets: MapPriorityPreset[], mapName: string): boolean {
  const preset = findPresetForMap(presets, mapName)
  if (!preset) return false
  return normalizeTierEntries(preset.entries).some((entry) => entry.keyCiv)
}

export function collectNemesisCivIds(presets: MapPriorityPreset[], mapNames: string[]): Set<string> {
  const ids = new Set<string>()
  for (const mapName of mapNames) {
    const preset = findPresetForMap(presets, mapName)
    if (!preset) continue
    for (const entry of normalizeTierEntries(preset.entries)) {
      if (entry.nemesisCiv) ids.add(entry.civId)
    }
  }
  return ids
}

export function isMapAdvancedPreset(presets: MapPriorityPreset[], mapName: string): boolean {
  const preset = findPresetForMap(presets, mapName)
  return Boolean(preset?.advancedMode && preset.pools?.length)
}

function computeMapTierPressure(
  preset: MapPriorityPreset | null,
  allItems: CivBoardItem[],
): MapTierPressure {
  const pressure: MapTierPressure = {
    s: { gone: 0, total: 0 },
    a: { gone: 0, total: 0 },
  }
  if (!preset) return pressure

  for (const entry of normalizeTierEntries(preset.entries)) {
    if (entry.tier !== 'S' && entry.tier !== 'A') continue

    const bucket = entry.tier === 'S' ? pressure.s : pressure.a
    bucket.total += 1

    const boardItem = findBoardItem(allItems, entry.civId)
    if (boardItem && isCivGone(boardItem)) {
      bucket.gone += 1
    }
  }

  return pressure
}

function computeMapPoolPressure(
  preset: MapPriorityPreset | null,
  allItems: CivBoardItem[],
  context?: MapPoolPressureContext,
): MapPoolPressureEntry[] {
  if (!preset?.advancedMode || !preset.pools?.length) return []

  const mapAssignedCounts =
    context?.mode === 'map-assigned' &&
    context.mapId &&
    context.ownPicks &&
    context.assignments &&
    context.mapNames
      ? countPoolAssignmentsOnMap(
          preset,
          context.mapId,
          context.ownPicks,
          context.assignments,
          context.mapNames,
        )
      : null

  const buckets = new Map<string, MapPoolPressureEntry>()
  for (const pool of preset.pools) {
    buckets.set(pool.id, {
      id: pool.id,
      name: pool.name,
      gone: 0,
      total: 0,
      ownPicked: 0,
      maxPicks: pool.maxPicks,
    })
  }

  for (const entry of normalizeTierEntries(preset.entries)) {
    const membership = entryPoolIds(entry)
    if (!membership.length) continue
    const boardItem = findBoardItem(allItems, entry.civId)
    const gone = Boolean(boardItem && isCivGone(boardItem))
    const ownPicked = boardItem?.status === 'own_pick'

    for (const poolId of membership) {
      const bucket = buckets.get(poolId)
      if (!bucket) continue
      bucket.total += 1
      if (gone) bucket.gone += 1
      if (mapAssignedCounts) {
        bucket.ownPicked = mapAssignedCounts.get(poolId) ?? 0
      } else if (ownPicked) {
        bucket.ownPicked += 1
      }
    }
  }

  return preset.pools
    .map((pool) => buckets.get(pool.id))
    .filter((entry): entry is MapPoolPressureEntry => Boolean(entry && entry.total > 0))
}

function countPoolAssignmentsOnMap(
  preset: MapPriorityPreset,
  mapId: string,
  ownPicks: CivBoardItem[],
  assignments: Record<string, MapAssignmentTarget>,
  mapNames: string[],
): Map<string, number> {
  const counts = new Map<string, number>()
  const assigned = picksForMap(ownPicks, mapId, assignments, mapNames)

  for (const pick of assigned) {
    const entry = findPresetEntry(preset, pick.id, pick.name)
    if (!entry) continue
    for (const poolId of entryPoolIds(entry)) {
      counts.set(poolId, (counts.get(poolId) ?? 0) + 1)
    }
  }

  return counts
}

function countPoolAssignmentsOnMapById(
  preset: MapPriorityPreset | null,
  mapId: string,
  ownPicks: CivBoardItem[],
  assignments: Record<string, MapAssignmentTarget>,
  mapNames: string[],
): Map<string, number> {
  if (!preset) return new Map()
  return countPoolAssignmentsOnMap(preset, mapId, ownPicks, assignments, mapNames)
}

function civBlockedByPoolCap(
  preset: MapPriorityPreset,
  entry: CivPriorityEntry,
  poolCounts: Map<string, number>,
): boolean {
  for (const poolId of entryPoolIds(entry)) {
    const pool = preset.pools?.find((item) => item.id === poolId)
    const max = pool?.maxPicks
    if (max == null || max <= 0) continue
    if ((poolCounts.get(poolId) ?? 0) >= max) return true
  }
  return false
}

function boardItemForMap(
  item: CivBoardItem,
  reasonPart: PriorityReasonPart,
  onMapTier?: PriorityTier,
): CivBoardItem {
  return {
    ...item,
    priorityTier: onMapTier ?? reasonPart.tier,
    priorityReasonParts: [reasonPart],
    priorityReason: reasonPartsToPlainText([reasonPart]),
    priorityReasonTooltip: undefined,
  }
}

export function getTopPicksPerMap(
  presets: MapPriorityPreset[],
  mapDisplays: MapPickDisplay[],
  allItems: CivBoardItem[],
  _saturatedMaps: string[] = [],
  limit = 3,
  ownPicks: CivBoardItem[] = [],
  assignments: Record<string, MapAssignmentTarget> = {},
  mapNamesForAssignment: string[] = [],
): MapTopPickGroup[] {
  const available = allItems.filter((item) => item.status === 'available')
  if (!available.length || !mapDisplays.length) return []

  const allMapNames = mapDisplays.map((map) => map.name)
  const itemById = new Map(available.map((item) => [item.id, item]))

  return mapDisplays
    .map((map) => {
      const preset = findPresetForMap(presets, map.name)
      const tierPressure = computeMapTierPressure(preset, allItems)
      const poolPressure = computeMapPoolPressure(preset, allItems)
      const advancedMode = Boolean(preset?.advancedMode && preset.pools?.length)
      const poolCounts = countPoolAssignmentsOnMapById(
        preset,
        map.id,
        ownPicks,
        assignments,
        mapNamesForAssignment.length ? mapNamesForAssignment : allMapNames,
      )

      const ranked: CivMapRankScore[] = []
      for (const item of available) {
        const civKeys = { id: item.id, name: item.name }
        const onMapTier = civTierOnPresetMap(preset, civKeys)
        if (!onMapTier) continue

        const entry = preset ? findPresetEntry(preset, item.id, item.name) : undefined
        if (entry && preset && civBlockedByPoolCap(preset, entry, poolCounts)) continue

        ranked.push({
          civId: item.id,
          onMapTier,
          onMapTierRank: civTierRankOnPresetMap(preset, civKeys),
          onMapPoolOrder: civPoolOrderOnPresetMap(preset, civKeys),
          otherBestTier: bestTierOnOtherMaps(presets, civKeys, map.name, allMapNames),
          aggregateScore: civAggregatePresetScore(presets, civKeys, allMapNames),
        })
      }

      ranked.sort((a, b) => {
        const byScore = compareCivMapRank(a, b)
        if (byScore !== 0) return byScore
        const nameA = itemById.get(a.civId)?.name ?? a.civId
        const nameB = itemById.get(b.civId)?.name ?? b.civId
        return nameA.localeCompare(nameB)
      })

      const picks = ranked.slice(0, limit).flatMap((score) => {
        const base = itemById.get(score.civId)
        if (!base || !preset) return []

        const entry = findPresetEntry(preset, base.id, base.name)
        if (!entry) return []

        const reasonPart = buildReasonPart(preset, entry)
        if (!reasonPart) return []

        return [boardItemForMap(base, reasonPart, score.onMapTier)]
      })

      const keyCivs = preset
        ? normalizeTierEntries(preset.entries)
            .filter((entry) => entry.keyCiv && entry.tier)
            .flatMap((entry) => {
              const base =
                itemById.get(entry.civId) ??
                available.find((item) => item.name === entry.civId)
              if (!base) return []

              const reasonPart = buildReasonPart(preset, entry)
              if (!reasonPart) return []

              return [boardItemForMap(base, reasonPart, entry.tier)]
            })
            .sort(compareCivBoardItems)
        : []

      return {
        mapId: map.id,
        mapName: map.name,
        imageUrl: map.imageUrl,
        picks,
        keyCivs,
        tierPressure,
        poolPressure,
        advancedMode,
      }
    })
    .filter((group) => group.picks.length > 0 || group.keyCivs.length > 0)
}

export function getTopRecommendations(items: CivBoardItem[], limit = 3): CivBoardItem[] {
  return items
    .filter((item) => item.status === 'available' && item.priorityTier)
    .sort(compareCivBoardItems)
    .slice(0, limit)
}
