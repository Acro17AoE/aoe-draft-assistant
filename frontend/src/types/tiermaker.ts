import type { CivPriorityEntry } from './draft'

export interface TierMakerList {
  id: string
  title: string
  mapName: string
  entries: CivPriorityEntry[]
  updatedAt: string
}

export interface TierMakerStore {
  version: 1
  activeId: string | null
  lists: TierMakerList[]
}
