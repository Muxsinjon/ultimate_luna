// Plain-language explanations built only from computed angles (used by Surface View and Explain mode).
import type { Sample } from './analysis'
import { fmtAz, fmtDeg } from './format'
import { type VisModel, signal } from './visibility'

/** Plain-language reason for the current visibility state, built from the computed angles. */
export function reason(now: Sample, body: 'sun' | 'earth', vis: VisModel): string {
  const isSun = body === 'sun'
  const el = isSun ? now.sunEl : now.earthEl
  const az = isSun ? now.sunAz : now.earthAz
  const hz = isSun ? now.sunHorizon : now.earthHorizon
  const visible = signal(now, body, vis) > 0
  const who = isSun ? 'The Sun' : 'Earth'
  const consequence = isSun
    ? visible
      ? 'so the site is in sunlight.'
      : 'so the site is dark and solar panels produce no power.'
    : visible
      ? 'so direct line-of-sight communication with Earth is geometrically possible.'
      : 'so direct line-of-sight communication is not available.'
  if (vis === 'geometric')
    return `${who}'s centre is ${fmtDeg(Math.abs(el))} ${el >= 0 ? 'above' : 'below'} the geometric horizon at azimuth ${fmtAz(az)}, ${consequence} (Simplified geometric model: local terrain is not included.)`
  if (visible && el > hz)
    return `${who} is ${fmtDeg(el)} high at azimuth ${fmtAz(az)}, and the LOLA terrain in that direction rises to only ${fmtDeg(hz)}, ${consequence}`
  if (visible)
    return `${who} is sitting on the terrain horizon at azimuth ${fmtAz(az)} (${fmtDeg(el)} high, terrain ${fmtDeg(hz)}): only part of the disc is visible, ${consequence}`
  if (el > 0)
    return `${who} is ${fmtDeg(el)} above the smooth horizon, but terrain at azimuth ${fmtAz(az)} rises to ${fmtDeg(hz)} and hides it, ${consequence}`
  return `${who} is ${fmtDeg(Math.abs(el))} below the horizon at azimuth ${fmtAz(az)}, ${consequence}`
}
