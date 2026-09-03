import type { CivPoolDefinition, CivPriorityEntry } from '../types/draft'
import { compareTierEntries } from './tiers'

export const DEFAULT_ADVANCED_POOLS: CivPoolDefinition[] = [
  { id: 'pool-halb-so', name: 'Halb SO' },
  { id: 'pool-paladin', name: 'Paladin' },
  { id: 'pool-flank', name: 'Flank' },
]

export type PoolIconKey =
  | 'siege-onager'
  | 'paladin'
  | 'villager'
  | 'scout'
  | 'archer'
  | 'question'

const POOL_ICON_FILES: Record<PoolIconKey, string> = {
  'siege-onager': 'siege-onager.png',
  paladin: 'paladin.png',
  villager: 'villager.png',
  scout: 'scout.png',
  archer: 'archer.png',
  question: 'question.svg',
}

/** Map a pool display name to a unit icon key. */
export function poolIconKey(name: string): PoolIconKey {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  if (
    normalized === 'halb so' ||
    normalized.includes('halb') ||
    normalized.includes('onager')
  ) {
    return 'siege-onager'
  }
  if (normalized.includes('paladin')) return 'paladin'
  if (normalized.includes('flank')) return 'villager'
  if (/\bscout\b/.test(normalized) || normalized === 'scout') return 'scout'
  if (/\barcher\b/.test(normalized) || normalized === 'archer') return 'archer'
  return 'question'
}

export function poolIconUrl(name: string): string {
  return `/units/${POOL_ICON_FILES[poolIconKey(name)]}`
}

/** Availability tint for remaining civs in a pool (draft pressure). */
export function poolAvailabilityTone(
  remaining: number,
): 'critical' | 'tight' | 'ok' {
  if (remaining <= 2) return 'critical'
  if (remaining < 6) return 'tight'
  return 'ok'
}

export function createPoolId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug ? `pool-${slug}` : `pool-${Date.now()}`
}

export function poolOrderIndex(pools: CivPoolDefinition[] | undefined, poolId?: string): number {
  if (!poolId || !pools?.length) return Number.MAX_SAFE_INTEGER
  const index = pools.findIndex((pool) => pool.id === poolId)
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER
}

/** Resolve pool membership, migrating legacy single `poolId`. */
export function entryPoolIds(entry: CivPriorityEntry): string[] {
  if (entry.poolIds?.length) {
    const seen = new Set<string>()
    return entry.poolIds.filter((id) => {
      const trimmed = id.trim()
      if (!trimmed || seen.has(trimmed)) return false
      seen.add(trimmed)
      return true
    })
  }
  if (entry.poolId?.trim()) return [entry.poolId.trim()]
  return []
}

export function entryInPool(entry: CivPriorityEntry, poolId: string): boolean {
  return entryPoolIds(entry).includes(poolId)
}

/** Earliest pool order among the civ's assigned pools (for board sorting). */
export function entryPoolOrder(
  pools: CivPoolDefinition[] | undefined,
  entry: CivPriorityEntry,
): number {
  const ids = entryPoolIds(entry)
  if (!ids.length) return Number.MAX_SAFE_INTEGER
  let best = Number.MAX_SAFE_INTEGER
  for (const id of ids) {
    const order = poolOrderIndex(pools, id)
    if (order < best) best = order
  }
  return best
}

/** Pool id with the earliest order (for single-id consumers). */
export function primaryPoolId(
  pools: CivPoolDefinition[] | undefined,
  entry: CivPriorityEntry,
): string | undefined {
  const ids = entryPoolIds(entry)
  if (!ids.length) return undefined
  let bestId = ids[0]
  let bestOrder = Number.MAX_SAFE_INTEGER
  for (const id of ids) {
    const order = poolOrderIndex(pools, id)
    if (order < bestOrder) {
      bestOrder = order
      bestId = id
    }
  }
  return bestId
}

/**
 * Which single pool an assignment should count toward.
 * Uses an explicit choice when it is still a membership; otherwise the primary pool.
 */
export function resolveCountingPoolId(
  pools: CivPoolDefinition[] | undefined,
  entry: CivPriorityEntry,
  chosenPoolId?: string | null,
): string | undefined {
  const membership = entryPoolIds(entry)
  if (!membership.length) return undefined
  if (chosenPoolId && membership.includes(chosenPoolId)) return chosenPoolId
  return primaryPoolId(pools, entry)
}

export function civIdsForPool(entries: CivPriorityEntry[], poolId: string): string[] {
  return entries
    .filter((entry) => entryInPool(entry, poolId))
    .sort(compareTierEntries)
    .map((entry) => entry.civId)
}

export function rankedCivIds(entries: CivPriorityEntry[]): string[] {
  return entries
    .filter((entry) => entry.tier)
    .sort(compareTierEntries)
    .map((entry) => entry.civId)
}

/** Persist shape: poolIds only (legacy poolId dropped). */
export function withNormalizedPoolIds(entry: CivPriorityEntry): CivPriorityEntry {
  const { poolId: _legacy, poolRank: _poolRank, ...rest } = entry
  const poolIds = entryPoolIds(entry)
  if (!poolIds.length) {
    const { poolIds: _ids, ...without } = rest
    return without
  }
  return { ...rest, poolIds }
}

/** Add a civ to a pool (keeps existing pools). Pass null to clear all pools. */
export function assignCivToPool(
  entries: CivPriorityEntry[],
  civId: string,
  poolId: string | null,
): CivPriorityEntry[] {
  return entries.map((entry) => {
    if (entry.civId !== civId) return entry
    if (!poolId) {
      const { poolId: _poolId, poolIds: _poolIds, poolRank: _poolRank, ...rest } = entry
      return rest
    }
    const current = entryPoolIds(entry)
    if (current.includes(poolId)) {
      return withNormalizedPoolIds(entry)
    }
    return withNormalizedPoolIds({ ...entry, poolIds: [...current, poolId] })
  })
}

/** Remove a civ from one pool (other memberships kept). */
export function removeCivFromPool(
  entries: CivPriorityEntry[],
  civId: string,
  poolId: string,
): CivPriorityEntry[] {
  return entries.map((entry) => {
    if (entry.civId !== civId) return entry
    const next = entryPoolIds(entry).filter((id) => id !== poolId)
    const { poolId: _poolId, poolIds: _poolIds, poolRank: _poolRank, ...rest } = entry
    if (!next.length) return rest
    return { ...rest, poolIds: next }
  })
}

/** Strip legacy poolRank — pool order comes from tier list only. */
export function stripPoolRanks(entries: CivPriorityEntry[]): CivPriorityEntry[] {
  return entries.map(({ poolRank: _poolRank, ...entry }) => withNormalizedPoolIds(entry))
}

export function normalizePresetPools(pools: CivPoolDefinition[] | undefined): CivPoolDefinition[] {
  if (!pools?.length) return []
  const seen = new Set<string>()
  return pools
    .map((pool) => ({
      id: pool.id.trim(),
      name: pool.name.trim(),
      maxPicks:
        typeof pool.maxPicks === 'number' && pool.maxPicks > 0
          ? Math.floor(pool.maxPicks)
          : undefined,
    }))
    .filter((pool) => {
      if (!pool.id || !pool.name || seen.has(pool.id)) return false
      seen.add(pool.id)
      return true
    })
}
