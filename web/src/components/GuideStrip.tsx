// Redesign: a three-step, plain-language guide at the top of each tool page for first-time users. Dismissible.
import { useState } from 'react'
import type { Workspace } from '../lib/state'

const STEPS: Partial<Record<Workspace, [string, string, string]>> = {
  compare: ['Pick two places on the Moon', 'Choose your mission dates', 'Watch when each gets sunlight and can see Earth'],
  finder: ['Say what your mission needs', 'Press “Find mission windows”', 'Read why the top dates work'],
  surface: ['Look around (drag)', 'Move time with the slider', 'See when hills hide the Sun or Earth'],
  terrain: ['Spin and zoom the real ground', 'Click a spot', 'See if it is flat and smooth enough to land'],
}
const KEY = 'lw-guide-hidden'

export default function GuideStrip({ ws }: { ws: Workspace }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })
  const steps = STEPS[ws]
  if (!steps || hidden) return null
  return (
    <div className="guide" role="note" aria-label="How to use this page">
      <ol>
        {steps.map((t, i) => (
          <li key={t}>
            <span className="guide-n" aria-hidden>
              {i + 1}
            </span>
            {t}
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn quiet"
        onClick={() => {
          setHidden(true)
          try {
            localStorage.setItem(KEY, '1')
          } catch {
            /* storage unavailable: hide for this visit only */
          }
        }}
      >
        Got it
      </button>
    </div>
  )
}
