import type { PresetBundle } from '../types/draft'

export const AOESTATS_DEFAULT_MAPS_1V1 = [
  'Arabia',
  'Arena',
  'MegaRandom',
  'Haboob',
  'Glade',
  'Hideout',
  'Gold Rush',
] as const

export const AOESTATS_DEFAULT_MAPS_TG = [
  'African Clearing',
  'Black Forest',
  'Arabia',
  'Arena',
  'Nomad',
] as const

export type AoestatsGrouping = 'random_map' | 'team_random_map'

export interface AoestatsPresetBundle extends PresetBundle {
  meta?: {
    source?: string
    patch?: number
    grouping?: string
    elo_range?: string
    description?: string
  }
}

export async function fetchAoestatsPresetBundle(
  mapNames?: string[],
  grouping: AoestatsGrouping = 'random_map',
): Promise<AoestatsPresetBundle> {
  const params = new URLSearchParams()
  if (mapNames?.length) params.set('maps', mapNames.join(','))
  params.set('grouping', grouping)
  const query = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(`/api/aoestats/preset-bundle${query}`)
  if (!response.ok) {
    let message = 'Failed to load aoestats data'
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) message = body.detail
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return response.json() as Promise<AoestatsPresetBundle>
}
