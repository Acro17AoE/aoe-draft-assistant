import { useCallback, useEffect, useRef, useState } from 'react'
import { CLOUD_HYDRATED, cloudHydratedIncludesKey, DOC_KEYS } from './cloudStorage'
import { extractDraftId } from './civs'
import {
  assignMapTarget,
  loadCivMapAssignments,
  pruneAssignments,
  saveCivMapAssignments,
  type CivMapAssignmentState,
  type MapAssignmentTarget,
} from './civMapAssignments'

function draftKey(civDraftUrl: string): string {
  const id = extractDraftId(civDraftUrl)
  return id || civDraftUrl.trim()
}

export function useCivMapAssignments(
  civDraftUrl: string,
  maps: string[],
  ownPickIds: string[],
  opponentPickIds: string[],
) {
  const [assignments, setAssignments] = useState<CivMapAssignmentState>(() =>
    loadCivMapAssignments(civDraftUrl),
  )
  const draftKeyRef = useRef(draftKey(civDraftUrl))

  const reloadAssignments = useCallback(() => {
    const loaded = loadCivMapAssignments(civDraftUrl)
    const hasPickData = ownPickIds.length > 0 || opponentPickIds.length > 0

    if (!hasPickData) {
      setAssignments(loaded)
      return
    }

    const pruned = pruneAssignments(loaded, ownPickIds, opponentPickIds)
    setAssignments((current) => {
      if (JSON.stringify(current) === JSON.stringify(pruned)) return current
      return pruned
    })
  }, [civDraftUrl, ownPickIds.join('|'), opponentPickIds.join('|')])

  useEffect(() => {
    const nextKey = draftKey(civDraftUrl)
    if (nextKey !== draftKeyRef.current) {
      draftKeyRef.current = nextKey
      setAssignments(loadCivMapAssignments(civDraftUrl))
      return
    }
    reloadAssignments()
  }, [civDraftUrl, reloadAssignments])

  useEffect(() => {
    const onHydrated = (event: Event) => {
      if (!cloudHydratedIncludesKey(event, DOC_KEYS.CIV_MAP_ASSIGNMENTS)) return
      reloadAssignments()
    }
    window.addEventListener(CLOUD_HYDRATED, onHydrated)
    return () => window.removeEventListener(CLOUD_HYDRATED, onHydrated)
  }, [reloadAssignments])

  const setOwnAssignment = useCallback(
    (civId: string, target: MapAssignmentTarget) => {
      const base = loadCivMapAssignments(civDraftUrl)
      const resolved = assignMapTarget(target, maps)
      const next: CivMapAssignmentState = {
        ...base,
        own: { ...base.own },
      }
      if (resolved == null) {
        delete next.own[civId]
      } else {
        next.own[civId] = resolved
      }
      saveCivMapAssignments(civDraftUrl, next)
      setAssignments(next)
    },
    [civDraftUrl, maps.join('|')],
  )

  const setOpponentAssignment = useCallback(
    (civId: string, target: MapAssignmentTarget) => {
      const base = loadCivMapAssignments(civDraftUrl)
      const resolved = assignMapTarget(target, maps)
      const next: CivMapAssignmentState = {
        ...base,
        opponent: { ...base.opponent },
      }
      if (resolved == null) {
        delete next.opponent[civId]
      } else {
        next.opponent[civId] = resolved
      }
      saveCivMapAssignments(civDraftUrl, next)
      setAssignments(next)
    },
    [civDraftUrl, maps.join('|')],
  )

  return { assignments, setOwnAssignment, setOpponentAssignment }
}
