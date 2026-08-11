import type { CSSProperties, DragEvent, ReactNode } from 'react'
import type { CivBoardItem } from '../types/draft'

export type TrackerTeam = 'own' | 'opponent'

export interface DragPayload {
  civId: string
  team: TrackerTeam
}

export const DRAG_MIME = 'application/x-aoe-civ-map-assignment'

export function readDragPayload(event: DragEvent): DragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DragPayload
    if (parsed && typeof parsed.civId === 'string' && (parsed.team === 'own' || parsed.team === 'opponent')) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

export function MapDropZone({
  zoneKey,
  vertical = false,
  dragOverKey,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
  className = '',
  style,
}: {
  zoneKey: string
  vertical?: boolean
  dragOverKey: string | null
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (event: DragEvent) => void
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`map-drop-zone${vertical ? ' map-drop-zone-vertical' : ''}${dragOverKey === zoneKey ? ' map-drop-zone-dragover' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
    </div>
  )
}

export function DraggableCivTile({
  pick,
  team,
  size = 'md',
  statusClass = 'status-own_pick',
}: {
  pick: CivBoardItem
  team: TrackerTeam
  size?: 'md' | 'sm'
  statusClass?: string
}) {
  return (
    <article
      className={`draft-card civ-card civ-card-tile civ-card-tile-${size} ${statusClass} draggable-civ-tile`}
      draggable
      onDragStart={(event) => {
        const payload: DragPayload = { civId: pick.id, team }
        event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
        event.dataTransfer.effectAllowed = 'move'
      }}
      title={`${pick.name} — drag to assign`}
      role="button"
      tabIndex={0}
    >
      <img src={pick.imageUrl} alt={pick.name} loading="lazy" draggable={false} />
      <span>{pick.name}</span>
    </article>
  )
}

/** @deprecated Use DraggableCivTile */
export function DraggableCivChip({
  pick,
  team,
  compact = false,
}: {
  pick: CivBoardItem
  team: TrackerTeam
  compact?: boolean
}) {
  return (
    <div
      className={`draggable-civ-chip${compact ? ' draggable-civ-chip-compact' : ''}`}
      draggable
      onDragStart={(event) => {
        const payload: DragPayload = { civId: pick.id, team }
        event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
        event.dataTransfer.effectAllowed = 'move'
      }}
      title={`${pick.name} — drag to assign`}
      role="button"
      tabIndex={0}
    >
      <img src={pick.imageUrl} alt={pick.name} loading="lazy" draggable={false} />
      <span>{pick.name}</span>
    </div>
  )
}
