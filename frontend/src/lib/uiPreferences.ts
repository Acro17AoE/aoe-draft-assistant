import { readLocalKey, writeLocalKey } from './cloudStorage'

export type FullMapTopPicksMode = 'hide' | 'show' | 'dim'

export interface UiPreferences {
  colorblindMode: boolean
  hideBannedCivs: boolean
  hideOpponentPrediction: boolean
  fullMapTopPicksMode: FullMapTopPicksMode
  /** Light / white UI theme. */
  whiteMode: boolean
}

const STORAGE_KEY = 'aoe-draft-assistant.ui-preferences'
export const UI_PREFERENCES_CHANGED = 'aoe-ui-preferences-changed'

export const FULL_MAP_TOP_PICKS_MODES: FullMapTopPicksMode[] = ['hide', 'show', 'dim']

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  colorblindMode: false,
  hideBannedCivs: false,
  hideOpponentPrediction: false,
  fullMapTopPicksMode: 'hide',
  whiteMode: false,
}

export function loadUiPreferences(): UiPreferences {
  const raw = readLocalKey(STORAGE_KEY)
  if (!raw) return { ...DEFAULT_UI_PREFERENCES }
  try {
    return normalizeUiPreferences(JSON.parse(raw) as Partial<UiPreferences>)
  } catch {
    return { ...DEFAULT_UI_PREFERENCES }
  }
}

export function saveUiPreferences(preferences: UiPreferences): void {
  writeLocalKey(STORAGE_KEY, JSON.stringify(preferences))
  window.dispatchEvent(new CustomEvent(UI_PREFERENCES_CHANGED))
}

function normalizeUiPreferences(raw: Partial<UiPreferences>): UiPreferences {
  const mode = raw.fullMapTopPicksMode
  return {
    colorblindMode: raw.colorblindMode === true,
    hideBannedCivs: raw.hideBannedCivs === true,
    hideOpponentPrediction: raw.hideOpponentPrediction === true,
    fullMapTopPicksMode:
      mode === 'show' || mode === 'dim' || mode === 'hide' ? mode : DEFAULT_UI_PREFERENCES.fullMapTopPicksMode,
    whiteMode: raw.whiteMode === true,
  }
}

export function cycleFullMapTopPicksMode(current: FullMapTopPicksMode): FullMapTopPicksMode {
  const index = FULL_MAP_TOP_PICKS_MODES.indexOf(current)
  return FULL_MAP_TOP_PICKS_MODES[(index + 1) % FULL_MAP_TOP_PICKS_MODES.length]
}
