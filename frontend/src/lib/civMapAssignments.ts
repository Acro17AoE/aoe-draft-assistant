import { extractDraftId } from './civs'
import { readLocalKey, writeLocalKey } from './cloudStorage'
import { assignmentTargetMatches } from './maps'
import type { CivBoardItem } from '../types/draft'

export type MapAssignmentTarget = string | 'flex'

export interface CivMapAssignmentState {
  own: Record<string, MapAssignmentTarget>
  opponent: Record<string, MapAssignmentTarget>
}

const STORAGE_KEY = 'aoe-draft-assistant.civ-map-assignments'
const ASSIGNMENT_SLOT_SEP = '@@'

function splitAssignmentTarget(target: string): { base: string; slotIndex: number | null } {
  const splitAt = target.lastIndexOf(ASSIGNMENT_SLOT_SEP)
  if (splitAt < 0) return { base: target, slotIndex: null }
  const base = target.slice(0, splitAt)
  const slotRaw = target.slice(splitAt + ASSIGNMENT_SLOT_SEP.length)
  const parsed = Number.parseInt(slotRaw, 10)
  if (!Number.isInteger(parsed) || parsed < 0) return { base: target, slotIndex: null }
  return { base, slotIndex: parsed }
}

export function mapAssignmentWithSlot(mapTarget: string, slotIndex: number): MapAssignmentTarget {
  if (!Number.isInteger(slotIndex) || slotIndex < 0) return mapTarget
  return `${mapTarget}${ASSIGNMENT_SLOT_SEP}${slotIndex}`
}

export function assignmentSlotIndex(target: MapAssignmentTarget | null | undefined): number | null {
  if (!target || target === 'flex') return null
  return splitAssignmentTarget(target).slotIndex
}

export function assignMapTarget(
  target: MapAssignmentTarget,
  maps: string[],
): MapAssignmentTarget | null {
  if (target === 'flex') return 'flex'
  const { base, slotIndex } = splitAssignmentTarget(target)
  const matched = maps.find((map) => assignmentTargetMatches(map, base))
  if (!matched) return null
  return slotIndex == null ? matched : mapAssignmentWithSlot(matched, slotIndex)
}

export function resolveAssignmentTarget(
  target: MapAssignmentTarget | null | undefined,
  maps: string[],
): MapAssignmentTarget | null {
  if (!target) return null
  if (target === 'flex') return 'flex'
  const { base } = splitAssignmentTarget(target)
  return maps.find((map) => assignmentTargetMatches(map, base)) ?? null
}

export function isFlexAssignment(
  target: MapAssignmentTarget | null | undefined,
  maps: string[],
): boolean {
  const resolved = resolveAssignmentTarget(target, maps)
  return resolved == null || resolved === 'flex'
}

export function picksForMap(
  picks: CivBoardItem[],
  slotKey: string,
  assignments: Record<string, MapAssignmentTarget>,
  maps: string[],
): CivBoardItem[] {
  const assigned = picks
    .map((pick) => ({ pick, target: assignments[pick.id] }))
    .filter(({ target }) => {
      const resolved = resolveAssignmentTarget(target, maps)
      return resolved != null && resolved !== 'flex' && assignmentTargetMatches(resolved, slotKey)
    })

  assigned.sort((a, b) => {
    const aSlot = assignmentSlotIndex(a.target)
    const bSlot = assignmentSlotIndex(b.target)
    if (aSlot == null && bSlot == null) return 0
    if (aSlot == null) return 1
    if (bSlot == null) return -1
    return aSlot - bSlot
  })

  return assigned.map(({ pick }) => pick)
}

export function picksInFlex(
  picks: CivBoardItem[],
  assignments: Record<string, MapAssignmentTarget>,
  maps: string[],
): CivBoardItem[] {
  return picks.filter((pick) => isFlexAssignment(assignments[pick.id], maps))
}

export function countAssignmentsForMap(
  pickIds: string[],
  slotKey: string,
  assignments: Record<string, MapAssignmentTarget>,
  maps: string[],
): number {
  return pickIds.filter((pickId) => {
    const target = resolveAssignmentTarget(assignments[pickId], maps)
    return target != null && target !== 'flex' && assignmentTargetMatches(target, slotKey)
  }).length
}

export function getSaturatedMaps(
  maps: string[],
  pickIds: string[],
  assignments: Record<string, MapAssignmentTarget>,
  civsPerMap: number,
): string[] {
  if (civsPerMap <= 0) return []
  return maps.filter((map) => countAssignmentsForMap(pickIds, map, assignments, maps) >= civsPerMap)
}

function storageKeyForDraft(civDraftUrl: string): string {
  const id = extractDraftId(civDraftUrl)
  return id || civDraftUrl.trim()
}

export function loadCivMapAssignments(civDraftUrl: string): CivMapAssignmentState {
  if (!civDraftUrl.trim()) return emptyAssignments()
  const raw = readLocalKey(STORAGE_KEY)
  if (!raw) return emptyAssignments()
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<CivMapAssignmentState>>
    const entry = parsed[storageKeyForDraft(civDraftUrl)]
    return normalizeAssignments(entry)
  } catch {
    return emptyAssignments()
  }
}

export function loadAllCivMapAssignmentDocuments(): Record<string, CivMapAssignmentState> {
  const raw = readLocalKey(STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<CivMapAssignmentState>>
    return Object.fromEntries(
      Object.entries(parsed).map(([draftKey, entry]) => [draftKey, normalizeAssignments(entry)]),
    )
  } catch {
    return {}
  }
}

export function mergeCivMapAssignmentDocuments(
  current: Record<string, Partial<CivMapAssignmentState>>,
  incoming: Record<string, Partial<CivMapAssignmentState>>,
): Record<string, CivMapAssignmentState> {
  const merged: Record<string, CivMapAssignmentState> = {}

  for (const draftKey of new Set([...Object.keys(current), ...Object.keys(incoming)])) {
    const currentEntry = normalizeAssignments(current[draftKey])
    const incomingEntry = normalizeAssignments(incoming[draftKey])
    merged[draftKey] = {
      own: { ...currentEntry.own, ...incomingEntry.own },
      opponent: { ...currentEntry.opponent, ...incomingEntry.opponent },
    }
  }

  return merged
}

export function saveCivMapAssignments(civDraftUrl: string, state: CivMapAssignmentState): void {
  if (!civDraftUrl.trim()) return
  const parsed = loadAllCivMapAssignmentDocuments()
  parsed[storageKeyForDraft(civDraftUrl)] = state
  writeLocalKey(STORAGE_KEY, JSON.stringify(parsed))
}

export function pruneAssignments(
  state: CivMapAssignmentState,
  ownPickIds: string[],
  opponentPickIds: string[],
): CivMapAssignmentState {
  const ownIds = new Set(ownPickIds)
  const opponentIds = new Set(opponentPickIds)
  const own: Record<string, MapAssignmentTarget> = {}
  const opponent: Record<string, MapAssignmentTarget> = {}

  for (const [civId, target] of Object.entries(state.own)) {
    if (ownIds.has(civId)) own[civId] = target
  }
  for (const [civId, target] of Object.entries(state.opponent)) {
    if (opponentIds.has(civId)) opponent[civId] = target
  }

  return { own, opponent }
}

function emptyAssignments(): CivMapAssignmentState {
  return { own: {}, opponent: {} }
}

function normalizeAssignments(raw?: Partial<CivMapAssignmentState>): CivMapAssignmentState {
  return {
    own: sanitizeAssignmentMap(raw?.own),
    opponent: sanitizeAssignmentMap(raw?.opponent),
  }
}

function sanitizeAssignmentMap(
  raw?: Record<string, unknown>,
): Record<string, MapAssignmentTarget> {
  if (!raw) return {}
  const result: Record<string, MapAssignmentTarget> = {}
  for (const [civId, target] of Object.entries(raw)) {
    if (typeof target === 'string') result[civId] = target
  }
  return result
}
