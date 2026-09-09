import type { RefObject } from 'react'
import type { CivPriorityEntry } from '../types/draft'
import { buildTierRowsForExport, exportMapImageUrl, localCivIconUrl } from '../lib/tierListExport'

export function TierListExportSurface({
  title,
  mapName,
  entries,
  exportRef,
}: {
  title: string
  mapName: string
  entries: CivPriorityEntry[]
  exportRef: RefObject<HTMLDivElement | null>
}) {
  const rows = buildTierRowsForExport(entries)
  const mapImageUrl = exportMapImageUrl(mapName)

  return (
    <div className="tierlist-export-host" aria-hidden>
      <div className="tierlist-export-surface" ref={exportRef}>
        <header className="tierlist-export-header">
          <div className="tierlist-export-heading">
            <h2 className="tierlist-export-title">{title.trim() || 'Tier list'}</h2>
          </div>
          {mapImageUrl ? (
            <div className="tierlist-export-map-block">
              <img
                key={mapName}
                src={mapImageUrl}
                alt=""
                className="tierlist-export-map-art"
                data-map-name={mapName}
              />
              <span className="tierlist-export-map-caption">{mapName}</span>
            </div>
          ) : (
            <p className="tierlist-export-map">{mapName}</p>
          )}
        </header>

        <div className="tier-maker tierlist-export-tiers">
          {rows.map(({ tier, civIds }) => (
            <div key={tier} className={`tier-maker-row tier-maker-row-${tier.toLowerCase()}`}>
              <span className="tier-maker-label">{tier}</span>
              <div className="tier-maker-slots">
                {civIds.map((civId) => (
                  <div key={civId} className="tier-maker-civ">
                    <img src={localCivIconUrl(civId)} alt="" />
                    <span>{civId}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!rows.length ? <p className="tierlist-export-empty">No civs ranked yet</p> : null}
        </div>

        <footer className="tierlist-export-footer">
          <img src="/draft-logo.png" alt="" className="tierlist-export-footer-logo" />
          <span>DRAFT</span>
        </footer>
      </div>
    </div>
  )
}
