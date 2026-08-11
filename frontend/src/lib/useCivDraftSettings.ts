import { useEffect, useState } from 'react'
import { CLOUD_HYDRATED } from './cloudStorage'
import {
  cloneSettings,
  loadCivDraftSettings,
  saveCivDraftSettings,
  SETTINGS_CHANGED,
} from './civDraftSettings'
import type { CivDraftSettings } from '../types/settings'

export function useCivDraftSettings() {
  const [settings, setSettingsState] = useState(() => loadCivDraftSettings())

  useEffect(() => {
    const refresh = () => setSettingsState(loadCivDraftSettings())
    window.addEventListener(SETTINGS_CHANGED, refresh)
    window.addEventListener(CLOUD_HYDRATED, refresh)
    return () => {
      window.removeEventListener(SETTINGS_CHANGED, refresh)
      window.removeEventListener(CLOUD_HYDRATED, refresh)
    }
  }, [])

  const setSettings = (next: CivDraftSettings) => {
    saveCivDraftSettings(next)
    setSettingsState(cloneSettings(next))
  }

  return { settings, setSettings }
}
