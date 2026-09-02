import { useCallback, useEffect, useMemo, useState } from 'react'
import { CivDraftAssistant } from './pages/CivDraftAssistant'
import { MapDraftAssistant } from './pages/MapDraftAssistant'
import { PresetsTab } from './pages/PresetsTab'
// Pro Analysis tab disabled for now.
// import { ProAnalysisTab } from './pages/ProAnalysisTab'
import { AnalysisTab } from './pages/AnalysisTab'
import { AoeDataTab } from './pages/AoeDataTab'
import { ResultsTab, useResultsState } from './pages/ResultsTab'
import { tournamentsWithResults } from './lib/results'
import { HomeTab } from './pages/HomeTab'
import { PregameTab } from './pages/PregameTab'
import { AdminTab } from './pages/AdminTab'
import { AppFooter } from './components/AppFooter'
import { FaqModal } from './components/FaqModal'
import { OnboardingTour } from './components/OnboardingTour'
import { UiPreferenceToggles } from './components/UiPreferenceToggles'
import { useAuth } from './contexts/AuthProvider'
import { MemberList } from './components/SharePanel'
import { useWorkspace } from './contexts/WorkspaceProvider'
import { parseCollaborationSlugFromPath } from './lib/cloudStorage'
import { PRODUCT_NAME } from './lib/brand'
import { getActivePresetTournament } from './lib/presetTournaments'
import { usePresetTournamentState } from './lib/usePresetTournamentState'
import { useUiPreferences } from './lib/useUiPreferences'
import { isAdminUser, canUseOpponentAnalysis } from './lib/admin'
import { trackPageViewOnce } from './lib/analytics'
import {
  ONBOARDING_START_EVENT,
  type TourTab,
} from './lib/onboarding'
import './App.css'

type AppTab = 'home' | 'presets' | 'pregame' | 'map' | 'civ' | 'results' | 'analysis' | 'aoedata' | 'pro' | 'settings' | 'admin'
function App() {
  const [tab, setTab] = useState<AppTab>('home')
  const [tourOpen, setTourOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState(false)
  const { store, setStore } = usePresetTournamentState()
  const { tournaments, setTournaments } = useResultsState()
  const analysisTournaments = useMemo(() => tournamentsWithResults(tournaments), [tournaments])

  const activePresetTournament = useMemo(() => getActivePresetTournament(store), [store])
  const civPresets = activePresetTournament?.presets ?? []
  const mapDraftPresetPool = useMemo(() => {
    if (!activePresetTournament) return []
    const merged = new Set<string>()
    for (const preset of activePresetTournament.presets) {
      const name = preset.mapName.trim()
      if (name) merged.add(name)
    }
    for (const mapName of activePresetTournament.customMaps) {
      const name = mapName.trim()
      if (name) merged.add(name)
    }
    return [...merged]
  }, [activePresetTournament])
  const { preferences, setPreference } = useUiPreferences()
  const { user } = useAuth()
  const { workspace, sessionUrl, joinError, leaveWorkspace, leaveSession } = useWorkspace()
  const pendingCollaborationSlug = parseCollaborationSlugFromPath()
  const showAdminTab = isAdminUser(user)
  const showPregameTab = canUseOpponentAnalysis(user)

  const requestTourTab = useCallback((next: TourTab) => {
    setTab(next)
  }, [])

  useEffect(() => {
    trackPageViewOnce()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', preferences.whiteMode ? 'light' : 'dark')
  }, [preferences.whiteMode])

  useEffect(() => {
    const onStart = () => setTourOpen(true)
    window.addEventListener(ONBOARDING_START_EVENT, onStart)
    return () => window.removeEventListener(ONBOARDING_START_EVENT, onStart)
  }, [])

  useEffect(() => {
    if (!showAdminTab && tab === 'admin') setTab('home')
  }, [showAdminTab, tab])

  useEffect(() => {
    if (!showPregameTab && tab === 'pregame') setTab('home')
  }, [showPregameTab, tab])

  useEffect(() => {
    if (tab === 'pro' || tab === 'settings') setTab('home')
  }, [tab])

  return (
    <div
      className={`app-shell${tab === 'civ' && preferences.colorblindMode ? ' colorblind-mode' : ''}${tab === 'civ' ? ' civ-draft-tab' : ''}${preferences.whiteMode ? ' white-mode' : ''}`}
    >
      {pendingCollaborationSlug && !workspace ? (
        <div className="share-invite-banner">
          {user ? (
            <p>{joinError ? `Could not join session: ${joinError}` : 'Joining shared session…'}</p>
          ) : (
            <p>
              You were invited to a shared draft session. Log in under <strong>Home</strong> to join.
            </p>
          )}
        </div>
      ) : null}
      {workspace ? (
        <div className="share-active-banner">
          <div className="share-active-banner-main">
            <span>
              Collaborating in <strong>{workspace.name}</strong> — draft data and Shared Presets sync automatically.
            </span>
            {sessionUrl ? (
              <a className="share-active-link" href={sessionUrl}>
                {sessionUrl}
              </a>
            ) : null}
            <MemberList compact />
          </div>
          {workspace.role !== 'owner' ? (
            <button
              type="button"
              className="share-banner-leave"
              onClick={() => void leaveSession(workspace.id, workspace.role)}
            >
              Leave session
            </button>
          ) : (
            <button type="button" className="share-banner-leave" onClick={() => void leaveWorkspace()}>
              Close
            </button>
          )}
        </div>
      ) : null}
      <header className="topbar">
        <div className="brand" data-tour="brand">
          <img src="/draft-logo.png" alt="DRAFT" className="brand-logo" />
          <h1>{PRODUCT_NAME}</h1>
        </div>
        <nav className="tabs">
          <button
            type="button"
            data-tour="nav-home"
            className={tab === 'home' ? 'active' : ''}
            onClick={() => setTab('home')}
          >
            Home
          </button>
          <button
            type="button"
            data-tour="nav-presets"
            className={tab === 'presets' ? 'active' : ''}
            onClick={() => setTab('presets')}
          >
            {workspace ? 'Shared Presets' : 'Presets'}
          </button>
          {showPregameTab ? (
            <button
              type="button"
              data-tour="nav-pregame"
              className={tab === 'pregame' ? 'active' : ''}
              onClick={() => setTab('pregame')}
            >
              Pregame
            </button>
          ) : null}
          <button
            type="button"
            data-tour="nav-map"
            className={tab === 'map' ? 'active' : ''}
            onClick={() => setTab('map')}
          >
            Map Draft
          </button>
          <button
            type="button"
            data-tour="nav-civ"
            className={tab === 'civ' ? 'active' : ''}
            onClick={() => setTab('civ')}
          >
            Civ Draft
          </button>
          <button
            type="button"
            data-tour="nav-results"
            className={tab === 'results' ? 'active' : ''}
            onClick={() => setTab('results')}
          >
            Results
          </button>
          <button
            type="button"
            data-tour="nav-analysis"
            className={tab === 'analysis' ? 'active' : ''}
            onClick={() => setTab('analysis')}
          >
            Analysis
          </button>
          <button
            type="button"
            data-tour="nav-aoedata"
            className={tab === 'aoedata' ? 'active' : ''}
            onClick={() => setTab('aoedata')}
          >
            AoE in Data
          </button>
          {showAdminTab ? (
            <button type="button" className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
              Admin
            </button>
          ) : null}
          <button
            type="button"
            className="tour-start-btn"
            onClick={() => setTourOpen(true)}
            title="Start guided walkthrough"
          >
            New Here?
          </button>
        </nav>
      </header>

      <div className="tab-panels">
        <div className="tab-panel" hidden={tab !== 'home'}>
          <HomeTab />
        </div>
        <div className="tab-panel" hidden={tab !== 'presets'}>
          <PresetsTab store={store} onChange={setStore} onResultsChange={setTournaments} />
        </div>
        {showPregameTab ? (
          <div className="tab-panel" hidden={tab !== 'pregame'}>
            <PregameTab presetTournamentName={activePresetTournament?.name} />
          </div>
        ) : null}
        <div className="tab-panel" hidden={tab !== 'map'}>
          <MapDraftAssistant
            key={workspace?.id ?? 'solo-map'}
            presetMaps={mapDraftPresetPool}
            activePresetId={activePresetTournament?.id ?? null}
            presets={civPresets}
            presetTournamentName={activePresetTournament?.name}
            tournamentFormat={activePresetTournament?.format ?? '1v1'}
            onOpenCivDraft={() => setTab('civ')}
          />
        </div>
        <div className="tab-panel" hidden={tab !== 'civ'}>
          <CivDraftAssistant
            key={workspace?.id ?? 'solo-civ'}
            presets={civPresets}
            tournamentFormat={activePresetTournament?.format ?? '1v1'}
            visible={tab === 'civ'}
            presetTournamentName={activePresetTournament?.name}
          />
        </div>
        <div className="tab-panel" hidden={tab !== 'results'}>
          <ResultsTab tournaments={tournaments} onChange={setTournaments} />
        </div>
        <div className="tab-panel" hidden={tab !== 'analysis'}>
          <AnalysisTab tournaments={analysisTournaments} />
        </div>
        <div className="tab-panel" hidden={tab !== 'aoedata'}>
          <AoeDataTab />
        </div>
        {showAdminTab ? (
          <div className="tab-panel" hidden={tab !== 'admin'}>
            <AdminTab />
          </div>
        ) : null}
      </div>

      <AppFooter
        whiteMode={preferences.whiteMode}
        onToggleWhiteMode={() => setPreference('whiteMode', !preferences.whiteMode)}
        onOpenFaq={() => setFaqOpen(true)}
      />
      {tab === 'civ' ? <UiPreferenceToggles /> : null}

      <FaqModal open={faqOpen} onClose={() => setFaqOpen(false)} />
      <OnboardingTour
        open={tourOpen}
        currentTab={tab}
        onRequestTab={requestTourTab}
        onClose={() => setTourOpen(false)}
      />
    </div>
  )
}

export default App
