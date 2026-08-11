import { useEffect, useRef, useState } from 'react'

interface MapNamePickerProps {
  maps: string[]
  selectedMap: string
  onSelect: (mapName: string) => void
}

export function MapNamePicker({ maps, selectedMap, onSelect }: MapNamePickerProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  return (
    <div className="preset-map-name-picker" ref={rootRef}>
      <button
        type="button"
        className="preset-map-name"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {selectedMap}
      </button>
      {menuOpen ? (
        <ul className="preset-map-name-menu" role="listbox">
          {maps.map((map) => (
            <li key={map}>
              <button
                type="button"
                role="option"
                aria-selected={map === selectedMap}
                className={map === selectedMap ? 'active' : ''}
                onClick={() => {
                  onSelect(map)
                  setMenuOpen(false)
                }}
              >
                {map}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
