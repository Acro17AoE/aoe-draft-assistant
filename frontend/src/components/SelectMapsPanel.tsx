import { resolveMapDisplay } from '../lib/maps'
import { SET_FORMAT_LABELS } from '../lib/results'
import type { SetFormat } from '../types/results'

interface SelectMapsPanelProps {
  maps: string[]
  format: SetFormat
  teamName: string
}

export function SelectMapsPanel({ maps, format, teamName }: SelectMapsPanelProps) {
  return (
    <section className="panel select-maps-panel">
      <header className="board-header">
        <h2>Selected maps</h2>
        <span className="map-badge">{SET_FORMAT_LABELS[format]}</span>
      </header>
      <p className="hint">Manual map selection — ported to Civ Draft for presets and assignments.</p>
      <p className="hint">Team: {teamName}</p>
      <div className="draft-grid map-grid select-maps-grid">
        {maps.map((mapName, index) => {
          const display = resolveMapDisplay(mapName)
          return (
            <article key={`${mapName}-${index}`} className="draft-card map-card status-own_pick">
              {display.imageUrl ? (
                <img src={display.imageUrl} alt={display.name} loading="lazy" />
              ) : (
                <div className="map-placeholder" aria-hidden="true">
                  {display.name.charAt(0)}
                </div>
              )}
              <span>
                G{index + 1}: {display.name}
              </span>
            </article>
          )
        })}
      </div>
    </section>
  )
}
