import type { Aoe2cmDraft, DraftSide } from '../types/draft'
import { resolveSide } from './draftState'

interface ParsedDraftTurn {
  player: DraftSide | 'NONE'
  action: string
}

function parseDraftTurn(turn: unknown): ParsedDraftTurn | null {
  if (!turn || typeof turn !== 'object') return null
  const item = turn as {
    player?: string
    executingPlayer?: string
    action?: string
  }
  const playerRaw = (item.executingPlayer ?? item.player ?? 'NONE').toUpperCase()
  const player =
    playerRaw === 'HOST' || playerRaw === 'GUEST' ? (playerRaw as DraftSide) : ('NONE' as const)
  const action = (item.action ?? '').toUpperCase()
  if (!action) return null
  return { player, action }
}

export function isBanTurn(turn: unknown): boolean {
  return parseDraftTurn(turn)?.action === 'BAN'
}

export function countOwnBanSlots(draft: Aoe2cmDraft, ownTeamName: string): number {
  const turns = draft.preset?.turns
  if (!turns?.length) return 0
  const { own } = resolveSide(draft, ownTeamName)
  return turns.filter((turn) => {
    const parsed = parseDraftTurn(turn)
    return parsed?.action === 'BAN' && parsed.player === own
  }).length
}

export function isBanPhaseComplete(draft: Aoe2cmDraft | null): boolean {
  if (!draft) return false
  const turns = draft.preset?.turns
  if (!turns?.length) return false

  let lastBanIndex = -1
  for (let index = 0; index < turns.length; index += 1) {
    if (isBanTurn(turns[index])) lastBanIndex = index
  }
  if (lastBanIndex < 0) return true
  return draft.nextAction > lastBanIndex
}
