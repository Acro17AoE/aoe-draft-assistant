import type { MapPriorityPreset } from './draft'
import type { TournamentFormat } from './results'

export interface PresetTournament {
  id: string
  name: string
  format: TournamentFormat
  resultsId?: string
  presets: MapPriorityPreset[]
  customMaps: string[]
  createdAt: string
}

export interface PresetTournamentStore {
  version: 2
  activeTournamentId: string | null
  tournaments: PresetTournament[]
}
