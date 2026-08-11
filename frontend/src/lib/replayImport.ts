import { playersPerSide } from './results'
import { namesMatch } from './nameUtils'
import type { GameResult, TournamentFormat } from '../types/results'

export const YOUR_TEAM_LABEL = 'Your Team'
export const OPPONENT_TEAM_LABEL = 'Opponent Team'

export interface ParsedReplayMember {
  name: string
  civ: string
  won: boolean
}

export interface ParsedReplayTeam {
  members: ParsedReplayMember[]
  won: boolean
}

export interface ParsedReplayGame {
  fileName: string
  error: string | null
  map: string
  playersPerSide: number
  teams: ParsedReplayTeam[]
  bytesReceived?: number
  expectedBytes?: number | null
}

export interface ParsedReplaySetResponse {
  games: ParsedReplayGame[]
}

const REPLAY_EXTENSIONS = ['.aoe2record', '.mgz', '.mgx', '.mgl']

export function isReplayFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  return REPLAY_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export async function parseReplaySet(
  files: File[],
  format: TournamentFormat,
): Promise<ParsedReplaySetResponse> {
  const tooSmall = files.filter((file) => file.size < 256)
  if (tooSmall.length) {
    throw new Error(
      `These files look empty or incomplete: ${tooSmall.map((file) => file.name).join(', ')}`,
    )
  }

  const form = new FormData()
  for (const file of files) {
    form.append('files', file, file.name)
  }
  const perSide = playersPerSide(format)
  const response = await fetch(`/api/replay/parse-set?players_per_side=${perSide}`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    let message = 'Failed to parse replays'
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) message = body.detail
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return response.json() as Promise<ParsedReplaySetResponse>
}

function findYourTeamIndex(teams: ParsedReplayTeam[], yourName: string): number | null {
  const trimmed = yourName.trim()
  if (!trimmed) return null
  for (let index = 0; index < teams.length; index += 1) {
    if (teams[index].members.some((member) => namesMatch(member.name, trimmed))) {
      return index
    }
  }
  return null
}

function teamToSide(members: ParsedReplayMember[], format: TournamentFormat, label: string): GameResult['side1'] {
  const count = playersPerSide(format)
  const slots = Array.from({ length: count }, (_, index) => {
    const member = members[index]
    return {
      playerName: member?.name ?? '',
      civ: member?.civ ?? '',
    }
  })
  return { label, members: slots }
}

export interface ParsedReplayDraftEntry {
  game: GameResult
  warning?: string
  bytesReceived?: number
  expectedBytes?: number | null
}

function draftMeta(parsed: ParsedReplayGame) {
  return {
    bytesReceived: parsed.bytesReceived,
    expectedBytes: parsed.expectedBytes ?? null,
  }
}

export function parsedReplayToGameResult(
  parsed: ParsedReplayGame,
  yourName: string,
  format: TournamentFormat,
  existingId?: string,
): ParsedReplayDraftEntry {
  const id = existingId ?? crypto.randomUUID()
  const meta = draftMeta(parsed)

  if (parsed.error) {
    return {
      ...meta,
      game: {
        id,
        map: parsed.map,
        replayFileName: parsed.fileName,
        side1: teamToSide([], format, YOUR_TEAM_LABEL),
        side2: teamToSide([], format, OPPONENT_TEAM_LABEL),
        winner: null,
      },
      warning: parsed.error,
    }
  }

  const yourIndex = findYourTeamIndex(parsed.teams, yourName)
  if (yourIndex === null) {
    return {
      ...meta,
      game: {
        id,
        map: parsed.map,
        replayFileName: parsed.fileName,
        side1: teamToSide(parsed.teams[0]?.members ?? [], format, YOUR_TEAM_LABEL),
        side2: teamToSide(parsed.teams[1]?.members ?? [], format, OPPONENT_TEAM_LABEL),
        winner: null,
      },
      warning: `Could not match "${yourName.trim()}" to a player in this replay`,
    }
  }

  const opponentIndex = yourIndex === 0 ? 1 : 0
  const yourTeam = parsed.teams[yourIndex]
  const opponentTeam = parsed.teams[opponentIndex]
  const yourWon = yourTeam.won

  return {
    ...meta,
    game: {
      id,
      map: parsed.map,
      replayFileName: parsed.fileName,
      side1: teamToSide(yourTeam.members, format, YOUR_TEAM_LABEL),
      side2: teamToSide(opponentTeam.members, format, OPPONENT_TEAM_LABEL),
      winner: yourWon ? 'side1' : opponentTeam.won ? 'side2' : null,
    },
    warning: !yourWon && !opponentTeam.won ? 'No clear winner in replay' : undefined,
  }
}

export function buildGamesFromParsedSet(
  parsedGames: ParsedReplayGame[],
  yourName: string,
  format: TournamentFormat,
  existingGames: GameResult[] = [],
): ParsedReplayDraftEntry[] {
  return parsedGames.map((parsed, index) =>
    parsedReplayToGameResult(parsed, yourName, format, existingGames[index]?.id),
  )
}
