import { useMemo } from 'react'
import { makeCtx, sampleAt } from '../lib/analysis'
import type { Site } from '../lib/data'
import { fmtAz, fmtDeg, fmtTime } from '../lib/format'
import { useStore } from '../lib/store'
import { MODEL_LABEL } from '../lib/visibility'

/** Sun and Earth directions for the 3D terrain view, computed by the same code path as the charts. */
export default function SkyReadout({ site, slot }: { site: Site; slot: 'A' | 'B' }) {
  const { s, data } = useStore()
  const now = useMemo(() => sampleAt(makeCtx(site, data.sites.azStepDeg), data.eph, s.selectedTime), [site, data, s.selectedTime])
  return (
    <section
      className="panel"
      aria-labelledby="sky-heading"
      data-testid="sky-readout"
      data-sun-az={now.sunAz}
      data-sun-el={now.sunEl}
      data-earth-az={now.earthAz}
      data-earth-el={now.earthEl}
    >
      <h3 id="sky-heading">
        Sun and Earth from Site {slot} at {fmtTime(s.selectedTime, s.tz)}
      </h3>
      <p className="num">
        Sun: azimuth {fmtAz(now.sunAz)}, elevation {fmtDeg(now.sunEl)} above the 0° geometric horizon
        {s.vis === 'terrain' ? `, terrain horizon ${fmtDeg(now.sunHorizon)}` : ''}.
      </p>
      <p className="num">
        Earth: azimuth {fmtAz(now.earthAz)}, elevation {fmtDeg(now.earthEl)}
        {s.vis === 'terrain' ? `, terrain horizon ${fmtDeg(now.earthHorizon)}` : ''}; apparent diameter{' '}
        {(2 * now.earthRadiusDeg).toFixed(2)}°.
      </p>
      <p className="model-label">{MODEL_LABEL[s.vis]}</p>
      <p className="hint">
        Orange and blue rays from the magenta site marker point to the Sun and Earth (directions from JPL Horizons via the shared ephemeris,
        including libration). Azimuth is measured clockwise from local north. The terrain horizon here is the planner&apos;s regional
        horizon mask (240 m polar DEM), not this 5 m mesh, and the mesh lighting is for inspection only: terrain shadowing on the 5 m
        surface is not modelled in this view.
      </p>
    </section>
  )
}
