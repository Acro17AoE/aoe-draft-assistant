import { useEffect, useMemo, useRef, useState } from 'react'
import type { CivPoolDefinition, CivPriorityEntry, MapPriorityPreset } from '../types/draft'
import {
  DEFAULT_ADVANCED_POOLS,
  entryPoolIds,
  normalizePresetPools,
  stripPoolRanks,
} from '../lib/pools'
import { normalizeTierEntries, compareTierEntries } from '../lib/tiers'
import {
  addCustomMap,
  deletePresetForMap,
  findPresetForMap,
  getTournamentMaps,
  upsertPresetForMap,
} from '../lib/presets'
import { AddMapPopout } from './AddMapPopout'
import { ConfirmModal } from './ConfirmModal'
import { MapNamePicker } from './MapNamePicker'
import { TierMakerEditor } from './TierMakerEditor'
import { CivPoolEditor } from './CivPoolEditor'

interface MapPresetEditorProps {
  presets: MapPriorityPreset[]
  customMaps: string[]
  onChange: (presets: MapPriorityPreset[], customMaps: string[]) => void
  onCopyFromMap?: (sourceMap: string, targetMap: string) => void
  onRemoveMap?: (mapName: string) => void
}

function normalizeEntriesSnapshot(entries: CivPriorityEntry[]): string {
  return JSON.stringify(
    stripPoolRanks(normalizeTierEntries(entries))
      .sort(compareTierEntries)
      .map((entry) => ({
        civId: entry.civId,
        tier: entry.tier ?? null,
        tierRank: entry.tierRank ?? null,
        poolIds: entryPoolIds(entry),
        keyCiv: entry.keyCiv ?? false,
        nemesisCiv: entry.nemesisCiv ?? false,
        reason: entry.reason ?? '',
      })),
  )
}

function serializePresetEntry(entry: CivPriorityEntry): CivPriorityEntry {
  const poolIds = entryPoolIds(entry)
  return {
    civId: entry.civId,
    tier: entry.tier,
    tierRank: entry.tierRank,
    ...(poolIds.length ? { poolIds } : {}),
    ...(entry.keyCiv ? { keyCiv: true } : {}),
    ...(entry.nemesisCiv ? { nemesisCiv: true } : {}),
    reason: entry.reason,
  }
}

function normalizePresetSnapshot(preset?: MapPriorityPreset | null): string {
  return JSON.stringify({
    entries: normalizeEntriesSnapshot(preset?.entries ?? []),
    advancedMode: preset?.advancedMode ?? false,
    pools: normalizePresetPools(preset?.pools),
  })
}

function DeleteX({ title, onClick, disabled }: { title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="delete-x"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      ×
    </button>
  )
}

export function MapPresetEditor({
  presets,
  customMaps,
  onChange,
  onCopyFromMap,
  onRemoveMap,
}: MapPresetEditorProps) {
  const tournamentMaps = useMemo(() => getTournamentMaps(customMaps, presets), [customMaps, presets])
  const [selectedMap, setSelectedMap] = useState(tournamentMaps[0] ?? 'Arabia')
  const [entries, setEntries] = useState<CivPriorityEntry[]>([])
  const [advancedMode, setAdvancedMode] = useState(false)
  const [pools, setPools] = useState<CivPoolDefinition[]>([])
  const [copyFromMap, setCopyFromMap] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [showAddMap, setShowAddMap] = useState(false)
  const [pendingMapSwitch, setPendingMapSwitch] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)
  const [pendingRemoveConfirm, setPendingRemoveConfirm] = useState(false)
  const [pendingImport, setPendingImport] = useState(false)
  const loadedMapRef = useRef<string | null>(null)
  const baselineSnapRef = useRef('')

  const savedPreset = useMemo(() => findPresetForMap(presets, selectedMap), [presets, selectedMap])

  const isDirty = useMemo(() => {
    const savedSnap = normalizePresetSnapshot(savedPreset)
    const currentSnap = JSON.stringify({
      entries: normalizeEntriesSnapshot(entries),
      advancedMode,
      pools: normalizePresetPools(pools),
    })
    return currentSnap !== savedSnap
  }, [entries, savedPreset, advancedMode, pools])

  const copySourceMaps = useMemo(
    () =>
      tournamentMaps.filter(
        (map) =>
          map !== selectedMap &&
          (findPresetForMap(presets, map)?.entries.length ?? 0) > 0,
      ),
    [tournamentMaps, selectedMap, presets],
  )

  const targetHasRatings = isDirty || (savedPreset?.entries.length ?? 0) > 0

  useEffect(() => {
    if (!tournamentMaps.some((map) => map === selectedMap)) {
      setSelectedMap(tournamentMaps[0] ?? 'Arabia')
    }
  }, [tournamentMaps, selectedMap])

  useEffect(() => {
    const preset = findPresetForMap(presets, selectedMap)
    const nextEntries = stripPoolRanks(
      normalizeTierEntries(preset?.entries.map((entry) => ({ ...entry })) ?? []),
    )
    const savedSnap = normalizePresetSnapshot(preset)
    const mapChanged = loadedMapRef.current !== selectedMap
    loadedMapRef.current = selectedMap

    setEntries((current) => {
      const currentSnap = JSON.stringify({
        entries: normalizeEntriesSnapshot(current),
        advancedMode,
        pools: normalizePresetPools(pools),
      })
      const isDirtyLocal = !mapChanged && currentSnap !== baselineSnapRef.current

      if (mapChanged || !isDirtyLocal) {
        baselineSnapRef.current = savedSnap
        setAdvancedMode(preset?.advancedMode ?? false)
        setPools(normalizePresetPools(preset?.pools))
        return nextEntries
      }
      return current
    })
  }, [presets, selectedMap])

  useEffect(() => {
    setCopyFromMap(copySourceMaps[0] ?? '')
  }, [selectedMap, copySourceMaps.join('|')])

  const persist = (nextPresets: MapPriorityPreset[], nextCustomMaps = customMaps) => {
    onChange(nextPresets, nextCustomMaps)
  }

  const save = () => {
    const tierEntries = stripPoolRanks(normalizeTierEntries(entries)).map(serializePresetEntry)
    const next = upsertPresetForMap(presets, selectedMap, {
      entries: tierEntries,
      advancedMode,
      pools: normalizePresetPools(pools),
    })
    persist(next)
    setEntries(tierEntries)
    baselineSnapRef.current = normalizePresetSnapshot({
      mapName: selectedMap,
      id: '',
      name: selectedMap,
      entries: tierEntries,
      advancedMode,
      pools: normalizePresetPools(pools),
      updatedAt: '',
    })
    setStatus(`Preset saved for "${selectedMap}".`)
  }

  const resetMap = () => {
    const next = deletePresetForMap(presets, selectedMap)
    persist(next)
    setEntries([])
    setAdvancedMode(false)
    setPools([])
    baselineSnapRef.current = normalizePresetSnapshot(null)
    setStatus(`Preset reset for "${selectedMap}".`)
  }

  const toggleAdvancedMode = () => {
    const next = !advancedMode
    setAdvancedMode(next)
    if (next && pools.length === 0) {
      setPools(DEFAULT_ADVANCED_POOLS.map((pool) => ({ ...pool })))
    }
  }

  const applyAddMap = (trimmed: string) => {
    const nextMaps = addCustomMap(customMaps, trimmed)
    persist(presets, nextMaps)
    setSelectedMap(trimmed)
    setStatus(`Map "${trimmed}" added.`)
  }

  const handleAddMap = (mapName: string) => {
    const trimmed = mapName.trim()
    if (!trimmed) return
    if (isDirty) {
      setPendingMapSwitch(`__add__:${trimmed}`)
      return
    }
    applyAddMap(trimmed)
  }

  const switchToMap = (nextMap: string) => {
    setSelectedMap(nextMap)
    setPendingMapSwitch(null)
    setPendingRemove(false)
  }

  const requestMapSwitch = (nextMap: string) => {
    if (nextMap === selectedMap) return
    if (!isDirty) {
      switchToMap(nextMap)
      return
    }
    setPendingMapSwitch(nextMap)
  }

  const requestRemoveMap = () => {
    if (tournamentMaps.length <= 1) {
      setStatus('A tournament must keep at least one map.')
      return
    }
    if (!onRemoveMap) return
    if (isDirty) {
      setPendingRemove(true)
      return
    }
    setPendingRemoveConfirm(true)
  }

  const executeRemoveMap = () => {
    if (!onRemoveMap) return
    onRemoveMap(selectedMap)
    setStatus(`Map "${selectedMap}" removed from tournament.`)
    setPendingRemoveConfirm(false)
    setPendingRemove(false)
  }

  const confirmLeaveSave = () => {
    save()
    if (pendingRemove) {
      setPendingRemove(false)
      setPendingRemoveConfirm(true)
      return
    }
    if (pendingMapSwitch?.startsWith('__add__:')) {
      applyAddMap(pendingMapSwitch.slice('__add__:'.length))
      setPendingMapSwitch(null)
      return
    }
    if (pendingMapSwitch) {
      switchToMap(pendingMapSwitch)
    }
  }

  const confirmLeaveDiscard = () => {
    if (pendingRemove) {
      setPendingRemove(false)
      setPendingRemoveConfirm(true)
      return
    }
    if (pendingMapSwitch?.startsWith('__add__:')) {
      applyAddMap(pendingMapSwitch.slice('__add__:'.length))
      setPendingMapSwitch(null)
      return
    }
    if (pendingMapSwitch) {
      switchToMap(pendingMapSwitch)
    }
  }

  const cancelLeave = () => {
    setPendingMapSwitch(null)
    setPendingRemove(false)
  }

  const copyFromSelected = () => {
    if (!copyFromMap || !onCopyFromMap) return
    onCopyFromMap(copyFromMap, selectedMap)
    setStatus(`Imported ratings from "${copyFromMap}".`)
    setPendingImport(false)
  }

  const requestImport = () => {
    if (!copyFromMap || !onCopyFromMap) return
    if (targetHasRatings) {
      setPendingImport(true)
      return
    }
    copyFromSelected()
  }

  const showUnsavedModal = pendingMapSwitch !== null || pendingRemove

  return (
    <div className="map-preset-editor">
      <div className="preset-map-heading-row">
        <MapNamePicker maps={tournamentMaps} selectedMap={selectedMap} onSelect={requestMapSwitch} />
        <button type="button" className="add-btn" title="Add map" onClick={() => setShowAddMap(true)}>
          +
        </button>
        {onRemoveMap ? (
          <DeleteX
            title={tournamentMaps.length <= 1 ? 'At least one map required' : `Remove ${selectedMap}`}
            disabled={tournamentMaps.length <= 1}
            onClick={requestRemoveMap}
          />
        ) : null}
      </div>

      {onCopyFromMap && copySourceMaps.length > 0 ? (
        <div className="preset-map-import-row">
          <span className="preset-map-import-label">Import ratings from:</span>
          <select
            value={copyFromMap}
            aria-label="Source map to import ratings from"
            onChange={(event) => setCopyFromMap(event.target.value)}
          >
            {copySourceMaps.map((map) => (
              <option key={map} value={map}>
                {map}
              </option>
            ))}
          </select>
          <button type="button" onClick={requestImport} disabled={!copyFromMap}>
            Insert
          </button>
        </div>
      ) : null}

      {status ? <p className="hint preset-status">{status}</p> : null}
      {isDirty ? <p className="hint preset-unsaved-hint">Unsaved changes for &quot;{selectedMap}&quot;.</p> : null}

      {showUnsavedModal ? (
        <div className="modal-overlay" onClick={cancelLeave} role="presentation">
          <div
            className="modal-dialog panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <h2>Save changes?</h2>
              <button type="button" className="modal-close" onClick={cancelLeave} aria-label="Close">
                ×
              </button>
            </div>
            <p className="confirm-message">
              {pendingRemove
                ? `You have unsaved changes for "${selectedMap}". Save before removing this map?`
                : `You have unsaved changes for "${selectedMap}". Save before leaving this map?`}
            </p>
            <div className="modal-actions">
              <button type="button" onClick={cancelLeave}>
                Cancel
              </button>
              <button type="button" onClick={confirmLeaveDiscard}>
                Don&apos;t save
              </button>
              <button type="button" className="accent-btn" onClick={confirmLeaveSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingImport ? (
        <div className="modal-overlay" onClick={() => setPendingImport(false)} role="presentation">
          <div
            className="modal-dialog panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <h2>Overwrite ratings?</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setPendingImport(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="confirm-message">
              Import ratings from &quot;{copyFromMap}&quot; into &quot;{selectedMap}&quot;? Existing ratings
              {isDirty && !savedPreset?.entries.length ? ' (including unsaved changes)' : ''} will be
              replaced.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingImport(false)}>
                Cancel
              </button>
              <button type="button" className="accent-btn" onClick={copyFromSelected}>
                Insert
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingRemoveConfirm ? (
        <ConfirmModal
          title="Remove map?"
          message={`Remove "${selectedMap}" from this tournament? Ratings for this map will be deleted.`}
          confirmLabel="Remove"
          danger
          onCancel={() => setPendingRemoveConfirm(false)}
          onConfirm={executeRemoveMap}
        />
      ) : null}

      {showAddMap ? <AddMapPopout onClose={() => setShowAddMap(false)} onAdd={handleAddMap} /> : null}

      <TierMakerEditor
        entries={entries}
        onChange={setEntries}
        advancedMode={advancedMode}
        onAdvancedToggle={toggleAdvancedMode}
        advancedSection={
          <CivPoolEditor
            entries={entries}
            pools={pools}
            onEntriesChange={setEntries}
            onPoolsChange={setPools}
          />
        }
      />

      <div className="preset-toolbar preset-toolbar-below">
        <button type="button" className="accent-btn" onClick={save} disabled={!isDirty}>
          Save
        </button>
        <button type="button" onClick={resetMap}>
          Reset
        </button>
      </div>
    </div>
  )
}
