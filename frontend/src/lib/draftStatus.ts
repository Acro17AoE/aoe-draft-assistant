import type { Aoe2cmDraft } from '../types/draft'

export type DraftStatus = 'live' | 'finished' | 'no_draft' | 'not_started'

export function deriveDraftStatus(
  draft: Aoe2cmDraft | null,
  streamError: string | null,
): DraftStatus | null {
  if (streamError) return 'no_draft'
  if (!draft) return null

  const events = draft.events ?? []
  const turnCount = draft.preset?.turns?.length ?? 0

  if (events.length === 0 && draft.nextAction === 0) {
    return 'not_started'
  }

  if (turnCount > 0 && draft.nextAction >= turnCount) {
    return 'finished'
  }

  return 'live'
}
