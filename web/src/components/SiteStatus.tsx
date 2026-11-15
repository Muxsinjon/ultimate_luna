import type { NextEvent, Sample } from '../lib/analysis'
import type { Site } from '../lib/data'
import { fmtAz, fmtDeg, fmtEventWindow, fmtHoursApprox, fmtPct } from '../lib/format'
import { INFO } from '../lib/glossary'
import { useStore } from '../lib/store'
import { signal } from '../lib/visibility'
import { SiteFacts } from './SitePair'
import { Chip, InfoTip } from './ui'

function Event({ ev, now }: { ev: NextEvent; now: number }) {
  const { s } = useStore()
  if (ev.time === null || ev.after === null) return <span className="muted">No {ev.kind.toLowerCase()} before the data ends</span>
  return (
    <span>
      {ev.kind} in <b className="num">{fmtHoursApprox(ev.time - now)}</b>{' '}
      <span className="muted num">({fmtEventWindow(ev.after, ev.time, s.tz)})</span>
    </span>
  )
}

/** Status for one site at the selected time: Sun and Earth azimuth/elevation and visibility. */
export default function SiteStatus({
  site,
  slot,
  now,
  sunEv,
  earthEv,
}: {
  site: Site
  slot: 'A' | 'B'
  now: Sample
  sunEv: NextEvent
  earthEv: NextEvent
}) {
  const { s } = useStore()
  const sunVis = signal(now, 'sun', s.vis) > 0
  const earthVis = signal(now, 'earth', s.vis) > 0
  const terrain = s.vis === 'terrain'
  return (
    <section className={`site-status slot-${slot.toLowerCase()}`} aria-label={`Site ${slot} status`}>
      <SiteFacts site={site} slot={slot} />
      <div className="chips">
        {sunVis ? (
          <Chip kind="sun">{terrain && now.sunFrac < 0.999 ? `Sunlit, ${fmtPct(now.sunFrac * 100)} of disc` : 'Sunlit'}</Chip>
        ) : (
          <Chip kind="none" icon="sun">
            Dark
          </Chip>
        )}
        {earthVis ? (
          <Chip kind="earth">Earth link ✓</Chip>
        ) : (
          <Chip kind="none" icon="earth">
            No Earth link
          </Chip>
        )}
      </div>
      <dl className="azel num">
        <div>
          <dt>
            Sun <InfoTip info={INFO.sun} label="Sun position" />
          </dt>
          <dd>
            az {fmtAz(now.sunAz)}, el {fmtDeg(now.sunEl)}
            {terrain && <span className="muted"> (terrain {fmtDeg(now.sunHorizon)})</span>}
          </dd>
        </div>
        <div>
          <dt>
            Earth <InfoTip info={INFO.earth} label="Earth position" />
          </dt>
          <dd>
            az {fmtAz(now.earthAz)}, el {fmtDeg(now.earthEl)}
            {terrain && <span className="muted"> (terrain {fmtDeg(now.earthHorizon)})</span>}
          </dd>
        </div>
      </dl>
      <p className="small">
        <Event ev={sunEv} now={now.t} />
      </p>
      <p className="small">
        <Event ev={earthEv} now={now.t} />
      </p>
      {!terrain && <p className="model-label">Geometric visibility — local terrain obstruction not included.</p>}
    </section>
  )
}
