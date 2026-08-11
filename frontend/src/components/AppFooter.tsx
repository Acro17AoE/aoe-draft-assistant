const GCU_RULES_URL = 'https://www.xbox.com/en-us/developers/rules'
const LIQUIPEDIA_AOE_URL = 'https://liquipedia.net/ageofempires/Main_Page'

interface AppFooterProps {
  whiteMode?: boolean
  onToggleWhiteMode?: () => void
  onOpenFaq?: () => void
}

export function AppFooter({ whiteMode = false, onToggleWhiteMode, onOpenFaq }: AppFooterProps) {
  return (
    <footer className="app-footer">
      <div className="app-footer-tools">
        {onOpenFaq ? (
          <button type="button" className="app-footer-btn" onClick={onOpenFaq}>
            FAQ
          </button>
        ) : null}
        {onToggleWhiteMode ? (
          <button
            type="button"
            className={`app-footer-btn${whiteMode ? ' active' : ''}`}
            aria-pressed={whiteMode}
            onClick={onToggleWhiteMode}
            title={whiteMode ? 'Switch to dark mode' : 'Switch to white mode'}
          >
            {whiteMode ? 'Dark mode' : 'White mode'}
          </button>
        ) : null}
      </div>
      <p className="app-footer-credits">
        Created by <strong>Acro17</strong> (2025 – 2026)
      </p>
      <p className="app-footer-attribution">
        Tournament and team data provided by{' '}
        <a href={LIQUIPEDIA_AOE_URL} target="_blank" rel="noopener noreferrer">
          Liquipedia
        </a>
        .
      </p>
      <p className="app-footer-disclaimer">
        Draft suggestions and tier lists are unofficial fan tooling for practice only — not affiliated with
        tournament organizers, aoe2cm, or Microsoft.
      </p>
      <p className="app-footer-legal">
        Age of Empires © Microsoft Corporation. DRAFT was created under Microsoft&apos;s{' '}
        <a href={GCU_RULES_URL} target="_blank" rel="noopener noreferrer">
          Game Content Usage Rules
        </a>{' '}
        using assets from Age of Empires II, and it is not endorsed by or affiliated with Microsoft.
      </p>
    </footer>
  )
}
