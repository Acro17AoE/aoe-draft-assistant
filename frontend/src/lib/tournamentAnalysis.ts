import type { Aoe2cmDraft } from '../types/draft'
import type { Tournament, SetDraftContext, TournamentSet, TournamentFormat } from '../types/results'
import { civIconUrl, extractDraftId } from './civs'
import { deriveCivBoard, deriveMapBoard, extractAllMapPicks } from './draftState'
import { mapNamesMatch, normalizeMapName, resolveMapDisplay } from './maps'
import { collectSavedGames, draftBoardTeamName, isGameSaved } from './results'
import type { AnalysisSection, AnalysisStat } from '../components/AnalysisCard'

interface CountBucket {
  label: string
  count: number
  wins: number
  iconUrl?: string
}

function bump(bucket: Map<string, CountBucket>, key: string, label: string, iconUrl?: string) {
  const current = bucket.get(key) ?? { label, count: 0, wins: 0, iconUrl }
  current.count += 1
  bucket.set(key, current)
}

function bumpWin(bucket: Map<string, CountBucket>, key: string) {
  const current = bucket.get(key)
  if (current) current.wins += 1
}

function toStats(
  bucket: Map<string, CountBucket>,
  valueMode: 'count' | 'winrate' | 'avgPick',
  sortAscending = false,
): AnalysisStat[] {
  const rows = [...bucket.values()]
    .map((row) => {
      const value =
        valueMode === 'winrate'
          ? row.count > 0
            ? row.wins / row.count
            : 0
          : valueMode === 'avgPick'
            ? row.count > 0
              ? row.wins / row.count
              : 0
            : row.count
      const displayValue =
        valueMode === 'winrate'
          ? `${Math.round(value * 100)}% (${row.wins}/${row.count})`
          : valueMode === 'avgPick'
            ? `#${Math.round(value) + 1}`
            : String(row.count)
      return {
        key: row.label,
        label: row.label,
        value,
        displayValue,
        iconUrl: row.iconUrl,
      }
    })
    .sort((a, b) => (sortAscending ? a.value - b.value : b.value - a.value))

  return rows
}

function civStatsFromResults(tournament: Tournament): AnalysisStat[] {
  const bucket = new Map<string, CountBucket>()
  for (const { game } of collectSavedGames(tournament)) {
    for (const sideKey of ['side1', 'side2'] as const) {
      const won = game.winner === sideKey
      for (const member of game[sideKey].members) {
        const civ = member.civ.trim()
        if (!civ) continue
        bump(bucket, civ, civ, civIconUrl(civ))
        if (won) bumpWin(bucket, civ)
      }
    }
  }
  return toStats(bucket, 'winrate')
}

function mapStatsFromResults(tournament: Tournament): AnalysisStat[] {
  const bucket = new Map<string, CountBucket>()
  for (const { game } of collectSavedGames(tournament)) {
    const map = game.map.trim()
    if (!map) continue
    const display = resolveMapDisplay(map)
    bump(bucket, normalizeMapName(map), display.name, display.imageUrl)
  }
  return toStats(bucket, 'count')
}

function civByMapFromResults(tournament: Tournament): AnalysisStat[] {
  const bucket = new Map<string, CountBucket>()
  for (const { game } of collectSavedGames(tournament)) {
    const map = game.map.trim()
    if (!map) continue
    for (const side of [game.side1, game.side2]) {
      for (const member of side.members) {
        const civ = member.civ.trim()
        if (!civ) continue
        const key = `${normalizeMapName(map)}::${civ}`
        bump(bucket, key, `${civ} on ${map}`, civIconUrl(civ))
      }
    }
  }
  return toStats(bucket, 'count').slice(0, 12)
}

function fillDraftPickBucket(
  bucket: Map<string, CountBucket>,
  draft: Aoe2cmDraft,
  ownTeamName: string,
  mode: 'all' | 'own' | 'banned' | 'early',
) {
  for (const item of deriveCivBoard(draft, ownTeamName)) {
    if (mode === 'banned') {
      if (item.status !== 'banned') continue
      bump(bucket, item.name, item.name, item.imageUrl)
      continue
    }

    if (item.status === 'banned' || item.status === 'available') continue
    if (mode === 'own' && item.status !== 'own_pick') continue

    const pickIndex = item.pickIndex ?? 99
    if (mode === 'early' && pickIndex > 2) continue

    const row = bucket.get(item.name) ?? {
      label: item.name,
      count: 0,
      wins: 0,
      iconUrl: item.imageUrl,
    }
    row.count += 1
    row.wins += pickIndex
    bucket.set(item.name, row)
  }
}

function aggregateDraftPickStats(
  tournament: Tournament,
  draftsByUrl: Record<string, Aoe2cmDraft>,
  mode: 'all' | 'own' | 'banned' | 'early',
): AnalysisStat[] {
  const bucket = new Map<string, CountBucket>()
  for (const set of tournament.sets) {
    const context = set.draftContext ?? {}
    const civId = extractDraftId(context.civDraftUrl ?? '')
    if (civId.length < 4) continue
    const draft = draftsByUrl[civId]
    if (!draft) continue
    fillDraftPickBucket(bucket, draft, draftBoardTeamName(context), mode)
  }
  return toStats(bucket, mode === 'early' ? 'avgPick' : 'count', mode === 'early')
}

function fillMapDraftPickBucket(
  bucket: Map<string, CountBucket>,
  draft: Aoe2cmDraft,
  ownTeamName: string,
) {
  for (const item of deriveMapBoard(draft, ownTeamName)) {
    if (item.status === 'banned' || item.status === 'available') continue
    bump(bucket, item.name, item.name, item.imageUrl)
  }
}

function aggregateMapDraftPickStats(
  tournament: Tournament,
  draftsByUrl: Record<string, Aoe2cmDraft>,
): AnalysisStat[] {
  const bucket = new Map<string, CountBucket>()
  for (const set of tournament.sets) {
    const context = set.draftContext ?? {}
    if (context.mapSource !== 'draft') continue
    const mapId = extractDraftId(context.mapDraftUrl ?? '')
    if (mapId.length < 4) continue
    const draft = draftsByUrl[mapId]
    if (!draft) continue
    fillMapDraftPickBucket(bucket, draft, draftBoardTeamName(context))
  }
  return toStats(bucket, 'count')
}

function aggregateManualMapStats(tournament: Tournament): AnalysisStat[] {
  const bucket = new Map<string, CountBucket>()
  for (const set of tournament.sets) {
    const context = set.draftContext ?? {}
    if (context.mapSource === 'single-map' && context.singleMap?.trim()) {
      const display = resolveMapDisplay(context.singleMap)
      bump(bucket, normalizeMapName(context.singleMap), display.name, display.imageUrl)
    }
    if (context.mapSource === 'select') {
      for (const map of context.selectedMaps ?? []) {
        const trimmed = map.trim()
        if (!trimmed) continue
        const display = resolveMapDisplay(trimmed)
        bump(bucket, normalizeMapName(trimmed), display.name, display.imageUrl)
      }
    }
  }
  return toStats(bucket, 'count')
}

function mapPoolFromContext(context: SetDraftContext, mapDraft: Aoe2cmDraft | null): string[] {
  if (context.mapSource === 'single-map' && context.singleMap?.trim()) {
    return [context.singleMap.trim()]
  }
  if (context.mapSource === 'select') {
    return (context.selectedMaps ?? []).map((map) => map.trim()).filter(Boolean)
  }
  if (mapDraft) return extractAllMapPicks(mapDraft)
  return []
}

function civPickRateOnMapsForSet(
  set: TournamentSet,
  format: TournamentFormat,
  civDraft: Aoe2cmDraft,
  context: SetDraftContext,
  mapDraft: Aoe2cmDraft | null,
  target: Map<string, CountBucket>,
) {
  const mapPool = mapPoolFromContext(context, mapDraft)
  const board = deriveCivBoard(civDraft, draftBoardTeamName(context))
  const pickedCivs = board.filter((item) => item.status === 'own_pick' || item.status === 'opponent_pick')

  for (const game of set.games) {
    if (!isGameSaved(game, format)) continue
    const map = game.map.trim()
    if (!map) continue
    if (mapPool.length && !mapPool.some((candidate) => mapNamesMatch(candidate, map))) continue

    for (const side of [game.side1, game.side2]) {
      for (const member of side.members) {
        const civ = member.civ.trim()
        if (!civ) continue
        const drafted = pickedCivs.some((item) => item.name === civ)
        if (!drafted) continue
        bump(target, civ, civ, civIconUrl(civ))
      }
    }
  }
}

function aggregateCivPickRateOnMaps(
  tournament: Tournament,
  draftsByUrl: Record<string, Aoe2cmDraft>,
): AnalysisStat[] {
  const bucket = new Map<string, CountBucket>()
  for (const set of tournament.sets) {
    const context = set.draftContext ?? {}
    const civId = extractDraftId(context.civDraftUrl ?? '')
    if (civId.length < 4) continue
    const civDraft = draftsByUrl[civId]
    if (!civDraft) continue
    const mapId = context.mapSource === 'draft' ? extractDraftId(context.mapDraftUrl ?? '') : ''
    const mapDraft = mapId.length >= 4 ? draftsByUrl[mapId] ?? null : null
    civPickRateOnMapsForSet(set, tournament.format, civDraft, context, mapDraft, bucket)
  }
  return toStats(bucket, 'count')
}

function hasLinkedCivDrafts(tournament: Tournament): boolean {
  return tournament.sets.some(
    (set) => extractDraftId(set.draftContext?.civDraftUrl ?? '').length >= 4,
  )
}

function hasLinkedMapDrafts(tournament: Tournament): boolean {
  return tournament.sets.some((set) => {
    const context = set.draftContext ?? {}
    return (
      context.mapSource === 'draft' &&
      extractDraftId(context.mapDraftUrl ?? '').length >= 4
    )
  })
}

function hasManualMapConfig(tournament: Tournament): boolean {
  return tournament.sets.some((set) => {
    const source = set.draftContext?.mapSource
    return source === 'single-map' || source === 'select'
  })
}

export interface TournamentAnalysisInput {
  tournament: Tournament
  draftsByUrl: Record<string, Aoe2cmDraft>
}

export function buildTournamentAnalysisSections({
  tournament,
  draftsByUrl,
}: TournamentAnalysisInput): AnalysisSection[] {
  const savedCount = collectSavedGames(tournament).length
  const sections: AnalysisSection[] = [
    {
      id: 'overview',
      title: 'Results overview',
      subtitle: `${savedCount} saved game${savedCount === 1 ? '' : 's'} across ${tournament.sets.length} set(s)`,
      stats: [
        {
          key: 'games',
          label: 'Saved games',
          value: savedCount,
        },
        {
          key: 'sets',
          label: 'Sets',
          value: tournament.sets.length,
        },
        {
          key: 'format',
          label: 'Tournament format',
          value: 1,
          displayValue: tournament.format,
        },
      ],
    },
    {
      id: 'civ-winrate',
      title: 'Civ win rate (results)',
      subtitle: 'Win rate when a civ appeared in saved games',
      stats: civStatsFromResults(tournament),
    },
    {
      id: 'map-frequency',
      title: 'Maps played',
      subtitle: 'How often each map appeared in saved results',
      stats: mapStatsFromResults(tournament),
    },
    {
      id: 'civ-by-map',
      title: 'Civ usage by map',
      subtitle: 'Most common civ + map combinations in results',
      stats: civByMapFromResults(tournament),
    },
  ]

  if (hasLinkedCivDrafts(tournament)) {
    sections.push(
      {
        id: 'draft-picks',
        title: 'Civ draft picks',
        subtitle: 'Aggregated across all set civ drafts',
        stats: aggregateDraftPickStats(tournament, draftsByUrl, 'all'),
      },
      {
        id: 'draft-early',
        title: 'Early draft picks',
        subtitle: 'Civs picked in the first three pick slots (lower = earlier)',
        stats: aggregateDraftPickStats(tournament, draftsByUrl, 'early'),
      },
      {
        id: 'draft-bans',
        title: 'Draft bans',
        subtitle: 'Civs banned across linked set civ drafts',
        stats: aggregateDraftPickStats(tournament, draftsByUrl, 'banned'),
      },
      {
        id: 'draft-map-civ',
        title: 'Drafted civs on maps',
        subtitle: 'Played civs from each set civ draft, filtered by that set map pool',
        stats: aggregateCivPickRateOnMaps(tournament, draftsByUrl),
      },
    )
  }

  if (hasLinkedMapDrafts(tournament)) {
    sections.push({
      id: 'map-draft-picks',
      title: 'Map draft picks',
      subtitle: 'Aggregated across all set map drafts',
      stats: aggregateMapDraftPickStats(tournament, draftsByUrl),
    })
  }

  if (hasManualMapConfig(tournament)) {
    sections.push({
      id: 'manual-maps',
      title: 'Configured maps (non-draft)',
      subtitle: '1-map select / select maps from set draft links',
      stats: aggregateManualMapStats(tournament),
    })
  }

  return sections
}
