import { useMemo, useState, type DragEvent } from 'react'
import { civIconUrl } from '../lib/civs'
import {
  assignCivToPool,
  civIdsForPool,
  createPoolId,
  entryPoolIds,
  poolIconUrl,
  rankedCivIds,
  removeCivFromPool,
} from '../lib/pools'
import { compareTierEntries } from '../lib/tiers'
import { TIER_MAKER_DRAG_MIME, readTierMakerPayload } from './TierMakerEditor'
import type { CivPoolDefinition, CivPriorityEntry } from '../types/draft'

interface CivPoolEditorProps {
  entries: CivPriorityEntry[]
  pools: CivPoolDefinition[]
  onEntriesChange: (entries: CivPriorityEntry[]) => void
  onPoolsChange: (pools: CivPoolDefinition[]) => void
}

export function CivPoolEditor({
  entries,
  pools,
  onEntriesChange,
  onPoolsChange,
}: CivPoolEditorProps) {
  const [dragOverPool, setDragOverPool] = useState<string | 'unassigned' | null>(null)

  const rankedIds = useMemo(() => new Set(rankedCivIds(entries)), [entries])
  const validPoolIds = useMemo(() => new Set(pools.map((pool) => pool.id)), [pools])

  const civsByPool = useMemo(() => {
    const grouped = new Map<string | 'unassigned', string[]>()
    grouped.set('unassigned', [])

    for (const pool of pools) {
      grouped.set(
        pool.id,
        civIdsForPool(entries, pool.id).filter((civId) => rankedIds.has(civId)),
      )
    }

    for (const civId of rankedIds) {
      const entry = entries.find((item) => item.civId === civId)
      const membership = entryPoolIds(entry ?? { civId }).filter((id) => validPoolIds.has(id))
      if (!membership.length) {
        grouped.get('unassigned')?.push(civId)
      }
    }

    grouped.get('unassigned')?.sort((a, b) => {
      const entryA = entries.find((entry) => entry.civId === a)
      const entryB = entries.find((entry) => entry.civId === b)
      return compareTierEntries(entryA ?? { civId: a }, entryB ?? { civId: b })
    })

    return grouped
  }, [entries, pools, rankedIds, validPoolIds])

  const handleDrop = (poolId: string | null, event: DragEvent) => {
    event.preventDefault()
    setDragOverPool(null)
    const payload = readTierMakerPayload(event)
    if (!payload) return
    // null = clear all pools; otherwise add to target (multi-pool allowed)
    onEntriesChange(assignCivToPool(entries, payload.civId, poolId))
  }

  const removeFromPool = (civId: string, poolId: string) => {
    onEntriesChange(removeCivFromPool(entries, civId, poolId))
  }

  const addPool = () => {
    const name = `Pool ${pools.length + 1}`
    onPoolsChange([...pools, { id: createPoolId(name), name }])
  }

  const renamePool = (poolId: string, name: string) => {
    onPoolsChange(pools.map((pool) => (pool.id === poolId ? { ...pool, name } : pool)))
  }

  const removePool = (poolId: string) => {
    onEntriesChange(entries.map((entry) => removeCivFromPool([entry], entry.civId, poolId)[0]!))
    onPoolsChange(pools.filter((pool) => pool.id !== poolId))
  }

  if (!rankedIds.size) {
    return (
      <p className="hint tier-maker-pool-hint">Rank civs in the tier list above before assigning pools.</p>
    )
  }

  return (
    <div className="tier-maker-pools">
      <div className="tier-maker-pools-toolbar">
        <span className="tier-maker-pools-title">Civ pools</span>
        <button type="button" className="compact-btn" onClick={addPool}>
          + Pool
        </button>
      </div>
      <p className="hint tier-maker-pool-hint">
        Drop a civ onto a pool to add it (civs can belong to multiple pools). Drop on Unassigned to
        clear all pools. Use × on a chip to remove it from that pool only.
      </p>

      {pools.map((pool, index) => (
        <PoolRow
          key={pool.id}
          poolIndex={index}
          pool={pool}
          civIds={civsByPool.get(pool.id) ?? []}
          dragOver={dragOverPool === pool.id}
          onRename={(name) => renamePool(pool.id, name)}
          onRemove={() => removePool(pool.id)}
          onRemoveCiv={(civId) => removeFromPool(civId, pool.id)}
          onDragOver={() => setDragOverPool(pool.id)}
          onDragLeave={() => setDragOverPool((current) => (current === pool.id ? null : current))}
          onDrop={(event) => handleDrop(pool.id, event)}
        />
      ))}

      <PoolRow
        poolIndex={-1}
        pool={null}
        label="Unassigned"
        civIds={civsByPool.get('unassigned') ?? []}
        dragOver={dragOverPool === 'unassigned'}
        onDragOver={() => setDragOverPool('unassigned')}
        onDragLeave={() => setDragOverPool((current) => (current === 'unassigned' ? null : current))}
        onDrop={(event) => handleDrop(null, event)}
        unassigned
      />
    </div>
  )
}

function PoolRow({
  pool,
  poolIndex,
  label,
  civIds,
  dragOver,
  onRename,
  onRemove,
  onRemoveCiv,
  onDragOver,
  onDragLeave,
  onDrop,
  unassigned = false,
}: {
  pool: CivPoolDefinition | null
  poolIndex: number
  label?: string
  civIds: string[]
  dragOver: boolean
  onRename?: (name: string) => void
  onRemove?: () => void
  onRemoveCiv?: (civId: string) => void
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (event: DragEvent) => void
  unassigned?: boolean
}) {
  const colorClass = unassigned
    ? 'tier-maker-pool-block-unassigned'
    : `tier-maker-pool-block-color-${(poolIndex % 4) + 1}`
  const iconSrc = pool ? poolIconUrl(pool.name) : null

  return (
    <div className={`tier-maker-pool-block ${colorClass}`}>
      <div className="tier-maker-pool-heading">
        {pool && onRename ? (
          <>
            <input
              className="tier-maker-pool-name-input"
              value={pool.name}
              onChange={(event) => onRename(event.target.value)}
              aria-label="Pool name"
              size={Math.max(pool.name.length, 4)}
            />
            <button
              type="button"
              className="delete-x tier-maker-pool-remove"
              onClick={onRemove}
              title="Remove pool"
              aria-label={`Remove ${pool.name}`}
            >
              ×
            </button>
          </>
        ) : (
          <span className="tier-maker-pool-heading-label">{label ?? pool?.name}</span>
        )}
      </div>

      <div
        className={`tier-maker-row tier-maker-row-pool${dragOver ? ' tier-maker-row-dragover' : ''}`}
      >
        <div className="tier-maker-label tier-maker-pool-icon-cell" aria-hidden={!iconSrc}>
          {iconSrc ? (
            <img src={iconSrc} alt="" className="tier-maker-pool-unit-icon" draggable={false} />
          ) : (
            <span className="tier-maker-pool-icon-fallback">—</span>
          )}
        </div>
        <div
          className="tier-maker-slots"
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
            onDragOver()
          }}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {civIds.map((civId) => (
            <PoolCivChip
              key={civId}
              civId={civId}
              onRemove={onRemoveCiv ? () => onRemoveCiv(civId) : undefined}
            />
          ))}
          {!civIds.length ? (
            <span className="tier-maker-empty">{unassigned ? 'No unassigned civs' : 'Drop here'}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function PoolCivChip({ civId, onRemove }: { civId: string; onRemove?: () => void }) {
  return (
    <div
      className="tier-maker-civ"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(TIER_MAKER_DRAG_MIME, JSON.stringify({ civId }))
        event.dataTransfer.effectAllowed = 'copyMove'
      }}
      title={civId}
      role="button"
      tabIndex={0}
    >
      <img src={civIconUrl(civId)} alt="" loading="lazy" draggable={false} />
      <span>{civId}</span>
      {onRemove ? (
        <button
          type="button"
          className="tier-maker-civ-pool-remove"
          title={`Remove ${civId} from this pool`}
          aria-label={`Remove ${civId} from this pool`}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
