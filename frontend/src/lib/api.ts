import type { Aoe2cmDraft, MapAnalysisResponse, TournamentSuggestion } from '../types/draft'
import type { Aoe2cmPreset } from '../types/mapDraftPreset'
import { extractDraftId } from './civs'
import { extractPresetId } from './mapDraftPresets'

async function readApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as { detail?: unknown }
    if (typeof parsed.detail === 'string') {
      return parsed.detail
    }
  } catch {
    // response was plain text
  }
  return text || fallback
}

export async function fetchDraft(draftIdOrUrl: string): Promise<Aoe2cmDraft> {
  const draftId = extractDraftId(draftIdOrUrl)
  const response = await fetch(`/api/draft/${draftId}`)
  if (!response.ok) {
    throw new Error(await readApiError(response, `Failed to load draft ${draftId}`))
  }
  return response.json() as Promise<Aoe2cmDraft>
}

export async function fetchAoe2cmPreset(presetIdOrUrl: string): Promise<Aoe2cmPreset> {
  const presetId = extractPresetId(presetIdOrUrl)
  const response = await fetch(`/api/preset/${encodeURIComponent(presetId)}`)
  if (!response.ok) {
    throw new Error(await readApiError(response, `Failed to load preset ${presetId}`))
  }
  return response.json() as Promise<Aoe2cmPreset>
}

export async function fetchTournamentSuggestions(
  mapDraftId: string,
  civDraftId?: string,
): Promise<{ suggestions: TournamentSuggestion[]; presetName: string }> {
  const params = new URLSearchParams({ map_draft_id: extractDraftId(mapDraftId) })
  if (civDraftId?.trim()) {
    params.set('civ_draft_id', extractDraftId(civDraftId))
  }

  const response = await fetch(`/api/tournament-suggestions?${params}`)
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Failed to load tournament suggestions'))
  }

  return response.json()
}

export async function fetchMapAnalysis(payload: {
  mapDraftId: string
  ownTeamName: string
  tournamentId?: string
  opponentNames?: string[]
}): Promise<MapAnalysisResponse> {
  const body: Record<string, unknown> = {
    map_draft_id: payload.mapDraftId,
    own_team_name: payload.ownTeamName,
    opponent_names: payload.opponentNames ?? [],
  }

  if (payload.tournamentId?.trim()) {
    body.tournament_id = payload.tournamentId.trim()
  }

  const response = await fetch('/api/map-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Map analysis failed'))
  }

  return response.json() as Promise<MapAnalysisResponse>
}
