import { TournamentMetaPanel } from '../TournamentMetaPanel'

export function MetaExplorerPanel() {
  return (
    <div className="aoe-data-meta">
      <p className="hint aoe-data-meta-intro">
        Tournament draft meta (Liquipedia + aoe2cm). Ladder win rates from aoestats.io power preset
        tiers under Presets → Import aoestats.
      </p>
      <TournamentMetaPanel />
    </div>
  )
}
