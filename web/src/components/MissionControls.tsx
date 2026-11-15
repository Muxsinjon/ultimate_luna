import { fmtTime, fromInputValue, toInputValue } from '../lib/format'
import { DURATIONS, clampToCoverage } from '../lib/state'
import { HOUR, useStore } from '../lib/store'
import { Icon } from './ui'

/** Mission start and duration, restricted to the supported ephemeris with an explicit explanation. */
export default function MissionControls() {
  const { s, set, data, notice, setNotice } = useStore()
  const dataStart = data.eph.meta.startMs
  const dataEnd = data.eph.endMs
  const apply = (patch: { missionStart?: number; durationDays?: number }) => {
    const next = { ...s, ...patch, selectedTime: patch.missionStart ?? s.selectedTime }
    const r = clampToCoverage(next, dataStart, dataEnd)
    setNotice(r.note)
    set({ missionStart: r.state.missionStart, durationDays: r.state.durationDays, selectedTime: r.state.selectedTime })
  }
  return (
    <section className="panel" aria-labelledby="mission-h">
      <h2 id="mission-h" className="panel-title">
        Mission period
      </h2>
      <label className="field">
        <span className="field-label">Mission start ({s.tz === 'utc' ? 'UTC' : 'local time'})</span>
        <input
          type="datetime-local"
          value={toInputValue(s.missionStart, s.tz)}
          onChange={(e) => {
            const ms = fromInputValue(e.target.value, s.tz)
            if (!Number.isFinite(ms)) return
            apply({ missionStart: Math.floor(ms / HOUR) * HOUR })
          }}
        />
      </label>
      <div className="field">
        <span className="field-label">Duration</span>
        <div className="seg full" role="radiogroup" aria-label="Mission duration">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={s.durationDays === d}
              className={s.durationDays === d ? 'on' : ''}
              onClick={() => apply({ durationDays: d })}
            >
              {d} d
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        Supported dates: {fmtTime(dataStart, 'utc', false)} to {fmtTime(dataEnd, 'utc', false)} (UTC), hourly samples.
      </p>
      {notice && (
        <p className="field-error" role="status">
          <Icon name="warn" size={16} /> {notice}
        </p>
      )}
    </section>
  )
}
