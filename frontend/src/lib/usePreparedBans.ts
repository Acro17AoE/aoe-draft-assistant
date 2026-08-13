import { useCallback, useEffect, useRef, useState } from 'react'
import { extractDraftId } from './civs'
import { loadPreparedBans, savePreparedBans, trimPreparedBans } from './preparedBans'

function draftKey(civDraftUrl: string): string {
  const id = extractDraftId(civDraftUrl)
  return id || civDraftUrl.trim()
}

export function usePreparedBans(civDraftUrl: string, maxSlots: number) {
  const [preparedBanIds, setPreparedBanIds] = useState<string[]>(() =>
    trimPreparedBans(loadPreparedBans(civDraftUrl), maxSlots),
  )
  const draftKeyRef = useRef(draftKey(civDraftUrl))

  useEffect(() => {
    const nextKey = draftKey(civDraftUrl)
    if (nextKey !== draftKeyRef.current) {
      draftKeyRef.current = nextKey
      setPreparedBanIds(trimPreparedBans(loadPreparedBans(civDraftUrl), maxSlots))
      return
    }
    setPreparedBanIds((current) => trimPreparedBans(current, maxSlots))
  }, [civDraftUrl, maxSlots])

  const addPreparedBan = useCallback(
    (civId: string) => {
      setPreparedBanIds((current) => {
        if (current.includes(civId) || current.length >= maxSlots) return current
        const next = [...current, civId]
        savePreparedBans(civDraftUrl, next)
        return next
      })
    },
    [civDraftUrl, maxSlots],
  )

  const removePreparedBan = useCallback(
    (civId: string) => {
      setPreparedBanIds((current) => {
        const next = current.filter((id) => id !== civId)
        savePreparedBans(civDraftUrl, next)
        return next
      })
    },
    [civDraftUrl],
  )

  return {
    preparedBanIds,
    addPreparedBan,
    removePreparedBan,
  }
}
