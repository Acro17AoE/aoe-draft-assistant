import type { CivPriorityEntry, PriorityTier } from '../types/draft'

export const PRIORITY_TIERS: PriorityTier[] = ['S', 'A', 'B', 'C', 'D', 'F']

export const TIER_ORDER: Record<PriorityTier, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  F: 5,
}

const TIER_FROM_PERCENTILE: { tier: PriorityTier; max: number }[] = [
  { tier: 'S', max: 0.05 },
  { tier: 'A', max: 0.15 },
  { tier: 'B', max: 0.35 },
  { tier: 'C', max: 0.65 },
  { tier: 'D', max: 0.85 },
  { tier: 'F', max: 1 },
]

export function isPriorityTier(value: string): value is PriorityTier {
  return PRIORITY_TIERS.includes(value as PriorityTier)
}

export function tierFromPercentile(percentile: number): PriorityTier {
  const clamped = Math.min(1, Math.max(0, percentile))
  for (const band of TIER_FROM_PERCENTILE) {
    if (clamped <= band.max) return band.tier
  }
  return 'F'
}

export function compareTierRank(a?: number, b?: number): number {
  const left = a ?? Number.MAX_SAFE_INTEGER
  const right = b ?? Number.MAX_SAFE_INTEGER
  return left - right
}

export function compareTierEntries(a: CivPriorityEntry, b: CivPriorityEntry): number {
  const tierCmp = (TIER_ORDER[a.tier ?? 'F'] ?? 99) - (TIER_ORDER[b.tier ?? 'F'] ?? 99)
  if (tierCmp !== 0) return tierCmp
  const rankCmp = compareTierRank(a.tierRank, b.tierRank)
  if (rankCmp !== 0) return rankCmp
  return a.civId.localeCompare(b.civId)
}

/** Assign contiguous 0..n-1 ranks per tier from current order (left = best). */
export function compactTierRanks(entries: CivPriorityEntry[]): CivPriorityEntry[] {
  const byTier = new Map<PriorityTier, CivPriorityEntry[]>()

  for (const entry of entries) {
    if (!entry.tier || !isPriorityTier(entry.tier)) continue
    const bucket = byTier.get(entry.tier) ?? []
    bucket.push(entry)
    byTier.set(entry.tier, bucket)
  }

  const ranked: CivPriorityEntry[] = []
  for (const tier of PRIORITY_TIERS) {
    const bucket = byTier.get(tier)
    if (!bucket?.length) continue
    const sorted = [...bucket].sort(compareTierEntries)
    sorted.forEach((entry, index) => {
      ranked.push({ ...entry, tier, tierRank: index })
    })
  }

  const unranked = entries.filter((entry) => !entry.tier || !isPriorityTier(entry.tier))
  return [...ranked, ...unranked.map((entry) => ({ ...entry, tierRank: undefined }))]
}

/** Normalize legacy points-only entries to explicit tiers. */
export function normalizeTierEntries(entries: CivPriorityEntry[]): CivPriorityEntry[] {
  const withTier = entries.filter((entry) => entry.tier && isPriorityTier(entry.tier))
  const withPointsOnly = entries.filter(
    (entry) => !entry.tier && entry.points != null && entry.points > 0,
  )

  const result: CivPriorityEntry[] = withTier.map((entry) => {
    const poolIds =
      entry.poolIds?.length
        ? [...entry.poolIds]
        : entry.poolId
          ? [entry.poolId]
          : undefined
    return {
      civId: entry.civId,
      tier: entry.tier,
      tierRank: entry.tierRank,
      poolIds,
      poolId: poolIds?.[0],
      poolRank: entry.poolRank,
      reason: entry.reason,
    }
  })

  if (withPointsOnly.length) {
    const sorted = [...withPointsOnly].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    const total = sorted.length
    for (let index = 0; index < sorted.length; index += 1) {
      const entry = sorted[index]
      const percentile = (index + 1) / total
      const tier = tierFromPercentile(percentile)
      const tierSize = result.filter((item) => item.tier === tier).length
      const poolIds =
        entry.poolIds?.length
          ? [...entry.poolIds]
          : entry.poolId
            ? [entry.poolId]
            : undefined
      result.push({
        civId: entry.civId,
        tier,
        tierRank: tierSize,
        poolIds,
        poolId: poolIds?.[0],
        poolRank: entry.poolRank,
        reason: entry.reason,
      })
    }
  }

  const seen = new Set<string>()
  const deduped = result.filter((entry) => {
    if (seen.has(entry.civId)) return false
    seen.add(entry.civId)
    return true
  })

  return compactTierRanks(deduped)
}

export function civIdsForTier(entries: CivPriorityEntry[], tier: PriorityTier): string[] {
  return entries
    .filter((entry) => entry.tier === tier)
    .sort(compareTierEntries)
    .map((entry) => entry.civId)
}

export function moveCivInTierList(
  entries: CivPriorityEntry[],
  civId: string,
  tier: PriorityTier | null,
  insertIndex?: number,
): CivPriorityEntry[] {
  const existing = entries.find((entry) => entry.civId === civId)
  const without = entries.filter((entry) => entry.civId !== civId)

  if (!tier) {
    return without
  }

  const tierSiblings = without
    .filter((entry) => entry.tier === tier)
    .sort(compareTierEntries)

  const index = insertIndex ?? tierSiblings.length
  const clamped = Math.max(0, Math.min(index, tierSiblings.length))

  tierSiblings.splice(clamped, 0, {
    civId,
    tier,
    tierRank: clamped,
    reason: existing?.reason,
  })

  const ranked = tierSiblings.map((entry, rank) => ({ ...entry, tierRank: rank }))
  const others = without.filter((entry) => entry.tier !== tier)

  return compactTierRanks([...others, ...ranked])
}
