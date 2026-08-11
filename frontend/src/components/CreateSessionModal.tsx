import { useMemo, useState } from 'react'
import type { PresetImportOptions } from '../lib/cloudStorage'
import { loadPersonalPresetStore } from '../lib/presetTournaments'

interface CreateSessionModalProps {
  initialName: string
  creating: boolean
  onClose: () => void
  onCreate: (name: string, presetImport: PresetImportOptions) => void
}

export function CreateSessionModal({ initialName, creating, onClose, onCreate }: CreateSessionModalProps) {
  const [name, setName] = useState(initialName)
  const [importMode, setImportMode] = useState<PresetImportOptions['mode']>('none')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const personalTournaments = useMemo(() => loadPersonalPresetStore().tournaments, [])

  const toggleTournament = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const handleSubmit = () => {
    const presetImport: PresetImportOptions =
      importMode === 'selected'
        ? { mode: 'selected', tournamentIds: selectedIds }
        : { mode: importMode }
    onCreate(name.trim() || 'Draft session', presetImport)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal create-session-modal"
        role="dialog"
        aria-labelledby="create-session-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="create-session-title">Create shared session</h2>
        <p className="hint">
          Draft data and Shared Presets sync with everyone in this session. Your personal presets stay
          private unless you import them below.
        </p>

        <label>
          Session name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. KOTD Civ Draft"
          />
        </label>

        <fieldset className="create-session-import">
          <legend>Import into Shared Presets</legend>
          <label className="create-session-import-option">
            <input
              type="radio"
              name="preset-import"
              checked={importMode === 'none'}
              onChange={() => setImportMode('none')}
            />
            Start empty (Arabia placeholder only)
          </label>
          <label className="create-session-import-option">
            <input
              type="radio"
              name="preset-import"
              checked={importMode === 'all'}
              onChange={() => setImportMode('all')}
              disabled={!personalTournaments.length}
            />
            Import all personal tournaments ({personalTournaments.length})
          </label>
          <label className="create-session-import-option">
            <input
              type="radio"
              name="preset-import"
              checked={importMode === 'selected'}
              onChange={() => setImportMode('selected')}
              disabled={!personalTournaments.length}
            />
            Import selected tournaments
          </label>
          {importMode === 'selected' && personalTournaments.length > 0 ? (
            <ul className="create-session-import-list">
              {personalTournaments.map((tournament) => (
                <li key={tournament.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(tournament.id)}
                      onChange={() => toggleTournament(tournament.id)}
                    />
                    {tournament.name}
                    <span className="chip muted">
                      {tournament.format} · {tournament.presets.length} maps
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button
            type="button"
            className="accent-btn"
            disabled={creating || (importMode === 'selected' && !selectedIds.length)}
            onClick={handleSubmit}
          >
            {creating ? 'Creating…' : 'Create session'}
          </button>
        </div>
      </div>
    </div>
  )
}
