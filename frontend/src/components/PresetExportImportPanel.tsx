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
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden>
      <path
        d="M8 11.5V3.75M8 3.75 5.25 6.5M8 3.75 10.75 6.5M3 12.5h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden>
      <path
        d="M8 3.5v7.75M8 11.25 5.25 8.5M8 11.25 10.75 8.5M3 13h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
