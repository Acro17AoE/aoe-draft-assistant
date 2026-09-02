import { AccountPanel } from '../components/AccountPanel'
import { SharePanel } from '../components/SharePanel'
import { PRODUCT_EXPANSION, PRODUCT_NAME, PRODUCT_TAGLINE } from '../lib/brand'
import { requestOnboardingStart } from '../lib/onboarding'

export function HomeTab() {
  return (
    <div className="home-page">
      <section className="panel home-welcome" data-tour="nav-home">
        <div className="home-welcome-hero">
          <img src="/draft-logo.png" alt="" className="home-welcome-logo" aria-hidden />
          <div className="home-welcome-copy">
            <div className="home-welcome-header">
              <h2 className="home-title">{PRODUCT_NAME}</h2>
              <p className="home-expansion">{PRODUCT_EXPANSION}</p>
            </div>
            <p className="home-tagline">{PRODUCT_TAGLINE}</p>
          </div>
        </div>
        <div className="home-intro">
          <p>
            <strong>DRAFT</strong> is a companion for Age of Empires II Captain's Mode on{' '}
            <a href="https://aoe2cm.net" target="_blank" rel="noopener noreferrer">
              aoe2cm.net
            </a>
            . Build map-specific tier lists, mark Key and Nemesis civs, plan bans, and follow the
            live draft. Everything you need in one place.
          </p>
          <ul className="home-feature-list">
            <li>
              <strong>Presets</strong> — tier civs per map, mark ★ Key picks and ☠ Nemesis ban
              targets
            </li>
            <li>
              <strong>Map Draft</strong> — follow a live map draft or set maps manually
            </li>
            <li>
              <strong>Civ Draft</strong> — Prepared bans, Top 3, Key civs column, and drag-and-drop
              assignment
            </li>
            <li>
              <strong>Results &amp; Analysis</strong> — log sets, review patterns and tournament
              meta
            </li>
            <li>
              <strong>AoE in Data</strong> — civ/tech visualizations and meta charts
            </li>
          </ul>
          <button
            type="button"
            className="accent-btn home-tour-btn"
            onClick={requestOnboardingStart}
          >
            New Here? Start the guided tour →
          </button>
        </div>
      </section>

      <section className="panel home-account-section">
        <h2>Account &amp; Cloud Sync</h2>
        <div className="home-account-intro">
          <p>
            <strong>DRAFT works without an account.</strong> All your data (presets, results,
            sessions) is stored in your browser. You can use every feature right away — no sign-up
            needed.
          </p>
          <p className="hint">
            Without login, data stays in this browser only. Clearing site data or switching devices
            will lose it. Cloud sync and shared sessions with teammates require an account.
          </p>
        </div>
        <div className="home-account-benefits">
          <div className="home-account-benefit">
            <span className="home-benefit-icon">☁</span>
            <div>
              <strong>Cloud sync</strong>
              <p>Presets, results, and settings sync across all your devices when logged in.</p>
            </div>
          </div>
          <div className="home-account-benefit">
            <span className="home-benefit-icon">🤝</span>
            <div>
              <strong>Shared sessions</strong>
              <p>Invite teammates to a shared workspace with a single draft board, synced live.</p>
            </div>
          </div>
        </div>
        <AccountPanel />
        <SharePanel />
      </section>
    </div>
  )
}
