import { getAuthToken } from './cloudStorage'

export type AnalyticsEventType = 'page_view' | 'civ_draft'

/** Fire-and-forget usage event. Failures are ignored. */
export function trackAnalyticsEvent(eventType: AnalyticsEventType, meta?: string): void {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`

  void fetch('/api/analytics/event', {
    method: 'POST',
    headers,
    body: JSON.stringify({ event_type: eventType, meta: meta ?? null }),
    keepalive: true,
  }).catch(() => {
    // analytics must never break the app
  })
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
