import { useEffect, useRef } from 'react'
import {
  applyWorkspaceDocumentUpdate,
  getAuthToken,
  type WorkspaceDocumentPayload,
} from './cloudStorage'

function buildWorkspaceStreamUrl(workspaceId: string, token: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ token })
  return `${protocol}//${window.location.host}/api/workspaces/${workspaceId}/stream?${params}`
}

const RECONNECT_BASE_MS = 1500
const RECONNECT_MAX_MS = 15000

export function useWorkspaceStream(workspaceId: string | null | undefined, enabled: boolean) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!enabled || !workspaceId) return undefined

    let stopped = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0

    const scheduleReconnect = () => {
      if (stopped || !enabledRef.current) return
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
      attempt += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    const connect = () => {
      if (stopped || !enabledRef.current) return

      const token = getAuthToken()
      if (!token) {
        scheduleReconnect()
        return
      }

      ws = new WebSocket(buildWorkspaceStreamUrl(workspaceId, token))

      ws.onopen = () => {
        if (stopped) return
        attempt = 0
      }

      ws.onmessage = (event) => {
        if (stopped) return
        try {
          const doc = JSON.parse(event.data as string) as WorkspaceDocumentPayload
          if (doc.key && doc.content != null && doc.updated_at) {
            applyWorkspaceDocumentUpdate(doc)
          }
        } catch {
          console.warn('Invalid workspace update from server')
        }
      }

      ws.onerror = () => {
        if (stopped) return
      }

      ws.onclose = () => {
        if (stopped) return
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [workspaceId, enabled])
}
