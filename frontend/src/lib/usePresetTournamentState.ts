import { useCallback, useEffect, useState } from 'react'
import type { PresetTournamentStore } from '../types/presetTournament'
import { CLOUD_HYDRATED } from './cloudStorage'
import { loadPresetStore, PRESET_STORE_CHANGED, savePresetStore } from './presetTournaments'

export function usePresetTournamentState() {
  const [store, setStore] = useState<PresetTournamentStore>(() => loadPresetStore())

  const persist = useCallback((next: PresetTournamentStore) => {
    savePresetStore(next)
    setStore(next)
  }, [])

  useEffect(() => {
    const refresh = () => setStore(loadPresetStore())
    window.addEventListener(PRESET_STORE_CHANGED, refresh)
    window.addEventListener(CLOUD_HYDRATED, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(PRESET_STORE_CHANGED, refresh)
      window.removeEventListener(CLOUD_HYDRATED, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return { store, setStore: persist }
}
