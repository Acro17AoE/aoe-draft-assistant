import type { CivSessionConfig, MapSessionConfig } from '../types/draft'
import { extractDraftId } from '../lib/civs'
import { getSessionMapPicks } from '../lib/mapSession'
import { SET_FORMAT_LABELS } from '../lib/results'

interface CivDraftSetupProps {
  value: CivSessionConfig
  mapSession: MapSessionConfig | null
  presetTournamentName?: string
  onChange: (value: CivSessionConfig) => void
  onGo: () => void
  error?: string | null
}

function isValidDraftLink(url: string): boolean {
  return extractDraftId(url.trim()).length >= 4
}

export function CivDraftSetup({
  value,
  mapSession,
  presetTournamentName,
  onChange,
  onGo,
  error,
}: CivDraftSetupProps) {
  const mode = mapSession?.mode ?? 'standard'
  const isManualMaps = mode === 'single-map' || mode === 'select'
  const mapDraftId = mapSession?.mapDraftUrl ? extractDraftId(mapSession.mapDraftUrl) : ''
  const manualMaps = mapSession ? getSessionMapPicks(mapSession) : []
  const mapLabel = isManualMaps
    ? manualMaps.length
      ? manualMaps.join(', ')
      : '—'
    : mapDraftId || '—'
  const formatHint =
    mode === 'select' && mapSession?.selectFormat
      ? SET_FORMAT_LABELS[mapSession.selectFormat]
      : mode === 'single-map' && mapSession?.singleMapFormat
        ? SET_FORMAT_LABELS[mapSession.singleMapFormat]
        : null
  const canGo = isValidDraftLink(value.civDraftUrl) && Boolean(mapSession?.ownTeamName.trim())

  return (
    <section className="panel setup-form civ-setup-compact" data-tour="civ-setup">
      <div className="civ-setup-meta">
        <span>
          Teamname: <strong>{mapSession?.ownTeamName || '—'}</strong>
        </span>
        <span>
          {isManualMaps ? 'Maps' : 'Map draft'}: <strong>{mapLabel}</strong>
          {formatHint ? <span className="chip muted"> {formatHint}</span> : null}
        </span>
        {presetTournamentName ? (
          <span>
            Presets: <strong>{presetTournamentName}</strong>
          </span>
        ) : null}
      </div>

      {!mapSession ? (
        <p className="error">
          Start a map draft session first and make sure you set your teamname you used in the drafts
          (Map Draft tab).
        </p>
      ) : null}

      <label className="civ-link-row">
        <span>Civ draft link</span>
        <div className="civ-link-input">
          <input
            value={value.civDraftUrl}
            onChange={(event) => onChange({ ...value, civDraftUrl: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canGo) onGo()
            }}
            placeholder="https://aoe2cm.net/draft/..."
          />
          <button type="button" className="go-btn" onClick={onGo} disabled={!canGo}>
            go
          </button>
        </div>
      </label>

      {error ? <p className="error">{error}</p> : null}
    </section>
  )
}
