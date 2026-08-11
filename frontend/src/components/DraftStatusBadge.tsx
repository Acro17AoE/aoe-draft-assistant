import type { DraftStatus } from '../lib/draftStatus'

const LABELS: Record<DraftStatus, string> = {
  live: 'live',
  finished: 'finished',
  no_draft: 'no draft',
  not_started: 'not started',
}

export function DraftStatusBadge({ status }: { status: DraftStatus }) {
  return <span className={`draft-status draft-status-${status}`}>{LABELS[status]}</span>
}
