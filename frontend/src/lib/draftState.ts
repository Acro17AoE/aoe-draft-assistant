import type {
  Aoe2cmDraft,
  CivBoardItem,
  CivPriorityEntry,
  DraftItemStatus,
  DraftSide,
  MapBoardItem,
  MapPickDisplay,
  PriorityTier,
} from '../types/draft'
import { AOE2_CIVS, civIconUrl } from './civs'
import { compareCivBoardItems } from './priorities'
import { PRIORITY_TIERS } from './tiers'
import { reasonPartsToPlainText, reasonPartsToTooltip } from './priorityReason'
import { mapIconUrl, normalizeMapName } from './maps'

export function resolveSide(
  draft: Aoe2cmDraft,
  ownTeamName: string,
): { own: DraftSide; opponent: DraftSide } {
  const host = (draft.nameHost ?? '').trim().toLowerCase()
  const guest = (draft.nameGuest ?? '').trim().toLowerCase()
  const own = ownTeamName.trim().toLowerCase()

  if (own === host) return { own: 'HOST', opponent: 'GUEST' }
  if (own === guest) return { own: 'GUEST', opponent: 'HOST' }
  return { own: 'HOST', opponent: 'GUEST' }
}

function eventActor(event: { player?: string; executingPlayer?: string }): DraftSide | 'NONE' {
  return (event.executingPlayer ?? event.player ?? 'NONE').toUpperCase() as DraftSide | 'NONE'
}

function isAdminEvent(event: { player?: string; executingPlayer?: string }): boolean {
  const player = (event.player ?? 'NONE').toUpperCase()
  const executing = (event.executingPlayer ?? 'NONE').toUpperCase()
  return player === 'NONE' && executing === 'NONE'
}

function applyDraftEvents(
  events: Aoe2cmDraft['events'],
  sides: { own: DraftSide; opponent: DraftSide },
): Map<string, { status: DraftItemStatus; pickIndex?: number }> {
  const statusById = new Map<string, { status: DraftItemStatus; pickIndex?: number }>()
  let ownPickCount = 0
  let opponentPickCount = 0
  let adminPickCount = 0

  for (const event of events ?? []) {
    const action = (event.actionType ?? event.action ?? '').toLowerCase()
    if (!['pick', 'ban', 'snipe', 'steal'].includes(action)) continue

    const optionId = event.chosenOptionId
    if (!optionId) continue

    if (action === 'ban' || action === 'snipe') {
      statusById.set(optionId, { status: 'banned' })
      continue
    }

    const actor = eventActor(event)
    if (action === 'pick' || action === 'steal') {
      if (isAdminEvent(event)) {
        statusById.set(optionId, { status: 'admin_pick', pickIndex: adminPickCount })
        adminPickCount += 1
      } else if (actor === sides.own) {
        statusById.set(optionId, { status: 'own_pick', pickIndex: ownPickCount })
        ownPickCount += 1
      } else if (actor === sides.opponent) {
        statusById.set(optionId, { status: 'opponent_pick', pickIndex: opponentPickCount })
        opponentPickCount += 1
      }
    }
  }

  return statusById
}

function buildCivOptionMap(draft: Aoe2cmDraft): Map<string, { name: string; imageUrl: string }> {
  const map = new Map<string, { name: string; imageUrl: string }>()
  for (const option of draft.preset?.draftOptions ?? []) {
    const imageUrl = civIconUrl(option.name, option.imageUrls?.unit ?? option.imageUrls?.emblem)
    map.set(option.id, { name: option.name, imageUrl })
    map.set(option.name, { name: option.name, imageUrl })
  }
  for (const civ of AOE2_CIVS) {
    if (!map.has(civ)) {
      map.set(civ, { name: civ, imageUrl: civIconUrl(civ) })
    }
  }
  return map
}

function buildMapOptionMap(draft: Aoe2cmDraft): Map<string, { name: string; imageUrl?: string }> {
  const map = new Map<string, { name: string; imageUrl?: string }>()
  for (const option of draft.preset?.draftOptions ?? []) {
    const imageUrl = mapIconUrl(option)
    map.set(option.id, { name: option.name, imageUrl })
    map.set(option.name, { name: option.name, imageUrl })
  }
  return map
}

function collectMapPool(draft: Aoe2cmDraft): string[] {
  if (draft.preset?.draftOptions?.length) {
    return draft.preset.draftOptions.map((option) => option.id)
  }

  const fromEvents = new Set<string>()
  for (const event of draft.events ?? []) {
    if (event.chosenOptionId) fromEvents.add(event.chosenOptionId)
  }
  return [...fromEvents].sort((a, b) => a.localeCompare(b))
}

export function extractOwnMapPicks(draft: Aoe2cmDraft, ownTeamName: string): string[] {
  const sides = resolveSide(draft, ownTeamName)
  const picks: string[] = []

  for (const event of draft.events ?? []) {
    const action = (event.actionType ?? event.action ?? '').toLowerCase()
    if (action !== 'pick' && action !== 'steal') continue
    if (eventActor(event) !== sides.own) continue
    if (event.chosenOptionId) picks.push(event.chosenOptionId)
  }

  return picks
}

export function resolveMapPickDisplays(
  mapDraft: Aoe2cmDraft | null,
  pickKeys: string[],
): MapPickDisplay[] {
  const optionMap = mapDraft ? buildMapOptionMap(mapDraft) : new Map<string, { name: string; imageUrl?: string }>()

  return pickKeys.map((key) => {
    const meta = optionMap.get(key) ?? {
      name: key,
      imageUrl: mapIconUrl({ id: key.toLowerCase().replace(/\s+/g, '-'), name: key }),
    }
    return {
      id: key,
      name: meta.name,
      imageUrl: meta.imageUrl,
    }
  })
}

export function extractAllMapPicks(draft: Aoe2cmDraft): string[] {
  const optionMap = buildMapOptionMap(draft)
  const seen = new Set<string>()
  const picks: string[] = []

  for (const event of draft.events ?? []) {
    const action = (event.actionType ?? event.action ?? '').toLowerCase()
    if (action !== 'pick' && action !== 'steal') continue

    const optionId = event.chosenOptionId
    if (!optionId) continue

    const displayName = optionMap.get(optionId)?.name ?? optionId
    const key = normalizeMapName(displayName)
    if (!key || seen.has(key)) continue

    seen.add(key)
    picks.push(displayName)
  }

  return picks
}

export function deriveMapBoard(draft: Aoe2cmDraft, ownTeamName: string): MapBoardItem[] {
  const sides = resolveSide(draft, ownTeamName)
  const optionMap = buildMapOptionMap(draft)
  const statusById = applyDraftEvents(draft.events, sides)
  const pool = collectMapPool(draft)

  const items: MapBoardItem[] = pool.map((optionId) => {
    const meta = optionMap.get(optionId) ?? { name: optionId }
    const state = statusById.get(optionId) ?? statusById.get(meta.name) ?? { status: 'available' as DraftItemStatus }

    return {
      id: optionId,
      name: meta.name,
      imageUrl: meta.imageUrl,
      status: state.status,
      pickIndex: state.pickIndex,
    }
  })

  return sortDraftBoard(items)
}

export function deriveCivBoard(
  draft: Aoe2cmDraft,
  ownTeamName: string,
  priorities: CivPriorityEntry[] = [],
): CivBoardItem[] {
  const sides = resolveSide(draft, ownTeamName)
  const optionMap = buildCivOptionMap(draft)
  const priorityByCiv = new Map(priorities.map((entry) => [entry.civId, entry]))
  const statusById = applyDraftEvents(draft.events, sides)

  const allCivIds = draft.preset?.draftOptions?.length
    ? draft.preset.draftOptions.map((option) => option.id)
    : [...AOE2_CIVS]

  const items: CivBoardItem[] = allCivIds.map((civId) => {
    const meta = optionMap.get(civId) ?? { name: civId, imageUrl: civIconUrl(civId) }
    const state = statusById.get(civId) ?? statusById.get(meta.name) ?? { status: 'available' as DraftItemStatus }
    const priority = priorityByCiv.get(civId) ?? priorityByCiv.get(meta.name)

    return {
      id: civId,
      name: meta.name,
      imageUrl: meta.imageUrl,
      status: state.status,
      pickIndex: state.pickIndex,
      priorityTier: priority?.tier,
      priorityTierRank: priority?.tierRank,
      priorityPoolId: priority?.poolId ?? priority?.poolIds?.[0],
      priorityPoolOrder: priority?.poolOrder,
      priorityReasonParts: priority?.reasonParts,
      priorityReason:
        priority?.reason ??
        (priority?.reasonParts ? reasonPartsToPlainText(priority.reasonParts) : undefined),
      priorityReasonTooltip: priority?.reasonParts
        ? reasonPartsToTooltip(priority.reasonParts)
        : undefined,
    }
  })

  return sortDraftBoard(items)
}

export function sortDraftBoard<T extends {
  status: DraftItemStatus
  name: string
  pickIndex?: number
  priorityTier?: PriorityTier
  priorityTierRank?: number
  priorityPoolOrder?: number
  priorityReasonParts?: CivBoardItem['priorityReasonParts']
}>(items: T[]): T[] {
  const available = items
    .filter((item) => item.status === 'available')
    .sort((a, b) => compareCivBoardItems(a, b))

  const ownPicks = items
    .filter((item) => item.status === 'own_pick')
    .sort((a, b) => (a.pickIndex ?? 0) - (b.pickIndex ?? 0))

  const opponentPicks = items
    .filter((item) => item.status === 'opponent_pick')
    .sort((a, b) => (a.pickIndex ?? 0) - (b.pickIndex ?? 0))

  const adminPicks = items
    .filter((item) => item.status === 'admin_pick')
    .sort((a, b) => (a.pickIndex ?? 0) - (b.pickIndex ?? 0))

  const banned = items
    .filter((item) => item.status === 'banned')
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...available, ...ownPicks, ...opponentPicks, ...adminPicks, ...banned]
}

export function flattenAvailableByRanking(items: CivBoardItem[]): CivBoardItem[] {
  return flattenAvailableByPriority(items)
}

export function flattenAvailableByPriority(items: CivBoardItem[]): CivBoardItem[] {
  const clusters = clusterAvailableByPriority(items)
  const order: (PriorityTier | 'none')[] = [...PRIORITY_TIERS, 'none']
  return order.flatMap((tier) => clusters.get(tier) ?? [])
}

export function clusterAvailableByPriority(items: CivBoardItem[]): Map<PriorityTier | 'none', CivBoardItem[]> {
  const available = items.filter((item) => item.status === 'available')
  const clusters = new Map<PriorityTier | 'none', CivBoardItem[]>()

  for (const item of available) {
    const key = item.priorityTier ?? 'none'
    const bucket = clusters.get(key) ?? []
    bucket.push(item)
    clusters.set(key, bucket)
  }

  for (const [key, bucket] of clusters) {
    bucket.sort(compareCivBoardItems)
    clusters.set(key, bucket)
  }

  return clusters
}
