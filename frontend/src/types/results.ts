export type TournamentFormat = '1v1' | '2v2' | '3v3' | '4v4'

export type SetFormat = 'BO3' | 'PA3' | 'PA4' | 'PA5' | 'BO5' | 'BO7' | 'BO9'

export type GameWinner = 'side1' | 'side2' | null

export interface GameMember {
  playerName: string
  civ: string
}

export interface GameSide {
  label: string
  members: GameMember[]
}

export interface GameResult {
  id: string
  map: string
  replayFileName?: string
  side1: GameSide
  side2: GameSide
  winner: GameWinner
  saved?: boolean
}

export interface TournamentSet {
  id: string
  name?: string
  format: SetFormat
  games: GameResult[]
  createdAt: string
  draftContext?: SetDraftContext
}

export type MapSourceMode = 'draft' | 'single-map' | 'select'

export interface SetDraftContext {
  /** In-game name for replay team matching (may differ from draft display name). */
  ingameName?: string
  /** Name as registered on aoe2cm for civ/map draft boards. */
  draftName?: string
  /** @deprecated Migrated to ingameName / draftName on load */
  ownTeamName?: string
  civDraftUrl?: string
  mapSource?: MapSourceMode
  mapDraftUrl?: string
  singleMap?: string
  selectedMaps?: string[]
}

/** @deprecated Use SetDraftContext on TournamentSet */
export type TournamentDraftContext = SetDraftContext

export interface Tournament {
  id: string
  name: string
  format: TournamentFormat
  sets: TournamentSet[]
  createdAt: string
}

export interface ResultsBundle {
  version: 1
  tournaments: Tournament[]
}
