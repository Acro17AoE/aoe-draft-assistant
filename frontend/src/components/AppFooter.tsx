const GCU_RULES_URL = 'https://www.xbox.com/en-us/developers/rules'
const LIQUIPEDIA_AOE_URL = 'https://liquipedia.net/ageofempires/Main_Page'
const SOURCE_REPO_URL = 'https://github.com/Acro17AoE/aoe-draft-assistant'
const LIQUIPEDIA_ICON = '/liquipedia-favicon.ico'

function GitHubIcon() {
  return (
    <svg className="app-footer-link-icon" viewBox="0 0 16 16" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  )
}

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
        Created by <strong>Acro17</strong> (2026). Tournament and team data provided by{' '}
        <a href={LIQUIPEDIA_AOE_URL} target="_blank" rel="noopener noreferrer" className="app-footer-link">
          <img src={LIQUIPEDIA_ICON} alt="" className="app-footer-link-icon app-footer-link-icon--img" />
          Liquipedia
        </a>
        . Code:{' '}
        <a href={SOURCE_REPO_URL} target="_blank" rel="noopener noreferrer" className="app-footer-link">
          <GitHubIcon />
          GitHub
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
