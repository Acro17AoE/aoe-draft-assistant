import { useMemo, type CSSProperties } from 'react'
import { AOE2_CIVS, civIconUrl } from '../lib/civs'
import { compareTierEntries } from '../lib/tiers'
import type { CivPriorityEntry } from '../types/draft'

interface PreparedBanListProps {
  preparedBanIds: string[]
  maxSlots: number
  ownBanSlots: number
  priorityEntries?: CivPriorityEntry[]
  onAdd: (civId: string) => void
  onRemove: (civId: string) => void
}

export function PreparedBanList({
  preparedBanIds,
  maxSlots,
  ownBanSlots,
  priorityEntries = [],
  onAdd,
  onRemove,
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
    <section className="panel prepared-ban-panel" data-tour="prepared-bans">
      <div className="prepared-ban-header">
        <h3>Prepared bans</h3>
        <p className="hint prepared-ban-hint">
          Plan up to {maxSlots} civs ({ownBanSlots} ban{ownBanSlots === 1 ? '' : 's'} × 2). Click a
          civ below to add it in order.
        </p>
      </div>

      <div
        className="prepared-ban-slots"
        style={{ '--prepared-ban-columns': Math.min(maxSlots, 14) } as CSSProperties}
      >
        {preparedBanIds.map((civId, index) => {
          const priority = priorityByCiv.get(civId)
          const tierClass = priority?.tier ? ` priority-${priority.tier.toLowerCase()}` : ''
          return (
            <button
              key={`${civId}-${index}`}
              type="button"
              className={`prepared-ban-slot prepared-ban-slot-filled${tierClass}`}
              onClick={() => onRemove(civId)}
              title={`Remove ${civId} from ban list`}
            >
              <em className="prepared-ban-rank">{index + 1}</em>
              <img src={civIconUrl(civId)} alt="" loading="lazy" draggable={false} />
              <span>{civId}</span>
            </button>
          )
        })}
        {Array.from({ length: emptySlots }, (_, index) => (
          <div
            key={`empty-${preparedBanIds.length + index}`}
            className="prepared-ban-slot prepared-ban-slot-empty"
            aria-hidden
          />
        ))}
      </div>

      <div className="prepared-ban-picker">
        {pickerCivs.map((civId) => {
          const priority = priorityByCiv.get(civId)
          const tierClass = priority?.tier ? ` priority-${priority.tier.toLowerCase()}` : ''
          const disabled = preparedBanIds.length >= maxSlots
          return (
            <button
              key={civId}
              type="button"
              className={`prepared-ban-picker-civ${tierClass}${disabled ? ' prepared-ban-picker-civ-disabled' : ''}`}
              disabled={disabled}
              onClick={() => onAdd(civId)}
              title={disabled ? 'Ban list full' : `Add ${civId}`}
            >
              <img src={civIconUrl(civId)} alt="" loading="lazy" draggable={false} />
              <span>{civId}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
