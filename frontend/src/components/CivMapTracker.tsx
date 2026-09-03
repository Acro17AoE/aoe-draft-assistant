import { useState, type DragEvent } from 'react'
import type { CivBoardItem, MapPickDisplay } from '../types/draft'
import { useUiPreferences } from '../lib/useUiPreferences'
import { mapNamesMatch } from '../lib/maps'
import {
  picksForMap,
  picksInFlex,
  type CivMapAssignmentState,
  type MapAssignmentTarget,
} from '../lib/civMapAssignments'
import { DraggableCivTile, MapDropZone, readDragPayload, type TrackerTeam } from './civMapDrag'

interface CivMapTrackerProps {
  maps: MapPickDisplay[]
  mapNames: string[]
  civsPerMap: number
  ownPicks: CivBoardItem[]
  opponentPicks: CivBoardItem[]
  assignments: CivMapAssignmentState
  saturatedMaps: string[]
  onAssignOwn: (
    civId: string,
    target: MapAssignmentTarget,
    options?: { countingPoolId?: string | null },
  ) => void
  onAssignOpponent: (
    civId: string,
    target: MapAssignmentTarget,
    options?: { countingPoolId?: string | null },
  ) => void
}

export function CivMapTracker({
  maps,
  mapNames,
  civsPerMap,
  ownPicks,
  opponentPicks,
  assignments,
  saturatedMaps,
  onAssignOwn,
  onAssignOpponent,
}: CivMapTrackerProps) {
  const { preferences } = useUiPreferences()

  if (!maps.length) return null

  const showOwn = ownPicks.length > 0
  const showOpponent = opponentPicks.length > 0 && !preferences.hideOpponentPrediction
  if (!showOwn && !showOpponent) return null

  return (
    <div className="civ-map-tracker">
      {showOwn ? (
        <MapTrackerSide
          title="Map assignments — your team"
          maps={maps}
          mapNames={mapNames}
          civsPerMap={civsPerMap}
          picks={ownPicks}
          team="own"
          sideAssignments={assignments.own}
          saturatedMaps={saturatedMaps}
          onAssign={onAssignOwn}
        />
      ) : null}
      {showOpponent ? (
        <MapTrackerSide
          title="Map assignments — opponent (prediction)"
          maps={maps}
          mapNames={mapNames}
          civsPerMap={civsPerMap}
          picks={opponentPicks}
          team="opponent"
          sideAssignments={assignments.opponent}
          saturatedMaps={[]}
          onAssign={onAssignOpponent}
          prediction
        />
      ) : null}
    </div>
  )
}

function MapTrackerSide({
  title,
  maps,
  mapNames,
  civsPerMap,
  picks,
  team,
  sideAssignments,
  saturatedMaps,
  onAssign,
  prediction = false,
}: {
  title: string
  maps: MapPickDisplay[]
  mapNames: string[]
  civsPerMap: number
  picks: CivBoardItem[]
  team: TrackerTeam
  sideAssignments: CivMapAssignmentState['own']
  saturatedMaps: string[]
  onAssign: (civId: string, target: MapAssignmentTarget, options?: { countingPoolId?: string | null }) => void
  prediction?: boolean
}) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const flexPicks = picksInFlex(picks, sideAssignments, mapNames)

  const handleDrop = (_rowKey: string, target: MapAssignmentTarget, event: DragEvent) => {
    event.preventDefault()
    setDragOverKey(null)
    const payload = readDragPayload(event)
    if (!payload || payload.team !== team) return
    onAssign(payload.civId, target)
  }

  return (
    <div className={`map-tracker-side${prediction ? ' map-tracker-side-prediction' : ''}`}>
      <h3>{title}</h3>
      <div className="map-tracker-columns">
        {maps.map((map) => {
          const assigned = picksForMap(picks, map.name, sideAssignments, mapNames)
          const count = assigned.length
          const saturated = saturatedMaps.some((name) => mapNamesMatch(name, map.name))
          const remaining = Math.max(0, civsPerMap - count)
          const rowKey = `map:${map.id}`

          return (
            <div
              key={map.id}
              className={`map-tracker-column${saturated ? ' map-tracker-column-saturated' : ''}`}
            >
              <div className="map-tracker-map">
                {map.imageUrl ? (
                  <img src={map.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className="map-tracker-fallback">{map.name.charAt(0)}</span>
                )}
                <span>{map.name}</span>
              </div>
              <MapDropZone
                zoneKey={rowKey}
                vertical
                dragOverKey={dragOverKey}
                onDragOver={() => setDragOverKey(rowKey)}
                onDragLeave={() => setDragOverKey((current) => (current === rowKey ? null : current))}
                onDrop={(event) => handleDrop(rowKey, map.name, event)}
              >
                {assigned.map((pick) => (
                  <DraggableCivTile key={pick.id} pick={pick} team={team} size="sm" />
                ))}
                {remaining > 0 && !assigned.length ? (
                  <span className="map-drop-hint">Drop here</span>
                ) : null}
              </MapDropZone>
              <div className="map-tracker-count" title={`${count} of ${civsPerMap} civs assigned`}>
                {count}/{civsPerMap}
                {!prediction && remaining > 0 ? (
                  <span className="map-tracker-remaining">{remaining} left</span>
                ) : null}
                {!prediction && saturated ? (
                  <span className="map-tracker-full">full</span>
                ) : null}
              </div>
            </div>
          )
        })}

        <div className="map-tracker-column map-tracker-column-flex">
          <div className="map-tracker-map">
            <span className="map-tracker-flex-label">FLEX</span>
          </div>
          <MapDropZone
            zoneKey="flex"
            vertical
            dragOverKey={dragOverKey}
            onDragOver={() => setDragOverKey('flex')}
            onDragLeave={() => setDragOverKey((current) => (current === 'flex' ? null : current))}
            onDrop={(event) => handleDrop('flex', 'flex', event)}
          >
            {flexPicks.length ? (
              flexPicks.map((pick) => (
                <DraggableCivTile key={pick.id} pick={pick} team={team} size="sm" />
              ))
            ) : (
              <span className="map-drop-hint">Drop here</span>
            )}
          </MapDropZone>
          <div className="map-tracker-count map-tracker-count-flex">?</div>
        </div>
      </div>
    </div>
  )
}
