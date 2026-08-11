import { civIconUrl } from '../lib/civs'
import { resolveMapDisplay } from '../lib/maps'
import type { OpponentDraftEvent, OpponentSetSummary } from '../lib/opponentAnalysis'

function optionIcon(event: OpponentDraftEvent, kind: 'map' | 'civ') {
  if (kind === 'map') {
    const display = resolveMapDisplay(event.name)
    return display.imageUrl ? <img src={display.imageUrl} alt="" /> : null
  }
  return <img src={civIconUrl(event.name)} alt="" />
}

function eventToneClass(event: OpponentDraftEvent): string {
  if (event.isTeam) return 'is-team'
  if (event.side && event.side.toUpperCase() !== 'NONE') return 'is-foe'
  return 'is-neutral'
}

function Timeline({
  title,
  events,
  kind,
}: {
  title: string
  events: OpponentDraftEvent[]
  kind: 'map' | 'civ'
}) {
  if (!events.length) {
    return (
      <section className="opponent-set-timeline">
        <h4>{title}</h4>
        <p className="hint">No draft events</p>
      </section>
    )
  }
  return (
    <section className="opponent-set-timeline">
      <h4>{title}</h4>
      <ol className="opponent-set-timeline-list">
        {events.map((event, index) => (
          <li
            key={`${event.action}-${event.optionId}-${index}`}
            className={`opponent-set-event action-${event.action} ${eventToneClass(event)}`}
          >
            <span className="opponent-set-action">{event.action}</span>
            {optionIcon(event, kind)}
            <span>{event.name}</span>
            {event.order != null ? <span className="hint">#{event.order}</span> : null}
            {event.isTeam ? <em>team</em> : event.side?.toUpperCase() !== 'NONE' ? <em>opp</em> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

interface OpponentSetDraftModalProps {
  set: OpponentSetSummary
  teamName: string
  onClose: () => void
}

export function OpponentSetDraftModal({ set, teamName, onClose }: OpponentSetDraftModalProps) {
  return (
    <div className="opponent-set-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="opponent-set-modal panel"
        role="dialog"
        aria-modal="true"
        aria-label="Set draft summary"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="opponent-set-modal-header">
          <div>
            <h3>
              {teamName} vs {set.opponent ?? 'Opponent'}
            </h3>
            <p className="hint">
              {[set.stage, set.date].filter(Boolean).join(' · ') || 'Tournament set'}
              {set.winner ? ` · winner: ${set.winner}` : ''}
            </p>
          </div>
          <button type="button" className="compact-btn" onClick={onClose}>
            Close
          </button>
        </header>

        {(set.games ?? []).length ? (
          <section className="opponent-set-games">
            <h4>Games</h4>
            <ul>
              {(set.games ?? []).map((game, index) => {
                const mapDisplay = game.map ? resolveMapDisplay(game.map) : null
                return (
                  <li key={`${set.matchKey}-g-${index}`}>
                    {mapDisplay?.imageUrl ? <img src={mapDisplay.imageUrl} alt="" /> : null}
                    <span>{game.map || `Game ${index + 1}`}</span>
                    <span className="opponent-set-game-civs">
                      {(game.teamCivs ?? []).map((civ) => (
                        <img key={`t-${civ}`} src={civIconUrl(civ)} alt={civ} title={civ} />
                      ))}
                      <span>vs</span>
                      {(game.opponentCivs ?? []).map((civ) => (
                        <img key={`o-${civ}`} src={civIconUrl(civ)} alt={civ} title={civ} />
                      ))}
                    </span>
                    {game.winner ? <em>{game.winner}</em> : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <div className="opponent-set-modal-grid">
          <Timeline title="Map draft" events={set.mapTimeline} kind="map" />
          <Timeline title="Civ draft" events={set.civTimeline} kind="civ" />
        </div>

        <p className="hint opponent-set-links">
          {set.mapDraftUrl ? (
            <a href={set.mapDraftUrl} target="_blank" rel="noreferrer">
              Map draft
            </a>
          ) : null}
          {set.mapDraftUrl && set.civDraftUrl ? ' · ' : null}
          {set.civDraftUrl ? (
            <a href={set.civDraftUrl} target="_blank" rel="noreferrer">
              Civ draft
            </a>
          ) : null}
        </p>
      </div>
    </div>
  )
}
