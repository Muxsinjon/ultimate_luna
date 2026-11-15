"""Milestone 8: independent checks of the science overlays against their source data (offline once cached)."""
import hashlib, json, unittest
from pathlib import Path

import numpy as np

import science_layers as S

WEB = S.WEB
SUBSET = S.OUT / 'diviner_prp_south_subset.npz'
SITES = ('site01', 'site04', 'site06')


def load(sid, lid):
    idx = json.loads((WEB / sid / 'science/index.json').read_text())
    m = next(l for l in idx['layers'] if l['id'] == lid)
    q = np.frombuffer((WEB / sid / 'science' / m['file']).read_bytes(), '<u2').reshape(m['height'], m['width'])
    return m, q


def decode(m, q):
    v = q.astype(float) * m['scale'] + m['offset']
    v[q == m['noData']] = np.nan
    for sp in m.get('specials', []):
        v[q == sp['value']] = np.nan
    return v


@unittest.skipUnless(SUBSET.exists(), 'Diviner PRP subset not downloaded (run science_layers.py)')
class DivinerPRP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        d = np.load(SUBSET)
        cls.prp = {k: d[k] for k in d.files}
        cls.meta = json.loads((S.OUT / 'diviner_prp_south_subset.json').read_text())

    def test_source_integrity(self):
        self.assertEqual(self.meta['rowsTotal'], 2_880_000)
        self.assertEqual(self.meta['bytes'], 604_800_210)
        for sid in SITES:
            idx = json.loads((WEB / sid / 'science/index.json').read_text())
            for l in idx['layers']:
                self.assertEqual(hashlib.sha256((WEB / sid / 'science' / l['file']).read_bytes()).hexdigest(), l['sha256'])
                if l['id'].startswith('diviner'):
                    self.assertEqual(l['source']['sha256'], self.meta['sha256'])

    def test_values_equal_brute_force_containing_triangle(self):
        """Independent of the KD-tree path: test every triangle near the point, pick the one that contains it."""
        p = self.prp
        tx = np.stack([S.xyz_to_polar_km(p[f'tri{k}_x'], p[f'tri{k}_y'], p[f'tri{k}_z'])[0] for k in (1, 2, 3)], 1)
        ty = np.stack([S.xyz_to_polar_km(p[f'tri{k}_x'], p[f'tri{k}_y'], p[f'tri{k}_z'])[1] for k in (1, 2, 3)], 1)
        rng = np.random.default_rng(8)
        for sid in SITES:
            m_avg, q_avg = load(sid, 'diviner-tavg')
            m_max, q_max = load(sid, 'diviner-tmax')
            t = json.loads((WEB / sid / 'terrain.json').read_text())
            for _ in range(60):
                i, j = (int(v) for v in rng.integers(0, 101, 2))
                x, y = (t['x0'] + j * 4 * t['dx']) / 1000, (t['y0'] + i * 4 * t['dy']) / 1000
                near = np.flatnonzero((np.abs(tx[:, 0] - x) < 1.5) & (np.abs(ty[:, 0] - y) < 1.5))
                hit = None
                for k in near:
                    (ax, bx, cx), (ay, by, cy) = tx[k], ty[k]
                    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
                    l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den
                    l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den
                    if l1 >= -1e-9 and l2 >= -1e-9 and 1 - l1 - l2 >= -1e-9:
                        hit = k
                        break
                self.assertIsNotNone(hit, (sid, i, j))
                self.assertAlmostEqual(q_avg[i, j] * m_avg['scale'], p['temp_avg'][hit], delta=0.006)
                self.assertAlmostEqual(q_max[i, j] * m_max['scale'], p['temp_max'][hit], delta=0.006)

    def test_units_ranges_and_special_values(self):
        for sid in SITES:
            for lid in ('diviner-tavg', 'diviner-tmax'):
                m, q = load(sid, lid)
                v = decode(m, q)
                self.assertTrue(np.isfinite(v).all(), lid)  # crops lie well inside the PRP mesh
                self.assertTrue(20 < np.nanmin(v) and np.nanmax(v) < 420, (sid, lid, np.nanmin(v), np.nanmax(v)))
                self.assertAlmostEqual(float(np.nanmin(v)), m['min'], places=2)
            m, q = load(sid, 'diviner-ice')
            v = decode(m, q)
            self.assertTrue((np.nan_to_num(v, nan=0) <= 2.8739).all())
            for sp in m['specials']:
                self.assertAlmostEqual(float(np.mean(q == sp['value'])) * 100, sp['pct'], places=6)
            # the undocumented source value -1 is never shown as a depth
            self.assertFalse((np.nan_to_num(v, nan=1) < 0).any())

    def test_cold_where_nasa_maps_permanent_shadow(self):
        """Independent datasets agree: Diviner model max temperature is low inside the PGDA LPSR permanent shadows."""
        m, q = load('site04', 'diviner-tmax')
        v = decode(m, q)
        psr = np.frombuffer((WEB / 'site04/illumination/psr.u8').read_bytes(), np.uint8).reshape(401, 401)[::4, ::4]
        inside, outside = np.nanmedian(v[psr == 1]), np.nanmedian(v[psr == 0])
        print('site04 Diviner Tmax median: PSR', inside, 'non-PSR', outside)
        self.assertLess(inside, 120)
        self.assertGreater(outside - inside, 60)


class ShadowCam(unittest.TestCase):
    def test_only_where_observed(self):
        for sid in SITES:
            idx = json.loads((WEB / sid / 'science/index.json').read_text())
            ids = [l['id'] for l in idx['layers']]
            self.assertEqual('shadowcam-if' in ids, sid == 'site04', sid)
        m, q = load('site04', 'shadowcam-if')
        v = decode(m, q)
        self.assertGreater(np.isnan(v).sum(), 0)  # partial coverage is kept as no data, never filled
        self.assertTrue((np.nanmax(v) < 1.31) and (np.nanmin(v) >= 0))

    @unittest.skipUnless((S.OUT / 'shadowcam_site04_window.npz').exists(), 'ShadowCam window not cached')
    def test_values_equal_source_pixels(self):
        w = np.load(S.OUT / 'shadowcam_site04_window.npz')
        a, tr = w['a'], w['transform']
        m, q = load('site04', 'shadowcam-if')
        t = json.loads((WEB / 'site04/terrain.json').read_text())
        rng = np.random.default_rng(3)
        n = 0
        for _ in range(400):
            i, j = (int(v) for v in rng.integers(0, 401, 2))
            x, y = t['x0'] + j * t['dx'], t['y0'] + i * t['dy']
            c, r = int(np.floor((x - tr[2]) / tr[0])), int(np.floor((y - tr[5]) / tr[4]))
            src = a[r, c] if 0 <= r < a.shape[0] and 0 <= c < a.shape[1] else np.nan
            if not np.isfinite(src) or src < 0:
                self.assertEqual(q[i, j], m['noData'])
            else:
                self.assertAlmostEqual(q[i, j] * m['scale'], float(src), delta=1.1e-5)
                n += 1
        self.assertGreater(n, 100)


if __name__ == '__main__':
    unittest.main()
