import { useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import type { CivBoardItem, MapPickDisplay, MapPriorityPreset } from '../types/draft'
import { poolAvailabilityTone, poolIconUrl } from '../lib/pools'
import {
  getMapPoolPressure,
  getMapTierPressure,
  isMapAdvancedPreset,
  mapPresetHasKeyCivs,
  type MapPoolPressureEntry,
  type MapTierPressure,
  type MapTopPickGroup,
} from '../lib/priorities'
import {
  assignmentSlotIndex,
  mapAssignmentWithSlot,
  picksForMap,
  picksInFlex,
  type MapAssignmentTarget,
} from '../lib/civMapAssignments'
import type { DraftStatus } from '../lib/draftStatus'
import { useUiPreferences } from '../lib/useUiPreferences'
import type { FullMapTopPicksMode } from '../lib/uiPreferences'
import { normalizeMapName } from '../lib/maps'
import { DraggableCivTile, MapDropZone, readDragPayload, type TrackerTeam } from './civMapDrag'
import { PriorityReason } from './PriorityReason'

export type CivMapHubVariant = 'own' | 'opponent'

interface CivDraftMapHubProps {
  variant?: CivMapHubVariant
  maps: MapPickDisplay[]
  mapNames: string[]
  civsPerMap: number
  topPicksPerMap?: MapTopPickGroup[]
  allItems?: CivBoardItem[]
  presets?: MapPriorityPreset[]
  picks: CivBoardItem[]
  assignments: Record<string, MapAssignmentTarget>
  saturatedMaps: string[]
  draftStatus?: DraftStatus | null
  onAssign: (civId: string, target: MapAssignmentTarget) => void
  flexPanelLabel?: string
}

interface MapColumnData {
  map: MapPickDisplay
  picks: CivBoardItem[]
  keyCivs: CivBoardItem[]
  tierPressure: MapTierPressure
  poolPressure: MapPoolPressureEntry[]
  advancedMode: boolean
  saturated: boolean
}

function picksBySlot(
  picks: CivBoardItem[],
  assignments: Record<string, MapAssignmentTarget>,
  mapId: string,
  mapNames: string[],
  slotCount: number,
): Array<CivBoardItem | null> {
  const assigned = picksForMap(picks, mapId, assignments, mapNames)
  const slots: Array<CivBoardItem | null> = Array.from({ length: slotCount }, () => null)
  const overflow: CivBoardItem[] = []

  for (const pick of assigned) {
    const slotIndex = assignmentSlotIndex(assignments[pick.id])
    if (slotIndex != null && slotIndex >= 0 && slotIndex < slotCount && slots[slotIndex] == null) {
      slots[slotIndex] = pick
      continue
    }
    overflow.push(pick)
  }

  for (const pick of overflow) {
    const freeIndex = slots.findIndex((entry) => entry == null)
    if (freeIndex < 0) break
    slots[freeIndex] = pick
  }

  return slots
}

const YOUR_PICKS_COLUMN_DEPTH = 5

function chunkIntoColumns<T>(items: T[], columnDepth: number): T[][] {
  if (!items.length) return [[]]
  const columns: T[][] = []
  for (let index = 0; index < items.length; index += columnDepth) {
    columns.push(items.slice(index, index + columnDepth))
  }
  return columns
}

function shouldShowTopPicksForColumn(
  mode: FullMapTopPicksMode,
  saturated: boolean,
  draftFinished: boolean,
  hasPicks: boolean,
): 'hidden' | 'visible' | 'dimmed' {
  if (!hasPicks || draftFinished) return 'hidden'
  if (!saturated) return 'visible'
  if (mode === 'show') return 'visible'
  if (mode === 'dim') return 'dimmed'
  return 'hidden'
}

export function CivDraftMapHub({
  variant = 'own',
  maps,
  mapNames,
  civsPerMap,
  topPicksPerMap = [],
  allItems = [],
  presets = [],
  picks,
  assignments,
  saturatedMaps,
  draftStatus = null,
  onAssign,
  flexPanelLabel,
}: CivDraftMapHubProps) {
  const { preferences } = useUiPreferences()
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const team: TrackerTeam = variant === 'own' ? 'own' : 'opponent'
  const showTopPicksSection = variant === 'own'
  const draftFinished = draftStatus === 'finished'
  const fullMapMode = preferences.fullMapTopPicksMode

  const topByMapId = useMemo(
    () => new Map(topPicksPerMap.map((group) => [group.mapId, group])),
    [topPicksPerMap],
  )

  const uniqueMapCount = useMemo(() => {
    const unique = new Set(maps.map((map) => normalizeMapName(map.name)))
    return unique.size
  }, [maps])
  const showSingleMapLayout = uniqueMapCount === 1

  const poolPressureContext = useMemo(
    () =>
      showSingleMapLayout
        ? undefined
        : {
            mode: 'map-assigned' as const,
            ownPicks: picks,
            assignments,
            mapNames,
          },
    [showSingleMapLayout, picks, assignments, mapNames],
  )

  const columns: MapColumnData[] = useMemo(
    () =>
      maps.map((map) => {
        const group = topByMapId.get(map.id)
        const saturated = saturatedMaps.includes(map.id)
        const mapPoolContext = poolPressureContext
          ? { ...poolPressureContext, mapId: map.id }
          : undefined
        return {
          map,
          picks: group?.picks ?? [],
          keyCivs: group?.keyCivs ?? [],
          tierPressure:
            group?.tierPressure ?? getMapTierPressure(presets, map.name, allItems),
          poolPressure: getMapPoolPressure(
            presets,
            map.name,
            allItems,
            mapPoolContext,
          ),
          advancedMode:
            group?.advancedMode ?? isMapAdvancedPreset(presets, map.name),
          saturated,
        }
      }),
    [maps, topByMapId, saturatedMaps, presets, allItems, poolPressureContext],
  )

  const unassignedPicks = picksInFlex(picks, assignments, mapNames)
  const flexColumns = useMemo(
    () => chunkIntoColumns(unassignedPicks, YOUR_PICKS_COLUMN_DEPTH),
    [unassignedPicks],
  )

  const handleDrop = (target: MapAssignmentTarget, event: DragEvent) => {
    event.preventDefault()
    setDragOverKey(null)
    const payload = readDragPayload(event)
    if (!payload || payload.team !== team) return

    let resolvedTarget = target
    if (target !== 'flex') {
      const assignedOnMap = picksForMap(picks, target, assignments, mapNames)
      const civAlreadyOnMap = assignedOnMap.some((pick) => pick.id === payload.civId)
      if (assignedOnMap.length >= civsPerMap && !civAlreadyOnMap) {
        resolvedTarget = 'flex'
      }
    }

    onAssign(payload.civId, resolvedTarget)
  }

  const singleMapColumn = showSingleMapLayout ? columns[0]! : null
  // One unique map: AVAILABLE ranking is enough; Top 3 per column is redundant.
  const showTopPicks = showTopPicksSection && !showSingleMapLayout

  const hasVisibleTopPicks =
    showTopPicks &&
    !draftFinished &&
    columns.some((column) => {
      const mode = shouldShowTopPicksForColumn(
        fullMapMode,
        column.saturated,
        draftFinished,
        column.picks.length > 0 ||
          (mapPresetHasKeyCivs(presets, column.map.name) && column.keyCivs.length > 0),
      )
      return mode !== 'hidden'
    })

  const resolvedFlexLabel =
    flexPanelLabel ?? (variant === 'own' ? 'Your picks' : 'Opponent picks')

  if (!maps.length) return null

  return (
    <div
      className={`section-block civ-draft-hub civ-draft-hub-${variant}${hasVisibleTopPicks ? '' : ' civ-draft-hub-compact'}${showSingleMapLayout ? ' civ-draft-hub-single-map' : ''}`}
    >
      <div className="civ-draft-hub-maps">
        {showSingleMapLayout && singleMapColumn ? (
          <div className="civ-draft-single-map-header">
            <div className="civ-draft-map-hero">
              {singleMapColumn.map.imageUrl ? (
                <img src={singleMapColumn.map.imageUrl} alt="" loading="lazy" />
              ) : (
                <span className="civ-draft-map-fallback">{singleMapColumn.map.name.charAt(0)}</span>
              )}
              <span className="civ-draft-map-name">{singleMapColumn.map.name}</span>
            </div>
            <MapPressureHint
              advancedMode={singleMapColumn.advancedMode}
              tierPressure={singleMapColumn.tierPressure}
              poolPressure={singleMapColumn.poolPressure}
            />
          </div>
        ) : null}
        <div className="civ-draft-hub-map-strip">
          {columns.map((column, columnIndex) => {
            const assigned = picksForMap(picks, column.map.id, assignments, mapNames)
            const slotPicks = picksBySlot(picks, assignments, column.map.id, mapNames, civsPerMap)
            const count = assigned.length
            const remaining = Math.max(0, civsPerMap - count)
            const zoneKey = `${variant}:map:${column.map.id}`
            const columnHasKeyCivPreset = mapPresetHasKeyCivs(presets, column.map.name)
            const topPickMode = shouldShowTopPicksForColumn(
              fullMapMode,
              column.saturated,
              draftFinished,
              column.picks.length > 0 || (columnHasKeyCivPreset && column.keyCivs.length > 0),
            )

            return (
              <div
                key={column.map.id}
                className={`civ-draft-map-column${column.saturated ? ' civ-draft-map-column-saturated' : ''}`}
              >
                {showSingleMapLayout ? (
                  <span className="civ-draft-map-game-label">G{columnIndex + 1}</span>
                ) : null}

                <div className="civ-draft-map-section civ-draft-map-assign">
                  <span className="civ-draft-map-section-label">Assignment</span>
                  <MapDropZone
                    zoneKey={zoneKey}
                    vertical
                    dragOverKey={dragOverKey}
                    onDragOver={() => {
                      if (!column.saturated) setDragOverKey(zoneKey)
                    }}
                    onDragLeave={() =>
                      setDragOverKey((current) => (current === zoneKey ? null : current))
                    }
                    onDrop={(event) => handleDrop(column.map.id, event)}
                    className="civ-draft-assign-slots"
                    style={{ '--assign-slot-count': civsPerMap } as CSSProperties}
                  >
                    {Array.from({ length: civsPerMap }, (_, slotIndex) => {
                      const pick = slotPicks[slotIndex]
                      const slotZoneKey = `${zoneKey}:slot:${slotIndex}`
                      const slotTarget = mapAssignmentWithSlot(column.map.id, slotIndex)

                      if (pick) {
                        return (
                          <div
                            key={`${column.map.id}-slot-${slotIndex}`}
                            className={`civ-draft-assign-slot${dragOverKey === slotZoneKey ? ' map-drop-zone-dragover' : ''}`}
                            onDragOver={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              event.dataTransfer.dropEffect = 'move'
                              setDragOverKey(slotZoneKey)
                            }}
                            onDragLeave={() =>
                              setDragOverKey((current) => (current === slotZoneKey ? null : current))
                            }
                            onDrop={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              const payload = readDragPayload(event)
                              if (!payload || payload.team !== team) return
                              if (payload.civId !== pick.id) {
                                onAssign(pick.id, 'flex')
                              }
                              handleDrop(slotTarget, event)
                            }}
                          >
                            <DraggableCivTile pick={pick} team={team} size="sm" />
                          </div>
                        )
                      }
                      return (
                        <div
                          key={`${column.map.id}-slot-${slotIndex}`}
                          className={`civ-draft-assign-slot-placeholder${dragOverKey === slotZoneKey ? ' map-drop-zone-dragover' : ''}`}
                          onDragOver={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            event.dataTransfer.dropEffect = 'move'
                            setDragOverKey(slotZoneKey)
                          }}
                          onDragLeave={() =>
                            setDragOverKey((current) => (current === slotZoneKey ? null : current))
                          }
                          onDrop={(event) => {
                            event.stopPropagation()
                            handleDrop(slotTarget, event)
                          }}
                          aria-hidden
                        />
                      )
                    })}
                  </MapDropZone>
                  <span className="civ-draft-map-count" title={`${count} of ${civsPerMap} assigned`}>
                    {count}/{civsPerMap}
                    {remaining > 0 ? <em>{remaining} left</em> : null}
                    {column.saturated ? <em className="full-tag">full</em> : null}
                  </span>
                </div>

                {!showSingleMapLayout ? (
                  <div className="civ-draft-map-hero">
                    {column.map.imageUrl ? (
                      <img src={column.map.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="civ-draft-map-fallback">{column.map.name.charAt(0)}</span>
                    )}
                    <span className="civ-draft-map-name">{column.map.name}</span>
                  </div>
                ) : null}

                {!showSingleMapLayout ? (
                  <MapColumnPressure
                    advancedMode={column.advancedMode}
                    tierPressure={column.tierPressure}
                    poolPressure={column.poolPressure}
                    civsPerMap={civsPerMap}
                  />
                ) : null}

                {showTopPicks && topPickMode !== 'hidden' ? (
                  <div
                    className={`civ-draft-map-section civ-draft-map-recommendations${topPickMode === 'dimmed' ? ' civ-draft-map-top-picks-dimmed' : ''}${columnHasKeyCivPreset ? ' civ-draft-map-recommendations-split' : ''}`}
                  >
                    <div className="civ-draft-map-top-picks">
                      <span className="civ-draft-map-section-label">Top 3 picks</span>
                      <div className="civ-draft-top-picks-stack">
                        {column.picks.map((item, index) => (
                          <HubPickCard key={item.id} item={item} rank={index + 1} />
                        ))}
                      </div>
                    </div>
                    {columnHasKeyCivPreset ? (
                      <div className="civ-draft-map-key-civs">
                        <span className="civ-draft-map-section-label">Key civs</span>
                        <div className="civ-draft-top-picks-stack">
                          {column.keyCivs.map((item) => (
                            <HubPickCard key={item.id} item={item} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        <MapDropZone
          zoneKey={`${variant}:flex`}
          vertical
          dragOverKey={dragOverKey}
          onDragOver={() => setDragOverKey(`${variant}:flex`)}
          onDragLeave={() =>
            setDragOverKey((current) => (current === `${variant}:flex` ? null : current))
          }
          onDrop={(event) => handleDrop('flex', event)}
          className={`civ-draft-own-picks${variant === 'opponent' ? ' civ-draft-opponent-picks' : ''}`}
        >
          <span className="civ-draft-map-section-label">{resolvedFlexLabel}</span>
          <div className="civ-draft-own-picks-columns">
            {flexColumns.map((columnPicks, columnIndex) => (
              <div key={`${variant}-flex-col-${columnIndex}`} className="civ-draft-own-picks-col">
                {columnPicks.map((pick) => (
                  <DraggableCivTile key={pick.id} pick={pick} team={team} size="sm" />
                ))}
              </div>
            ))}
          </div>
        </MapDropZone>
      </div>
    </div>
  )
}

function MapColumnPressure({
  advancedMode,
  tierPressure,
  poolPressure,
  civsPerMap,
}: {
  advancedMode: boolean
  tierPressure: MapTierPressure
  poolPressure: MapPoolPressureEntry[]
  civsPerMap: number
}) {
  if (advancedMode && poolPressure.length > 0) {
    return (
      <div
        className="civ-draft-map-pool-tiers"
        title="Remaining S/A-tier civs per pool, and your picks on this map"
      >
        <span className="civ-draft-map-section-label">Pools left</span>
        <div className="civ-draft-map-pool-tiers-list">
          {poolPressure.map((pool) => (
            <PoolTierRow key={pool.id} pool={pool} civsPerMap={civsPerMap} compact />
          ))}
        </div>
      </div>
    )
  }

  return <MapTierPressureHint pressure={tierPressure} />
}

function MapPressureHint({
  advancedMode,
  tierPressure,
  poolPressure,
}: {
  advancedMode: boolean
  tierPressure: MapTierPressure
  poolPressure: MapPoolPressureEntry[]
}) {
  if (advancedMode && poolPressure.length > 0) {
    return (
      <div
        className="civ-draft-pool-pressure civ-draft-map-pool-tiers civ-draft-map-pool-tiers-wide"
        title="Remaining S/A-tier civs per pool, and your picks in this draft"
      >
        <span className="civ-draft-map-section-label civ-draft-pool-pressure-heading">
          Pools left
        </span>
        <div className="civ-draft-map-pool-tiers-list">
          {poolPressure.map((pool) => (
            <PoolTierRow key={pool.id} pool={pool} showTotalRemaining />
          ))}
        </div>
      </div>
    )
  }

  return <MapTierPressureHint pressure={tierPressure} />
}

function PoolTierRow({
  pool,
  civsPerMap,
  compact = false,
  showTotalRemaining = false,
}: {
  pool: MapPoolPressureEntry
  civsPerMap?: number
  compact?: boolean
  showTotalRemaining?: boolean
}) {
  const remaining = Math.max(0, pool.total - pool.gone)
  const sLeft = Math.max(0, pool.tiers.s.total - pool.tiers.s.gone)
  const aLeft = Math.max(0, pool.tiers.a.total - pool.tiers.a.gone)
  const tone = poolAvailabilityTone(remaining)
  const pickCap = pool.maxPicks ?? civsPerMap
  const atCap = pickCap != null && pickCap > 0 && pool.ownPicked >= pickCap
  const title = [
    `${pool.name}: ${remaining}/${pool.total} left`,
    pool.tiers.s.total ? `S ${sLeft}/${pool.tiers.s.total}` : null,
    pool.tiers.a.total ? `A ${aLeft}/${pool.tiers.a.total}` : null,
    pickCap != null ? `picks ${pool.ownPicked}/${pickCap}` : `picks ${pool.ownPicked}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={`civ-draft-pool-tiers-row${compact ? ' civ-draft-pool-tiers-row-compact' : ''}${atCap ? ' civ-draft-pool-tiers-at-cap' : ''}`}
      title={title}
    >
      <span className={`civ-draft-pool-tiers-name civ-draft-pool-tone-${tone}`}>{pool.name}</span>
      <div className="civ-draft-pool-tiers-chips">
        {pool.tiers.s.total > 0 ? (
          <TierLeftChip tier="S" left={sLeft} total={pool.tiers.s.total} />
        ) : null}
        {pool.tiers.a.total > 0 ? (
          <TierLeftChip tier="A" left={aLeft} total={pool.tiers.a.total} />
        ) : null}
        {pool.tiers.s.total === 0 && pool.tiers.a.total === 0 && showTotalRemaining ? (
          <span className="civ-draft-pool-tiers-fallback">{remaining}</span>
        ) : null}
      </div>
      <img
        src={poolIconUrl(pool.name)}
        alt=""
        className="civ-draft-pool-tiers-icon"
        draggable={false}
      />
      <span className="civ-draft-pool-tiers-picks">
        {pool.ownPicked}
        {pickCap != null ? `/${pickCap}` : ''}
      </span>
    </div>
  )
}

function TierLeftChip({
  tier,
  left,
  total,
}: {
  tier: 'S' | 'A'
  left: number
  total: number
}) {
  const depleted = left === 0
  const tight = !depleted && left <= (tier === 'S' ? 1 : 2)

  return (
    <span
      className={`civ-draft-tier-chip legend-tier tier-${tier.toLowerCase()}${depleted ? ' civ-draft-tier-chip-gone' : ''}${tight ? ' civ-draft-tier-chip-tight' : ''}`}
      title={`${tier}-tier: ${left} of ${total} left`}
    >
      <em>{tier}</em>
      {left}
    </span>
  )
}

function MapTierPressureHint({ pressure }: { pressure: MapTierPressure }) {
  const sRemaining = pressure.s.total - pressure.s.gone
  const aRemaining = pressure.a.total - pressure.a.gone
  const hasS = pressure.s.total > 0
  const hasA = pressure.a.total > 0

  if (!hasS && !hasA) return null

  const sCritical = hasS && sRemaining === 0
  const aCritical = hasA && aRemaining === 0
  const sTight = hasS && sRemaining <= 1 && !sCritical
  const aTight = hasA && aRemaining <= 2 && !aCritical

  const severity =
    sCritical || aCritical ? 'critical' : sTight || aTight ? 'tight' : 'ok'

  return (
    <div
      className={`civ-draft-tier-pressure civ-draft-tier-pressure-chips civ-draft-tier-pressure-${severity}`}
      title="Remaining S- and A-tier civs on this map (left of total)"
    >
      <span className="civ-draft-map-section-label">S / A left</span>
      <div className="civ-draft-tier-pressure-row">
        {hasS ? <TierLeftChip tier="S" left={sRemaining} total={pressure.s.total} /> : null}
        {hasA ? <TierLeftChip tier="A" left={aRemaining} total={pressure.a.total} /> : null}
      </div>
    </div>
  )
}

function HubPickCard({ item, rank }: { item: CivBoardItem; rank?: number }) {
  const displayTier = item.priorityTier
  const priorityClass =
    item.status === 'available' && displayTier ? ` priority-${displayTier.toLowerCase()}` : ''
  const showMapTooltip = Boolean(item.priorityReasonParts?.length)

  return (
    <article
      className={`draft-card civ-card civ-card-tile civ-card-tile-sm status-${item.status}${priorityClass}${showMapTooltip ? ' has-map-tooltip' : ''} top-recommendation`}
      aria-label={showMapTooltip ? item.priorityReason : undefined}
    >
      {rank ? <em className="rank-tag">#{rank}</em> : null}
      <img src={item.imageUrl} alt={item.name} loading="lazy" />
      <span>{item.name}</span>
      {displayTier ? <em className="tier-tag">{displayTier}</em> : null}
      {showMapTooltip ? (
        <div className="civ-card-tooltip">
          <PriorityReason parts={item.priorityReasonParts!} />
        </div>
      ) : null}
    </article>
  )
}
