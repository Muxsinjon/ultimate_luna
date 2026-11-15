import { describe, expect, it } from 'vitest'
import { decodeValue, formatScience, legendPosition, validateScienceIndex, valueAtVertex, type ScienceLayerMeta } from './scienceLayers'

const meta = (over: Partial<ScienceLayerMeta> = {}): ScienceLayerMeta => ({
  id: 'diviner-ice',
  title: 't',
  kind: 'model',
  quantity: 'depth',
  unit: 'm',
  scale: 0.001,
  offset: 0,
  noData: 65535,
  specials: [
    { value: 65534, label: 'No stable ice within 2.87 m of the surface (model)', pct: 10 },
    { value: 65533, label: 'Source code -1 (not defined in the PDS label; not interpreted)', pct: 5 },
  ],
  width: 101,
  height: 101,
  stride: 4,
  file: 'x',
  sha256: 'x',
  validPct: 100,
  min: 0,
  max: 2,
  resolutionM: 500,
  period: 'p',
  legend: { min: 0, max: 2.8738, palette: 'ice' },
  source: { title: 's', url: 'u', citation: 'c' },
  caveats: [],
  ...over,
})

describe('science layer decoding (Milestone 8)', () => {
  it('distinguishes values, the special state and no data; never invents a value', () => {
    const m = meta()
    expect(decodeValue(m, 1234)).toEqual({ kind: 'value', value: 1.234 })
    expect(decodeValue(m, 65534).kind).toBe('special')
    expect(decodeValue(m, 65533)).toEqual({ kind: 'special', label: 'Source code -1 (not defined in the PDS label; not interpreted)' })
    expect(decodeValue(m, 65535)).toEqual({ kind: 'nodata' })
    expect(formatScience(m, decodeValue(m, 65535))).toBe('No data')
    expect(formatScience(m, decodeValue(m, 1234))).toBe('1.23 m')
    expect(formatScience(meta({ unit: 'K', scale: 0.01 }), { kind: 'value', value: 95.123 })).toBe('95.1 K')
  })
  it('maps mesh vertices to the layer grid by stride and rejects out-of-range vertices', () => {
    const raw = new Uint16Array(101 * 101).fill(65535)
    raw[25 * 101 + 50] = 500
    const l = { meta: meta(), raw }
    expect(valueAtVertex(l, 100, 200)).toEqual({ kind: 'value', value: 0.5 })
    expect(valueAtVertex(l, 101, 201)).toEqual({ kind: 'value', value: 0.5 }) // nearest sample
    expect(valueAtVertex(l, 0, 0).kind).toBe('nodata')
    expect(valueAtVertex(l, 401, 0).kind).toBe('nodata')
  })
  it('legend position is clamped and null for no data or special', () => {
    const m = meta({ legend: { min: 40, max: 320, palette: 'thermal' } })
    expect(legendPosition(m, { kind: 'value', value: 180 })).toBeCloseTo(0.5, 12)
    expect(legendPosition(m, { kind: 'value', value: 10 })).toBe(0)
    expect(legendPosition(m, { kind: 'nodata' })).toBeNull()
  })
  it('rejects a layer list for another site or a grid not aligned with the 401 × 401 mesh', () => {
    expect(() => validateScienceIndex({ version: 1, siteId: 'site04', layers: [meta()] }, 'site01')).toThrow()
    expect(() => validateScienceIndex({ version: 1, siteId: 'site01', layers: [meta({ width: 100, height: 100 })] }, 'site01')).toThrow()
    expect(() =>
      validateScienceIndex({ version: 1, siteId: 'site01', layers: [meta(), meta({ stride: 1, width: 401, height: 401 })] }, 'site01'),
    ).not.toThrow()
  })
})
