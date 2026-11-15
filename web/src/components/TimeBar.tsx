import { useEffect, useMemo, useState } from 'react'
import { fmtTime } from '../lib/format'
import { HOUR, missionEnd, useStore } from '../lib/store'
import { Icon } from './ui'

const SPEEDS = [
  { label: '1 h per tick', h: 1 },
  { label: '6 h per tick', h: 6 },
  { label: '1 day per tick', h: 24 },
]

/**
 * Shared time controls. The selected time lives in the shared state, so every chart, table and the
 * Surface View move together. Playback advances by whole hourly samples at the chosen rate.
 */
export default function TimeBar({ label = 'Selected time' }: { label?: string }) {
  const { s, set } = useStore()
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const t0 = s.missionStart
  const t1 = missionEnd(s) - HOUR
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(
      () => {
        const nx = s.selectedTime + SPEEDS[speed].h * HOUR
        if (nx > t1) {
          set({ selectedTime: t1 })
          setPlaying(false)
        } else set({ selectedTime: nx })
      },
      reduced ? 400 : 120,
    )
    return () => window.clearInterval(id)
  }, [playing, speed, s.selectedTime, t1, set, reduced])

  const step = (dh: number) => {
    setPlaying(false)
    set({ selectedTime: Math.max(t0, Math.min(t1, s.selectedTime + dh * HOUR)) })
  }

  return (
    <div className="timebar" role="group" aria-label="Time controls">
      <div className="tb-buttons">
        <button type="button" className="btn icon-only" onClick={() => step(-1)} aria-label="Previous hour" title="Previous hour (←)">
          ‹
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (!playing && s.selectedTime >= t1) set({ selectedTime: t0 })
            setPlaying(!playing)
          }}
          aria-label={playing ? 'Pause' : 'Play through the mission'}
        >
          <Icon name={playing ? 'pause' : 'play'} />
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn icon-only" onClick={() => step(1)} aria-label="Next hour" title="Next hour (→)">
          ›
        </button>
        <select value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Playback speed" className="tb-speed">
          {SPEEDS.map((x, i) => (
            <option key={x.h} value={i}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <input
        className="scrub"
        type="range"
        min={t0}
        max={t1}
        step={HOUR}
        value={s.selectedTime}
        onChange={(e) => {
          setPlaying(false)
          set({ selectedTime: +e.target.value })
        }}
        aria-label={label}
        aria-valuetext={fmtTime(s.selectedTime, s.tz)}
      />
      <output className="scrub-time num">{fmtTime(s.selectedTime, s.tz)}</output>
    </div>
  )
}
