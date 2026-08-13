import { useMemo } from 'react'
import { AOE2_CIVS, civIconUrl } from '../lib/civs'
import { compareTierEntries } from '../lib/tiers'
import type { CivPriorityEntry, PriorityTier } from '../types/draft'

interface PreparedBanListProps {
  preparedBanIds: string[]
  maxSlots: number
  ownBanSlots: number
  locked: boolean
  nemesisCivIds?: Set<string>
  priorityEntries?: CivPriorityEntry[]
  onAdd: (civId: string) => void
  onRemove: (civId: string) => void
  onLock: () => void
  onUnlock: () => void
}

export function PreparedBanList({
  preparedBanIds,
  maxSlots,
  ownBanSlots,
  locked,
  nemesisCivIds = new Set(),
  priorityEntries = [],
  onAdd,
  onRemove,
  onLock,
  onUnlock,
}: PreparedBanListProps) {
  const priorityByCiv = useMemo(
    () => new Map(priorityEntries.map((entry) => [entry.civId, entry])),
    [priorityEntries],
  )

  const pickerCivs = useMemo(() => {
    const prepared = new Set(preparedBanIds)
    return AOE2_CIVS.filter((civ) => !prepared.has(civ)).sort((a, b) => {
      const entryA = priorityByCiv.get(a) ?? { civId: a }
      const entryB = priorityByCiv.get(b) ?? { civId: b }
      const cmp = compareTierEntries(entryA, entryB)
      if (cmp !== 0) return cmp
      return a.localeCompare(b)
    })
  }, [preparedBanIds, priorityByCiv])

  const emptySlots = Math.max(0, maxSlots - preparedBanIds.length)

  return (
    <section
      className={`panel prepared-ban-panel${locked ? ' prepared-ban-panel-locked' : ''}`}
      data-tour="prepared-bans"
    >
      <div className="prepared-ban-header">
        <div className="prepared-ban-header-row">
          <h3>Prepared bans</h3>
          {locked ? (
            <button type="button" className="compact-btn prepared-ban-action-btn" onClick={onUnlock}>
              Change
            </button>
          ) : (
            <button
              type="button"
              className="compact-btn prepared-ban-action-btn accent-btn"
              onClick={onLock}
              disabled={preparedBanIds.length === 0}
            >
              Set
            </button>
          )}
        </div>
        {!locked ? (
          <p className="hint prepared-ban-hint">
            Plan up to {maxSlots} civs ({ownBanSlots} ban{ownBanSlots === 1 ? '' : 's'} × 2). Click a
            civ below to add it in order.
          </p>
        ) : null}
      </div>

      <div className="prepared-ban-slots">
        {preparedBanIds.map((civId, index) => (
          <PreparedBanTile
            key={`${civId}-${index}`}
            civId={civId}
            rank={index + 1}
            nemesis={nemesisCivIds.has(civId)}
            tier={priorityByCiv.get(civId)?.tier}
            disabled={locked}
            onClick={() => onRemove(civId)}
          />
        ))}
        {!locked
          ? Array.from({ length: emptySlots }, (_, index) => (
              <div
                key={`empty-${preparedBanIds.length + index}`}
                className="prepared-ban-slot-placeholder"
                aria-hidden
              />
            ))
          : null}
      </div>

      {!locked ? (
        <div className="prepared-ban-picker">
          {pickerCivs.map((civId) => (
            <PreparedBanTile
              key={civId}
              civId={civId}
              nemesis={nemesisCivIds.has(civId)}
              tier={priorityByCiv.get(civId)?.tier}
              disabled={preparedBanIds.length >= maxSlots}
              onClick={() => onAdd(civId)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function PreparedBanTile({
  civId,
  rank,
  nemesis,
  tier,
  disabled,
  onClick,
}: {
  civId: string
  rank?: number
  nemesis: boolean
  tier?: PriorityTier
  disabled?: boolean
  onClick: () => void
}) {
  const priorityClass = tier ? ` priority-${tier.toLowerCase()}` : ''
  const nemesisClass = nemesis ? ' prepared-ban-tile-nemesis' : ''

  return (
    <button
      type="button"
      className={`prepared-ban-tile draft-card civ-card civ-card-tile civ-card-tile-sm${priorityClass}${nemesisClass}`}
      disabled={disabled}
      onClick={onClick}
      title={
        disabled && rank
          ? civId
          : nemesis
            ? `Nemesis: ${civId}`
            : rank
              ? `Remove ${civId} from ban list`
              : `Add ${civId}`
      }
    >
      {rank ? <em className="rank-tag">{rank}</em> : null}
      {nemesis ? (
        <em className="prepared-ban-nemesis-tag" aria-label="Nemesis civ">
          ☠
        </em>
      ) : null}
      <img src={civIconUrl(civId)} alt="" loading="lazy" draggable={false} />
      <span>{civId}</span>
    </button>
  )
}
