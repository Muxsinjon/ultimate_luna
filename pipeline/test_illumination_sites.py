"""Milestone 5: offline checks of the illumination inputs and the recorded independent validations."""
import hashlib, json, unittest
from pathlib import Path

import numpy as np

import illumination_sites as I

ROOT = Path(__file__).resolve().parent.parent
VAL = json.loads((ROOT / 'docs/data/MILESTONE5_ILLUMINATION_VALIDATION.json').read_text())
BOUND = json.loads((ROOT / 'docs/data/MILESTONE5_SAMPLING_BOUND.json').read_text())


class IlluminationInputs(unittest.TestCase):
    def test_assets_match_metadata(self):
        for sid in ('site01', 'site04', 'site06'):
            d = I.WEB / sid / 'illumination'
            m = json.loads((d / 'illumination.json').read_text())
            for a in m['assets'].values():
                self.assertEqual(hashlib.sha256((d / a['file']).read_bytes()).hexdigest(), a['sha256'])
            el = np.frombuffer((d / 'far_el.i16').read_bytes(), '<i2')
            self.assertEqual(el.size, 21 * 21 * 720)
            self.assertTrue((np.abs(el) < 9000).all())
            psr = np.frombuffer((d / 'psr.u8').read_bytes(), np.uint8)
            self.assertEqual(psr.size, 401 * 401)
            self.assertAlmostEqual(float((psr == 1).mean()), m['psrFraction'], places=12)
            self.assertTrue(set(np.unique(psr)) <= {0, 1, 255})

    def test_elevation_formula_matches_curvature_drop(self):
        # far terrain at the observer's height drops by about d^2/2R
        e = I.elev_deg(np.array([10.0]), 0.0, 0.0)[0]
        self.assertAlmostEqual(e, np.degrees(np.arctan2(-(10 ** 2) / (2 * I.R_MOON_KM), 10)), places=3)


class IndependentValidation(unittest.TestCase):
    def test_long_term_vs_pgda_average_visibility(self):
        for sid, pts in VAL['sites'].items():
            d = np.array([p['oursSunDiscPct'] - p['pgdaSunPct'] for p in pts])
            e = np.array([p['oursEarthAnyPct'] - p['pgdaEarthPct'] for p in pts])
            self.assertEqual(len(pts), 81)
            self.assertLess(np.median(np.abs(d)), 3.0, sid)
            self.assertLess(np.median(np.abs(e)), 1.0, sid)
            self.assertGreater(np.corrcoef([p['oursSunDiscPct'] for p in pts], [p['pgdaSunPct'] for p in pts])[0, 1], 0.85)

    def test_psr_points_dark_at_shackleton(self):
        psr = [p for p in VAL['sites']['site04'] if p['psr'] == 1]
        self.assertGreater(len(psr), 20)
        self.assertEqual(max(p['oursSunAnyPct'] for p in psr), 0.0)

    def test_hourly_sampling_bound(self):
        for body in ('sun', 'earth'):
            s = BOUND['summary'][body]
            self.assertLess(s['maxAbsPctDifference'], 0.05)
            self.assertLess(s['missedLongestMinutes'], 60)
            self.assertLessEqual(s['transitionOffsetMaxMinutes'], 60)


if __name__ == '__main__':
    unittest.main()
