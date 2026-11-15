import type { Site } from '../lib/data'
import type { WindowSummary, Sample, NextEvent } from '../lib/analysis'
import { useStore, HOUR } from '../lib/store'
import { MODEL_LABEL, signal } from '../lib/visibility'
import { fmtHoursApprox, fmtTime, fmtLat, fmtLon, fmtAz, fmtDeg } from '../lib/format'
import { Chip } from './ui'

type Card = { site: Site; sum: WindowSummary; now: Sample; sunEvent: NextEvent; earthEvent: NextEvent }

export default function MissionDashboard({ a, b }: { a: Card; b: Card }) {
  const { s, set } = useStore()
  return (
    <section className="mission-dashboard" aria-label="Mission at a glance">
      {[a, b].map(({ site, sum, now, sunEvent, earthEvent }, i) => (
        <article className="panel dashboard-card" key={i}>
          <p className="eyebrow">Site {i === 0 ? 'A' : 'B'} / Mission at a glance</p>
          <h3>{site.name.replace(/ \(.*/, '')}</h3>
          <p className="small muted">
            {fmtLat(site.lat)} · {fmtLon(site.lon)}
            {site.verify && ' · Coordinates need verification'}
          </p>
          <details className="small">
            <summary>Location source</summary>
            <p>{site.source}</p>
          </details>
          <p className="small muted">At {fmtTime(now.t, s.tz)}</p>
          <p className="small num">
            Sun: az {fmtAz(now.sunAz)}, el {fmtDeg(now.sunEl)} · Earth: az {fmtAz(now.earthAz)}, el {fmtDeg(now.earthEl)}
          </p>
          <div className="chips">
            <Chip kind={signal(now, 'sun', s.vis) > 0 ? 'sun' : 'none'}>{signal(now, 'sun', s.vis) > 0 ? 'Sun visible' : 'Dark'}</Chip>
            <Chip kind={signal(now, 'earth', s.vis) > 0 ? 'earth' : 'none'}>
              {signal(now, 'earth', s.vis) > 0 ? 'Earth visible' : 'Earth hidden'}
            </Chip>
          </div>
          <p className="small">
            {[sunEvent, earthEvent]
              .map((ev) =>
                ev.time === null
                  ? `No ${ev.kind.toLowerCase()} in the searched period (up to 400 days)`
                  : `${ev.kind} in ${fmtHoursApprox(ev.time - now.t)}`,
              )
              .join(' · ')}{' '}
            (hourly sampling)
          </p>
          <p className="small muted">Over the {s.durationDays}-day mission:</p>
          <dl className="dashboard-metrics">
            <div>
              <dt>Sun available</dt>
              <dd>
                {Math.round(sum.sunPct)}
                <small>%</small>
              </dd>
            </div>
            <div>
              <dt>Earth in view</dt>
              <dd>
                {Math.round(sum.earthPct)}
                <small>%</small>
              </dd>
            </div>
            <div>
              <dt>Longest darkness</dt>
              <dd>
                {Math.round(sum.longestDarkMs / HOUR)}
                <small>h</small>
              </dd>
            </div>
          </dl>
          <p className="model-label">{MODEL_LABEL[s.vis]}</p>
          {s.vis === 'terrain' && site.custom && <p className="small muted">{site.terrainNote}</p>}
          <p className="small muted">
            {s.vis === 'terrain'
              ? 'Any solar disc above the terrain horizon counts as sunlight.'
              : 'Geometric visibility: disc centre above 0°; terrain obstruction excluded.'}{' '}
            Earth visibility is line of sight, not a guaranteed radio link.
          </p>
          <button className="btn" onClick={() => set({ surfaceSite: i === 0 ? 'A' : 'B', surface3d: true, ws: 'surface' })}>
            Explore Site {i === 0 ? 'A' : 'B'} from the surface →
          </button>
        </article>
      ))}
    </section>
  )
}
