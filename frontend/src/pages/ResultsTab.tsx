import { useEffect, useState, type ReactNode } from 'react'
import { CLOUD_HYDRATED, cloudHydratedIncludesKey, DOC_KEYS, LOCAL_STORAGE_KEYS, resolvedStorageKey } from '../lib/cloudStorage'
import { SavedGameSummary, SetReplayImport } from '../components/SetReplayImport'
import { SetDraftContextEditor, SetDraftContextSummary } from '../components/SetDraftContextEditor'
import { SetPlayerIdentityPanel } from '../components/SetPlayerIdentityPanel'
import {
  createEmptySet,
  createTournament,
  formatSetScore,
  isGameSaved,
  loadTournaments,
  maxGamesForSetFormat,
  saveTournaments,
  setDisplayName,
  setGameCountHint,
  updateTournament,
} from '../lib/results'
import type { GameResult, SetFormat, Tournament, TournamentFormat, TournamentSet } from '../types/results'

const FORMATS: TournamentFormat[] = ['1v1', '2v2', '3v3', '4v4']
const SET_FORMATS: SetFormat[] = ['BO3', 'PA3', 'PA4', 'PA5', 'BO5', 'BO7', 'BO9']
const TOURNAMENT_ICON = '/tournament-icon.png'
const SET_ICON = '/set-icon.png'

type ResultsEntityIconVariant = 'panel' | 'list' | 'list-active' | 'block'

function ResultsEntityIcon({
  src,
  label,
  variant = 'block',
}: {
  src: string
  label: string
  variant?: ResultsEntityIconVariant
}) {
  return (
    <span className={`results-entity-icon-wrap results-entity-icon-wrap--${variant}`}>
      <img src={src} alt="" className="results-entity-icon" aria-hidden title={label} />
    </span>
  )
}

export function useResultsState() {
  const [tournaments, setTournaments] = useState<Tournament[]>(() => loadTournaments())

  useEffect(() => {
    const refresh = () => setTournaments(loadTournaments())
    const onHydrated = (event: Event) => {
      if (!cloudHydratedIncludesKey(event, DOC_KEYS.RESULTS)) return
      refresh()
    }
    window.addEventListener('aoe-results-changed', refresh)
    window.addEventListener(CLOUD_HYDRATED, onHydrated)
    window.addEventListener('storage', (event) => {
      if (event.key === resolvedStorageKey(LOCAL_STORAGE_KEYS.RESULTS)) refresh()
    })
    return () => {
      window.removeEventListener('aoe-results-changed', refresh)
      window.removeEventListener(CLOUD_HYDRATED, onHydrated)
    }
  }, [])

  const persist = (next: Tournament[]) => {
    saveTournaments(next)
    setTournaments(next)
  }

  return { tournaments, setTournaments: persist }
}

interface ResultsTabProps {
  tournaments: Tournament[]
  onChange: (tournaments: Tournament[]) => void
}

type DeleteTarget =
  | { kind: 'tournament'; id: string; label: string }
  | { kind: 'set'; id: string; label: string }
  | null

export function ResultsTab({ tournaments, onChange }: ResultsTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => tournaments[0]?.id ?? null)
  const [showNewTournament, setShowNewTournament] = useState(false)
  const [showNewSet, setShowNewSet] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [tournamentOpen, setTournamentOpen] = useState(true)
  const [openSets, setOpenSets] = useState<Record<string, boolean>>({})
  const [editingSets, setEditingSets] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (selectedId && !tournaments.some((t) => t.id === selectedId)) {
      setSelectedId(tournaments[0]?.id ?? null)
    }
  }, [tournaments, selectedId])

  const selected = tournaments.find((t) => t.id === selectedId) ?? null

  const patchTournament = (tournamentId: string, updater: (t: Tournament) => Tournament) => {
    onChange(updateTournament(tournaments, tournamentId, updater))
  }

  const handleCreateTournament = (name: string, format: TournamentFormat) => {
    const created = createTournament(name, format)
    onChange([created, ...tournaments])
    setSelectedId(created.id)
    setTournamentOpen(true)
    setShowNewTournament(false)
  }

  const handleCreateSet = (name: string, format: SetFormat) => {
    if (!selected) return
    const set = createEmptySet(format, name)
    patchTournament(selected.id, (t) => ({ ...t, sets: [...t.sets, set] }))
    setOpenSets((prev) => ({ ...prev, [set.id]: true }))
    setShowNewSet(false)
  }

  const confirmDelete = () => {
    if (!deleteTarget) return

    if (deleteTarget.kind === 'tournament') {
      onChange(tournaments.filter((t) => t.id !== deleteTarget.id))
    } else if (deleteTarget.kind === 'set' && selected) {
      patchTournament(selected.id, (t) => ({
        ...t,
        sets: t.sets.filter((s) => s.id !== deleteTarget.id),
      }))
    }
    setDeleteTarget(null)
  }

  const handleReplaceSetGames = (setId: string, games: GameResult[]) => {
    if (!selected) return
    patchTournament(selected.id, (t) => ({
      ...t,
      sets: t.sets.map((s) => (s.id === setId ? { ...s, games } : s)),
    }))
    setEditingSets((prev) => ({ ...prev, [setId]: false }))
  }

  const handleUpdateSet = (setId: string, patch: Partial<TournamentSet>) => {
    if (!selected) return
    patchTournament(selected.id, (t) => ({
      ...t,
      sets: t.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
    }))
  }


  const handleRenameTournament = (name: string) => {
    if (!selected) return
    patchTournament(selected.id, (t) => ({ ...t, name: name.trim() || t.name }))
  }

  return (
    <div className="results-layout">
      <aside className="panel results-sidebar">
        <div className="results-sidebar-header">
          <h2>
            <ResultsEntityIcon src={TOURNAMENT_ICON} label="Tournament" variant="panel" />
            Tournaments
          </h2>
          <AddBtn title="Add tournament" onClick={() => setShowNewTournament(true)} />
        </div>
        {tournaments.length === 0 ? (
          <p className="hint">No tournaments yet.</p>
        ) : (
          <ul className="tournament-list">
            {tournaments.map((tournament) => (
              <li key={tournament.id}>
                <button
                  type="button"
                  className={`tournament-list-item ${selectedId === tournament.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(tournament.id)}
                >
                  <ResultsEntityIcon
                    src={TOURNAMENT_ICON}
                    label="Tournament"
                    variant={selectedId === tournament.id ? 'list-active' : 'list'}
                  />
                  <span className="tournament-list-copy">
                    <span className="tournament-list-name">{tournament.name}</span>
                    <span className="tournament-list-meta">
                      {tournament.format} · {tournament.sets.length} sets
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="panel results-main">
        {!selected ? (
          <p className="hint">Select or create a tournament.</p>
        ) : (
          <CollapsibleBlock
            open={tournamentOpen}
            onToggle={() => setTournamentOpen((v) => !v)}
            onDelete={() =>
              setDeleteTarget({
                kind: 'tournament',
                id: selected.id,
                label: selected.name,
              })
            }
            addButton={<AddBtn title="Add set" onClick={() => setShowNewSet(true)} />}
            summary={
              <>
                <ResultsEntityIcon src={TOURNAMENT_ICON} label="Tournament" variant="block" />
                <InlineEditableName
                  value={selected.name}
                  placeholder="Untitled tournament"
                  onChange={handleRenameTournament}
                />
                <span className="chip">{selected.format}</span>
                <span className="chip muted">{selected.sets.length} sets</span>
              </>
            }
          >
            {selected.sets.length === 0 ? (
              <p className="hint layer-empty-hint">No sets yet.</p>
            ) : (
              <div className="set-list">
                {selected.sets.map((set, setIndex) => (
                  <SetBlock
                    key={set.id}
                    set={set}
                    setIndex={setIndex}
                    format={selected.format}
                    open={openSets[set.id] ?? false}
                    onToggle={() => setOpenSets((prev) => ({ ...prev, [set.id]: !prev[set.id] }))}
                    onRename={(name) => handleUpdateSet(set.id, { name })}
                    onDeleteSet={() =>
                      setDeleteTarget({
                        kind: 'set',
                        id: set.id,
                        label: setDisplayName(set, setIndex),
                      })
                    }
                    onReplaceGames={(games) => handleReplaceSetGames(set.id, games)}
                    editing={editingSets[set.id] ?? set.games.length === 0}
                    onStartEdit={() => setEditingSets((prev) => ({ ...prev, [set.id]: true }))}
                    onCancelEdit={() => setEditingSets((prev) => ({ ...prev, [set.id]: false }))}
                    onDraftContextChange={(draftContext) =>
                      handleUpdateSet(set.id, { draftContext })
                    }
                  />
                ))}
              </div>
            )}
          </CollapsibleBlock>
        )}
      </main>

      {showNewTournament && (
        <NewTournamentModal
          onClose={() => setShowNewTournament(false)}
          onCreate={handleCreateTournament}
        />
      )}

      {showNewSet && (
        <NewSetModal onClose={() => setShowNewSet(false)} onCreate={handleCreateSet} />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.kind}?`}
          message={`Are you sure you want to delete "${deleteTarget.label}"? This cannot be undone.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

function CollapseChevron({ open }: { open: boolean }) {
  return (
    <svg
      className="collapsible-chevron-icon"
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden
    >
      {open ? (
        <path
          d="M3.5 6.25 8 10.75 12.5 6.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M6.25 3.5 10.75 8 6.25 12.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function CollapsibleBlock({
  open,
  onToggle,
  summary,
  onDelete,
  addButton,
  headerAction,
  children,
  className = '',
}: {
  open: boolean
  onToggle: () => void
  summary: ReactNode
  onDelete?: () => void
  addButton?: ReactNode
  headerAction?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`collapsible-block ${open ? 'open' : 'collapsed'} ${className}`}>
      <div className="collapsible-grid">
        <button
          type="button"
          className="collapsible-chevron"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <CollapseChevron open={open} />
        </button>
        <div className="collapsible-summary">{summary}</div>
        <div className="collapsible-header-actions">
          {headerAction}
          {open && onDelete ? <DeleteX title="Delete" onClick={onDelete} /> : null}
        </div>

        {open && (
          <>
            <div className="collapsible-toolbar-left">{addButton}</div>
            <div className="collapsible-toolbar-spacer" />
            <div className="collapsible-toolbar-right" />
          </>
        )}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  )
}

function AddBtn({
  title,
  onClick,
  disabled = false,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="add-btn"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      +
    </button>
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

  useEffect(() => {
    setDraft(value)
  }, [value])

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
        onClick={(e) => e.stopPropagation()}
        autoFocus
      />
    )
  }

  return (
    <strong
      className="inline-name"
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      title="Click to rename"
    >
      {value.trim() || placeholder}
    </strong>
  )
}

function DeleteX({
  title,
  onClick,
  className = '',
}: {
  title: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={`delete-x ${className}`.trim()}
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      ×
    </button>
  )
}

function ConfirmModal({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-message">{message}</p>
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="danger-confirm-btn" onClick={onConfirm}>
          Delete
        </button>
      </div>
    </Modal>
  )
}

function NewTournamentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (name: string, format: TournamentFormat) => void
}) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState<TournamentFormat | null>(null)

  return (
    <Modal title="New tournament" onClose={onClose}>
      <label>
        Tournament name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. King of the Desert"
          autoFocus
        />
      </label>
      <FormatPicker label="Format" options={FORMATS} value={format} onChange={setFormat} />
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="accent-btn"
          disabled={!format}
          onClick={() => format && onCreate(name, format)}
        >
          Create
        </button>
      </div>
    </Modal>
  )
}

function NewSetModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (name: string, format: SetFormat) => void
}) {
  const [name, setName] = useState('')
  const [format, setFormat] = useState<SetFormat | null>(null)

  return (
    <Modal title="New set" onClose={onClose}>
      <label>
        Set name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Grand Final"
          autoFocus
        />
      </label>
      <FormatPicker label="Set format" options={SET_FORMATS} value={format} onChange={setFormat} />
      {format && <p className="hint">{setGameCountHint(format)}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="accent-btn"
          disabled={!format}
          onClick={() => format && onCreate(name, format)}
        >
          Create
        </button>
      </div>
    </Modal>
  )
}

function FormatPicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  value: T | null
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="format-picker">
      <legend>{label}</legend>
      <div className="format-picker-grid">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={value === option ? 'format-option active' : 'format-option'}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function SetBlock({
  set,
  setIndex,
  format,
  open,
  onToggle,
  onRename,
  onDeleteSet,
  onReplaceGames,
  editing,
  onStartEdit,
  onCancelEdit,
  onDraftContextChange,
}: {
  set: TournamentSet
  setIndex: number
  format: TournamentFormat
  open: boolean
  onToggle: () => void
  onRename: (name: string) => void
  onDeleteSet: () => void
  onReplaceGames: (games: GameResult[]) => void
  editing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onDraftContextChange: (draftContext: TournamentSet['draftContext']) => void
}) {
  const maxGames = maxGamesForSetFormat(set.format)
  const score = formatSetScore(set)
  const displayName = setDisplayName(set, setIndex)
  const savedGames = set.games.filter((game) => isGameSaved(game, format))
  const configuring = editing || savedGames.length === 0

  return (
    <CollapsibleBlock
      className="set-block"
      open={open}
      onToggle={onToggle}
      onDelete={onDeleteSet}
      headerAction={
        !editing ? (
          <button
            type="button"
            className="set-header-action-btn"
            onClick={(event) => {
              event.stopPropagation()
              onStartEdit()
            }}
          >
            {savedGames.length ? 'Edit / re-import' : 'Import results'}
          </button>
        ) : null
      }
      summary={
        <>
          <ResultsEntityIcon src={SET_ICON} label="Set" variant="block" />
          <InlineEditableName
            value={set.name ?? ''}
            placeholder={displayName}
            onChange={onRename}
          />
          <span className="chip">{set.format}</span>
          <span className="chip score">{score}</span>
          <span className="chip muted">
            {savedGames.length}/{maxGames}
          </span>
        </>
      }
    >
      <SetPlayerIdentityPanel
        value={set.draftContext}
        readonly={!configuring}
        onChange={(draftContext) => onDraftContextChange(draftContext)}
      />

      {configuring ? (
        <SetDraftContextEditor
          datalistId={`set-draft-maps-${set.id}`}
          value={set.draftContext}
          onChange={(draftContext) => onDraftContextChange(draftContext)}
        />
      ) : (
        <SetDraftContextSummary value={set.draftContext} />
      )}

      {editing ? (
        <SetReplayImport
          key={`${set.id}-${editing}-${set.games.length}`}
          format={format}
          setFormat={set.format}
          games={set.games}
          ingameName={set.draftContext?.ingameName ?? ''}
          onConfirm={onReplaceGames}
          onCancel={savedGames.length > 0 ? onCancelEdit : undefined}
        />
      ) : (
        <div className="set-saved-results">
          {savedGames.length === 0 ? (
            <p className="hint layer-empty-hint">No games recorded yet.</p>
          ) : (
            <div className="game-list">
              {savedGames.map((game, gameIndex) => (
                <SavedGameSummary key={game.id} game={game} gameIndex={gameIndex} format={format} />
              ))}
            </div>
          )}
        </div>
      )}
    </CollapsibleBlock>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
