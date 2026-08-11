import { useState } from 'react'

interface AddMapPopoutProps {
  onClose: () => void
  onAdd: (mapName: string) => void
}

export function AddMapPopout({ onClose, onAdd }: AddMapPopoutProps) {
  const [mapName, setMapName] = useState('')

  const submit = () => {
    const trimmed = mapName.trim()
    if (!trimmed) return
    onAdd(trimmed)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="add-map-popout panel" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="add-map-popout-header">
          <strong>Add map</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <label>
          Map name
          <input
            value={mapName}
            onChange={(event) => setMapName(event.target.value)}
            placeholder="e.g. Two Rivers"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
        </label>
        <div className="add-map-popout-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="accent-btn" onClick={submit} disabled={!mapName.trim()}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
