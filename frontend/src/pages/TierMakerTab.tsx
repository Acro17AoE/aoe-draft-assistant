import { useEffect, useMemo, useRef, useState } from 'react'
import { AddMapPopout } from '../components/AddMapPopout'
import { CommunityPresetBrowser, PublishCommunityPresetModal } from '../components/CommunityPresetBrowser'
import { MapNamePicker } from '../components/MapNamePicker'
import { TierListExportSurface } from '../components/TierListExportSurface'
import { TierMakerEditor } from '../components/TierMakerEditor'
import { useAuth } from '../contexts/AuthProvider'
import type { CommunityPresetDetail } from '../lib/communityPresets'
import { DEFAULT_MAPS, mapNamesMatch, normalizeMapName } from '../lib/maps'
import { downloadTierListPng } from '../lib/tierListExport'
import {
  createEmptyTierMakerList,
  getActiveTierMakerList,
  stripMarkers,
  upsertTierMakerList,
} from '../lib/tiermakerStore'
import { normalizeTierEntries } from '../lib/tiers'
import type { CivPriorityEntry } from '../types/draft'
import type { TierMakerStore } from '../types/tiermaker'

const MAP_OPTIONS = [...DEFAULT_MAPS].sort((a, b) => a.localeCompare(b))

interface TierMakerTabProps {
  store: TierMakerStore
  onChange: (store: TierMakerStore) => void
  communityOpen?: boolean
  onCommunityOpenChange?: (open: boolean) => void
}

export function TierMakerTab({
  store,
  onChange,
  communityOpen,
  onCommunityOpenChange,
}: TierMakerTabProps) {
  const { user } = useAuth()
  const active = useMemo(() => getActiveTierMakerList(store), [store])
  const [title, setTitle] = useState(active?.title ?? 'My tier list')
  const [mapName, setMapName] = useState(active?.mapName ?? 'Arabia')
  const [extraMaps, setExtraMaps] = useState<string[]>([])
  const [showAddMap, setShowAddMap] = useState(false)
  const [entries, setEntries] = useState<CivPriorityEntry[]>(active?.entries ?? [])
  const [status, setStatus] = useState<string | null>(null)
  const [pngBusy, setPngBusy] = useState(false)
  const [localCommunityOpen, setLocalCommunityOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const browserOpen = communityOpen ?? localCommunityOpen
  const setBrowserOpen = (open: boolean) => {
    onCommunityOpenChange?.(open)
    if (communityOpen === undefined) setLocalCommunityOpen(open)
  }

  const mapOptions = useMemo(() => {
    const byNorm = new Map<string, string>()
    for (const name of MAP_OPTIONS) byNorm.set(normalizeMapName(name), name)
    for (const name of extraMaps) {
      const trimmed = name.trim()
      if (!trimmed) continue
      const key = normalizeMapName(trimmed)
      if (!byNorm.has(key)) byNorm.set(key, trimmed)
    }
    const current = mapName.trim()
    if (current) {
      const key = normalizeMapName(current)
      if (!byNorm.has(key)) byNorm.set(key, current)
    }
    return [...byNorm.values()].sort((a, b) => a.localeCompare(b))
  }, [extraMaps, mapName])

  useEffect(() => {
    if (!active) return
    setTitle(active.title)
    setMapName(active.mapName)
    setEntries(stripMarkers(normalizeTierEntries(active.entries.map((entry) => ({ ...entry })))))
    if (
      active.mapName.trim() &&
      !MAP_OPTIONS.some((map) => mapNamesMatch(map, active.mapName))
    ) {
      setExtraMaps((current) =>
        current.some((map) => mapNamesMatch(map, active.mapName))
          ? current
          : [...current, active.mapName.trim()],
      )
    }
  }, [active?.id])

  const persistActive = (nextEntries = entries, nextTitle = title, nextMap = mapName) => {
    if (!active) return
    onChange(
      upsertTierMakerList(store, {
        ...active,
        title: nextTitle.trim() || 'Untitled tier list',
        mapName: nextMap,
        entries: stripMarkers(normalizeTierEntries(nextEntries)),
      }),
    )
  }

  const ensureActive = () => {
    if (active) return active
    const created = createEmptyTierMakerList({
      title: title.trim() || 'My tier list',
      mapName: mapName || 'Arabia',
      entries,
    })
    onChange(upsertTierMakerList(store, created))
    return created
  }

  const selectMap = (next: string) => {
    const trimmed = next.trim()
    if (!trimmed) return
    setMapName(trimmed)
    persistActive(entries, title, trimmed)
  }

  const handleAddMap = (next: string) => {
    const trimmed = next.trim()
    if (!trimmed) return
    setExtraMaps((current) =>
      current.some((map) => mapNamesMatch(map, trimmed)) ||
      MAP_OPTIONS.some((map) => mapNamesMatch(map, trimmed))
        ? current
        : [...current, trimmed],
    )
    selectMap(trimmed)
  }

  const handlePng = async () => {
    setPngBusy(true)
    setStatus(null)
    try {
      persistActive()
      await downloadTierListPng(exportRef.current, title, mapName, entries)
      setStatus('PNG downloaded.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'PNG export failed')
    } finally {
      setPngBusy(false)
    }
  }

  const handleLoadCommunity = (detail: CommunityPresetDetail) => {
    const nextEntries = stripMarkers(normalizeTierEntries(detail.payload.entries ?? []))
    const nextTitle = detail.title
    const nextMap = detail.map_name || mapName
    setTitle(nextTitle)
    setMapName(nextMap)
    setEntries(nextEntries)
    if (nextMap.trim() && !MAP_OPTIONS.some((map) => mapNamesMatch(map, nextMap))) {
      setExtraMaps((current) =>
        current.some((map) => mapNamesMatch(map, nextMap)) ? current : [...current, nextMap.trim()],
      )
    }
    const base = ensureActive()
    onChange(
      upsertTierMakerList(store, {
        ...base,
        title: nextTitle,
        mapName: nextMap,
        entries: nextEntries,
      }),
    )
    setStatus(`Loaded “${detail.title}” from community.`)
  }

  return (
    <div className="tiermaker-page tiermaker-page-simple">
      <main className="panel tiermaker-main" data-tour="tiermaker-editor">
        <div className="tiermaker-toolbar">
          <label className="tiermaker-title-field">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => persistActive()}
              maxLength={120}
            />
          </label>
          <div className="tiermaker-map-field">
            <span className="tiermaker-field-label">Map</span>
            <MapNamePicker
              maps={mapOptions}
              selectedMap={mapName}
              onSelect={selectMap}
              onRequestAdd={() => setShowAddMap(true)}
            />
          </div>
          <div className="tiermaker-actions">
            <button type="button" onClick={() => void handlePng()} disabled={pngBusy}>
              {pngBusy ? 'Exporting…' : 'Download PNG'}
            </button>
            <button type="button" onClick={() => setBrowserOpen(true)}>
              Community Browser
            </button>
            {user ? (
              <button
                type="button"
                className="accent-btn"
                onClick={() => {
                  persistActive()
                  setPublishOpen(true)
                }}
              >
                Share to Community
              </button>
            ) : null}
          </div>
        </div>

        {status ? <p className="hint preset-status">{status}</p> : null}

        <TierMakerEditor
          entries={entries}
          onChange={(next) => {
            const cleaned = stripMarkers(next)
            setEntries(cleaned)
            if (active) {
              onChange(
                upsertTierMakerList(store, {
                  ...active,
                  title: title.trim() || 'Untitled tier list',
                  mapName,
                  entries: stripMarkers(normalizeTierEntries(cleaned)),
                }),
              )
            }
          }}
          allowMarkers={false}
        />
      </main>

      <TierListExportSurface title={title} mapName={mapName} entries={entries} exportRef={exportRef} />

      <CommunityPresetBrowser
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onLoad={handleLoadCommunity}
        loadLabel="Load into TierMaker"
      />

      <PublishCommunityPresetModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        defaultTitle={title.trim() || `${mapName} tier list`}
        mapName={mapName}
        payload={{ entries: stripMarkers(normalizeTierEntries(entries)) }}
        onPublished={() => setStatus('Shared to the community browser.')}
      />

      {showAddMap ? (
        <AddMapPopout onClose={() => setShowAddMap(false)} onAdd={handleAddMap} />
      ) : null}
    </div>
  )
}
