import { readLocalKey, writeLocalKey } from './cloudStorage'
import { isPriorityTier } from './tiers'
import type { CivDraftSettings } from '../types/settings'
import type { PriorityTier } from '../types/draft'

const STORAGE_KEY = 'aoe-draft-assistant.civ-draft-settings'
export const SETTINGS_CHANGED = 'aoe-civ-draft-settings-changed'

export const DEFAULT_CIV_DRAFT_SETTINGS: CivDraftSettings = {
  version: 1,
  tierAggregation: 'average',
  tierRules: [
    {
      id: 'override-s-on-any-map',
      enabled: true,
      ifAnyMapTier: 'S',
      showAsTier: 'S',
    },
  ],
}

export function loadCivDraftSettings(): CivDraftSettings {
  const raw = readLocalKey(STORAGE_KEY)
  if (!raw) return cloneSettings(DEFAULT_CIV_DRAFT_SETTINGS)
  try {
    return normalizeSettings(JSON.parse(raw) as Partial<CivDraftSettings>)
  } catch {
    return cloneSettings(DEFAULT_CIV_DRAFT_SETTINGS)
  }
}

export function saveCivDraftSettings(settings: CivDraftSettings): void {
  writeLocalKey(STORAGE_KEY, JSON.stringify(settings))
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED))
}

export function cloneSettings(settings: CivDraftSettings): CivDraftSettings {
  return {
    version: 1,
    tierAggregation: settings.tierAggregation,
    tierRules: settings.tierRules.map((rule) => ({ ...rule })),
  }
}

function normalizeSettings(raw: Partial<CivDraftSettings>): CivDraftSettings {
  const base = cloneSettings(DEFAULT_CIV_DRAFT_SETTINGS)
  if (raw.tierAggregation === 'best' || raw.tierAggregation === 'worst' || raw.tierAggregation === 'average') {
    base.tierAggregation = raw.tierAggregation
  }
  if (Array.isArray(raw.tierRules)) {
    base.tierRules = raw.tierRules
      .filter((rule) => rule && typeof rule.id === 'string')
      .map((rule) => ({
        id: rule.id,
        enabled: rule.enabled !== false,
        ifAnyMapTier: isTier(rule.ifAnyMapTier) ? rule.ifAnyMapTier : 'S',
        showAsTier: isTier(rule.showAsTier) ? rule.showAsTier : 'S',
      }))
  }
  return base
}

function isTier(value: unknown): value is PriorityTier {
  return typeof value === 'string' && isPriorityTier(value)
}
