interface MapSlotSelectProps {
  label: string
  value: string
  pool: readonly string[]
  onChange: (mapName: string) => void
}

export function MapSlotSelect({ label, value, pool, onChange }: MapSlotSelectProps) {
  return (
    <div className="map-slot-select">
      <label>
        {label}
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">—</option>
          {pool.map((map) => (
            <option key={map} value={map}>
              {map}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
