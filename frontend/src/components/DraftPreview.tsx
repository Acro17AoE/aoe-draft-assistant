import { useMemo, useState } from 'react'
import {
  buildDraftPreviewModel,
  formatExplainReason,
  type PortfolioCiv,
} from '../lib/draftPreview'
import { poolAvailabilityTone, poolIconUrl } from '../lib/pools'
import { useCivDraftSettings } from '../lib/useCivDraftSettings'
import { useTournamentInsights } from '../lib/useTournamentInsights'
import type { MapPriorityPreset, PriorityReasonPart } from '../types/draft'
import type { MapTopPickGroup } from '../lib/priorities'
import {
  MapTournamentInsightStrip,
  TournamentInsightsPanel,
} from './TournamentInsightsPanel'

interface DraftPreviewProps {
  presets: MapPriorityPreset[]
  mapNames: string[]
  presetTournamentName?: string
  tournamentFormat?: string
  /** When true, show CTA toward Civ Draft tab. */
  showCivDraftHint?: boolean
  onOpenCivDraft?: () => void
  compact?: boolean
}

function CivChip({
  civ,
  selected,
  onSelect,
}: {
  civ: PortfolioCiv
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`draft-preview-civ${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      title={civ.name}
    >
      <img src={civ.imageUrl} alt="" />
      <span className="draft-preview-civ-name">{civ.name}</span>
      {civ.tier ? <span className={`tier-tag tier-${civ.tier.toLowerCase()}`}>{civ.tier}</span> : null}
      {civ.specialistMaps?.length ? (
        <span className="draft-preview-civ-map">{civ.specialistMaps[0]}</span>
      ) : null}
    </button>
  )
}

function PreviewTierChip({
  tier,
  left,
  total,
}: {
  tier: 'S' | 'A'
  left: number
  total: number
}) {
  const depleted = left === 0
  return (
    <span
      className={`civ-draft-tier-chip legend-tier tier-${tier.toLowerCase()}${depleted ? ' civ-draft-tier-chip-gone' : ''}`}
      title={`${tier}-tier: ${left} of ${total} left`}
    >
      <em>{tier}</em>
      {left}
    </span>
  )
}

function PressureBlock({ group }: { group: MapTopPickGroup }) {
  if (group.advancedMode && group.poolPressure.length) {
    return (
      <div className="draft-preview-pressure draft-preview-pressure-pools draft-preview-pressure-pool-tiers">
        {group.poolPressure.map((pool) => {
          const remaining = Math.max(0, pool.total - pool.gone)
          const sLeft = Math.max(0, pool.tiers.s.total - pool.tiers.s.gone)
          const aLeft = Math.max(0, pool.tiers.a.total - pool.tiers.a.gone)
          const tone = poolAvailabilityTone(remaining)
          const title = [
            `${pool.name}: ${remaining}/${pool.total} left`,
            pool.tiers.s.total ? `S ${sLeft}/${pool.tiers.s.total}` : null,
            pool.tiers.a.total ? `A ${aLeft}/${pool.tiers.a.total}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <div key={pool.id} className={`draft-preview-pool-tiers tone-${tone}`} title={title}>
              <img src={poolIconUrl(pool.name)} alt="" />
              <div className="draft-preview-pool-tiers-chips">
                {pool.tiers.s.total > 0 ? (
                  <PreviewTierChip tier="S" left={sLeft} total={pool.tiers.s.total} />
                ) : null}
                {pool.tiers.a.total > 0 ? (
                  <PreviewTierChip tier="A" left={aLeft} total={pool.tiers.a.total} />
                ) : null}
                {pool.tiers.s.total === 0 && pool.tiers.a.total === 0 ? (
                  <span>{remaining}</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const { s, a } = group.tierPressure
  const sLeft = Math.max(0, s.total - s.gone)
  const aLeft = Math.max(0, a.total - a.gone)
  return (
    <div className="draft-preview-pressure draft-preview-pressure-tiers">
      {s.total > 0 ? <PreviewTierChip tier="S" left={sLeft} total={s.total} /> : null}
      {a.total > 0 ? <PreviewTierChip tier="A" left={aLeft} total={a.total} /> : null}
    </div>
  )
}

function ExplainPanel({
  name,
  tier,
  parts,
}: {
  name: string
  tier?: string
  parts?: PriorityReasonPart[]
}) {
  return (
    <div className="draft-preview-explain" role="status">
      <strong>{name}</strong>
      <p>{formatExplainReason(parts, tier)}</p>
      {parts && parts.length > 1 ? (
        <ul className="draft-preview-contrib">
          {parts.map((part) => (
            <li key={`${part.mapName}-${part.tier}`}>
              <span>{part.mapName}</span>
              <span className={`tier-tag tier-${part.tier.toLowerCase()}`}>{part.tier}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function DraftPreview({
  presets,
  mapNames,
  presetTournamentName,
  tournamentFormat,
  showCivDraftHint = false,
  onOpenCivDraft,
  compact = false,
}: DraftPreviewProps) {
  const { settings } = useCivDraftSettings()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const tournamentInsights = useTournamentInsights(presetTournamentName, mapNames)

  const model = useMemo(
    () => buildDraftPreviewModel(presets, mapNames, settings),
    [presets, mapNames, settings],
  )

  if (!mapNames.length) {
    return (
      <section className={`panel draft-preview draft-preview-empty${compact ? ' is-compact' : ''}`}>
        <h2>Civ Draft Preview</h2>
        <p className="draft-preview-sub">
          Set your team and maps above to see how civ priorities will look before bans start.
        </p>
      </section>
    )
  }

  if (!model) return null

  const selected =
    model.strongAcrossSet.find((civ) => civ.id === selectedId) ||
    model.mapSpecialists.find((civ) => civ.id === selectedId) ||
    model.topPicksPerMap.flatMap((group) => group.picks).find((pick) => pick.id === selectedId)

  const selectedParts =
    selected && 'priorityReasonParts' in selected
      ? selected.priorityReasonParts
      : selected && 'reasonParts' in selected
        ? selected.reasonParts
        : undefined
  const selectedTier =
    selected && 'priorityTier' in selected
      ? selected.priorityTier
      : selected && 'tier' in selected
        ? selected.tier
        : undefined
  const selectedName = selected?.name ?? ''

  return (
    <section className={`panel draft-preview${compact ? ' is-compact' : ''}`}>
      <div className="draft-preview-header">
        <div>
          <h2>Civ Draft Preview</h2>
          <p className="draft-preview-sub">
            How your maps and preset connect before bans start.
          </p>
        </div>
        <div className="draft-preview-meta">
          {presetTournamentName ? <span>{presetTournamentName}</span> : <span>No active preset</span>}
          {tournamentFormat ? <span>{tournamentFormat}</span> : null}
          {model.advancedMapCount > 0 ? (
            <span>
              Advanced pools on {model.advancedMapCount}/{model.matchedMaps.length || model.uniqueMaps.length}{' '}
              maps
            </span>
          ) : null}
        </div>
      </div>

      {model.unmatchedMaps.length ? (
        <p className="draft-preview-warn">
          No tier list in active preset for: {model.unmatchedMaps.join(', ')}
        </p>
      ) : null}

      {presetTournamentName ? (
        <TournamentInsightsPanel
          status={tournamentInsights.status}
          draftSummary={tournamentInsights.draftSummary}
          fullDrafts={tournamentInsights.fullDrafts}
          busy={tournamentInsights.busy}
          error={tournamentInsights.error}
          ready={tournamentInsights.ready}
          loadFullDrafts={tournamentInsights.loadFullDrafts}
          refresh={tournamentInsights.refresh}
          setError={tournamentInsights.setError}
        />
      ) : null}

      {model.uniqueMaps.length > 1 ? (
        <div className="draft-preview-portfolio">
          <div className="draft-preview-portfolio-col">
            <h3>Strong across the set</h3>
            <div className="draft-preview-civ-row">
              {model.strongAcrossSet.length ? (
                model.strongAcrossSet.map((civ) => (
                  <CivChip
                    key={civ.id}
                    civ={civ}
                    selected={selectedId === civ.id}
                    onSelect={() => setSelectedId(civ.id === selectedId ? null : civ.id)}
                  />
                ))
              ) : (
                <p className="muted">Rank more maps in the preset to see set-wide civs.</p>
              )}
            </div>
          </div>
          <div className="draft-preview-portfolio-col">
            <h3>Map specialists</h3>
            <div className="draft-preview-civ-row">
              {model.mapSpecialists.length ? (
                model.mapSpecialists.map((civ) => (
                  <CivChip
                    key={civ.id}
                    civ={civ}
                    selected={selectedId === civ.id}
                    onSelect={() => setSelectedId(civ.id === selectedId ? null : civ.id)}
                  />
                ))
              ) : (
                <p className="muted">No clear single-map specialists yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="draft-preview-portfolio">
          <div className="draft-preview-portfolio-col">
            <h3>Priorities for this map</h3>
            <div className="draft-preview-civ-row">
              {model.strongAcrossSet.map((civ) => (
                <CivChip
                  key={civ.id}
                  civ={civ}
                  selected={selectedId === civ.id}
                  onSelect={() => setSelectedId(civ.id === selectedId ? null : civ.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="draft-preview-maps">
        {model.topPicksPerMap.map((group) => {
          const unmatched = model.unmatchedMaps.includes(group.mapName)
          const singleMap = model.uniqueMaps.length <= 1
          return (
            <article key={group.mapId} className="draft-preview-map-col">
              <header>
                {group.imageUrl ? <img src={group.imageUrl} alt="" className="draft-preview-map-img" /> : null}
                <h3>{group.mapName}</h3>
              </header>
              {unmatched ? (
                <p className="draft-preview-warn">Add this map to the active preset to preview tiers.</p>
              ) : (
                <>
                  {!singleMap ? (
                    <>
                      <span className="draft-preview-label">Top 3 picks</span>
                      <div className="draft-preview-civ-row">
                        {group.picks.map((pick) => (
                          <CivChip
                            key={`${group.mapId}-${pick.id}`}
                            civ={{
                              id: pick.id,
                              name: pick.name,
                              imageUrl: pick.imageUrl,
                              tier: pick.priorityTier,
                              reasonParts: pick.priorityReasonParts,
                            }}
                            selected={selectedId === pick.id}
                            onSelect={() => setSelectedId(pick.id === selectedId ? null : pick.id)}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}
                  <span className="draft-preview-label">Pressure (pre-draft)</span>
                  <PressureBlock group={group} />
                  {tournamentInsights.ready ? (
                    <MapTournamentInsightStrip stats={tournamentInsights.mapStats[group.mapName]} />
                  ) : null}
                </>
              )}
            </article>
          )
        })}
      </div>

      {selectedName ? (
        <ExplainPanel name={selectedName} tier={selectedTier} parts={selectedParts} />
      ) : (
        <p className="draft-preview-hint">Select a civ to see map contributions and fused rank.</p>
      )}

      {showCivDraftHint ? (
        <div className="draft-preview-cta">
          {onOpenCivDraft ? (
            <button type="button" className="accent-btn" onClick={onOpenCivDraft}>
              Open Civ Draft
            </button>
          ) : (
            <p className="muted">Open the Civ Draft tab, paste the aoe2cm link, then Go.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}
