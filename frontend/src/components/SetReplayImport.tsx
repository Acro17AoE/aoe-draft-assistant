import { useCallback, useEffect, useMemo, useState } from 'react'
import { AOE2_CIVS, civIconUrl } from '../lib/civs'
import { DEFAULT_MAPS, resolveMapDisplay } from '../lib/maps'
import {
  buildGamesFromParsedSet,
  isReplayFile,
  OPPONENT_TEAM_LABEL,
  parseReplaySet,
  YOUR_TEAM_LABEL,
  type ParsedReplayDraftEntry,
  type ParsedReplayGame,
} from '../lib/replayImport'
import {
  isGameComplete,
  maxGamesForSetFormat,
  requiresExactGameCount,
  setGameCountHint,
} from '../lib/results'
import type { GameResult, SetFormat, TournamentFormat } from '../types/results'

interface SetReplayImportProps {
  format: TournamentFormat
  setFormat: SetFormat
  games: GameResult[]
  ingameName: string
  onConfirm: (games: GameResult[]) => void
  onCancel?: () => void
}

type ImportPhase = 'upload' | 'preview'

export function SetReplayImport({
  format,
  setFormat,
  games,
  ingameName,
  onConfirm,
  onCancel,
}: SetReplayImportProps) {
  const maxGames = maxGamesForSetFormat(setFormat)
  const startsEmpty = games.length === 0

  const [phase, setPhase] = useState<ImportPhase>(startsEmpty ? 'upload' : 'preview')
  const [orderedFiles, setOrderedFiles] = useState<File[]>([])
  const [parsedGames, setParsedGames] = useState<ParsedReplayGame[] | null>(null)
  const [draftEntries, setDraftEntries] = useState<ParsedReplayDraftEntry[]>(() =>
    games.map((game) => ({ game })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rebuildFromParsed = useCallback(
    (parsed: ParsedReplayGame[], name: string) => {
      setDraftEntries(buildGamesFromParsedSet(parsed, name, format, games))
    },
    [format, games],
  )

  useEffect(() => {
    if (parsedGames && ingameName.trim()) {
      rebuildFromParsed(parsedGames, ingameName)
    }
  }, [ingameName, parsedGames, rebuildFromParsed])

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList?.length) return
    const incoming = Array.from(fileList).filter(isReplayFile)
    if (!incoming.length) {
      setError('No valid replay files selected (.aoe2record)')
      return
    }
    setError(null)
    setOrderedFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`))
      const merged = [...prev]
      for (const file of incoming) {
        const key = `${file.name}:${file.size}:${file.lastModified}`
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(file)
        }
      }
      return merged.slice(0, maxGames)
    })
  }

  const moveFile = (index: number, direction: -1 | 1) => {
    setOrderedFiles((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const removeFile = (index: number) => {
    setOrderedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAnalyze = async () => {
    if (!ingameName.trim()) {
      setError('Enter your ingame name above so we can match your team.')
      return
    }
    if (!orderedFiles.length) {
      setError('Add at least one replay file.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await parseReplaySet(orderedFiles, format)
      setParsedGames(response.games)
      setDraftEntries(buildGamesFromParsedSet(response.games, ingameName, format, games))
      const failed = response.games.filter((game) => game.error)
      if (failed.length === response.games.length) {
        setError(
          failed[0]?.error ??
            'All replays failed to parse. Use .aoe2record files (not ZIP) and redeploy the API if this is a new server build.',
        )
      } else if (failed.length) {
        setError(`${failed.length} replay(s) could not be parsed — review warnings below.`)
      }
      setPhase('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse replays')
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = () => {
    const completeGames = draftEntries.map((entry) => ({ ...entry.game, saved: true }))
    const completeCount = completeGames.filter((game) => isGameComplete(game, format)).length
    if (completeCount !== completeGames.length) {
      setError('Fix incomplete games before saving.')
      return
    }
    if (requiresExactGameCount(setFormat) && completeGames.length !== maxGames) {
      setError(`This set format requires exactly ${maxGames} games.`)
      return
    }
    if (!requiresExactGameCount(setFormat) && completeGames.length > maxGames) {
      setError(`At most ${maxGames} games allowed for ${setFormat}.`)
      return
    }
    onConfirm(completeGames)
  }

  const allComplete = useMemo(
    () => draftEntries.every((entry) => isGameComplete(entry.game, format)),
    [draftEntries, format],
  )

  const countValid = requiresExactGameCount(setFormat)
    ? draftEntries.length === maxGames
    : draftEntries.length > 0 && draftEntries.length <= maxGames

  if (phase === 'upload') {
    return (
      <div className="set-replay-import">
        <p className="hint set-replay-hint">
          Upload replay files in game order ({setGameCountHint(setFormat)}). Files are parsed on the
          server and discarded immediately — nothing is stored.
        </p>

        <div className="set-replay-file-actions">
          <label className="set-replay-file-btn">
            Add replay files
            <input
              type="file"
              accept=".aoe2record,.mgz,.mgx,.mgl"
              multiple
              hidden
              onChange={(e) => {
                handleFilesSelected(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          {orderedFiles.length > 0 ? (
            <span className="hint">
              {orderedFiles.length}/{maxGames} selected
            </span>
          ) : null}
        </div>

        {orderedFiles.length > 0 ? (
          <ol className="set-replay-file-list">
            {orderedFiles.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                <span className="set-replay-file-index">G{index + 1}</span>
                <span className="set-replay-file-name" title={file.name}>
                  {file.name}
                </span>
                <div className="set-replay-file-order">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveFile(index, -1)}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === orderedFiles.length - 1}
                    onClick={() => moveFile(index, 1)}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => removeFile(index)} title="Remove">
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="hint layer-empty-hint">No replay files yet.</p>
        )}

        {error ? <p className="set-replay-error">{error}</p> : null}

        <div className="set-replay-actions">
          {!startsEmpty && onCancel ? (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="accent-btn"
            disabled={busy || !ingameName.trim() || orderedFiles.length === 0}
            onClick={() => void handleAnalyze()}
          >
            {busy ? 'Importing…' : 'Import Results'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="set-replay-import set-replay-preview">
      <div className="set-replay-preview-header">
        <button type="button" onClick={() => setPhase('upload')}>
          {parsedGames ? 'Re-upload replays' : 'Upload replays'}
        </button>
      </div>

      <p className="hint">
        Review parsed games below. Team labels are fixed as <strong>{YOUR_TEAM_LABEL}</strong> and{' '}
        <strong>{OPPONENT_TEAM_LABEL}</strong> based on your ingame name.
      </p>

      <div className="set-replay-preview-list">
        {draftEntries.map((entry, index) => (
          <ReplayGamePreviewCard
            key={entry.game.id}
            game={entry.game}
            gameIndex={index}
            format={format}
            warning={entry.warning}
            bytesReceived={entry.bytesReceived}
            expectedBytes={entry.expectedBytes}
            onChange={(game) =>
              setDraftEntries((prev) =>
                prev.map((item, i) => (i === index ? { ...item, game, warning: undefined } : item)),
              )
            }
          />
        ))}
      </div>

      {error ? <p className="set-replay-error">{error}</p> : null}

      <div className="set-replay-actions">
        {!startsEmpty && onCancel ? (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className="accent-btn"
          disabled={!allComplete || !countValid}
          onClick={handleConfirm}
        >
          Save set results
        </button>
      </div>
    </div>
  )
}

function ReplayGamePreviewCard({
  game,
  gameIndex,
  format,
  warning,
  bytesReceived,
  expectedBytes,
  onChange,
}: {
  game: GameResult
  gameIndex: number
  format: TournamentFormat
  warning?: string
  bytesReceived?: number
  expectedBytes?: number | null
  onChange: (game: GameResult) => void
}) {
  const mapDisplay = resolveMapDisplay(game.map)

  const updateMember = (
    sideKey: 'side1' | 'side2',
    memberIndex: number,
    patch: Partial<GameResult['side1']['members'][0]>,
  ) => {
    const side = game[sideKey]
    onChange({
      ...game,
      [sideKey]: {
        ...side,
        members: side.members.map((member, index) =>
          index === memberIndex ? { ...member, ...patch } : member,
        ),
      },
    })
  }

  return (
    <article className="game-card game-card-edit replay-preview-card">
      <div className="replay-game-layout">
        <div className="replay-game-map">
          {mapDisplay.imageUrl ? (
            <img src={mapDisplay.imageUrl} alt="" className="replay-map-thumb" />
          ) : (
            <div className="replay-map-thumb replay-map-thumb-empty" aria-hidden />
          )}
        </div>

        <div className="replay-game-content">
          <div className="game-card-header">
            <div>
              <h4>Game {gameIndex + 1}</h4>
              {game.replayFileName ? (
                <p className="replay-file-name" title={game.replayFileName}>
                  {game.replayFileName}
                </p>
              ) : null}
            </div>
          </div>

          {warning ? (
            <p className="set-replay-warning">
              {warning}
              {bytesReceived != null &&
              expectedBytes != null &&
              expectedBytes > 0 &&
              bytesReceived !== expectedBytes ? (
                <span className="replay-byte-hint">
                  {' '}
                  (received {bytesReceived.toLocaleString()} bytes / {expectedBytes.toLocaleString()}{' '}
                  expected)
                </span>
              ) : null}
            </p>
          ) : null}

          <label>
            Map
            <input
              list={`maps-preview-${game.id}`}
              value={game.map}
              onChange={(e) => onChange({ ...game, map: e.target.value })}
              placeholder="Map name"
            />
            <datalist id={`maps-preview-${game.id}`}>
              {DEFAULT_MAPS.map((map) => (
                <option key={map} value={map} />
              ))}
            </datalist>
          </label>

          <div className="game-sides">
            {(['side1', 'side2'] as const).map((sideKey) => {
              const side = game[sideKey]
              return (
                <div key={sideKey} className="game-side replay-preview-side">
                  <div className="replay-team-label">{side.label}</div>
                  <div className="replay-member-list">
                    {side.members.map((member, memberIndex) => (
                      <div key={memberIndex} className="replay-member-line">
                        {member.civ ? (
                          <img src={civIconUrl(member.civ)} alt="" className="replay-civ-icon" />
                        ) : (
                          <span className="replay-civ-icon replay-civ-icon-empty" aria-hidden />
                        )}
                        <CivSelect
                          value={member.civ}
                          onChange={(civ) => updateMember(sideKey, memberIndex, { civ })}
                        />
                        {format !== '1v1' ? (
                          <input
                            className="replay-player-input"
                            value={member.playerName}
                            placeholder="Player"
                            aria-label={`${side.label} player ${memberIndex + 1}`}
                            onChange={(e) =>
                              updateMember(sideKey, memberIndex, { playerName: e.target.value })
                            }
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <label>
            Winner
            <select
              value={game.winner ?? ''}
              onChange={(e) =>
                onChange({
                  ...game,
                  winner: e.target.value === '' ? null : (e.target.value as 'side1' | 'side2'),
                })
              }
            >
              <option value="">—</option>
              <option value="side1">{YOUR_TEAM_LABEL}</option>
              <option value="side2">{OPPONENT_TEAM_LABEL}</option>
            </select>
          </label>
        </div>
      </div>
    </article>
  )
}

function CivSelect({ value, onChange }: { value: string; onChange: (civ: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {AOE2_CIVS.map((civ) => (
        <option key={civ} value={civ}>
          {civ}
        </option>
      ))}
    </select>
  )
}

export function SavedGameSummary({
  game,
  gameIndex,
  format,
}: {
  game: GameResult
  gameIndex: number
  format: TournamentFormat
}) {
  const mapDisplay = resolveMapDisplay(game.map)
  return (
    <article className="game-card game-card-compact saved-game-summary">
      <div className="replay-game-layout replay-game-layout-compact">
        <div className="replay-game-map">
          {mapDisplay.imageUrl ? (
            <img src={mapDisplay.imageUrl} alt="" className="replay-map-thumb" />
          ) : (
            <div className="replay-map-thumb replay-map-thumb-empty" aria-hidden />
          )}
        </div>

        <div className="replay-game-content">
          <div className="game-compact-title">
            <strong>{game.map || `Game ${gameIndex + 1}`}</strong>
            <span className="hint">Game {gameIndex + 1}</span>
            {game.replayFileName ? (
              <span className="replay-file-name compact" title={game.replayFileName}>
                {game.replayFileName}
              </span>
            ) : null}
          </div>

          <div className="game-compact-sides">
            <CompactSide side={game.side1} format={format} winner={game.winner === 'side1'} />
            <span className="vs">vs</span>
            <CompactSide side={game.side2} format={format} winner={game.winner === 'side2'} />
          </div>
        </div>
      </div>
    </article>
  )
}

function CompactSide({
  side,
  format,
  winner,
}: {
  side: GameResult['side1']
  format: TournamentFormat
  winner: boolean
}) {
  const members = side.members.filter((member) => member.civ || member.playerName)
  return (
    <div className={`compact-side ${winner ? 'winner' : ''}`}>
      <div className="compact-side-title">{side.label}</div>
      <div className="replay-member-list">
        {members.map((member, index) => (
          <div key={`${member.civ}-${member.playerName}-${index}`} className="replay-member-line readonly">
            {member.civ ? (
              <img src={civIconUrl(member.civ)} alt="" className="replay-civ-icon" />
            ) : (
              <span className="replay-civ-icon replay-civ-icon-empty" aria-hidden />
            )}
            <span className="replay-member-civ">{member.civ || '—'}</span>
            {format !== '1v1' && member.playerName ? (
              <span className="replay-member-player">{member.playerName}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
