import { useMemo } from 'react'
import { normalizeSetDraftContext } from '../lib/results'
import { DEFAULT_MAPS } from '../lib/maps'
import type { MapSourceMode, SetDraftContext } from '../types/results'

const MAP_SOURCE_LABELS: Record<MapSourceMode, string> = {
  draft: 'Map draft (aoe2cm)',
  'single-map': '1-Map select',
  select: 'Select maps',
}

interface SetDraftContextEditorProps {
  value?: SetDraftContext
  onChange: (value: SetDraftContext) => void
  datalistId: string
}

interface SetDraftContextSummaryProps {
  value?: SetDraftContext
}

export function SetDraftContextSummary({ value }: SetDraftContextSummaryProps) {
  const draft = normalizeSetDraftContext(value)
  const mapSource = draft.mapSource ?? 'draft'
  const selectedMaps = (draft.selectedMaps ?? []).map((map) => map.trim()).filter(Boolean)

  const hasContent =
    draft.civDraftUrl?.trim() ||
    (mapSource === 'draft' && draft.mapDraftUrl?.trim()) ||
    (mapSource === 'single-map' && draft.singleMap?.trim()) ||
    (mapSource === 'select' && selectedMaps.length > 0)

  if (!hasContent) return null

  return (
    <section className="set-draft-context-summary panel inset-panel">
      <dl className="set-context-summary">
        {draft.civDraftUrl?.trim() ? (
          <div className="set-context-summary-row">
            <dt>Civ draft</dt>
            <dd>{draft.civDraftUrl.trim()}</dd>
          </div>
        ) : null}
        <div className="set-context-summary-row">
          <dt>Map source</dt>
          <dd>{MAP_SOURCE_LABELS[mapSource]}</dd>
        </div>
        {mapSource === 'draft' && draft.mapDraftUrl?.trim() ? (
          <div className="set-context-summary-row">
            <dt>Map draft</dt>
            <dd>{draft.mapDraftUrl.trim()}</dd>
          </div>
        ) : null}
        {mapSource === 'single-map' && draft.singleMap?.trim() ? (
          <div className="set-context-summary-row">
            <dt>Map</dt>
            <dd>{draft.singleMap.trim()}</dd>
          </div>
        ) : null}
        {mapSource === 'select' && selectedMaps.length > 0 ? (
          <div className="set-context-summary-row">
            <dt>Maps</dt>
            <dd>{selectedMaps.join(', ')}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}

export function SetDraftContextEditor({ value, onChange, datalistId }: SetDraftContextEditorProps) {
  const draft = normalizeSetDraftContext(value)
  const mapSource = draft.mapSource ?? 'draft'

  const selectedMaps = useMemo(() => {
    const maps = draft.selectedMaps ?? []
    return maps.length ? maps : ['']
  }, [draft.selectedMaps])

  const update = (patch: Partial<SetDraftContext>) => {
    onChange({ ...draft, ...patch })
  }

  const addMapSlot = () => {
    update({ selectedMaps: [...selectedMaps, ''] })
  }

  const updateMapSlot = (index: number, mapName: string) => {
    const next = [...selectedMaps]
    next[index] = mapName
    update({ selectedMaps: next })
  }

  return (
    <section className="set-draft-context panel inset-panel">
      <label>
        Civ draft URL
        <input
          value={draft.civDraftUrl ?? ''}
          onChange={(e) => update({ civDraftUrl: e.target.value })}
          placeholder="https://aoe2cm.net/draft/…"
        />
      </label>

      <label>
        Map source
        <select
          value={mapSource}
          onChange={(e) => update({ mapSource: e.target.value as MapSourceMode })}
        >
          <option value="draft">Map draft (aoe2cm)</option>
          <option value="single-map">1-Map select</option>
          <option value="select">Select maps</option>
        </select>
      </label>

      {mapSource === 'draft' ? (
        <label>
          Map draft URL
          <input
            value={draft.mapDraftUrl ?? ''}
            onChange={(e) => update({ mapDraftUrl: e.target.value })}
            placeholder="https://aoe2cm.net/draft/…"
          />
        </label>
      ) : null}

      {mapSource === 'single-map' ? (
        <label>
          Map
          <input
            list={datalistId}
            value={draft.singleMap ?? ''}
            onChange={(e) => update({ singleMap: e.target.value })}
            placeholder="Map name"
          />
        </label>
      ) : null}

      {mapSource === 'select' ? (
        <div className="set-draft-map-slots">
          <div className="set-draft-map-slots-header">
            <span>Selected maps</span>
            <button type="button" className="compact-btn" onClick={addMapSlot}>
              + Map
            </button>
          </div>
          {selectedMaps.map((mapName, index) => (
            <input
              key={`map-slot-${index}`}
              list={datalistId}
              value={mapName}
              onChange={(e) => updateMapSlot(index, e.target.value)}
              placeholder={`Map ${index + 1}`}
            />
          ))}
        </div>
      ) : null}

      <datalist id={datalistId}>
        {DEFAULT_MAPS.map((map) => (
          <option key={map} value={map} />
        ))}
      </datalist>
    </section>
  )
}
