import { useCallback, useEffect, useState } from 'react'
import { CLOUD_HYDRATED } from './cloudStorage'
import {
  loadUiPreferences,
  saveUiPreferences,
  UI_PREFERENCES_CHANGED,
  type UiPreferences,
} from './uiPreferences'

export function useUiPreferences() {
  const [preferences, setPreferences] = useState<UiPreferences>(() => loadUiPreferences())

  const setPreference = useCallback(<K extends keyof UiPreferences>(key: K, value: UiPreferences[K]) => {
    setPreferences((current) => {
      const next = { ...current, [key]: value }
      saveUiPreferences(next)
      return next
    })
  }, [])

  useEffect(() => {
    const refresh = () => setPreferences(loadUiPreferences())
    window.addEventListener(UI_PREFERENCES_CHANGED, refresh)
    window.addEventListener(CLOUD_HYDRATED, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(UI_PREFERENCES_CHANGED, refresh)
      window.removeEventListener(CLOUD_HYDRATED, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return { preferences, setPreference }
}
