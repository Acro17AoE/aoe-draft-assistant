import { useMemo } from 'react'
import type { MapDraftMode, MapSessionConfig } from '../types/draft'
import { extractDraftId } from '../lib/civs'
import {
  buildPresetMapPool,
  mapInPresetPool,
  resizeSelectedMaps,
} from '../lib/mapDraftSession'
import { maxGamesForSetFormat, SET_FORMAT_LABELS, SET_FORMATS } from '../lib/results'
import type { SetFormat } from '../types/results'
import type { TournamentTeamSummary } from '../lib/opponentAnalysis'
import { MapSlotSelect } from './MapSlotSelect'

interface MapDraftSetupProps {
  value: MapSessionConfig
  presetMaps?: string[]
  onChange: (value: MapSessionConfig) => void
  error?: string | null
  opponentTeams?: TournamentTeamSummary[]
  opponentTeamsBusy?: boolean
  opponentTeamsHint?: string | null
}

function OpponentTeamSelect({
  value,
  teams,
  busy,
  hint,
  onChange,
}: {
  value: string
  teams: TournamentTeamSummary[]
  busy?: boolean
  hint?: string | null
  onChange: (team: string) => void
}) {
  return (
    <label>
      Opponent (tournament)
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={busy || (!teams.length && !value)}
      >
        <option value="">No opponent selected</option>
        {teams.map((team) => (
          <option key={team.name} value={team.name}>
            {team.name} ({team.matchCount})
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}

export function MapDraftSetup({
  value,
  presetMaps = [],
  onChange,
  error,
  opponentTeams = [],
  opponentTeamsBusy = false,
  opponentTeamsHint = null,
}: MapDraftSetupProps) {
  const mode: MapDraftMode = value.mode ?? 'standard'
  const presetMapPool = useMemo(() => buildPresetMapPool(presetMaps), [presetMaps.join('|')])

  const selectFormat = value.selectFormat ?? value.singleMapFormat ?? 'PA3'
  const selectSlotCount = maxGamesForSetFormat(selectFormat)
  const selectedMaps = useMemo(
    () => resizeSelectedMaps(value.selectedMaps, selectSlotCount, presetMapPool),
    [value.selectedMaps, selectSlotCount, presetMapPool],
  )

  const singleMapValue =
    value.singleMap && mapInPresetPool(value.singleMap, presetMapPool)
      ? value.singleMap
      : (presetMapPool[0] ?? '')

  const update = (patch: Partial<MapSessionConfig>) => onChange({ ...value, ...patch })

  const switchMode = (nextMode: MapDraftMode) => {
    if (nextMode === 'single-map') {
      onChange({
        ...value,
        mode: nextMode,
        started: undefined,
        singleMap: singleMapValue || presetMapPool[0] || '',
        singleMapFormat: value.singleMapFormat ?? 'PA3',
      })
      return
    }
    if (nextMode === 'select') {
      const format = value.selectFormat ?? value.singleMapFormat ?? 'PA3'
      const count = maxGamesForSetFormat(format)
      onChange({
        ...value,
        mode: nextMode,
        started: undefined,
        selectFormat: format,
        selectedMaps: resizeSelectedMaps(value.selectedMaps, count, presetMapPool),
      })
      return
    }
    onChange({ ...value, mode: nextMode, started: undefined })
  }

  const changeSelectFormat = (format: SetFormat) => {
    const count = maxGamesForSetFormat(format)
    update({
      selectFormat: format,
      selectedMaps: resizeSelectedMaps(value.selectedMaps, count, presetMapPool),
    })
  }

  const updateSelectedMap = (index: number, mapName: string) => {
    const next = [...selectedMaps]
    next[index] = mapName
    update({ selectedMaps: next })
  }

  const draftIdValid = extractDraftId(value.mapDraftUrl).length >= 4
  const opponentSelect = (
    <OpponentTeamSelect
      value={value.opponentTeamName ?? ''}
      teams={opponentTeams}
      busy={opponentTeamsBusy}
      hint={opponentTeamsHint}
      onChange={(team) => update({ opponentTeamName: team })}
    />
  )

  return (
    <section className="panel setup-form map-draft-setup" data-tour="map-setup">
      <div className="setup-form-header">
        <h2>Map Draft</h2>
        <label className="map-mode-select">
          Mode
          <select
            value={mode}
            onChange={(event) => switchMode(event.target.value as MapDraftMode)}
          >
            <option value="standard">Standard</option>
            <option value="single-map">1-Map-Only</option>
            <option value="select">Select</option>
          </select>
        </label>
      </div>

      {mode === 'standard' ? (
        <>
          <p className="hint">Live map draft from aoe2cm.net.</p>
          <label>
            Map draft link
            <input
              value={value.mapDraftUrl}
              onChange={(event) => update({ mapDraftUrl: event.target.value })}
              placeholder="https://aoe2cm.net/draft/..."
            />
          </label>
          <label>
            Your team (host or guest name from aoe2cm)
            <input
              value={value.ownTeamName}
              onChange={(event) => update({ ownTeamName: event.target.value })}
              placeholder="e.g. Darius"
            />
          </label>
          {opponentSelect}
          {draftIdValid && value.ownTeamName.trim() ? (
            <p className="hint">Draft stream active when link and team are set.</p>
          ) : null}
        </>
      ) : null}

      {mode === 'single-map' ? (
        <>
          <p className="hint">Fixed map from the active preset tournament.</p>
          <label>
            Your team
            <input
              value={value.ownTeamName}
              onChange={(event) => update({ ownTeamName: event.target.value })}
              placeholder="e.g. Darius"
            />
          </label>
          {opponentSelect}
          <label>
            Map
            <select
              value={singleMapValue}
              onChange={(event) => update({ singleMap: event.target.value })}
              disabled={!presetMapPool.length}
            >
              {presetMapPool.length ? null : <option value="">No maps in active preset</option>}
              {presetMapPool.map((map) => (
                <option key={map} value={map}>
                  {map}
                </option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select
              value={value.singleMapFormat ?? 'PA3'}
              onChange={(event) => update({ singleMapFormat: event.target.value as SetFormat })}
            >
              {SET_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {SET_FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {mode === 'select' ? (
        <>
          <p className="hint">
            Pick maps from the active preset tournament. Add or edit maps under Presets.
          </p>
          <label>
            Your team
            <input
              value={value.ownTeamName}
              onChange={(event) => update({ ownTeamName: event.target.value })}
              placeholder="e.g. Darius"
            />
          </label>
          {opponentSelect}
          <label>
            Series format
            <select
              value={selectFormat}
              onChange={(event) => changeSelectFormat(event.target.value as SetFormat)}
            >
              {SET_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {SET_FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </label>
          <div className="select-maps-header">
            <span>Maps</span>
          </div>
          {presetMapPool.length ? (
            <div className="select-maps-slots">
              {selectedMaps.map((mapName, index) => (
                <MapSlotSelect
                  key={index}
                  label={`Map ${index + 1}`}
                  value={mapName}
                  pool={presetMapPool}
                  onChange={(next) => updateSelectedMap(index, next)}
                />
              ))}
            </div>
          ) : (
            <p className="hint">No maps in the active preset tournament yet.</p>
          )}
        </>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </section>
  )
}
