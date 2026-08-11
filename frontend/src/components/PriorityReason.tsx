import type { PriorityReasonPart } from '../types/draft'

export function reasonPartsToPlainText(parts: PriorityReasonPart[]): string {
  return parts.map((part) => part.mapName).join(' · ')
}

export function reasonPartsToTooltip(parts: PriorityReasonPart[]): string | undefined {
  const notes = parts.filter((part) => part.note).map((part) => `${part.mapName}: ${part.note}`)
  return notes.length > 0 ? notes.join('\n') : undefined
}

interface PriorityReasonProps {
  parts: PriorityReasonPart[]
  showNotes?: boolean
}

export function PriorityReason({ parts, showNotes = true }: PriorityReasonProps) {
  if (parts.length === 0) return null

  return (
    <p className="reason">
      {parts.map((part, index) => (
        <span key={`${part.mapName}-${index}`}>
          {index > 0 ? <span className="reason-sep"> · </span> : null}
          <span className={`reason-map tier-${part.tier.toLowerCase()}`}>{part.mapName}</span>
          {showNotes && part.note ? <span className="reason-note">: {part.note}</span> : null}
        </span>
      ))}
    </p>
  )
}
