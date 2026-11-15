"""Milestone 4: offline re-check of the stored JPL Horizons reference through the Python mirror of the browser path."""
import unittest
from datetime import datetime, timezone

import validate_astronomy as va


class AstronomyVsHorizons(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rep = va.compare()

    def test_error_bounds(self):
        o = self.rep['overall']
        self.assertLess(o['sunEl']['max'], 0.0015)
        self.assertLess(o['sunAz']['max'], 0.001)
        self.assertLess(o['earthEl']['max'], 0.007)
        self.assertLess(o['earthAz']['max'], 0.007)
        self.assertLess(o['earthDiam']['max'], 0.003)
        self.assertLess(o['earthLitPct']['max'], 0.01)

    def test_reference_scope_and_coverage(self):
        r = self.rep['reference']
        self.assertEqual((r['sites'], r['times'], r['requests']), (9, 40, 18))
        self.assertEqual(self.rep['coverage']['endUtc'], '2031-12-31T18:00:00Z')
        self.assertEqual(self.rep['coverage']['referenceEpochsOutsideCoverage'], ['2031-12-31T22:00:00Z', '2031-12-31T22:59:00Z'])
        self.assertEqual(self.rep['longitudeWrapHorizonsMaxDiffDeg'], 0.0)

    def test_no_extrapolation(self):
        meta, rows = va.browser_ephemeris()
        self.assertIsNone(va.ours(meta, rows, datetime(2032, 1, 1, tzinfo=timezone.utc), 0, -89))
        self.assertIsNone(va.ours(meta, rows, datetime(2022, 12, 31, 23, tzinfo=timezone.utc), 0, -89))
        self.assertIsNotNone(va.ours(meta, rows, datetime(2031, 12, 31, 18, tzinfo=timezone.utc), 0, -89))

    def test_longitude_conventions_agree(self):
        meta, rows = va.browser_ephemeris()
        t = datetime(2029, 5, 5, 5, 5, tzinfo=timezone.utc)
        a, b = va.ours(meta, rows, t, 209.94767, -89.53432), va.ours(meta, rows, t, -150.05233, -89.53432)
        for k in ('sun', 'earth'):
            self.assertAlmostEqual(a[k][0], b[k][0], places=9)
            self.assertAlmostEqual(a[k][1], b[k][1], places=9)


if __name__ == '__main__':
    unittest.main()
