import { useState } from 'react'
import type { Site } from '../lib/data'
import { fmtLat, fmtLon } from '../lib/format'
import { parseLat, parseLon } from '../lib/physics/lon'
import { useStore } from '../lib/store'
import { Icon } from './ui'

function SiteSelect({ slot, value, onChange, sites }: { slot: 'A' | 'B'; value: string; onChange: (id: string) => void; sites: Site[] }) {
  const groups = Array.from(new Set(sites.map((x) => x.group)))
  return (
    <label className="field">
      <span className="field-label site-label">
        <span className={`site-tag tag-${slot.toLowerCase()}`}>{slot}</span> Site {slot}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={`Site ${slot}`}>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {sites
              .filter((x) => x.group === g)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/** Choose Site A and Site B (dropdowns, swap, or custom coordinates computed from LOLA terrain). */
export default function SitePair() {
  const { s, set, sites, addCustom, customBusy } = useStore()
  const [lat, setLat] = useState('85.42 S')
  const [lon, setLon] = useState('31.6 E')
  const [slot, setSlot] = useState<'A' | 'B'>('B')
  const [err, setErr] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const la = parseLat(lat)
    const lo = parseLon(lon)
    if (la === null) return setErr('Latitude must be between 90 S and 90 N, for example "84.79 S" or "-84.79".')
    if (lo === null) return setErr('Longitude must be like "29.2 E", "150 W" or "209.9".')
    setErr('')
    void addCustom(la, lo, slot)
  }
  return (
    <section className="panel" aria-labelledby="sites-h">
      <div className="panel-head">
        <h2 id="sites-h" className="panel-title">
          Landing sites
        </h2>
        <button type="button" className="btn quiet" onClick={() => set({ siteA: s.siteB, siteB: s.siteA })}>
          Swap A and B
        </button>
      </div>
      <SiteSelect slot="A" value={s.siteA} onChange={(id) => set({ siteA: id })} sites={sites} />
      <SiteSelect slot="B" value={s.siteB} onChange={(id) => set({ siteB: id })} sites={sites} />
      <details className="custom">
        <summary>Analyse other coordinates</summary>
        <form onSubmit={submit} aria-label="Analyse custom coordinates">
          <p className="hint">
            The horizon for a custom spot is computed in your browser from LOLA terrain (960 m near the pole, about 7.6 km elsewhere), which
            is coarser than for the listed sites.
          </p>
          <div className="row">
            <input aria-label="Latitude, for example 84.79 S" value={lat} onChange={(e) => setLat(e.target.value)} />
            <input aria-label="Longitude, for example 29.2 E" value={lon} onChange={(e) => setLon(e.target.value)} />
          </div>
          <div className="row">
            <div className="seg" role="radiogroup" aria-label="Use as">
              {(['A', 'B'] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={slot === x}
                  className={slot === x ? 'on' : ''}
                  onClick={() => setSlot(x)}
                >
                  as Site {x}
                </button>
              ))}
            </div>
            <button type="submit" className="btn" disabled={customBusy}>
              {customBusy ? 'Computing…' : 'Analyse'}
            </button>
          </div>
          {err && (
            <p className="field-error" role="alert">
              <Icon name="warn" size={16} /> {err}
            </p>
          )}
        </form>
      </details>
    </section>
  )
}

export function SiteFacts({ site, slot }: { site: Site; slot?: 'A' | 'B' }) {
  return (
    <div className="site-facts-mini">
      {slot && <span className={`site-tag tag-${slot.toLowerCase()}`}>{slot}</span>}
      <div>
        <div className="sf-name">{site.name}</div>
        <div className="muted small num">
          {fmtLat(site.lat)}, {fmtLon(site.lon)}, {site.elevationM.toLocaleString('en-US')} m
          {site.verify && <span className="badge">Needs verification</span>}
        </div>
        <div className="muted small">{site.custom ? site.terrainNote : `Source: ${site.source}`}</div>
      </div>
    </div>
  )
}
