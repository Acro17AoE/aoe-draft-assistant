import { getAuthToken } from './cloudStorage'
import type { CivPoolDefinition, CivPriorityEntry } from '../types/draft'

export type CommunitySort = 'popular' | 'newest' | 'featured'

export interface CommunityPresetPayload {
  entries: CivPriorityEntry[]
  advancedMode?: boolean
  pools?: CivPoolDefinition[]
}

export interface CommunityPresetSummary {
  id: string
  title: string
  map_name: string
  format: string
  author_id: string
  author_name: string
  score: number
  upvote_count: number
  downvote_count: number
  entry_count: number
  created_at: string
  featured?: boolean
  my_vote: number | null
  can_delete?: boolean
  can_feature?: boolean
}

export interface CommunityPresetDetail extends CommunityPresetSummary {
  payload: CommunityPresetPayload
}

export interface CommunityAuthor {
  id: string
  display_name: string
  preset_count: number
}

export interface ListCommunityPresetsParams {
  sort?: CommunitySort
  map?: string
  author?: string
  q?: string
  offset?: number
  limit?: number
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as { detail?: unknown }
    if (typeof parsed.detail === 'string') return parsed.detail
  } catch {
    // plain text
  }
  return text || fallback
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function listCommunityPresets(
  params: ListCommunityPresetsParams = {},
): Promise<{ items: CommunityPresetSummary[]; total: number }> {
  const search = new URLSearchParams()
  if (params.sort) search.set('sort', params.sort)
  if (params.map?.trim()) search.set('map', params.map.trim())
  if (params.author?.trim()) search.set('author', params.author.trim())
  if (params.q?.trim()) search.set('q', params.q.trim())
  if (params.offset != null) search.set('offset', String(params.offset))
  if (params.limit != null) search.set('limit', String(params.limit))
  const response = await fetch(`/api/community/presets?${search}`, { headers: authHeaders() })
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to load community presets'))
  return response.json() as Promise<{ items: CommunityPresetSummary[]; total: number }>
}

export async function getCommunityPreset(id: string): Promise<CommunityPresetDetail> {
  const response = await fetch(`/api/community/presets/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to load preset'))
  return response.json() as Promise<CommunityPresetDetail>
}

export async function publishCommunityPreset(body: {
  title: string
  map_name: string
  format?: string
  payload: CommunityPresetPayload
}): Promise<CommunityPresetDetail> {
  const response = await fetch('/api/community/presets', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to publish preset'))
  return response.json() as Promise<CommunityPresetDetail>
}

export async function voteCommunityPreset(
  id: string,
  value: -1 | 0 | 1,
): Promise<CommunityPresetSummary> {
  const response = await fetch(`/api/community/presets/${encodeURIComponent(id)}/vote`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ value }),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to vote'))
  return response.json() as Promise<CommunityPresetSummary>
}

export async function deleteCommunityPreset(id: string): Promise<void> {
  const response = await fetch(`/api/community/presets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok && response.status !== 204) {
    throw new Error(await readApiError(response, 'Failed to delete preset'))
  }
}

export async function setFeaturedCommunityPreset(
  id: string,
  featured: boolean,
): Promise<CommunityPresetSummary> {
  const response = await fetch(`/api/community/presets/${encodeURIComponent(id)}/featured`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ featured }),
  })
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to update featured'))
  return response.json() as Promise<CommunityPresetSummary>
}

export async function listCommunityMaps(): Promise<string[]> {
  const response = await fetch('/api/community/maps', { headers: authHeaders() })
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to load maps'))
  const payload = (await response.json()) as { maps: string[] }
  return payload.maps
}

export async function listCommunityAuthors(): Promise<CommunityAuthor[]> {
  const response = await fetch('/api/community/authors', { headers: authHeaders() })
  if (!response.ok) throw new Error(await readApiError(response, 'Failed to load authors'))
  const payload = (await response.json()) as { authors: CommunityAuthor[] }
  return payload.authors
}
