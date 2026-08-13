import { extractDraftId } from './civs'
import { readLocalKey, writeLocalKey } from './cloudStorage'

const STORAGE_KEY = 'aoe-draft-assistant.prepared-bans'

function storageKeyForDraft(civDraftUrl: string): string {
  const id = extractDraftId(civDraftUrl)
  return id || civDraftUrl.trim()
}

export function loadPreparedBans(civDraftUrl: string): string[] {
  if (!civDraftUrl.trim()) return []
  const raw = readLocalKey(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const entry = parsed[storageKeyForDraft(civDraftUrl)]
    if (!Array.isArray(entry)) return []
    return entry.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

export function savePreparedBans(civDraftUrl: string, civIds: string[]): void {
  if (!civDraftUrl.trim()) return
  const parsed = (() => {
    const raw = readLocalKey(STORAGE_KEY)
    if (!raw) return {} as Record<string, string[]>
    try {
      return JSON.parse(raw) as Record<string, string[]>
    } catch {
      return {}
    }
  })()
  parsed[storageKeyForDraft(civDraftUrl)] = civIds
  writeLocalKey(STORAGE_KEY, JSON.stringify(parsed))
}

export function trimPreparedBans(civIds: string[], maxSlots: number): string[] {
  if (maxSlots <= 0) return []
  return civIds.slice(0, maxSlots)
}
