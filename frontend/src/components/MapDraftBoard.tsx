import type { MapBoardItem } from '../types/draft'
import type { DraftStatus } from '../lib/draftStatus'
import { DraftStatusBadge } from './DraftStatusBadge'

interface MapDraftBoardProps {
  items: MapBoardItem[]
  nameHost?: string
  nameGuest?: string
  draftStatus?: DraftStatus | null
}

export function MapDraftBoard({ items, nameHost, nameGuest, draftStatus }: MapDraftBoardProps) {
  const available = items.filter((item) => item.status === 'available')
  const ownPicks = items.filter((item) => item.status === 'own_pick')
  const opponentPicks = items.filter((item) => item.status === 'opponent_pick')
  const adminPicks = items.filter((item) => item.status === 'admin_pick')
  const banned = items.filter((item) => item.status === 'banned')
  const maxPickRows = Math.max(ownPicks.length, opponentPicks.length, adminPicks.length)

  return (
    <section className="panel map-board">
      <header className="board-header">
        <h2>Map Draft</h2>
        {nameHost && nameGuest ? (
          <span className="map-badge">
            {nameHost} vs {nameGuest}
          </span>
        ) : null}
        {draftStatus ? <DraftStatusBadge status={draftStatus} /> : null}
      </header>

      {available.length ? (
        <div className="section-block">
          <h3>Available pool ({available.length})</h3>
          <div className="draft-grid map-grid">
            {available.map((item) => (
              <MapCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}

      {maxPickRows ? (
        <div className="section-block pick-columns">
          <h3>Picks</h3>
          <div className="pick-grid">
            <div className="pick-column">
              <h4>Your team</h4>
              {Array.from({ length: maxPickRows }).map((_, index) => {
                const item = ownPicks[index]
                return item ? <MapCard key={item.id} item={item} /> : <div key={`own-${index}`} className="pick-slot empty" />
              })}
            </div>
            {adminPicks.length ? (
              <div className="pick-column pick-column-admin">
                <h4>Admin</h4>
                {Array.from({ length: maxPickRows }).map((_, index) => {
                  const item = adminPicks[index]
                  return item ? <MapCard key={item.id} item={item} /> : <div key={`admin-${index}`} className="pick-slot empty" />
                })}
              </div>
            ) : null}
            <div className="pick-column">
              <h4>Opponent</h4>
              {Array.from({ length: maxPickRows }).map((_, index) => {
                const item = opponentPicks[index]
                return item ? <MapCard key={item.id} item={item} /> : <div key={`opp-${index}`} className="pick-slot empty" />
              })}
            </div>
          </div>
        </div>
      ) : null}

      {banned.length ? (
        <div className="section-block banned-section">
          <h3>Banned ({banned.length})</h3>
          <div className="draft-grid map-grid">
            {banned.map((item) => (
              <MapCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function MapCard({ item }: { item: MapBoardItem }) {
  return (
    <article className={`draft-card map-card status-${item.status}`}>
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} loading="lazy" />
      ) : (
        <div className="map-placeholder" aria-hidden="true">
          {item.name.charAt(0)}
        </div>
      )}
      <span>{item.name}</span>
      {item.status === 'admin_pick' ? <em className="admin-tag">Admin</em> : null}
    </article>
  )
}
