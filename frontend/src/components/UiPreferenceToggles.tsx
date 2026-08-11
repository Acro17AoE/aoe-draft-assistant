import { cycleFullMapTopPicksMode } from '../lib/uiPreferences'
import { useUiPreferences } from '../lib/useUiPreferences'

const FULL_MAP_MODE_LABELS = {
  hide: 'Top 3 Picks: hide',
  show: 'Top 3 Picks: show',
  dim: 'Top 3 Picks: dim',
} as const

export function UiPreferenceToggles() {
  const { preferences, setPreference } = useUiPreferences()

  return (
    <div className="ui-preference-bar" role="toolbar" aria-label="Display options">
      <button
        type="button"
        className={`ui-pref-toggle${preferences.colorblindMode ? ' active' : ''}`}
        aria-pressed={preferences.colorblindMode}
        onClick={() => setPreference('colorblindMode', !preferences.colorblindMode)}
      >
        Colorblind mode
      </button>
      <button
        type="button"
        className={`ui-pref-toggle${preferences.hideBannedCivs ? ' active' : ''}`}
        aria-pressed={preferences.hideBannedCivs}
        onClick={() => setPreference('hideBannedCivs', !preferences.hideBannedCivs)}
      >
        Hide banned civs
      </button>
      <button
        type="button"
        className={`ui-pref-toggle${preferences.hideOpponentPrediction ? ' active' : ''}`}
        aria-pressed={preferences.hideOpponentPrediction}
        onClick={() => setPreference('hideOpponentPrediction', !preferences.hideOpponentPrediction)}
      >
        Hide prediction
      </button>
      <button
        type="button"
        className={`ui-pref-toggle ui-pref-toggle-cycle active`}
        aria-pressed
        onClick={() =>
          setPreference(
            'fullMapTopPicksMode',
            cycleFullMapTopPicksMode(preferences.fullMapTopPicksMode),
          )
        }
      >
        {FULL_MAP_MODE_LABELS[preferences.fullMapTopPicksMode]}
      </button>
    </div>
  )
}
