import type { PriorityTier } from '../types/draft'
import type { CivDraftSettings, TierAggregationMethod } from '../types/settings'
import { TIER_ORDER } from './tiers'

const TIER_SCORE: Record<PriorityTier, number> = { S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 }
const SCORE_TO_TIER: PriorityTier[] = ['F', 'D', 'C', 'B', 'A', 'S']

export function aggregateMapTiers(
  mapTiers: PriorityTier[],
  method: TierAggregationMethod = 'average',
): PriorityTier | undefined {
  if (mapTiers.length === 0) return undefined

  if (method === 'best') {
    return mapTiers.reduce((best, tier) =>
      TIER_ORDER[tier] < TIER_ORDER[best] ? tier : best,
    )
  }

  if (method === 'worst') {
    return mapTiers.reduce((worst, tier) =>
      TIER_ORDER[tier] > TIER_ORDER[worst] ? tier : worst,
    )
  }

  const avg = mapTiers.reduce((sum, tier) => sum + TIER_SCORE[tier], 0) / mapTiers.length
  const rounded = Math.round(avg)
  return SCORE_TO_TIER[Math.min(5, Math.max(0, rounded))]
}

export function applyTierOverrideRules(
  tier: PriorityTier | undefined,
  mapTiers: PriorityTier[],
  rules: CivDraftSettings['tierRules'],
): PriorityTier | undefined {
  if (!tier && mapTiers.length === 0) return undefined

  let result = tier ?? mapTiers[0]
  for (const rule of rules) {
    if (!rule.enabled) continue
    if (!mapTiers.includes(rule.ifAnyMapTier)) continue
    if (TIER_ORDER[rule.showAsTier] < TIER_ORDER[result]) {
      result = rule.showAsTier
    }
  }
  return result
}
