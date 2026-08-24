import { getActiveWorkspaceId, getAuthToken } from './cloudStorage'

export type AnalyticsEventType = 'page_view' | 'civ_draft' | 'map_draft'

export interface DraftAnalyticsPayload {
  civDraftId?: string
  mapDraftId?: string
}

/** Fire-and-forget usage event. Failures are ignored. */
export function trackAnalyticsEvent(
  eventType: AnalyticsEventType,
  meta?: string,
  draft?: DraftAnalyticsPayload,
): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`

  void fetch('/api/analytics/event', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event_type: eventType,
      meta: meta ?? null,
      civ_draft_id: draft?.civDraftId ?? null,
      map_draft_id: draft?.mapDraftId ?? null,
      workspace_id: getActiveWorkspaceId() ?? null,
    }),
    keepalive: true,
  }).catch(() => {
    // analytics must never break the app
  })
}

const TRACKED_DRAFT_PAYLOAD_KEY = 'aoe-draft-assistant.tracked-draft-payloads'

function rememberPayload(key: string): boolean {
  try {
    const raw = sessionStorage.getItem(TRACKED_DRAFT_PAYLOAD_KEY)
    const seen = raw ? (JSON.parse(raw) as unknown) : []
    const ids = Array.isArray(seen) ? seen.filter((item): item is string => typeof item === 'string') : []
    if (ids.includes(key)) return false
    ids.push(key)
    sessionStorage.setItem(TRACKED_DRAFT_PAYLOAD_KEY, JSON.stringify(ids))
  } catch {
    return true
  }
  return true
}

/** Record a civ draft once per aoe2cm draft id (Go, URL swap, or shared-session sync). */
export function trackCivDraftStarted(draftId: string, mapDraftId?: string): void {
  const id = draftId.trim()
  if (id.length < 4) return
  const mapId = mapDraftId?.trim() && mapDraftId.trim().length >= 4 ? mapDraftId.trim() : ''
  const workspaceId = getActiveWorkspaceId() ?? ''
  const key = `civ:${id}|map:${mapId}|ws:${workspaceId}`
  if (!rememberPayload(key)) return
  trackAnalyticsEvent('civ_draft', id, { civDraftId: id, mapDraftId: mapId || undefined })
}

/** Record a map draft when a live aoe2cm map link is used. */
export function trackMapDraftStarted(draftId: string): void {
  const id = draftId.trim()
  if (id.length < 4) return
  const workspaceId = getActiveWorkspaceId() ?? ''
  const key = `map:${id}|ws:${workspaceId}`
  if (!rememberPayload(key)) return
  trackAnalyticsEvent('map_draft', id, { mapDraftId: id })
}

const PAGE_VIEW_SESSION_KEY = 'aoe-draft-assistant.page-view-tracked'

/** Track one page view per browser tab session. */
export function trackPageViewOnce(): void {
  try {
    if (sessionStorage.getItem(PAGE_VIEW_SESSION_KEY)) return
    sessionStorage.setItem(PAGE_VIEW_SESSION_KEY, '1')
  } catch {
    // private mode / blocked storage — still count this load
  }
  trackAnalyticsEvent('page_view')
}
