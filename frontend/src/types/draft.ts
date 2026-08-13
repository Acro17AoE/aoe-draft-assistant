export type DraftSide = 'HOST' | 'GUEST'

export type DraftItemStatus = 'available' | 'own_pick' | 'opponent_pick' | 'admin_pick' | 'banned'

export type PriorityTier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

export interface DraftOption {
  id: string
  name: string
  imageUrls?: {
    unit?: string
    emblem?: string
  }
}

export interface DraftEvent {
  player?: string
  executingPlayer?: string
  actionType?: string
  action?: string
  chosenOptionId?: string
}

export interface Aoe2cmDraft {
  nextAction: number
  events: DraftEvent[]
  nameHost?: string
  nameGuest?: string
  preset?: {
    name?: string
    draftOptions?: DraftOption[]
    encodedCivilisations?: string
    turns?: unknown[]
  }
}

export interface MapPickDisplay {
  id: string
  name: string
  imageUrl?: string
}

export interface PriorityReasonPart {
  mapName: string
  tier: PriorityTier
  note?: string
}

export interface CivBoardItem {
  id: string
  name: string
  imageUrl: string
  status: DraftItemStatus
  pickIndex?: number
  priorityTier?: PriorityTier
  /** Lower = stronger preference within the displayed tier. */
  priorityTierRank?: number
  priorityPoolId?: string
  priorityPoolRank?: number
  /** Lower = earlier pool in preset pool list. */
  priorityPoolOrder?: number
  priorityReasonParts?: PriorityReasonPart[]
  priorityReason?: string
  priorityReasonTooltip?: string
}

export interface MapBoardItem {
  id: string
  name: string
  imageUrl?: string
  status: DraftItemStatus
  pickIndex?: number
}

export interface CivPoolDefinition {
  id: string
  name: string
  /** Max civs from this pool assignable on this map (Advanced presets). */
  maxPicks?: number
}

export interface CivPriorityEntry {
  civId: string
  tier?: PriorityTier
  /** Order within the tier row — 0 = leftmost / best, higher = worse. */
  tierRank?: number
  /** Pools this civ belongs to (a civ may be in multiple pools). */
  poolIds?: string[]
  /** @deprecated Prefer poolIds — migrated on normalize/save */
  poolId?: string
  /** Order within the pool row — 0 = leftmost / best. */
  poolRank?: number
  /** Resolved order index from preset pool list (runtime merge). */
  poolOrder?: number
  /** Mark as a key civ for draft recommendations (double-click in Presets). */
  keyCiv?: boolean
  /** Mark as a nemesis civ — highlighted in prepared bans (double-click cycle in Presets). */
  nemesisCiv?: boolean
  /** @deprecated Legacy import only — stripped on save */
  points?: number
  reason?: string
  reasonParts?: PriorityReasonPart[]
}

export interface MapPriorityPreset {
  id: string
  name: string
  mapName: string
  entries: CivPriorityEntry[]
  /** When enabled, civs can be grouped into custom pools for a second sort dimension. */
  advancedMode?: boolean
  pools?: CivPoolDefinition[]
  updatedAt: string
}

export interface PresetBundle {
  version: 1
  maps: string[]
  presets: MapPriorityPreset[]
}

import type { SetFormat } from './results'

export type MapDraftMode = 'standard' | 'single-map' | 'select'

/** @deprecated Use SetFormat from results */
export type SingleMapFormat = SetFormat

export interface MapSessionConfig {
  mode?: MapDraftMode
  mapDraftUrl: string
  ownTeamName: string
  /** Liquipedia/tournament opponent for pre-draft scouting (optional). */
  opponentTeamName?: string
  singleMap?: string
  singleMapFormat?: SetFormat
  selectFormat?: SetFormat
  selectedMaps?: string[]
  started?: boolean
}

export interface CivSessionConfig {
  civDraftUrl: string
  started?: boolean
}

export interface TournamentSuggestion {
  tournamentId: string
  name: string
  score: number
  reason: string
}

export interface MapInsight {
  map: string
  playedCount: number
  opponentPickCount: number
  opponentBanCount: number
  tags: string[]
  score: number
}

export interface MapAnalysisResponse {
  ownSide: DraftSide
  opponentSide: DraftSide
  nameHost: string
  nameGuest: string
  ownMapPicks: string[]
  tournamentStatsAvailable: boolean
  draftAnalysis: {
    opponentPicks: string[]
    opponentBans: string[]
    prioMaps: string[]
    antiPrioMaps: string[]
  }
  mapInsights: MapInsight[]
}
