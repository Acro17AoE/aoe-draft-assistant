import { FAQ_ENTRIES, FAQ_INTRO } from '../lib/faqContent'
import { PRODUCT_NAME } from '../lib/brand'

interface FaqModalProps {
  open: boolean
  onClose: () => void
}

export function FaqModal({ open, onClose }: FaqModalProps) {
  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog panel faq-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="faq-title"
      >
        <div className="modal-header">
          <h2 id="faq-title">{PRODUCT_NAME} FAQ</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body faq-modal-body">
          <p className="faq-intro">{FAQ_INTRO}</p>
          <div className="faq-list">
            {FAQ_ENTRIES.map((entry) => (
              <details key={entry.id} className="faq-item" open={entry.id === 'what-is-draft'}>
                <summary>{entry.question}</summary>
                <p>{entry.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
