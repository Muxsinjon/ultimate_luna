import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildEphemeris, type EphemMeta, type Site } from './data'
import { makeCtx, nextEvent, sampleAt, summarize } from './analysis'

const d = resolve(__dirname, '../../public/data')
const meta = JSON.parse(readFileSync(resolve(d, 'ephem.json'), 'utf8')) as EphemMeta
const b = readFileSync(resolve(d, 'ephem.bin'))
const eph = buildEphemeris(meta, new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)))
const sites = JSON.parse(readFileSync(resolve(d, 'sites.json'), 'utf8')) as { azStepDeg: number; sites: Site[] }

it('works at the very end of the supported data', () => {
  const ctx = makeCtx(sites.sites[0], sites.azStepDeg)
  const t1 = eph.endMs
  const t0 = t1 - 14 * 86_400_000
  for (const t of [t0, t1 - 3_600_000, t1]) {
    expect(() => sampleAt(ctx, eph, t)).not.toThrow()
    expect(() => nextEvent(ctx, eph, t, 'sun')).not.toThrow()
    expect(() => nextEvent(ctx, eph, t, 'earth', 'geometric')).not.toThrow()
  }
  expect(() => summarize(ctx, eph, t0, t1)).not.toThrow()
  // beyond the data: no extrapolation, no crash
  const late = t1 + 30 * 86_400_000
  expect(nextEvent(ctx, eph, late, 'sun').time).toBeNull()
  expect(summarize(ctx, eph, late, late + 86_400_000).samples.length).toBe(0)
  expect(summarize(ctx, eph, t0, t1).samples.length).toBe(14 * 24)
})
