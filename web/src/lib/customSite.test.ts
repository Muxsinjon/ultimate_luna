import { expect, it } from 'vitest'
import { customCoordinates, parseCustomId } from './customSite'

it('canonicalizes custom links at the same precision used by the shared state', () => {
  expect(customCoordinates(-85.123456, -30)).toEqual({ lat: -85.123456, lon: 330, id: 'custom:-85.123456,330.000000' })
  expect(customCoordinates(0, 359.9999999).lon).toBe(0)
  expect(parseCustomId('custom:-85.1235,-30')).toEqual(customCoordinates(-85.1235, 330))
})
it('rejects invalid latitude, missing fields and nonfinite custom coordinates', () => {
  for (const id of ['custom:', 'custom:,', 'custom:91,0', 'custom:NaN,0', 'custom:1,2,3']) expect(parseCustomId(id)).toBeNull()
  expect(() => customCoordinates(0, Infinity)).toThrow()
})
