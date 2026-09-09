import { LOCAL_STORAGE_KEYS, readLocalKey, writeLocalKey } from './cloudStorage'
import type { CivPriorityEntry } from '../types/draft'
import type { TierMakerList, TierMakerStore } from '../types/tiermaker'
import { normalizeTierEntries } from './tiers'

export const TIERMAKER_STORE_CHANGED = 'aoe-tiermaker-store-changed'

function newId(): string {
  return crypto.randomUUID()
}

export function createEmptyTierMakerList(partial?: Partial<TierMakerList>): TierMakerList {
  const now = new Date().toISOString()
  return {
    id: partial?.id ?? newId(),
    title: partial?.title?.trim() || 'Untitled tier list',
    mapName: partial?.mapName?.trim() || 'Arabia',
    entries: partial?.entries ? stripMarkers(normalizeTierEntries(partial.entries)) : [],
    updatedAt: partial?.updatedAt ?? now,
  }
}

export function stripMarkers(entries: CivPriorityEntry[]): CivPriorityEntry[] {
  return entries.map((entry) => {
    const next: CivPriorityEntry = {
      civId: entry.civId,
      tier: entry.tier,
      tierRank: entry.tierRank,
      reason: entry.reason,
    }
    if (entry.poolIds?.length) next.poolIds = entry.poolIds
    else if (entry.poolId) next.poolId = entry.poolId
    return next
  })
}

function defaultStore(): TierMakerStore {
  const list = createEmptyTierMakerList({ title: 'My tier list', mapName: 'Arabia' })
  return { version: 1, activeId: list.id, lists: [list] }
}

function normalizeStore(raw: Partial<TierMakerStore> | null | undefined): TierMakerStore {
  if (!raw || !Array.isArray(raw.lists) || raw.lists.length === 0) {
    return defaultStore()
  }
  const lists = raw.lists.map((item) =>
    createEmptyTierMakerList({
      id: typeof item.id === 'string' ? item.id : newId(),
      title: typeof item.title === 'string' ? item.title : 'Untitled tier list',
      mapName: typeof item.mapName === 'string' ? item.mapName : 'Arabia',
      entries: Array.isArray(item.entries) ? item.entries : [],
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
    }),
  )
  const activeId =
    typeof raw.activeId === 'string' && lists.some((list) => list.id === raw.activeId)
      ? raw.activeId
      : lists[0].id
  return { version: 1, activeId, lists }
}

export function loadTierMakerStore(): TierMakerStore {
  const raw = readLocalKey(LOCAL_STORAGE_KEYS.TIERMAKER_LISTS)
  if (!raw) return defaultStore()
  try {
    return normalizeStore(JSON.parse(raw) as Partial<TierMakerStore>)
  } catch {
    return defaultStore()
  }
}

export function saveTierMakerStore(store: TierMakerStore): void {
  const normalized = normalizeStore(store)
  writeLocalKey(LOCAL_STORAGE_KEYS.TIERMAKER_LISTS, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(TIERMAKER_STORE_CHANGED))
}

export function getActiveTierMakerList(store: TierMakerStore): TierMakerList | null {
  if (!store.lists.length) return null
  return store.lists.find((list) => list.id === store.activeId) ?? store.lists[0] ?? null
}

export function upsertTierMakerList(store: TierMakerStore, list: TierMakerList): TierMakerStore {
  const nextList = createEmptyTierMakerList({
    ...list,
    updatedAt: new Date().toISOString(),
  })
  const exists = store.lists.some((item) => item.id === nextList.id)
  return {
    version: 1,
    activeId: nextList.id,
    lists: exists
      ? store.lists.map((item) => (item.id === nextList.id ? nextList : item))
      : [nextList, ...store.lists],
  }
}

export function deleteTierMakerList(store: TierMakerStore, id: string): TierMakerStore {
  const lists = store.lists.filter((list) => list.id !== id)
  if (!lists.length) {
    const created = createEmptyTierMakerList({ title: 'My tier list', mapName: 'Arabia' })
    return { version: 1, activeId: created.id, lists: [created] }
  }
  const activeId = store.activeId === id ? lists[0].id : store.activeId
  return { version: 1, activeId, lists }
}
