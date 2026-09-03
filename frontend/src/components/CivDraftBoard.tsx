import { useMemo } from 'react'
import { CivDraftMapHub } from './CivDraftMapHub'
import { useUiPreferences } from '../lib/useUiPreferences'
import type { CivBoardItem, MapPriorityPreset } from '../types/draft'
import type { DraftStatus } from '../lib/draftStatus'
import type { MapPickDisplay } from '../types/draft'
import type { CivMapAssignmentState, MapAssignmentTarget } from '../lib/civMapAssignments'
import { getSaturatedMaps } from '../lib/civMapAssignments'
import type { AssignMapOptions } from '../lib/useCivMapAssignments'
import { flattenAvailableByRanking } from '../lib/draftState'
import type { MapTopPickGroup } from '../lib/priorities'
import { DraftStatusBadge } from './DraftStatusBadge'
import { MapPickChips } from './MapPickChips'
import { PriorityReason } from './PriorityReason'

interface CivDraftBoardProps {
  items: CivBoardItem[]
  topPicksPerMap: MapTopPickGroup[]
  mapPicks: MapPickDisplay[]
  mapNames: string[]
  civsPerMap: number
  unmatchedMaps: string[]
  draftStatus: DraftStatus | null
  presets: MapPriorityPreset[]
  assignments: CivMapAssignmentState
  saturatedMaps: string[]
  onAssignOwn: (civId: string, target: MapAssignmentTarget, options?: AssignMapOptions) => void
  onAssignOpponent: (civId: string, target: MapAssignmentTarget, options?: AssignMapOptions) => void
}

export function CivDraftBoard({
  items,
  topPicksPerMap,
  mapPicks,
  mapNames,
  civsPerMap,
  unmatchedMaps,
  draftStatus,
  presets,
  assignments,
  saturatedMaps,
  onAssignOwn,
  onAssignOpponent,
}: CivDraftBoardProps) {
  const { preferences } = useUiPreferences()

  const ownPicks = items.filter((item) => item.status === 'own_pick')
  const opponentPicks = items.filter((item) => item.status === 'opponent_pick')
  const adminPicks = items.filter((item) => item.status === 'admin_pick')
  const banned = items.filter((item) => item.status === 'banned')
  const availablePool = useMemo(() => flattenAvailableByRanking(items), [items])
  const topRecommendationIds = useMemo(
    () => new Set(topPicksPerMap.flatMap((group) => group.picks.map((item) => item.id))),
    [topPicksPerMap],
  )

  const opponentSaturatedMaps = useMemo(
    () =>
      getSaturatedMaps(
        mapNames,
        opponentPicks.map((pick) => pick.id),
        assignments.opponent,
        civsPerMap,
      ),
    [mapNames, opponentPicks, assignments.opponent, civsPerMap],
  )

  const showOpponentPrediction =
    opponentPicks.length > 0 && !preferences.hideOpponentPrediction

  return (
    <section className="panel civ-board civ-board-fill">
      <header className="board-header civ-board-header">
        <MapPickChips picks={mapPicks} emptyLabel="Waiting for map picks…" />
        {draftStatus ? <DraftStatusBadge status={draftStatus} /> : null}
      </header>

      {unmatchedMaps.length ? (
        <p className="hint map-tracker-hint">No preset found for: {unmatchedMaps.join(', ')}</p>
      ) : null}

      <div className="civ-board-main">
        <CivDraftMapHub
          variant="own"
          maps={mapPicks}
          mapNames={mapNames}
          civsPerMap={civsPerMap}
          topPicksPerMap={topPicksPerMap}
          allItems={items}
          presets={presets}
          picks={ownPicks}
          assignments={assignments.own}
          countingPools={assignments.ownCountingPool}
          saturatedMaps={saturatedMaps}
          draftStatus={draftStatus}
          onAssign={onAssignOwn}
        />

        <div className="civ-draft-bottom">
          <div className="section-block available-pool civ-draft-bottom-pool">
            <h3 className="pool-heading">Available ({availablePool.length})</h3>
            <div className="civ-draft-pool-grid">
              {availablePool.map((item) => (
                <CivCard key={item.id} item={item} highlightTop={topRecommendationIds.has(item.id)} />
              ))}
            </div>
          </div>

          {adminPicks.length || opponentPicks.length ? (
            <div className="section-block civ-draft-bottom-picks">
              <h3>Opponent picks</h3>
              {adminPicks.length ? (
                <>
                  <h4 className="civ-draft-picks-subheading">Admin</h4>
                  <div className="civ-draft-pool-grid">
                    {adminPicks.map((item) => (
                      <CivCard key={item.id} item={item} />
                    ))}
                  </div>
                </>
              ) : null}
              {opponentPicks.length ? (
                <div className="civ-draft-pool-grid">
                  {opponentPicks.map((item) => (
                    <CivCard key={item.id} item={item} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {showOpponentPrediction ? (
          <CivDraftMapHub
            variant="opponent"
            maps={mapPicks}
            mapNames={mapNames}
            civsPerMap={civsPerMap}
            allItems={items}
            presets={presets}
            picks={opponentPicks}
            assignments={assignments.opponent}
            countingPools={assignments.opponentCountingPool}
            saturatedMaps={opponentSaturatedMaps}
            onAssign={onAssignOpponent}
            flexPanelLabel="Opponent picks"
          />
        ) : null}
      </div>

      {banned.length && !preferences.hideBannedCivs ? (
        <div className="section-block banned-section">
          <h3>Banned ({banned.length})</h3>
          <div className="draft-grid civ-grid">
            {banned.map((item) => (
              <CivCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function CivCard({
  item,
  compact,
  highlightTop,
  rank,
}: {
  item: CivBoardItem
  compact?: boolean
  highlightTop?: boolean
  rank?: number
}) {
  const displayTier = item.priorityTier
  const priorityClass =
    item.status === 'available' && displayTier ? ` priority-${displayTier.toLowerCase()}` : ''
  const showMapTooltip = Boolean(item.priorityReasonParts?.length)

  return (
    <article
      className={`draft-card civ-card civ-card-tile status-${item.status}${priorityClass}${showMapTooltip ? ' has-map-tooltip' : ''}${compact ? ' civ-card-tile-sm' : ''}${highlightTop ? ' top-recommendation' : ''}`}
      aria-label={showMapTooltip ? item.priorityReason : undefined}
    >
      {rank ? <em className="rank-tag">#{rank}</em> : null}
      <img src={item.imageUrl} alt={item.name} loading="lazy" />
      <span>{item.name}</span>
      {item.status === 'admin_pick' ? <em className="admin-tag">Admin</em> : null}
      {displayTier ? <em className="tier-tag">{displayTier}</em> : null}
      {showMapTooltip ? (
        <div className="civ-card-tooltip">
          <PriorityReason parts={item.priorityReasonParts!} />
        </div>
      ) : null}
    </article>
  )
}
