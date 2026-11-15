"""Milestone 3: generalised multi-site terrain pipeline checks (run from pipeline/ with the terrain venv)."""
import hashlib, json, math, unittest
from pathlib import Path
import numpy as np
import rasterio
from terrain_sites import SITES, WEB, check_site01, crop_origin, source
from terrain_site01 import R

RAW_OK = all((Path(__file__).parent / 'raw' / SITES[s]['product'] / f"{SITES[s]['product']}_final_adj_5mpp_surf.tif").exists() for s in SITES)


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


class MultiSiteTerrain(unittest.TestCase):
    def test_assets_hashes_and_identical_method(self):
        for sid in ('site01', 'site04', 'site06'):
            m = json.loads((WEB / sid / 'terrain.json').read_text())
            h = json.loads((WEB / sid / 'hazards' / 'hazards.json').read_text())
            for f in m['assets'].values():
                self.assertEqual(sha(WEB / sid / f['file']), f['sha256'], sid)
            for f in h['assets'].values():
                self.assertEqual(sha(WEB / sid / 'hazards' / f['file']), f['sha256'], sid)
            self.assertEqual((m['width'], m['height'], m['dx'], m['dy'], m['radiusM']), (401, 401, 20.0, -20.0, 1737400))
            self.assertEqual((h['width'], h['height'], h['dx'], h['dy'], h['slopeSupportM'], h['roughnessSupportM']), (1601, 1601, 5.0, -5.0, 15, 25))
            self.assertEqual((h['x0'], h['y0']), (m['x0'], m['y0']))
            self.assertEqual(h['sourceSha256'], m['sources']['surf']['sha256'])
            if sid != 'site01':
                self.assertEqual(m['siteId'], sid)
                self.assertEqual(m['product'], SITES[sid]['product'])

    def test_heights_and_nodata(self):
        for sid in ('site04', 'site06'):
            m = json.loads((WEB / sid / 'terrain.json').read_text())
            z = np.frombuffer((WEB / sid / m['assets']['surf']['file']).read_bytes(), '<f4')
            self.assertEqual(z.size, 401 * 401)
            self.assertTrue(np.isfinite(z).all())  # both crops lie fully inside valid DEM coverage
            self.assertAlmostEqual(float(z.min()), m['assets']['surf']['min'], places=3)
            self.assertAlmostEqual(float(z.max()), m['assets']['surf']['max'], places=3)
            s = np.frombuffer((WEB / sid / 'hazards' / 'slope.u16').read_bytes(), '<u2').reshape(1601, 1601)
            g = np.frombuffer((WEB / sid / 'hazards' / 'roughness.u16').read_bytes(), '<u2').reshape(1601, 1601)
            # the 2-pixel source halo completes every 3x3 / 5x5 neighbourhood, so no sample is NoData here;
            # NoData handling at true raster edges is covered by test_hazard_site01.test_nodata_edges
            self.assertTrue((s != 65535).all() and (g != 65535).all())

    def test_crop_centres_are_inside_the_footprint(self):
        idx = json.loads((WEB / 'index.json').read_text())
        for t in idx['sites']:
            m = json.loads((WEB / t['id'] / 'terrain.json').read_text())
            lat, lon = math.radians(t['centre']['lat']), math.radians(t['centre']['lon'])
            k = 2 * R * math.tan(math.pi / 4 + lat / 2)
            x, y = k * math.sin(lon), k * math.cos(lon)
            cx, cy = m['x0'] + 200 * m['dx'], m['y0'] + 200 * m['dy']
            self.assertLess(math.hypot(x - cx, y - cy), 3.6, t['id'])  # within one native pixel diagonal

    @unittest.skipUnless(RAW_OK, 'raw PGDA GeoTIFFs not downloaded')
    def test_generalised_pipeline_reproduces_site01_exactly(self):
        self.assertTrue(check_site01()['allIdentical'])

    @unittest.skipUnless(RAW_OK, 'raw PGDA GeoTIFFs not downloaded')
    def test_footprint_centre_rule(self):
        for sid in ('site04', 'site06'):
            surf = source(SITES[sid]['product'], 'surf')
            r0, c0, centre, _, rc, _ = crop_origin(SITES[sid], surf)
            with rasterio.open(surf['path']) as src:
                self.assertEqual(rc, (src.height // 2, src.width // 2))
            self.assertEqual((r0, c0), (rc[0] - 800, rc[1] - 800))
            idx = {t['id']: t for t in json.loads((WEB / 'index.json').read_text())['sites']}
            self.assertAlmostEqual(idx[sid]['centre']['lat'], centre['lat'], places=9)


if __name__ == '__main__':
    unittest.main()
