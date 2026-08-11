import { readLocalKey, writeLocalKey } from './cloudStorage'

export type TourTab = 'presets' | 'map' | 'civ' | 'results' | 'analysis' | 'settings'

export interface TourStep {
  id: string
  tab: TourTab
  /** Matches `[data-tour="..."]`. Omit for centered welcome/done cards. */
  target?: string
  title: string
  body: string
}

const STORAGE_KEY = 'aoe-draft-assistant.onboarding-done'
export const ONBOARDING_START_EVENT = 'aoe-onboarding-start'

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    tab: 'presets',
    title: 'Welcome to DRAFT',
    body: 'Decision-support for Ranking, Assignment, and Forecasting under Time constraints. Prep and live Captain’s Mode drafts in one place — no Excel needed. This short tour walks through each tab.',
  },
  {
    id: 'nav-presets',
    tab: 'presets',
    target: 'nav-presets',
    title: 'Presets',
    body: 'Start here. Build map-specific civ tier lists that power recommendations in Civ Draft.',
  },
  {
    id: 'presets-sidebar',
    tab: 'presets',
    target: 'presets-sidebar',
    title: 'Your preset tournaments',
    body: 'Create or select a tournament and keep one ACTIVE. Civ Draft always uses the active tournament. You can also import aoestats tiers from the sidebar.',
  },
  {
    id: 'presets-editor',
    tab: 'presets',
    target: 'presets-editor',
    title: 'TierMaker editor',
    body: 'Pick a map, then drag civs into S / A / B / C / D / F. Order within a tier matters (left = stronger). Optional Advanced mode adds pools like Halb SO, Paladin, and Flank.',
  },
  {
    id: 'nav-map',
    tab: 'map',
    target: 'nav-map',
    title: 'Map Draft',
    body: 'Lock your team and maps (live aoe2cm, 1-Map, or Select). Draft Preview below shows how your preset connects before the civ draft.',
  },
  {
    id: 'map-setup',
    tab: 'map',
    target: 'map-setup',
    title: 'Team name & mode',
    body: 'Always enter your team name exactly as on aoe2cm. Use Standard with a map-draft link, or skip the map draft with 1-Map-Only / Select.',
  },
  {
    id: 'nav-civ',
    tab: 'civ',
    target: 'nav-civ',
    title: 'Civ Draft',
    body: 'Before Go, review Draft Preview. Then the live board: tiers, pressure, Top 3 picks, and drag-and-drop map assignment.',
  },
  {
    id: 'civ-setup',
    tab: 'civ',
    target: 'civ-setup',
    title: 'Paste & Go',
    body: 'Paste the aoe2cm civ draft link and click Go. Map Draft (with your team name) must be set up first.',
  },
  {
    id: 'nav-results',
    tab: 'results',
    target: 'nav-results',
    title: 'Results',
    body: 'After the match, log tournaments, sets, and games — maps, civs, winners — for your history.',
  },
  {
    id: 'nav-analysis',
    tab: 'analysis',
    target: 'nav-analysis',
    title: 'Analysis',
    body: 'Review win rates, maps, and draft patterns from tournaments that already have saved games.',
  },
  {
    id: 'nav-settings',
    tab: 'settings',
    target: 'nav-settings',
    title: 'Settings',
    body: 'Register or log in to sync across devices, and create a shared session so teammates draft on the same board.',
  },
  {
    id: 'done',
    tab: 'presets',
    title: 'You’re ready',
    body: 'Typical flow: Presets → Map Draft → Civ Draft. Start again anytime with the New Here? button in the top bar.',
  },
]

export function hasCompletedOnboarding(): boolean {
  return readLocalKey(STORAGE_KEY) === '1'
}

export function markOnboardingCompleted(): void {
  writeLocalKey(STORAGE_KEY, '1')
}

export function requestOnboardingStart(): void {
  window.dispatchEvent(new CustomEvent(ONBOARDING_START_EVENT))
}
