import { AccountPanel } from '../components/AccountPanel'
import { SharePanel } from '../components/SharePanel'

export function SettingsTab() {
  return (
    <div className="settings-page">
      <section className="panel settings-section">
        <h2>Account &amp; Cloud Sync</h2>
        <p className="hint">
          Log in to sync presets, results, and settings across devices. Create a share link to collaborate with
          others in the same workspace.
        </p>
        <AccountPanel />
        <SharePanel />
      </section>
    </div>
  )
}
