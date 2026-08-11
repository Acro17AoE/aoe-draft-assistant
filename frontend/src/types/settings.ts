import type { PriorityTier } from './draft'

export type TierAggregationMethod = 'average' | 'best' | 'worst'

export interface TierOverrideRule {
  id: string
  enabled: boolean
  ifAnyMapTier: PriorityTier
  showAsTier: PriorityTier
}

export interface CivDraftSettings {
  version: 1
  tierAggregation: TierAggregationMethod
  tierRules: TierOverrideRule[]
}
