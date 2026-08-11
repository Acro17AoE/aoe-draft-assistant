import { mapIconUrl, resolveMapImageUrl } from '../lib/maps'
import { SET_FORMAT_LABELS } from '../lib/results'
import type { SetFormat } from '../types/results'

interface SingleMapPanelProps {
  mapName: string
  format: SetFormat
  teamName: string
}

export function SingleMapPanel({ mapName, format, teamName }: SingleMapPanelProps) {
  const imageUrl =
    resolveMapImageUrl(mapName) ??
    mapIconUrl({ id: mapName.toLowerCase().replace(/\s+/g, '-'), name: mapName })

  return (
    <section className="panel single-map-panel">
      <header className="board-header">
        <h2>1-Map tournament</h2>
        <span className="map-badge">{SET_FORMAT_LABELS[format]}</span>
      </header>
      <p className="hint">No map draft — fixed map for civ presets and civ draft.</p>
      <div className="single-map-display">
        {imageUrl ? <img src={imageUrl} alt="" className="single-map-icon" /> : null}
        <div>
          <strong>{mapName}</strong>
          <span className="hint">Team: {teamName}</span>
        </div>
      </div>
    </section>
  )
}
