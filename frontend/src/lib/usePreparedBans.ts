import { useCallback, useEffect, useRef, useState } from 'react'
import { CLOUD_HYDRATED, cloudHydratedIncludesKey, DOC_KEYS } from './cloudStorage'
import { extractDraftId } from './civs'
import {
  loadPreparedBanEntry,
  savePreparedBanEntry,
  trimPreparedBans,
} from './preparedBans'

function draftKey(civDraftUrl: string): string {
  const id = extractDraftId(civDraftUrl)
  return id || civDraftUrl.trim()
}

export function usePreparedBans(civDraftUrl: string, maxSlots: number) {
  const [preparedBanIds, setPreparedBanIds] = useState<string[]>(() =>
    trimPreparedBans(loadPreparedBanEntry(civDraftUrl).civIds, maxSlots),
  )
  const [locked, setLocked] = useState(() => loadPreparedBanEntry(civDraftUrl).locked ?? false)
  const draftKeyRef = useRef(draftKey(civDraftUrl))

  const reloadPreparedBans = useCallback(() => {
    const entry = loadPreparedBanEntry(civDraftUrl)
    const trimmed = trimPreparedBans(entry.civIds, maxSlots)
    setPreparedBanIds((current) => (JSON.stringify(current) === JSON.stringify(trimmed) ? current : trimmed))
    setLocked((current) => (current === (entry.locked ?? false) ? current : (entry.locked ?? false)))
  }, [civDraftUrl, maxSlots])

  useEffect(() => {
    const nextKey = draftKey(civDraftUrl)
    if (nextKey !== draftKeyRef.current) {
      draftKeyRef.current = nextKey
      reloadPreparedBans()
      return
    }
    reloadPreparedBans()
  }, [civDraftUrl, maxSlots, reloadPreparedBans])

  useEffect(() => {
    const onHydrated = (event: Event) => {
      if (!cloudHydratedIncludesKey(event, DOC_KEYS.PREPARED_BANS)) return
      reloadPreparedBans()
    }
    window.addEventListener(CLOUD_HYDRATED, onHydrated)
    return () => window.removeEventListener(CLOUD_HYDRATED, onHydrated)
  }, [reloadPreparedBans])

  const addPreparedBan = useCallback(
    (civId: string) => {
      setPreparedBanIds((current) => {
        if (current.includes(civId) || current.length >= maxSlots) return current
        const next = [...current, civId]
        savePreparedBanEntry(civDraftUrl, { civIds: next, locked: false })
        setLocked(false)
        return next
      })
    },
    [civDraftUrl, maxSlots],
  )

  const removePreparedBan = useCallback(
    (civId: string) => {
      setPreparedBanIds((current) => {
        const next = current.filter((id) => id !== civId)
        savePreparedBanEntry(civDraftUrl, { civIds: next, locked: false })
        setLocked(false)
        return next
      })
    },
    [civDraftUrl],
  )

  const lockPreparedBans = useCallback(() => {
    setPreparedBanIds((current) => {
      const trimmed = trimPreparedBans(current, maxSlots)
      savePreparedBanEntry(civDraftUrl, { civIds: trimmed, locked: true })
      setLocked(true)
      return trimmed
    })
  }, [civDraftUrl, maxSlots])

  const unlockPreparedBans = useCallback(() => {
    setPreparedBanIds((current) => {
      const trimmed = trimPreparedBans(current, maxSlots)
      savePreparedBanEntry(civDraftUrl, { civIds: trimmed, locked: false })
      setLocked(false)
      return trimmed
    })
  }, [civDraftUrl, maxSlots])

  return {
    preparedBanIds,
    preparedBansLocked: locked,
    addPreparedBan,
    removePreparedBan,
    lockPreparedBans,
    unlockPreparedBans,
  }
}
