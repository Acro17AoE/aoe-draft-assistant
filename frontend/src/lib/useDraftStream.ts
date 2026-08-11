import { useCallback, useEffect, useRef, useState } from 'react'
import type { Aoe2cmDraft } from '../types/draft'
import { extractDraftId } from './civs'

function buildDraftStreamUrl(draftId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/draft/${draftId}/stream`
}

const RECONNECT_BASE_MS = 1500
const RECONNECT_MAX_MS = 15000

export function useDraftStream(draftIdOrUrl: string | null | undefined, enabled: boolean) {
  const [draft, setDraft] = useState<Aoe2cmDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [revision, setRevision] = useState(0)

  const reconnect = useCallback(() => {
    setRevision((value) => value + 1)
  }, [])

  const applyMessage = useCallback((raw: string) => {
    const data = JSON.parse(raw) as Aoe2cmDraft & { error?: string }
    if (data.error) {
      setError(data.error)
      return
    }
    setDraft(data)
    setError(null)
  }, [])

  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if (!enabled || !draftIdOrUrl?.trim()) {
      return undefined
    }

    const draftId = extractDraftId(draftIdOrUrl)
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

      ws = new WebSocket(buildDraftStreamUrl(draftId))

      ws.onopen = () => {
        if (stopped) return
        attempt = 0
        setConnected(true)
        setError(null)
      }

      ws.onmessage = (event) => {
        if (stopped) return
        try {
          applyMessage(event.data as string)
        } catch {
          setError('Invalid draft update from server')
        }
      }

      ws.onerror = () => {
        if (stopped) return
        setError('Draft stream connection failed')
        setConnected(false)
      }

      ws.onclose = () => {
        if (stopped) return
        setConnected(false)
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      setConnected(false)
      ws?.close()
    }
  }, [draftIdOrUrl, enabled, revision, applyMessage])

  return { draft, error, connected, reconnect }
}
