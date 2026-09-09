import { useCallback, useEffect, useState } from 'react'
import type { TierMakerStore } from '../types/tiermaker'
import { CLOUD_HYDRATED } from './cloudStorage'
import { loadTierMakerStore, saveTierMakerStore, TIERMAKER_STORE_CHANGED } from './tiermakerStore'

export function useTierMakerState() {
  const [store, setStore] = useState<TierMakerStore>(() => loadTierMakerStore())

  const persist = useCallback((next: TierMakerStore) => {
    saveTierMakerStore(next)
    setStore(next)
  }, [])

  useEffect(() => {
    const refresh = () => setStore(loadTierMakerStore())
    window.addEventListener(TIERMAKER_STORE_CHANGED, refresh)
    window.addEventListener(CLOUD_HYDRATED, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(TIERMAKER_STORE_CHANGED, refresh)
      window.removeEventListener(CLOUD_HYDRATED, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return { store, setStore: persist }
}
