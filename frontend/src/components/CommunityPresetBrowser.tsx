import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthProvider'
import { isAdminUser } from '../lib/admin'
import { civIconUrl } from '../lib/civs'
import {
  deleteCommunityPreset,
  getCommunityPreset,
  listCommunityAuthors,
  listCommunityMaps,
  listCommunityPresets,
  publishCommunityPreset,
  setFeaturedCommunityPreset,
  voteCommunityPreset,
  type CommunityAuthor,
  type CommunityPresetDetail,
  type CommunityPresetPayload,
  type CommunityPresetSummary,
  type CommunitySort,
} from '../lib/communityPresets'
import { buildTierRowsForExport, hasRankedCivs } from '../lib/tierListExport'
import { civMarker } from '../lib/tiers'
import type { CivPriorityEntry } from '../types/draft'

interface CommunityPresetBrowserProps {
  open: boolean
  onClose: () => void
  onLoad: (detail: CommunityPresetDetail) => void
  loadLabel?: string
}

export function CommunityPresetBrowser({
  open,
  onClose,
  onLoad,
  loadLabel = 'Load into current preset',
}: CommunityPresetBrowserProps) {
  const { user } = useAuth()
  const [sort, setSort] = useState<CommunitySort>('popular')
  const [mapFilter, setMapFilter] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [query, setQuery] = useState('')
  const [maps, setMaps] = useState<string[]>([])
  const [authors, setAuthors] = useState<CommunityAuthor[]>([])
  const [items, setItems] = useState<CommunityPresetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CommunityPresetSummary | null>(null)
  const [preview, setPreview] = useState<CommunityPresetDetail | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const isAdmin = isAdminUser(user)

  const refreshMeta = useCallback(async () => {
    try {
      const [nextMaps, nextAuthors] = await Promise.all([listCommunityMaps(), listCommunityAuthors()])
      setMaps(nextMaps)
      setAuthors(nextAuthors)
    } catch {
      // Filters stay empty if meta fails; list still works.
    }
  }, [])

  const refreshList = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await listCommunityPresets({
        sort,
        map: mapFilter || undefined,
        author: authorFilter || undefined,
        q: query || undefined,
        limit: 50,
      })
      setItems(result.items)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load community presets')
    } finally {
      setBusy(false)
    }
  }, [sort, mapFilter, authorFilter, query])

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setDeleteTarget(null)
      return
    }
    void refreshMeta()
    void refreshList()
  }, [open, refreshMeta, refreshList])

  if (!open) return null

  const handleVote = async (id: string, value: -1 | 0 | 1) => {
    if (!user) {
      setStatus('Log in to vote on community presets.')
      return
    }
    setStatus(null)
    try {
      const updated = await voteCommunityPreset(id, value)
      setItems((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
      setPreview((current) => (current && current.id === updated.id ? { ...current, ...updated } : current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vote failed')
    }
  }

  const handlePreview = async (id: string) => {
    setStatus(null)
    setError(null)
    setPreviewBusy(true)
    try {
      const detail = await getCommunityPreset(id)
      setPreview(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview preset')
    } finally {
      setPreviewBusy(false)
    }
  }

  const handleLoadDetail = (detail: CommunityPresetDetail) => {
    onLoad(detail)
    setStatus(`Loaded “${detail.title}”.`)
    setPreview(null)
    onClose()
  }

  const handleDelete = async (id: string) => {
    if (!user) return
    setError(null)
    try {
      await deleteCommunityPreset(id)
      setItems((current) => current.filter((item) => item.id !== id))
      setTotal((current) => Math.max(0, current - 1))
      if (preview?.id === id) setPreview(null)
      setStatus('Deleted community preset.')
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const handleFeature = async (item: CommunityPresetSummary) => {
    if (!user) return
    setError(null)
    try {
      const updated = await setFeaturedCommunityPreset(item.id, !item.featured)
      setItems((current) => {
        const next = current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row))
        if (sort === 'featured' && !updated.featured) {
          return next.filter((row) => row.id !== updated.id)
        }
        return next
      })
      if (sort === 'featured' && !updated.featured) {
        setTotal((current) => Math.max(0, current - 1))
      }
      setPreview((current) => (current && current.id === updated.id ? { ...current, ...updated } : current))
      setStatus(updated.featured ? `Featured “${updated.title}”.` : `Removed “${updated.title}” from Featured.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feature update failed')
    }
  }

  return (
    <>
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog panel community-browser-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-browser-title"
      >
        <div className="modal-header">
          <h2 id="community-browser-title">Community Preset Browser</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body community-browser-body">
          <div className="community-browser-filters">
            <label>
              Sort
              <select value={sort} onChange={(event) => setSort(event.target.value as CommunitySort)}>
                <option value="featured">Featured</option>
                <option value="popular">Most Popular</option>
                <option value="newest">Newest</option>
              </select>
            </label>
            <label>
              Map
              <select value={mapFilter} onChange={(event) => setMapFilter(event.target.value)}>
                <option value="">All maps</option>
                {maps.map((mapName) => (
                  <option key={mapName} value={mapName}>
                    {mapName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              User
              <select value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)}>
                <option value="">All users</option>
                {authors.map((author) => (
                  <option key={author.id} value={author.id}>
                    {author.display_name} ({author.preset_count})
                  </option>
                ))}
              </select>
            </label>
            <label className="community-browser-search">
              Search title
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by title…"
              />
            </label>
            <button type="button" className="compact-btn" onClick={() => void refreshList()} disabled={busy}>
              Refresh
            </button>
          </div>

          {!user ? <p className="hint">Log in to vote or share your own presets.</p> : null}
          {error ? <p className="hint community-browser-error">{error}</p> : null}
          {status ? <p className="hint">{status}</p> : null}

          {busy && !items.length ? <p className="hint">Loading…</p> : null}
          {!busy && !items.length ? (
            <p className="hint">
              {sort === 'featured'
                ? 'No featured presets yet.'
                : 'No community presets match these filters.'}
            </p>
          ) : null}

          <ul className="community-browser-list">
            {items.map((item) => {
              const canDelete =
                Boolean(item.can_delete) ||
                Boolean(user && (user.id === item.author_id || isAdmin))
              const canFeature = Boolean(item.can_feature) || isAdmin
              return (
                <li
                  key={item.id}
                  className={`community-browser-item${item.featured ? ' community-browser-item-featured' : ''}`}
                >
                  <div className="community-browser-item-main">
                    <div className="community-browser-title-row">
                      <strong>{item.title}</strong>
                      {item.featured ? (
                        <span className="community-browser-featured-badge">Featured</span>
                      ) : null}
                    </div>
                    <span className="community-browser-meta">
                      {item.map_name} · {item.author_name} · {item.entry_count} civs ·{' '}
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="community-browser-item-actions">
                    {user ? (
                      <div className="community-browser-votes" title="Your vote">
                        <button
                          type="button"
                          className={`compact-btn${item.my_vote === 1 ? ' active' : ''}`}
                          onClick={() => void handleVote(item.id, item.my_vote === 1 ? 0 : 1)}
                          aria-label="Upvote"
                        >
                          ▲
                        </button>
                        <span className="community-browser-score">{item.score}</span>
                        <button
                          type="button"
                          className={`compact-btn${item.my_vote === -1 ? ' active' : ''}`}
                          onClick={() => void handleVote(item.id, item.my_vote === -1 ? 0 : -1)}
                          aria-label="Downvote"
                        >
                          ▼
                        </button>
                      </div>
                    ) : (
                      <span className="community-browser-likes" title="Likes">
                        {item.upvote_count} likes
                      </span>
                    )}
                    <button
                      type="button"
                      className="accent-btn"
                      disabled={previewBusy}
                      onClick={() => void handlePreview(item.id)}
                    >
                      Preview
                    </button>
                    {canFeature ? (
                      <button
                        type="button"
                        className="compact-btn"
                        onClick={() => void handleFeature(item)}
                        title={item.featured ? 'Remove from Featured' : 'Highlight as Featured'}
                      >
                        {item.featured ? 'Unfeature' : 'Feature'}
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="compact-btn community-browser-delete"
                        onClick={() => setDeleteTarget(item)}
                        title={
                          isAdmin && user?.id !== item.author_id
                            ? 'Delete as admin'
                            : 'Delete this shared preset'
                        }
                      >
                        {isAdmin && user?.id !== item.author_id ? 'Admin delete' : 'Delete'}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          {total > items.length ? <p className="hint">Showing {items.length} of {total}</p> : null}
        </div>
      </div>
    </div>

      {preview ? (
        <CommunityPresetPreviewModal
          detail={preview}
          loadLabel={loadLabel}
          onClose={() => setPreview(null)}
          onLoad={() => handleLoadDetail(preview)}
        />
      ) : null}

      {deleteTarget ? (
        <div
          className="modal-overlay community-confirm-overlay"
          onClick={() => setDeleteTarget(null)}
          role="presentation"
        >
          <div
            className="modal-dialog panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <h2>Delete community preset?</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setDeleteTarget(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-message">
                Remove “{deleteTarget.title}” ({deleteTarget.map_name}) from the community browser?
                This cannot be undone.
              </p>
              <div className="modal-actions">
                <button type="button" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="accent-btn"
                  onClick={() => void handleDelete(deleteTarget.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function CommunityPresetPreviewModal({
  detail,
  loadLabel,
  onClose,
  onLoad,
}: {
  detail: CommunityPresetDetail
  loadLabel: string
  onClose: () => void
  onLoad: () => void
}) {
  const entries = useMemo(
    () => (Array.isArray(detail.payload.entries) ? detail.payload.entries : []) as CivPriorityEntry[],
    [detail.payload.entries],
  )
  const rows = useMemo(() => buildTierRowsForExport(entries), [entries])
  const markerByCiv = useMemo(() => {
    const map = new Map<string, ReturnType<typeof civMarker>>()
    for (const entry of entries) {
      map.set(entry.civId, civMarker(entry))
    }
    return map
  }, [entries])
  const hasMarkers = useMemo(
    () => [...markerByCiv.values()].some((marker) => marker !== 'none'),
    [markerByCiv],
  )

  return (
        <div
          className="modal-overlay community-preview-overlay"
          onClick={onClose}
          role="presentation"
        >
      <div
        className="modal-dialog panel community-preview-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-preview-title"
      >
        <div className="modal-header">
          <h2 id="community-preview-title">{detail.title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body community-preview-body">
          <p className="community-preview-meta">
            {detail.map_name} · {detail.author_name}
            {detail.featured ? ' · Featured' : ''} · {detail.upvote_count} likes ·{' '}
            {new Date(detail.created_at).toLocaleDateString()}
            {detail.payload.advancedMode ? ' · Advanced pools' : ''}
          </p>
          {hasMarkers ? (
            <p className="hint">
              ★ Key and ☠ Nemesis markers are included when you load into Presets (stripped in TierMaker).
            </p>
          ) : null}

          <div className="community-preview-tiers">
            {rows.map(({ tier, civIds }) => (
              <div key={tier} className={`community-preview-row community-preview-row-${tier.toLowerCase()}`}>
                <span className="community-preview-label">{tier}</span>
                <div className="community-preview-civs">
                  {civIds.map((civId) => {
                    const marker = markerByCiv.get(civId) ?? 'none'
                    return (
                      <div
                        key={civId}
                        className={`community-preview-civ${
                          marker === 'key'
                            ? ' community-preview-civ-key'
                            : marker === 'nemesis'
                              ? ' community-preview-civ-nemesis'
                              : ''
                        }`}
                        title={civId}
                      >
                        {marker === 'key' ? <span aria-hidden>{'\u2605\uFE0E'}</span> : null}
                        {marker === 'nemesis' ? <span aria-hidden>☠</span> : null}
                        <img src={civIconUrl(civId)} alt="" />
                        <span>{civId}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {!hasRankedCivs(entries) ? <p className="hint">No civs ranked in this preset.</p> : null}
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Back
            </button>
            <button type="button" className="accent-btn" onClick={onLoad}>
              {loadLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface PublishCommunityPresetModalProps {
  open: boolean
  onClose: () => void
  defaultTitle: string
  mapName: string
  format?: string
  payload: CommunityPresetPayload
  onPublished?: () => void
}

export function PublishCommunityPresetModal({
  open,
  onClose,
  defaultTitle,
  mapName,
  format = '1v1',
  payload,
  onPublished,
}: PublishCommunityPresetModalProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle)
      setError(null)
    }
  }, [open, defaultTitle])

  if (!open) return null

  const handlePublish = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Title is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await publishCommunityPreset({
        title: trimmed,
        map_name: mapName,
        format,
        payload,
      })
      onPublished?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-community-title"
      >
        <div className="modal-header">
          <h2 id="publish-community-title">Share to Community</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="hint">
            Publishes the <strong>{mapName}</strong> tier list for others to browse and load.
          </p>
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
          </label>
          {error ? <p className="hint community-browser-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="accent-btn" onClick={() => void handlePublish()} disabled={busy}>
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
