// "What blocks the Sun and Earth": per site, the terrain that costs the most sunlight and Earth-link hours in the
// mission period. Text is generated only from computed numbers (lib/blockers.ts).
import { useMemo } from 'react'
import type { Sample } from '../lib/analysis'
import { blockerSentence, terrainLosses } from '../lib/blockers'
import type { Site } from '../lib/data'

export default function BlockerPanel({
  sites,
  azStepDeg,
}: {
  sites: { slot: 'A' | 'B'; site: Site; samples: Sample[] }[]
  azStepDeg: number
}) {
  const rows = useMemo(
    () =>
      sites.map(({ slot, site, samples }) => ({
        slot,
        site,
        sun: terrainLosses(samples, site, azStepDeg, 'sun'),
        earth: terrainLosses(samples, site, azStepDeg, 'earth'),
      })),
    [sites, azStepDeg],
  )
  return (
    <section className="panel blockers" aria-labelledby="blockers-h">
      <h3 id="blockers-h">What blocks the Sun and Earth</h3>
      <div className="blockers-grid">
        {rows.map((r) => (
          <div key={r.slot} data-testid={`blockers-${r.slot}`} data-sun-lost={r.sun.lostHours} data-earth-lost={r.earth.lostHours}>
            <h4>
              Site {r.slot}: {r.site.name.replace(/ \(.*\)/, '')}
            </h4>
            <p>
              <span className="dot sun" aria-hidden /> {blockerSentence(r.sun)}
            </p>
            <p>
              <span className="dot earth" aria-hidden /> {blockerSentence(r.earth)}
            </p>
          </div>
        ))}
      </div>
      <p className="hint">
        A lost hour is one when the body is above a flat horizon but hidden by the terrain horizon (planner terrain: 240 m near the pole,
        coarser elsewhere). Direction and distance are those of the highest terrain in that 15° slice of the horizon. Hourly samples.
      </p>
    </section>
  )
}
