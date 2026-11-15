// Shared UI primitives: icons, info tooltip, status chip, skeleton, error boundary.
import { Component, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

type IconName = 'sun' | 'earth' | 'both' | 'none' | 'info' | 'link' | 'play' | 'pause' | 'warn' | 'check' | 'close' | 'theme' | 'clock'

/** One consistent icon set: 20×20 grid, 1.6 stroke, currentColor. */
export function Icon({ name, size = 18, title }: { name: IconName; size?: number; title?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const body: Record<IconName, ReactNode> = {
    sun: (
      <g {...p}>
        <circle cx="10" cy="10" r="3.6" fill="currentColor" stroke="none" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1="10" y1="2.2" x2="10" y2="4" transform={`rotate(${a} 10 10)`} />
        ))}
      </g>
    ),
    earth: (
      <g {...p}>
        <circle cx="10" cy="10" r="7" />
        <path d="M10 3a7 7 0 0 1 0 14" fill="currentColor" stroke="none" />
      </g>
    ),
    both: (
      <g {...p}>
        <path d="M4 10.5l3.6 3.6L16 5.8" />
      </g>
    ),
    none: <circle cx="10" cy="10" r="6" {...p} />,
    info: (
      <g {...p}>
        <circle cx="10" cy="10" r="7.2" />
        <line x1="10" y1="9" x2="10" y2="14" />
        <circle cx="10" cy="6.3" r="0.4" fill="currentColor" />
      </g>
    ),
    link: (
      <g {...p}>
        <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" />
        <path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" />
      </g>
    ),
    play: <path d="M6.5 4.5v11l9-5.5z" fill="currentColor" />,
    pause: (
      <g fill="currentColor">
        <rect x="5.5" y="4.5" width="3" height="11" rx="0.6" />
        <rect x="11.5" y="4.5" width="3" height="11" rx="0.6" />
      </g>
    ),
    warn: (
      <g {...p}>
        <path d="M10 3.2l7.3 12.8H2.7z" />
        <line x1="10" y1="8" x2="10" y2="11.5" />
        <circle cx="10" cy="13.8" r="0.4" fill="currentColor" />
      </g>
    ),
    check: <path d="M4 10.5l3.6 3.6L16 5.8" {...p} />,
    close: (
      <g {...p}>
        <line x1="5" y1="5" x2="15" y2="15" />
        <line x1="15" y1="5" x2="5" y2="15" />
      </g>
    ),
    theme: (
      <g {...p}>
        <circle cx="10" cy="10" r="6.5" />
        <path d="M10 3.5a6.5 6.5 0 0 0 0 13z" fill="currentColor" stroke="none" />
      </g>
    ),
    clock: (
      <g {...p}>
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l2.6 1.6" />
      </g>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className="icon"
    >
      {title && <title>{title}</title>}
      {body[name]}
    </svg>
  )
}

export interface InfoText {
  what: string
  how: string
  source: string
}

/** ⓘ button with an accessible popover: hover or focus opens, Escape or blur closes. */
export function InfoTip({ info, label }: { info: InfoText; label: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const w = Math.min(320, window.innerWidth - 24)
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2))
    const below = r.bottom + 8
    setPos({ left, top: below + 200 > window.innerHeight ? Math.max(12, r.top - 8 - 200) : below })
  }, [open])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])
  return (
    <span className="infotip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        ref={btn}
        type="button"
        className="info-btn"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="info" size={15} />
      </button>
      {open && pos && (
        <span role="tooltip" id={id} className="popover" style={{ left: pos.left, top: pos.top }}>
          <span className="pop-what">{info.what}</span>
          <span className="pop-row">
            <b>How</b> {info.how}
          </span>
          <span className="pop-row">
            <b>Source</b> {info.source}
          </span>
        </span>
      )}
    </span>
  )
}

export type ChipKind = 'sun' | 'earth' | 'both' | 'none' | 'warn'
export function Chip({ kind, children, icon }: { kind: ChipKind; children: ReactNode; icon?: IconName }) {
  return (
    <span className={`chip chip-${kind}`}>
      <Icon name={icon ?? (kind === 'warn' ? 'warn' : kind)} size={16} />
      {children}
    </span>
  )
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number | string; w?: number | string; r?: string }) {
  return <span className="skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden />
}

interface EBProps {
  children: ReactNode
  label: string
}
interface EBState {
  error: Error | null
}

/** Keeps one failing view from blanking the whole app. */
export class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null }
  static getDerivedStateFromError(error: Error): EBState {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="state-error" role="alert">
        <Icon name="warn" size={22} />
        <div>
          <p className="state-title">{this.props.label} couldn't be drawn.</p>
          <p className="muted">{this.state.error.message}. Other views still work. Try again, or pick another site or date.</p>
          <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    )
  }
}

/** Width of an element, updated on resize (for charts drawn at true pixel size). */
export function useWidth<T extends HTMLElement>(fallback = 900) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth || fallback)
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width) || fallback))
    ro.observe(el)
    return () => ro.disconnect()
  }, [fallback])
  return [ref, w] as const
}
