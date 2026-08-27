import { useRef } from 'react'
import {
  createPresetBundle,
  downloadPresetBundle,
  mergeImportedBundle,
  parsePresetBundle,
} from '../lib/presetBundle'
import type { MapPriorityPreset } from '../types/draft'

const EXPORT_TOOLTIP =
  'Download this tournament as a JSON file you can share. Includes maps, S–F tier rankings, Key/Nemesis markers, and Advanced pools.'

const IMPORT_TOOLTIP =
  'Upload a shared JSON preset file. Merges maps and rankings into this tournament (tiers, Key/Nemesis, Advanced pools).'

interface PresetExportImportPanelProps {
  presets: MapPriorityPreset[]
  customMaps: string[]
  onChange: (presets: MapPriorityPreset[], customMaps: string[]) => void
  onStatus?: (message: string) => void
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M9.25 14.75V6.56l-2.72 2.72a.75.75 0 1 1-1.06-1.06l4-4a.75.75 0 0 1 1.06 0l4 4a.75.75 0 1 1-1.06 1.06L10.75 6.56v8.19a.75.75 0 0 1-1.5 0Z" />
      <path d="M3.5 16.25a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 0 1.5H4.25a.75.75 0 0 1-.75-.75Z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M10.75 5.25v8.19l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V5.25a.75.75 0 0 1 1.5 0Z" />
      <path d="M3.5 16.25a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 0 1.5H4.25a.75.75 0 0 1-.75-.75Z" />
    </svg>
  )
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
    <div className="preset-io-actions">
      <button
        type="button"
        className="preset-io-btn"
        title={IMPORT_TOOLTIP}
        aria-label="Import presets from JSON file"
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon />
      </button>
      <button
        type="button"
        className="preset-io-btn"
        title={EXPORT_TOOLTIP}
        aria-label="Export presets as JSON file"
        onClick={exportPresets}
      >
        <DownloadIcon />
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
  )
}
