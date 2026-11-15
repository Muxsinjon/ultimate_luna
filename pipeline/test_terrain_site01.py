"""Real-data verification; raw-source checks skip explicitly when sources aren't downloaded."""
import json
from pathlib import Path
import unittest
import numpy as np
import rasterio
from pyproj import Transformer
from terrain_site01 import OUT, RAW, CRS_POLAR, digest, inspect

class TerrainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.meta=json.loads((OUT/'terrain.json').read_text())
        cls.grid=np.fromfile(OUT/'elevation.f32',dtype='<f4').reshape(401,401)

    def test_byte_integrity(self):
        for a in [*self.meta['assets'].values(),self.meta['imagery']]:
            self.assertEqual(digest(OUT/a['file']),a['sha256'])

    def test_projection_checkpoint_roundtrips(self):
        f=Transformer.from_crs(CRS_POLAR.geodetic_crs,CRS_POLAR,always_xy=True)
        m=self.meta
        for p in m['alignment']['checkpoints']:
            x,y=f.transform(p['lon'],p['lat'])
            self.assertAlmostEqual(x,m['x0']+p['col']*m['dx'],places=6)
            self.assertAlmostEqual(y,m['y0']+p['row']*m['dy'],places=6)
            self.assertAlmostEqual(float(self.grid[p['row'],p['col']]),p['elevationM'],places=5)

    def test_uncertainty_and_coverage(self):
        errors=np.fromfile(OUT/'uncertainty.f32',dtype='<f4')
        self.assertTrue(np.isfinite(self.grid).all())
        self.assertTrue((errors>=0).all())
        self.assertAlmostEqual(float(np.median(errors)),self.meta['assets']['toterr']['median'],places=6)
        self.assertEqual(self.grid.shape,(401,401))

    def test_texture_extent_and_pixel_centres(self):
        m=self.meta;p=json.loads((OUT/'imagery-provenance.json').read_text())
        a,b,c,d,e,f=p['textureTransform']
        self.assertEqual([c,f],[m['x0'],m['y0']])
        self.assertAlmostEqual(c+1024*a,m['x0']+8000)
        self.assertAlmostEqual(f+1024*e,m['y0']-8000)
        self.assertEqual(p['matrix'],8)
        self.assertGreater(len(p['tiles']),0)

    def test_fractional_reference_fixture_against_original_geotiff(self):
        from verify_site01_acceptance import SourceReference, ROOT
        fixture=json.loads((ROOT/'docs/data/SITE01_SAMPLE_REFERENCE.json').read_text())
        reference=SourceReference()
        self.assertEqual(fixture['sourceSha256'],self.meta['sources']['surf']['sha256'])
        self.assertEqual(len(fixture['points']),101)
        for point in fixture['points']:
            actual=reference.at(point['lat'],point['lon'])
            for field in ['native5mBilinearM','mesh20mBilinearM','mesh20mTriangleM']:
                self.assertAlmostEqual(actual[field],point[field],places=7)

    def test_full_native_subset_identity(self):
        path=RAW/self.meta['sources']['surf']['file']
        if not path.exists(): self.skipTest('Download real NASA sources with terrain_site01.py first')
        inspect(path)
        self.assertEqual(digest(path),self.meta['sources']['surf']['sha256'])
        with rasterio.open(path) as src:
            row,col=src.index(self.meta['x0'],self.meta['y0'])
            native=src.read(1,window=rasterio.windows.Window(col,row,1601,1601))
        np.testing.assert_array_equal(self.grid,native[::4,::4])

if __name__=='__main__': unittest.main()
