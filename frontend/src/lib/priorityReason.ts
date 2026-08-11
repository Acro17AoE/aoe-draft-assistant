import type { PriorityReasonPart } from '../types/draft'

export function reasonPartsToPlainText(parts: PriorityReasonPart[]): string {
  return parts.map((part) => part.mapName).join(' · ')
}

export function reasonPartsToTooltip(parts: PriorityReasonPart[]): string | undefined {
  const notes = parts.filter((part) => part.note).map((part) => `${part.mapName}: ${part.note}`)
  return notes.length > 0 ? notes.join('\n') : undefined
}
