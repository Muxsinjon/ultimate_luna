// "Validated against a real mission" panel (Chandrayaan-3, 2023).
import type { Validation } from '../lib/data'
import { Icon } from './ui'

export default function MissionCheck({ v, compact }: { v: Validation; compact?: boolean }) {
  const m = v.missions?.[0]
  if (!m) return null
  const sunset = m.predicted.find((e) => e.event === 'sunset')
  return (
    <section className={`mission ${compact ? 'compact' : ''}`} aria-labelledby="mission-title">
      <h3 id="mission-title">
        <Icon name="check" size={18} /> Validated against a real mission
      </h3>
      <p>
        <b>Chandrayaan-3</b> (ISRO) landed on 23 Aug 2023. Our terrain-aware model, without tuning, predicts local sunset at its landing
        site on <b className="num">{sunset ? sunset.utc.replace('T', ' ').replace('Z', ' UTC') : '—'}</b>. ISRO put the Vikram lander to
        sleep early that day, ahead of the lunar night.
      </p>
      {!compact && <p className="muted">{m.record}</p>}
      <p className="cite">Sources: ISRO mission updates, September 2023; The National, 5 Sep 2023. Model: JPL Horizons and LRO LOLA.</p>
    </section>
  )
}
