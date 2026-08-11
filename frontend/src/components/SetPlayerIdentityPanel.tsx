import { normalizeSetDraftContext } from '../lib/results'
import type { SetDraftContext } from '../types/results'

interface SetPlayerIdentityPanelProps {
  value?: SetDraftContext
  onChange?: (value: SetDraftContext) => void
  readonly?: boolean
}

export function SetPlayerIdentityPanel({ value, onChange, readonly = false }: SetPlayerIdentityPanelProps) {
  const draft = normalizeSetDraftContext(value)

  if (readonly) {
    return (
      <section className="set-player-identity panel inset-panel">
        <dl className="set-context-summary">
          <div className="set-context-summary-row">
            <dt>Ingame name</dt>
            <dd>{draft.ingameName?.trim() || '—'}</dd>
          </div>
          <div className="set-context-summary-row">
            <dt>Draft name</dt>
            <dd>{draft.draftName?.trim() || '—'}</dd>
          </div>
        </dl>
      </section>
    )
  }

  const update = (patch: Partial<SetDraftContext>) => {
    onChange?.({ ...draft, ...patch })
  }

  return (
    <section className="set-player-identity panel inset-panel">
      <div className="set-player-identity-fields">
        <label>
          Ingame name
          <input
            value={draft.ingameName ?? ''}
            onChange={(e) => update({ ingameName: e.target.value })}
            placeholder="e.g. Acro17"
            autoComplete="off"
          />
        </label>
        <label>
          Draft name
          <input
            value={draft.draftName ?? ''}
            onChange={(e) => update({ draftName: e.target.value })}
            placeholder="e.g. NOC | Acro17"
            autoComplete="off"
          />
        </label>
      </div>
    </section>
  )
}
