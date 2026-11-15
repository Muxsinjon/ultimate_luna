import json, unittest
import numpy as np
from hazard_site01 import plane_metrics
from terrain_site01 import OUT, RAW, digest

class HazardTests(unittest.TestCase):
 def test_flat_and_inclined_plane(self):
  yy,xx=np.mgrid[:21,:21];z=1000+xx*5*.2-yy*5*.3
  a,b,r=plane_metrics(z,n=5)
  np.testing.assert_allclose(a[2:-2,2:-2],.2,atol=1e-11)
  np.testing.assert_allclose(b[2:-2,2:-2],.3,atol=1e-11)
  self.assertLess(np.nanmax(r),1e-5)
  a,b,r=plane_metrics(np.full((21,21),1500.),n=3)
  self.assertEqual(float(np.nanmax(np.hypot(a,b))),0)
 def test_known_residual_rms(self):
  z=np.zeros((9,9));z[4,4]=1
  _,_,r=plane_metrics(z,n=5)
  self.assertAlmostEqual(r[4,4],np.sqrt(24)/25,places=12)
 def test_nodata_edges(self):
  z=np.zeros((11,11));z[5,5]=np.nan
  a,b,r=plane_metrics(z,n=5)
  self.assertTrue(np.isnan(r[0]).all());self.assertTrue(np.isnan(r[3:8,3:8]).all())
  self.assertTrue(np.isfinite(r[2,2]))
 def test_assets_georeference_and_quantization(self):
  m=json.loads((OUT/'hazards/hazards.json').read_text());terrain=json.loads((OUT/'terrain.json').read_text())
  self.assertEqual((m['x0'],m['y0']),(terrain['x0'],terrain['y0']))
  self.assertEqual(m['sourceSha256'],terrain['sources']['surf']['sha256'])
  for key,a in m['assets'].items():
   path=OUT/'hazards'/a['file'];self.assertEqual(digest(path),a['sha256'])
   grid=np.fromfile(path,dtype='<u2').reshape(1601,1601)
   for p in m['points']:self.assertLessEqual(abs(grid[p['row'],p['col']]*m['quantum']-p[key]),.000501)
  self.assertLess(m['independentMaxDifference'],1e-7)
 def test_independent_plane_source_sample(self):
  import rasterio
  m=json.loads((OUT/'hazards/hazards.json').read_text())
  with rasterio.open(RAW/'Site01_final_adj_5mpp_surf.tif') as src:
   r,c=src.index(m['x0'],m['y0'])
   z=src.read(1,window=rasterio.windows.Window(c+800-2,r+800-2,5,5))
  x,y=np.meshgrid(np.arange(-2,3)*5,-np.arange(-2,3)*5)
  A=np.column_stack([x.ravel(),y.ravel(),np.ones(25)])
  coef=np.linalg.lstsq(A,z.ravel(),rcond=None)[0];rms=np.sqrt(np.mean((z.ravel()-A@coef)**2))
  self.assertAlmostEqual(rms,m['points'][2]['roughness'],places=7)

if __name__=='__main__':unittest.main()
