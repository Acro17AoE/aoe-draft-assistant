import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import {
  markOnboardingCompleted,
  TOUR_STEPS,
  type TourStep,
  type TourTab,
} from '../lib/onboarding'

interface OnboardingTourProps {
  open: boolean
  currentTab: TourTab | string
  onRequestTab: (tab: TourTab) => void
  onClose: () => void
}

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

const TOOLTIP_WIDTH = 360
const TOOLTIP_EST_HEIGHT = 230
const VIEW_MARGIN = 12

function measureTarget(step: TourStep): SpotlightRect | null {
  if (!step.target) return null
  const el = document.querySelector(`[data-tour="${step.target}"]`)
  if (!(el instanceof HTMLElement)) return null
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 && rect.height < 2) return null

  const pad = 8
  const maxHeight = Math.min(window.innerHeight * 0.42, rect.height + pad * 2)
  return {
    top: Math.max(VIEW_MARGIN, rect.top - pad),
    left: Math.max(VIEW_MARGIN, rect.left - pad),
    width: Math.min(window.innerWidth - VIEW_MARGIN * 2, rect.width + pad * 2),
    height: Math.max(48, maxHeight),
  }
}

function tooltipStyle(rect: SpotlightRect | null): CSSProperties {
  const tooltipWidth = Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEW_MARGIN * 2)
  const maxTop = Math.max(VIEW_MARGIN, window.innerHeight - TOOLTIP_EST_HEIGHT - VIEW_MARGIN)

  if (!rect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: tooltipWidth,
    }
  }

  const spaceBelow = window.innerHeight - (rect.top + rect.height) - VIEW_MARGIN
  const spaceAbove = rect.top - VIEW_MARGIN
  const spaceRight = window.innerWidth - (rect.left + rect.width) - VIEW_MARGIN

  let top: number
  let left: number

  if (spaceBelow >= TOOLTIP_EST_HEIGHT) {
    top = rect.top + rect.height + VIEW_MARGIN
    left = rect.left + rect.width / 2 - tooltipWidth / 2
  } else if (spaceAbove >= TOOLTIP_EST_HEIGHT) {
    top = rect.top - VIEW_MARGIN - TOOLTIP_EST_HEIGHT
    left = rect.left + rect.width / 2 - tooltipWidth / 2
  } else if (spaceRight >= tooltipWidth + VIEW_MARGIN) {
    top = Math.min(rect.top, maxTop)
    left = rect.left + rect.width + VIEW_MARGIN
  } else {
    // Dock inside the viewport so Next/Skip stay clickable.
    top = maxTop
    left = (window.innerWidth - tooltipWidth) / 2
  }

  top = Math.min(Math.max(VIEW_MARGIN, top), maxTop)
  left = Math.max(VIEW_MARGIN, Math.min(left, window.innerWidth - tooltipWidth - VIEW_MARGIN))

  return { top, left, width: tooltipWidth }
}

export function OnboardingTour({ open, currentTab, onRequestTab, onClose }: OnboardingTourProps) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<SpotlightRect | null>(null)

  const step = TOUR_STEPS[index]
  const isLast = index >= TOUR_STEPS.length - 1

  const finish = useCallback(() => {
    markOnboardingCompleted()
    onClose()
  }, [onClose])

  const refreshRect = useCallback(() => {
    if (!step) return
    if (step.target) {
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    }
    setRect(measureTarget(step))
  }, [step])

  useEffect(() => {
    if (!open) return
    setIndex(0)
  }, [open])

  useEffect(() => {
    if (!open || !step) return
    if (currentTab !== step.tab) {
      onRequestTab(step.tab)
    }
  }, [open, step, currentTab, onRequestTab])

  useLayoutEffect(() => {
    if (!open || !step) return
    if (currentTab !== step.tab) {
      setRect(null)
      return
    }
    const timers = [
      window.setTimeout(refreshRect, 30),
      window.setTimeout(refreshRect, 120),
      window.setTimeout(refreshRect, 280),
    ]
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [open, step, currentTab, refreshRect, index])

  useEffect(() => {
    if (!open) return
    const onResize = () => refreshRect()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, refreshRect])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  if (!open || !step) return null

  const next = () => {
    if (isLast) {
      finish()
      return
    }
    setIndex((value) => value + 1)
  }

  const back = () => {
    setIndex((value) => Math.max(0, value - 1))
  }

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-backdrop" onClick={finish} />
      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      ) : null}

      <div className="tour-tooltip" style={tooltipStyle(rect)}>
        <div className="tour-tooltip-progress">
          Step {index + 1} of {TOUR_STEPS.length}
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-tooltip-actions">
          <button type="button" className="tour-btn ghost" onClick={finish}>
            Skip
          </button>
          <div className="tour-tooltip-nav">
            {index > 0 ? (
              <button type="button" className="tour-btn" onClick={back}>
                Back
              </button>
            ) : null}
            <button type="button" className="tour-btn primary" onClick={next}>
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
