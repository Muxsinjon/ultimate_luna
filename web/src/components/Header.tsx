import { useState } from 'react'
import type { TimeZoneMode } from '../lib/format'
import type { Mode } from '../lib/prefs'
import type { Workspace } from '../lib/state'
import { useStore } from '../lib/store'
import type { VisModel } from '../lib/visibility'
import { Icon } from './ui'

const NAV: [Workspace, string][] = [
  ['compare', 'Explore & Compare'],
  ['finder', 'Mission Window Finder'],
  ['surface', 'Surface View'],
  ['terrain', '3D Terrain'],
  ['about', 'About & methodology'],
]

export function Mark() {
  // Original mark: a horizon with a low Sun and Earth. No agency insignia.
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden className="mark">
      <rect width="32" height="32" rx="8" fill="var(--c-raised)" />
      <path d="M3 22 L9 17 L13 20 L19 13 L24 18 L29 15 L29 29 L3 29Z" fill="var(--c-terrain-top)" />
      <circle cx="21.5" cy="10.5" r="3.2" fill="var(--c-sun)" />
      <circle cx="9" cy="9" r="2.6" fill="var(--c-earth)" />
    </svg>
  )
}

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={value === v ? 'on' : ''}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

export default function Header() {
  const { s, set, theme, setTheme } = useStore()
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    window.setTimeout(() => setCopied('idle'), 2200)
  }
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={() => set({ ws: 'home' })} aria-label="LunaWindow home">
        <Mark />
        <span>
          <span className="brand-name">LunaWindow</span>
          <span className="brand-tag">Explore. Compare. Plan. Experience.</span>
        </span>
      </button>
      <nav className="tabs" aria-label="Workspaces">
        {NAV.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-current={s.ws === k ? 'page' : undefined}
            className={s.ws === k ? 'on' : ''}
            onClick={() => set({ ws: k })}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="top-controls">
        <button
          type="button"
          className="btn quiet"
          aria-pressed={s.full}
          onClick={() => set({ full: !s.full })}
          title="Simple view hides expert settings; nothing is removed"
        >
          {s.full ? 'Simple view' : 'Show all controls'}
        </button>
        <div className="adv adv-inline">
          <Seg<VisModel>
            label="Visibility model"
            value={s.vis}
            onChange={(v) => set({ vis: v })}
            options={[
              ['terrain', 'Terrain-aware'],
              ['geometric', 'Geometric 0°'],
            ]}
          />
          <Seg<Mode>
            label="Audience"
            value={s.mode}
            onChange={(v) => set({ mode: v })}
            options={[
              ['planner', 'Planner'],
              ['explore', 'Explain'],
            ]}
          />
          <Seg<TimeZoneMode>
            label="Time zone"
            value={s.tz}
            onChange={(v) => set({ tz: v })}
            options={[
              ['utc', 'UTC'],
              ['local', 'Local'],
            ]}
          />
        </div>
        <button
          type="button"
          className="btn quiet icon-only"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          <Icon name="theme" />
        </button>
        <button type="button" className="btn" onClick={copy} aria-live="polite">
          <Icon name={copied === 'ok' ? 'check' : 'link'} />
          {copied === 'ok' ? 'Link copied' : copied === 'fail' ? 'Copy failed: use the address bar' : 'Copy link'}
        </button>
      </div>
    </header>
  )
}
