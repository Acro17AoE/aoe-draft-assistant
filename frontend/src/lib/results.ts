import type {
  GameResult,
  GameSide,
  SetDraftContext,
  SetFormat,
  Tournament,
  TournamentFormat,
  TournamentSet,
} from '../types/results'

import { readLocalKey, writeLocalKey } from './cloudStorage'
import { OPPONENT_TEAM_LABEL, YOUR_TEAM_LABEL } from './replayImport'

const STORAGE_KEY = 'aoe-draft-assistant.results'

export function normalizeSetDraftContext(raw?: SetDraftContext): SetDraftContext {
  if (!raw) return {}
  const legacy = raw.ownTeamName?.trim()
  const ingameName = raw.ingameName?.trim() || legacy || ''
  const draftName = raw.draftName?.trim() || legacy || ''
  const { ownTeamName: _legacy, ...rest } = raw
  return {
    ...rest,
    ingameName,
    draftName,
  }
}

export function draftBoardTeamName(context?: SetDraftContext): string {
  const normalized = normalizeSetDraftContext(context)
  return normalized.draftName?.trim() || normalized.ingameName?.trim() || ''
}

export function playersPerSide(format: TournamentFormat): number {
  return Number.parseInt(format[0], 10)
}

export function maxGamesForSetFormat(format: SetFormat): number {
  return Number.parseInt(format.replace(/\D/g, ''), 10)
}

export function requiresExactGameCount(format: SetFormat): boolean {
  return format.startsWith('PA')
}

export function sideLabel(format: TournamentFormat): string {
  return format === '1v1' ? 'Player' : 'Team'
}

export const SET_FORMATS: SetFormat[] = ['BO3', 'PA3', 'PA4', 'PA5', 'BO5', 'BO7', 'BO9']

export const SET_FORMAT_LABELS: Record<SetFormat, string> = {
  BO3: 'BO3',
  PA3: 'Play all 3 (PA3)',
  PA4: 'Play all 4 (PA4)',
  PA5: 'Play all 5 (PA5)',
  BO5: 'BO5',
  BO7: 'BO7',
  BO9: 'BO9',
}

export function createId(): string {
  return crypto.randomUUID()
}

function createEmptySide(playerCount: number): GameSide {
  return {
    label: '',
    members: Array.from({ length: playerCount }, () => ({ playerName: '', civ: '' })),
  }
}

export function createEmptyGame(format: TournamentFormat): GameResult {
  const count = playersPerSide(format)
  return {
    id: createId(),
    map: '',
    side1: { label: YOUR_TEAM_LABEL, members: createEmptySide(count).members },
    side2: { label: OPPONENT_TEAM_LABEL, members: createEmptySide(count).members },
    winner: null,
  }
}

export function createEmptySet(format: SetFormat, name = ''): TournamentSet {
  return {
    id: createId(),
    name: name.trim(),
    format,
    games: [],
    createdAt: new Date().toISOString(),
  }
}

export function createTournament(name: string, format: TournamentFormat): Tournament {
  return {
    id: createId(),
    name: name.trim() || 'Untitled tournament',
    format,
    sets: [],
    createdAt: new Date().toISOString(),
  }
}

export function loadTournaments(): Tournament[] {
  const raw = readLocalKey(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Array<Tournament & { draftContext?: SetDraftContext }>
    if (!Array.isArray(parsed)) return []
    return parsed.map((tournament) => {
      const legacyContext = tournament.draftContext
        ? normalizeSetDraftContext(tournament.draftContext)
        : undefined
      const { draftContext: _removed, ...rest } = tournament
      return {
        ...rest,
        sets: tournament.sets.map((set) => ({
          ...set,
          draftContext: normalizeSetDraftContext(set.draftContext ?? legacyContext),
        })),
      }
    })
  } catch {
    return []
  }
}

export function saveTournaments(tournaments: Tournament[]): void {
  writeLocalKey(STORAGE_KEY, JSON.stringify(tournaments))
  window.dispatchEvent(new CustomEvent('aoe-results-changed'))
}

export function updateTournament(
  tournaments: Tournament[],
  tournamentId: string,
  updater: (tournament: Tournament) => Tournament,
): Tournament[] {
  return tournaments.map((tournament) =>
    tournament.id === tournamentId ? updater(tournament) : tournament,
  )
}

export function canAddGame(set: TournamentSet): boolean {
  const max = maxGamesForSetFormat(set.format)
  if (set.games.length >= max) return false
  if (requiresExactGameCount(set.format) && set.games.length >= max) return false
  return true
}

export function setGameCountHint(format: SetFormat): string {
  const max = maxGamesForSetFormat(format)
  if (requiresExactGameCount(format)) {
    return `Play all ${max} games`
  }
  return `Up to ${max} games (best of ${max})`
}

export function isGameComplete(game: GameResult, format: TournamentFormat): boolean {
  if (!game.map.trim() || !game.winner) return false

  for (const sideKey of ['side1', 'side2'] as const) {
    const side = game[sideKey]
    if (!side.label.trim()) return false
    if (format === '1v1') {
      if (!side.members[0]?.civ) return false
      continue
    }
    for (const member of side.members) {
      if (!member.playerName.trim() || !member.civ) return false
    }
  }

  return true
}

export function isGameSaved(game: GameResult, format: TournamentFormat): boolean {
  if (game.saved === true) return true
  if (game.saved === false) return false
  return isGameComplete(game, format)
}

export function computeSetScore(set: TournamentSet): { side1: number; side2: number } {
  let side1 = 0
  let side2 = 0
  for (const game of set.games) {
    if (game.winner === 'side1') side1 += 1
    else if (game.winner === 'side2') side2 += 1
  }
  return { side1, side2 }
}

export function setDisplayName(set: TournamentSet, index: number): string {
  return set.name?.trim() || `Set ${index + 1}`
}

export function formatSetScore(set: TournamentSet): string {
  const { side1, side2 } = computeSetScore(set)
  if (side1 === 0 && side2 === 0) return '0-0'
  return `${side1}-${side2}`
}

export function collectSavedGames(
  tournament: Tournament,
): Array<{ game: GameResult; setIndex: number; gameIndex: number }> {
  const rows: Array<{ game: GameResult; setIndex: number; gameIndex: number }> = []
  tournament.sets.forEach((set, setIndex) => {
    set.games.forEach((game, gameIndex) => {
      if (isGameSaved(game, tournament.format)) {
        rows.push({ game, setIndex, gameIndex })
      }
    })
  })
  return rows
}

export function tournamentHasSavedResults(tournament: Tournament): boolean {
  return collectSavedGames(tournament).length > 0
}

export function tournamentsWithResults(tournaments: Tournament[]): Tournament[] {
  return tournaments.filter(tournamentHasSavedResults)
}
