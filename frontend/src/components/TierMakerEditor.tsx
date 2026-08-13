import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { AOE2_CIVS, civIconUrl } from '../lib/civs'
import {
  PRIORITY_TIERS,
  civIdsForTier,
  isPriorityTier,
  moveCivInTierList,
  toggleKeyCiv,
} from '../lib/tiers'
import type { CivPriorityEntry, PriorityTier } from '../types/draft'

const DRAG_MIME = 'application/x-aoe-tier-maker'

interface TierMakerEditorProps {
  entries: CivPriorityEntry[]
  onChange: (entries: CivPriorityEntry[]) => void
  advancedMode?: boolean
  onAdvancedToggle?: () => void
  advancedSection?: ReactNode
}

interface DragPayload {
  civId: string
}

export function TierMakerEditor({
  entries,
  onChange,
  advancedMode = false,
  onAdvancedToggle,
  advancedSection,
}: TierMakerEditorProps) {
  const [dragOverTier, setDragOverTier] = useState<PriorityTier | 'unranked' | null>(null)
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null)

  const civsByTier = useMemo(() => {
    const grouped = new Map<PriorityTier | 'unranked', string[]>()
    grouped.set('unranked', [])

    for (const tier of PRIORITY_TIERS) {
      grouped.set(tier, civIdsForTier(entries, tier))
    }

    const ranked = new Set(
      entries.filter((entry) => entry.tier && isPriorityTier(entry.tier)).map((entry) => entry.civId),
    )
    for (const civ of AOE2_CIVS) {
      if (!ranked.has(civ)) {
        grouped.get('unranked')?.push(civ)
      }
    }

    grouped.get('unranked')?.sort((a, b) => a.localeCompare(b))
    return grouped
  }, [entries])

  const moveCiv = (civId: string, tier: PriorityTier | null, insertIndex?: number) => {
    onChange(moveCivInTierList(entries, civId, tier, insertIndex))
  }

  const keyCivIds = useMemo(
    () => new Set(entries.filter((entry) => entry.keyCiv).map((entry) => entry.civId)),
    [entries],
  )

  const handleToggleKeyCiv = (civId: string) => {
    onChange(toggleKeyCiv(entries, civId))
  }

  const handleDrop = (tier: PriorityTier | null, insertIndex: number | undefined, event: DragEvent) => {
    event.preventDefault()
    setDragOverTier(null)
    setDragInsertIndex(null)
    const payload = readPayload(event)
    if (!payload) return
    moveCiv(payload.civId, tier, insertIndex)
  }

  return (
    <div className="tier-maker">
      <div className="tier-maker-header">
        <p className="hint tier-maker-hint">
          Within each tier, left = strongest preference, right = weakest.
          <span
            className="tier-maker-key-civ-hint"
            title="Double Click Civ Icon to declare Key Civ"
          >
            <span className="tier-maker-key-civ-star" aria-hidden>
              ★
            </span>
            <span className="tier-maker-key-civ-label">= Key civ</span>
          </span>
        </p>
        {onAdvancedToggle ? (
          <button
            type="button"
            className={`compact-btn tier-maker-advanced-btn${advancedMode ? ' active' : ''}`}
            onClick={onAdvancedToggle}
            aria-pressed={advancedMode}
          >
            Advanced
          </button>
        ) : null}
      </div>

      {PRIORITY_TIERS.map((tier) => (
        <TierRow
          key={tier}
          tier={tier}
          civIds={civsByTier.get(tier) ?? []}
          keyCivIds={keyCivIds}
          onToggleKeyCiv={handleToggleKeyCiv}
          dragOver={dragOverTier === tier}
          dragInsertIndex={dragOverTier === tier ? dragInsertIndex : null}
          onDragOver={(index) => {
            setDragOverTier(tier)
            setDragInsertIndex(index)
          }}
          onDragLeave={() => {
            setDragOverTier((current) => (current === tier ? null : current))
            setDragInsertIndex(null)
          }}
          onDrop={(insertIndex, event) => handleDrop(tier, insertIndex, event)}
        />
      ))}
      <TierRow
        tier={null}
        label="Unranked"
        civIds={civsByTier.get('unranked') ?? []}
        keyCivIds={keyCivIds}
        onToggleKeyCiv={handleToggleKeyCiv}
        dragOver={dragOverTier === 'unranked'}
        dragInsertIndex={dragOverTier === 'unranked' ? dragInsertIndex : null}
        onDragOver={() => {
          setDragOverTier('unranked')
          setDragInsertIndex(null)
        }}
        onDragLeave={() => {
          setDragOverTier((current) => (current === 'unranked' ? null : current))
          setDragInsertIndex(null)
        }}
        onDrop={(_, event) => handleDrop(null, undefined, event)}
        unranked
      />

      {advancedMode ? advancedSection : null}
    </div>
  )
}

function TierRow({
  tier,
  label,
  civIds,
  keyCivIds,
  onToggleKeyCiv,
  dragOver,
  dragInsertIndex,
  onDragOver,
  onDragLeave,
  onDrop,
  unranked = false,
}: {
  tier: PriorityTier | null
  label?: string
  civIds: string[]
  keyCivIds: Set<string>
  onToggleKeyCiv: (civId: string) => void
  dragOver: boolean
  dragInsertIndex: number | null
  onDragOver: (insertIndex: number | null) => void
  onDragLeave: () => void
  onDrop: (insertIndex: number | undefined, event: DragEvent) => void
  unranked?: boolean
}) {
  const rowClass = tier ? `tier-maker-row tier-maker-row-${tier.toLowerCase()}` : 'tier-maker-row tier-maker-row-unranked'

  return (
    <div className={`${rowClass}${dragOver ? ' tier-maker-row-dragover' : ''}`}>
      <span className="tier-maker-label">{label ?? tier}</span>
      <div
        className="tier-maker-slots"
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          onDragOver(civIds.length)
        }}
        onDragLeave={onDragLeave}
        onDrop={(event) => onDrop(civIds.length, event)}
      >
        {civIds.map((civId, index) => (
          <div key={civId} className="tier-maker-slot-wrap">
            {dragInsertIndex === index ? <span className="tier-maker-insert-marker" aria-hidden /> : null}
            <TierCivChip
              civId={civId}
              isKeyCiv={keyCivIds.has(civId)}
              onToggleKeyCiv={() => onToggleKeyCiv(civId)}
              onDragOver={() => onDragOver(index)}
              onDrop={(event) => {
                event.stopPropagation()
                onDrop(index, event)
              }}
            />
          </div>
        ))}
        {dragInsertIndex === civIds.length && civIds.length > 0 ? (
          <span className="tier-maker-insert-marker" aria-hidden />
        ) : null}
        {!civIds.length && unranked ? (
          <span className="tier-maker-empty">All civs ranked</span>
        ) : null}
        {!civIds.length && !unranked ? <span className="tier-maker-empty">Drop here</span> : null}
      </div>
    </div>
  )
}

function TierCivChip({
  civId,
  isKeyCiv,
  onToggleKeyCiv,
  onDragOver,
  onDrop,
}: {
  civId: string
  isKeyCiv: boolean
  onToggleKeyCiv: () => void
  onDragOver: () => void
  onDrop: (event: DragEvent) => void
}) {
  return (
    <div
      className={`tier-maker-civ${isKeyCiv ? ' tier-maker-civ-key' : ''}`}
      draggable
      onDragStart={(event) => {
        const payload: DragPayload = { civId }
        event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
        event.dataTransfer.effectAllowed = 'move'
      }}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggleKeyCiv()
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDrop={onDrop}
      title={civId}
      role="button"
      tabIndex={0}
    >
      {isKeyCiv ? (
        <span className="tier-maker-key-civ-badge" aria-label="Key civ">
          ★
        </span>
      ) : null}
      <img src={civIconUrl(civId)} alt="" loading="lazy" draggable={false} />
      <span>{civId}</span>
    </div>
  )
}

function readPayload(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DragPayload
    if (parsed && typeof parsed.civId === 'string') return parsed
  } catch {
    return null
  }
  return null
}

export { readPayload as readTierMakerPayload, DRAG_MIME as TIER_MAKER_DRAG_MIME }
