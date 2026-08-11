export interface AoeDataOverview {
  patchLabel: string
  source: string
  civCount: number
  techCount: number
  unitCount: number
  buildingCount: number
  synergyCount: number
}

export interface AoeDataEntity {
  id: string
  type: 'tech' | 'unit' | 'building'
  internalName: string
  name: string
  civCount?: number
  totalCivs?: number
  civs?: string[]
  missingCivs?: string[]
  patchLabel?: string
}

export interface AoeDataEntitySearchResponse {
  query: string
  results: AoeDataEntity[]
}

export interface AoeDataIntersectionResponse {
  entities: AoeDataEntity[]
  civs: string[]
  civCount: number
  totalCivs: number
  patchLabel?: string
}

export interface AoeDataSimilarityNeighbor {
  civ: string
  similarity: number
}

export interface AoeDataSimilarityResponse {
  civ: string
  found: boolean
  neighbors: AoeDataSimilarityNeighbor[]
  patchLabel?: string
  method?: string
}

export interface AoeDataSynergy {
  id: string
  title: string
  civA: string
  civB: string
  category: string
  strength: string
  explanation: string
  effects?: string[]
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const parsed = (await response.json()) as { detail?: string }
    if (parsed.detail) return parsed.detail
  } catch {
    // ignore
  }
  return fallback
}

export async function fetchAoeDataOverview(): Promise<AoeDataOverview> {
  const response = await fetch('/api/aoe-data/overview')
  if (!response.ok) throw new Error(await readError(response, 'Could not load overview'))
  return response.json()
}

export async function fetchAoeDataCivs(): Promise<string[]> {
  const response = await fetch('/api/aoe-data/civs')
  if (!response.ok) throw new Error(await readError(response, 'Could not load civ list'))
  const parsed = (await response.json()) as { civs?: string[] }
  return parsed.civs ?? []
}

export async function searchAoeDataEntities(query: string): Promise<AoeDataEntity[]> {
  const response = await fetch(`/api/aoe-data/entities/search?q=${encodeURIComponent(query)}`)
  if (!response.ok) throw new Error(await readError(response, 'Search failed'))
  const parsed = (await response.json()) as AoeDataEntitySearchResponse
  return parsed.results ?? []
}

export async function fetchAoeDataEntity(type: string, id: string): Promise<AoeDataEntity> {
  const response = await fetch(`/api/aoe-data/entities/${encodeURIComponent(type)}/${encodeURIComponent(id)}`)
  if (!response.ok) throw new Error(await readError(response, 'Entity not found'))
  return response.json()
}

export async function fetchAoeDataIntersection(keys: string[]): Promise<AoeDataIntersectionResponse> {
  const response = await fetch(
    `/api/aoe-data/entities/intersection?keys=${encodeURIComponent(keys.join(','))}`,
  )
  if (!response.ok) throw new Error(await readError(response, 'Intersection failed'))
  return response.json()
}

export async function fetchAoeDataSimilarity(civ: string): Promise<AoeDataSimilarityResponse> {
  const response = await fetch(`/api/aoe-data/civ-similarity/${encodeURIComponent(civ)}`)
  if (!response.ok) throw new Error(await readError(response, 'Similarity failed'))
  return response.json()
}

export async function fetchAoeDataSynergies(category?: string): Promise<AoeDataSynergy[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : ''
  const response = await fetch(`/api/aoe-data/synergies${params}`)
  if (!response.ok) throw new Error(await readError(response, 'Could not load synergies'))
  const parsed = (await response.json()) as { synergies?: AoeDataSynergy[] }
  return parsed.synergies ?? []
}

export type AoeDataSection = 'overview' | 'tech' | 'dna' | 'synergies' | 'meta'

export const AOE_DATA_SECTIONS: { id: AoeDataSection; label: string; blurb: string }[] = [
  {
    id: 'overview',
    label: 'Overview',
    blurb: 'Headlines and entry points into AoE2 data.',
  },
  {
    id: 'tech',
    label: 'Tech Tree',
    blurb: 'Search technologies, units, and civ intersections.',
  },
  {
    id: 'dna',
    label: 'Civilization DNA',
    blurb: 'Structural similarity from tech-tree access.',
  },
  {
    id: 'synergies',
    label: 'Hidden Synergies',
    blurb: 'Curated bonus interactions beyond plain text.',
  },
  {
    id: 'meta',
    label: 'The Meta',
    blurb: 'Ladder and tournament statistics.',
  },
]
