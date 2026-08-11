import { useState } from 'react'
import { CreateSessionModal } from './CreateSessionModal'
import { useAuth } from '../contexts/AuthProvider'
import { useWorkspace } from '../contexts/WorkspaceProvider'
import type { PresetImportOptions } from '../lib/cloudStorage'

function MemberList({ compact = false }: { compact?: boolean }) {
  const { members } = useWorkspace()
  if (!members.length) return null

  return (
    <div className={`share-members${compact ? ' share-members-compact' : ''}`}>
      <span className="share-members-label">Sharing with:</span>
      <ul>
        {members.map((member) => (
          <li key={member.user_id}>
            <span className="share-member-name">{member.display_name || member.email}</span>
            <span className="chip muted">{member.role}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SharePanel() {
  const { user } = useAuth()
  const {
    workspace,
    workspaces,
    sessionUrl,
    creating,
    joinError,
    createSharedWorkspace,
    leaveWorkspace,
    leaveSession,
    endSession,
    openWorkspace,
  } = useWorkspace()
  const [name, setName] = useState('Draft session')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ending, setEnding] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  if (!user) {
    return (
      <div className="share-panel">
        <p className="hint">Log in to create a shared draft session and collaborate via link.</p>
      </div>
    )
  }

  const handleCreate = async (sessionName: string, presetImport: PresetImportOptions) => {
    setError(null)
    try {
      await createSharedWorkspace(sessionName, { presetImport })
      setShowCreateModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    }
  }

  const handleEndSession = async (workspaceId: string, sessionName: string) => {
    const confirmed = window.confirm(
      `End session "${sessionName}" for everyone? The link will stop working and shared draft data will be deleted.`,
    )
    if (!confirmed) return
    setError(null)
    setEnding(true)
    try {
      await endSession(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session')
    } finally {
      setEnding(false)
    }
  }

  const handleLeaveSession = async (workspaceId: string, role: string) => {
    setError(null)
    setLeaving(true)
    try {
      await leaveSession(workspaceId, role)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave session')
    } finally {
      setLeaving(false)
    }
  }

  const copyLink = async () => {
    if (!sessionUrl) return
    try {
      await navigator.clipboard.writeText(sessionUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy link')
    }
  }

  if (workspace && sessionUrl) {
    return (
      <div className="share-panel share-panel-active">
        <div className="share-panel-head">
          <strong>Session: {workspace.name}</strong>
          <span className="chip">Collaborating</span>
        </div>
        <div className="share-link-row">
          <input type="text" readOnly value={sessionUrl} aria-label="Session link" />
          <button type="button" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <MemberList />
        <p className="hint">
          Shared sessions sync map draft, civ draft, map assignments, and Shared Presets. Personal presets and
          settings stay private.
        </p>
        <div className="share-panel-actions">
          {workspace.role !== 'owner' ? (
            <button
              type="button"
              className="account-btn"
              disabled={leaving}
              onClick={() => void handleLeaveSession(workspace.id, workspace.role)}
            >
              {leaving ? 'Leaving…' : 'Leave session'}
            </button>
          ) : (
            <button type="button" className="account-btn" onClick={() => void leaveWorkspace()}>
              Close session view
            </button>
          )}
          {workspace.role === 'owner' ? (
            <button
              type="button"
              className="account-btn account-btn-danger"
              disabled={ending}
              onClick={() => void handleEndSession(workspace.id, workspace.name)}
            >
              {ending ? 'Ending…' : 'End session for everyone'}
            </button>
          ) : null}
        </div>
        {error ? <p className="account-error">{error}</p> : null}
        {joinError ? <p className="account-error">{joinError}</p> : null}
      </div>
    )
  }

  return (
    <div className="share-panel">
      <label>
        Session name
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. KOTD Civ Draft"
        />
      </label>
      <button type="button" className="accent-btn" disabled={creating} onClick={() => setShowCreateModal(true)}>
        Create session
      </button>
      {error ? <p className="account-error">{error}</p> : null}
      {joinError ? <p className="account-error">{joinError}</p> : null}

      {showCreateModal ? (
        <CreateSessionModal
          initialName={name}
          creating={creating}
          onClose={() => setShowCreateModal(false)}
          onCreate={(sessionName, presetImport) => void handleCreate(sessionName, presetImport)}
        />
      ) : null}

      {workspaces.length > 0 ? (
        <div className="share-session-list">
          <h3>Your sessions</h3>
          <ul>
            {workspaces.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void openWorkspace(item.share_slug)}>
                  {item.name}
                </button>
                <span className="chip muted">{item.role}</span>
                {item.role === 'owner' ? (
                  <button
                    type="button"
                    className="share-session-end"
                    title="End session for everyone"
                    disabled={ending}
                    onClick={() => void handleEndSession(item.id, item.name)}
                  >
                    End
                  </button>
                ) : (
                  <button
                    type="button"
                    className="share-session-leave"
                    title="Leave session"
                    disabled={leaving}
                    onClick={() => void handleLeaveSession(item.id, item.role)}
                  >
                    Leave
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export { MemberList }
