import { useEffect, useState, type ReactNode } from 'react'
import { MapPresetEditor } from '../components/MapPresetEditor'
import { PresetExportImportPanel } from '../components/PresetExportImportPanel'
import { useWorkspace } from '../contexts/WorkspaceProvider'
import { fetchAoe2cmPreset } from '../lib/api'
import { fetchAoestatsPresetBundle, type AoestatsGrouping } from '../lib/aoestats'
import { DEFAULT_MAPS, presetIdForMap } from '../lib/maps'
import { extractPresetId, mapsFromAoe2cmPreset } from '../lib/mapDraftPresets'
import {
  copyMapPresetWithinTournament,
  copyMapPresetsBetweenTournaments,
  createPresetTournament,
  createPresetsFromMapNames,
  customMapsFromMapNames,
  deletePresetTournament,
  loadPresetStore,
  removeMapFromTournament,
  updatePresetTournament,
} from '../lib/presetTournaments'
import type { MapPriorityPreset } from '../types/draft'
import { createTournament, loadTournaments, saveTournaments } from '../lib/results'
import type { PresetTournament, PresetTournamentStore } from '../types/presetTournament'
import type { Tournament, TournamentFormat } from '../types/results'

const FORMATS: TournamentFormat[] = ['1v1', '2v2', '3v3', '4v4']

interface PresetsTabProps {
  store: PresetTournamentStore
  onChange: (store: PresetTournamentStore) => void
  onResultsChange?: (tournaments: Tournament[]) => void
}

export function PresetsTab({ store, onChange, onResultsChange }: PresetsTabProps) {
  const { workspace } = useWorkspace()
  const isSharedSession = Boolean(workspace)
  const activeId = store.activeTournamentId ?? store.tournaments[0]?.id ?? null
  const selectedId = activeId
  const selected = store.tournaments.find((t) => t.id === selectedId) ?? null

  const [showNewTournament, setShowNewTournament] = useState(false)
  const [pendingResultsCreate, setPendingResultsCreate] = useState<{
    presetTournamentId: string
    name: string
    format: TournamentFormat
  } | null>(null)
  const [copySourceId, setCopySourceId] = useState('')
  const [selectedCopyMaps, setSelectedCopyMaps] = useState<string[]>([])
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [copyExpanded, setCopyExpanded] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [aoestatsBusy, setAoestatsBusy] = useState(false)
  const [aoestatsStatus, setAoestatsStatus] = useState<string | null>(null)
  const [editorStatus, setEditorStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!selected) return
    const others = store.tournaments.filter((t) => t.id !== selected.id)
    setCopySourceId(others[0]?.id ?? '')
  }, [selected?.id, store.tournaments])

  const copySource = store.tournaments.find((t) => t.id === copySourceId) ?? null
  const copySourceMaps = copySource?.presets.map((p) => p.mapName) ?? []

  useEffect(() => {
    setSelectedCopyMaps([])
  }, [copySourceId])

  const toggleCopyMap = (mapName: string) => {
    setSelectedCopyMaps((current) =>
      current.includes(mapName) ? current.filter((m) => m !== mapName) : [...current, mapName],
    )
  }

  const copySelectedMaps = () => {
    if (!selected || !copySourceId || !selectedCopyMaps.length) return
    const next = copyMapPresetsBetweenTournaments(store, selected.id, copySourceId, selectedCopyMaps)
    onChange(next)
    setCopyStatus(`Copied ${selectedCopyMaps.length} map preset(s) from "${copySource?.name}".`)
  }

  const copyAllMaps = () => {
    if (!selected || !copySourceId || !copySourceMaps.length) return
    const next = copyMapPresetsBetweenTournaments(store, selected.id, copySourceId)
    onChange(next)
    setCopyStatus(`Copied all ${copySourceMaps.length} map preset(s) from "${copySource?.name}".`)
  }

  const selectTournament = (id: string) => {
    onChange({ ...store, activeTournamentId: id })
  }

  const handleCreateTournament = async (
    name: string,
    format: TournamentFormat,
    mapDraftPresetUrl: string | null,
  ) => {
    let created = createPresetTournament(name, format)

    if (mapDraftPresetUrl?.trim()) {
      const remote = await fetchAoe2cmPreset(mapDraftPresetUrl)
      const maps = mapsFromAoe2cmPreset(remote)
      if (!maps.length) {
        throw new Error('aoe2cm preset has no maps in draftOptions.')
      }
      created = {
        ...created,
        presets: createPresetsFromMapNames(created.id, maps),
        customMaps: customMapsFromMapNames(maps),
      }
    }

    onChange({
      ...store,
      activeTournamentId: created.id,
      tournaments: [created, ...store.tournaments],
    })
    setShowNewTournament(false)
    setPendingResultsCreate({ presetTournamentId: created.id, name: created.name, format })
  }

  const confirmResultsCreate = (createInResults: boolean) => {
    if (!pendingResultsCreate) return

    if (createInResults && onResultsChange) {
      const resultsTournament = createTournament(
        pendingResultsCreate.name,
        pendingResultsCreate.format,
      )
      const nextResults = [resultsTournament, ...loadTournaments()]
      saveTournaments(nextResults)
      onResultsChange(nextResults)

      const currentStore = loadPresetStore()
      onChange(
        updatePresetTournament(currentStore, pendingResultsCreate.presetTournamentId, (tournament) => ({
          ...tournament,
          resultsId: resultsTournament.id,
        })),
      )
    }

    setPendingResultsCreate(null)
  }

  const handleRename = (id: string, name: string) => {
    onChange(
      updatePresetTournament(store, id, (tournament) => ({
        ...tournament,
        name: name.trim() || tournament.name,
      })),
    )
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    onChange(deletePresetTournament(store, deleteTarget.id))
    setDeleteTarget(null)
  }

  const handlePresetChange = (presets: PresetTournament['presets'], customMaps: string[]) => {
    if (!selected) return
    onChange(
      updatePresetTournament(store, selected.id, (tournament) => ({
        ...tournament,
        presets,
        customMaps,
      })),
    )
  }

  const copyFromTournament = copyAllMaps

  const clonePresetsForTournament = (tournamentId: string, presets: MapPriorityPreset[]): MapPriorityPreset[] =>
    presets.map((preset) => ({
      ...preset,
      id: `${tournamentId}-${presetIdForMap(preset.mapName)}`,
      entries: preset.entries.map((entry) => ({ ...entry })),
      updatedAt: new Date().toISOString(),
    }))

  const importAoestatsTournament = async (
    tournamentName: string,
    format: TournamentFormat,
    grouping: AoestatsGrouping,
  ) => {
    setAoestatsBusy(true)
    setAoestatsStatus(null)
    try {
      const bundle = await fetchAoestatsPresetBundle(undefined, grouping)
      const defaultMapKeys = new Set(DEFAULT_MAPS.map((map) => map.toLowerCase()))
      const customMaps = bundle.maps.filter((map) => !defaultMapKeys.has(map.toLowerCase()))
      const existing = store.tournaments.find((t) => t.name.toLowerCase() === tournamentName.toLowerCase())

      if (existing) {
        onChange(
          updatePresetTournament(store, existing.id, (tournament) => ({
            ...tournament,
            format,
            presets: clonePresetsForTournament(tournament.id, bundle.presets),
            customMaps: [...new Set([...tournament.customMaps, ...customMaps])],
          })),
        )
        setAoestatsStatus(
          `Updated "${existing.name}" from aoestats.io (patch ${bundle.meta?.patch ?? '?'}, ${bundle.presets.length} maps).`,
        )
      } else {
        const created = createPresetTournament(tournamentName, format)
        const withPresets = {
          ...created,
          presets: clonePresetsForTournament(created.id, bundle.presets),
          customMaps,
        }
        onChange({
          ...store,
          activeTournamentId: withPresets.id,
          tournaments: [withPresets, ...store.tournaments],
        })
        setAoestatsStatus(
          `Created "${tournamentName}" from aoestats.io (patch ${bundle.meta?.patch ?? '?'}, ${bundle.presets.length} maps).`,
        )
      }
      setShowNewTournament(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'aoestats import failed'
      setAoestatsStatus(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setAoestatsBusy(false)
    }
  }

  const otherTournaments = store.tournaments.filter((t) => t.id !== selected?.id)

  return (
    <div className="results-layout">
      <aside className="panel results-sidebar" data-tour="presets-sidebar">
        <div className="results-sidebar-header">
          <h2>{isSharedSession ? 'Shared Presets' : 'Tournaments'}</h2>
          <button type="button" className="add-btn" title="Add tournament" onClick={() => setShowNewTournament(true)}>
            +
          </button>
        </div>
        {isSharedSession ? (
          <p className="hint presets-shared-hint">
            These presets exist only in this session. Personal presets are not visible to others.
          </p>
        ) : null}
        {store.tournaments.length === 0 ? (
          <p className="hint">No tournaments yet.</p>
        ) : (
          <ul className="tournament-list">
            {store.tournaments.map((tournament) => (
              <li key={tournament.id}>
                <button
                  type="button"
                  className={`tournament-list-item ${selectedId === tournament.id ? 'active' : ''}`}
                  onClick={() => selectTournament(tournament.id)}
                >
                  <span className="tournament-list-name">
                    {activeId === tournament.id ? (
                      <span className="preset-active-badge">ACTIVE</span>
                    ) : null}
                    {tournament.name}
                  </span>
                  <span className="tournament-list-meta">
                    {tournament.format} · {tournament.presets.length} maps
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="panel results-main" data-tour="presets-editor">
        {!selected ? (
          <p className="hint">Select or create a tournament to edit civ presets.</p>
        ) : (
          <>
            <div className="presets-main-header">
              <div>
                <InlineEditableName
                  value={selected.name}
                  placeholder="Untitled tournament"
                  onChange={(name) => handleRename(selected.id, name)}
                />
                <span className="chip">{selected.format}</span>
                <span className="chip muted">{selected.presets.length} map presets</span>
                {selected.resultsId ? <span className="chip muted">Linked to Results</span> : null}
              </div>
              <div className="presets-main-header-actions">
                <PresetExportImportPanel
                  presets={selected.presets}
                  customMaps={selected.customMaps}
                  onChange={handlePresetChange}
                  onStatus={setEditorStatus}
                />
                <DeleteX
                  title="Delete tournament"
                  onClick={() => setDeleteTarget({ id: selected.id, name: selected.name })}
                />
              </div>
            </div>

            {otherTournaments.length > 0 ? (
              <details
                className="preset-copy-panel"
                open={copyExpanded}
                onToggle={(event) => setCopyExpanded((event.target as HTMLDetailsElement).open)}
              >
                <summary>Copy presets from another tournament</summary>
                <div className="preset-copy-panel-body">
                  <div className="preset-copy-row">
                    <label>
                      Tournament
                      <select value={copySourceId} onChange={(e) => setCopySourceId(e.target.value)}>
                        {otherTournaments.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" onClick={copySelectedMaps} disabled={!selectedCopyMaps.length}>
                      Copy selected
                    </button>
                    <button type="button" onClick={copyFromTournament} disabled={!copySourceMaps.length}>
                      Copy all
                    </button>
                  </div>
                  {copySourceMaps.length ? (
                    <div className="preset-copy-map-list">
                      {copySourceMaps.map((mapName) => (
                        <label key={mapName} className="preset-copy-map-item">
                          <input
                            type="checkbox"
                            checked={selectedCopyMaps.includes(mapName)}
                            onChange={() => toggleCopyMap(mapName)}
                          />
                          {mapName}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">No map presets in this tournament yet.</p>
                  )}
                </div>
              </details>
            ) : null}

            {copyStatus ? <p className="hint preset-status">{copyStatus}</p> : null}
            {editorStatus ? <p className="hint preset-status">{editorStatus}</p> : null}
            {aoestatsStatus ? <p className="hint preset-status">{aoestatsStatus}</p> : null}

            <MapPresetEditor
              key={selected.id}
              presets={selected.presets}
              customMaps={selected.customMaps}
              onChange={handlePresetChange}
              onCopyFromMap={(sourceMap, targetMap) => {
                onChange(copyMapPresetWithinTournament(store, selected.id, sourceMap, targetMap))
              }}
              onRemoveMap={(mapName) => {
                onChange(removeMapFromTournament(store, selected.id, mapName))
              }}
            />
          </>
        )}
      </main>

      {showNewTournament ? (
        <NewPresetTournamentModal
          onClose={() => setShowNewTournament(false)}
          onCreate={handleCreateTournament}
          onTestImport={importAoestatsTournament}
          testBusy={aoestatsBusy}
        />
      ) : null}

      {pendingResultsCreate && (
        <ConfirmModal
          title="Also create in Results?"
          message={`Create "${pendingResultsCreate.name}" (${pendingResultsCreate.format}) in the Results tab as well?`}
          confirmLabel="Yes, create in Results"
          cancelLabel="Presets only"
          onCancel={() => confirmResultsCreate(false)}
          onConfirm={() => confirmResultsCreate(true)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete tournament?"
          message={`Delete preset tournament "${deleteTarget.name}"? Map presets for this tournament will be lost.`}
          confirmLabel="Delete"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function NewPresetTournamentModal({
  onClose,
  onCreate,
  onTestImport,
  testBusy,
}: {
  onClose: () => void
  onCreate: (name: string, format: TournamentFormat, mapDraftPresetUrl: string | null) => Promise<void>
  onTestImport: (
    tournamentName: string,
    format: TournamentFormat,
    grouping: AoestatsGrouping,
  ) => Promise<void>
  testBusy: boolean
}) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState<TournamentFormat | null>(null)
  const [mapSource, setMapSource] = useState<'none' | 'preset'>('none')
  const [presetUrl, setPresetUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locked = busy || testBusy
  const canCreate =
    Boolean(format) &&
    (mapSource === 'none' || extractPresetId(presetUrl).length > 0) &&
    !locked

  const submit = async () => {
    if (!format || !canCreate) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(name, format, mapSource === 'preset' ? presetUrl.trim() : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament')
      setBusy(false)
    }
  }

  const runTestImport = async (
    tournamentName: string,
    tournamentFormat: TournamentFormat,
    grouping: AoestatsGrouping,
  ) => {
    setError(null)
    try {
      await onTestImport(tournamentName, tournamentFormat, grouping)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test import failed')
    }
  }

  return (
    <Modal title="New preset tournament" onClose={onClose}>
      <label>
        Tournament name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. King of the Desert"
          autoFocus
          disabled={locked}
        />
      </label>
      <fieldset className="format-picker">
        <legend>Format</legend>
        <div className="format-picker-grid">
          {FORMATS.map((option) => (
            <button
              key={option}
              type="button"
              className={format === option ? 'format-option active' : 'format-option'}
              onClick={() => setFormat(option)}
              disabled={locked}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
      <label>
        Map Draft Preset
        <select
          value={mapSource}
          onChange={(event) => setMapSource(event.target.value as 'none' | 'preset')}
          disabled={locked}
        >
          <option value="none">None (Arabia only)</option>
          <option value="preset">Map Draft Preset</option>
        </select>
      </label>
      {mapSource === 'preset' ? (
        <>
          <label>
            aoe2cm preset link
            <input
              value={presetUrl}
              onChange={(event) => setPresetUrl(event.target.value)}
              placeholder="https://aoe2cm.net/preset/..."
              disabled={locked}
            />
          </label>
          <p className="hint">
            Maps from the preset are loaded and empty civ presets are created for each map.
          </p>
        </>
      ) : (
        <p className="hint">Starts with a single Arabia placeholder. Add more maps later.</p>
      )}
      {error ? <p className="error">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" onClick={onClose} disabled={locked}>
          Cancel
        </button>
        <button type="button" className="accent-btn" disabled={!canCreate} onClick={() => void submit()}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>

      <div className="new-tournament-test-actions">
        <p className="hint">Quick test tournaments from aoestats.io</p>
        <div className="new-tournament-test-buttons">
          <button
            type="button"
            className="accent-btn"
            disabled={locked}
            onClick={() => void runTestImport('Test 1v1', '1v1', 'random_map')}
          >
            {testBusy ? 'Loading…' : 'Test 1v1'}
          </button>
          <button
            type="button"
            className="accent-btn"
            disabled={locked}
            onClick={() => void runTestImport('Test Teamgame', '4v4', 'team_random_map')}
          >
            {testBusy ? 'Loading…' : 'Test Teamgame'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function InlineEditableName({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  const commit = () => {
    onChange(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="inline-name-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        autoFocus
      />
    )
  }

  return (
    <strong className="inline-name" onClick={() => setEditing(true)} title="Click to rename">
      {value.trim() || placeholder}
    </strong>
  )
}

function DeleteX({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" className="delete-x" title={title} aria-label={title} onClick={onClick}>
      ×
    </button>
  )
}

function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-message">{message}</p>
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="accent-btn" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-dialog panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
