import { extractDraftId } from './civs'
import { readLocalKey, writeLocalKey } from './cloudStorage'

const STORAGE_KEY = 'aoe-draft-assistant.prepared-bans'

export interface PreparedBanDraftEntry {
  civIds: string[]
  locked?: boolean
}

function storageKeyForDraft(civDraftUrl: string): string {
  const id = extractDraftId(civDraftUrl)
  return id || civDraftUrl.trim()
}

function readStore(): Record<string, PreparedBanDraftEntry | string[]> {
  const raw = readLocalKey(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, PreparedBanDraftEntry | string[]>
  } catch {
    return {}
  }
}

function normalizeEntry(raw: PreparedBanDraftEntry | string[] | undefined): PreparedBanDraftEntry {
  if (!raw) return { civIds: [], locked: false }
  if (Array.isArray(raw)) {
    return {
      civIds: raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
      locked: false,
    }
  }
  return {
    civIds: Array.isArray(raw.civIds)
      ? raw.civIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    locked: Boolean(raw.locked),
  }
}

export function loadPreparedBanEntry(civDraftUrl: string): PreparedBanDraftEntry {
  if (!civDraftUrl.trim()) return { civIds: [], locked: false }
  const parsed = readStore()
  return normalizeEntry(parsed[storageKeyForDraft(civDraftUrl)])
}

export function loadPreparedBans(civDraftUrl: string): string[] {
  return loadPreparedBanEntry(civDraftUrl).civIds
}

export function savePreparedBanEntry(civDraftUrl: string, entry: PreparedBanDraftEntry): void {
  if (!civDraftUrl.trim()) return
  const parsed = readStore()
  parsed[storageKeyForDraft(civDraftUrl)] = entry
  writeLocalKey(STORAGE_KEY, JSON.stringify(parsed))
}

export function savePreparedBans(civDraftUrl: string, civIds: string[]): void {
  const current = loadPreparedBanEntry(civDraftUrl)
  savePreparedBanEntry(civDraftUrl, { ...current, civIds })
}

export function trimPreparedBans(civIds: string[], maxSlots: number): string[] {
  if (maxSlots <= 0) return []
  return civIds.slice(0, maxSlots)
}
