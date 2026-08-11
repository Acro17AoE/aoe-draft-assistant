import { useRef } from 'react'
import {
  createPresetBundle,
  downloadPresetBundle,
  mergeImportedBundle,
  parsePresetBundle,
} from '../lib/presetBundle'
import type { MapPriorityPreset } from '../types/draft'

interface PresetExportImportPanelProps {
  presets: MapPriorityPreset[]
  customMaps: string[]
  onChange: (presets: MapPriorityPreset[], customMaps: string[]) => void
  onStatus?: (message: string) => void
}

export function PresetExportImportPanel({
  presets,
  customMaps,
  onChange,
  onStatus,
}: PresetExportImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const exportPresets = () => {
    const bundle = createPresetBundle(presets, customMaps)
    downloadPresetBundle(bundle)
    onStatus?.('Preset file downloaded.')
  }

  const importPresets = async (file: File) => {
    const text = await file.text()
    const bundle = parsePresetBundle(JSON.parse(text))
    const merged = mergeImportedBundle(presets, customMaps, bundle)
    onChange(merged.presets, merged.customMaps)
    onStatus?.(`Loaded ${bundle.presets.length} preset(s) from "${file.name}".`)
  }

  return (
    <details className="preset-export-panel">
      <summary>Export/Import Presets</summary>
      <div className="preset-export-actions">
        <button type="button" onClick={exportPresets}>
          Save as file
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Load from file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void importPresets(file).catch((err) => {
              onStatus?.(err instanceof Error ? err.message : 'Failed to load preset file.')
            })
          }}
        />
      </div>
    </details>
  )
}
