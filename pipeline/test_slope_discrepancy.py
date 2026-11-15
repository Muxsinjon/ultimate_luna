"""Regression guards for estimator attribution and the reported scientific limitations."""
import json,unittest
import numpy as np
import rasterio
from terrain_site01 import ROOT,RAW,digest

class SlopeInvestigationTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.report=json.loads((ROOT/'docs/data/SITE01_SLOPE_DISCREPANCY.json').read_text())
 def test_alignment_and_causal_controls(self):
  r=self.report
  self.assertTrue(r['metadata']['sameGrid']);self.assertTrue(r['metadata']['haloAllFinite'])
  self.assertEqual(r['metadata']['cropNoDataOfficialSlope'],0)
  self.assertEqual(r['metadata']['cropNoDataDEM'],0)
  self.assertGreaterEqual(r['metadata']['minimumCropDistanceFromNativeBoundaryPixels'],3)
  self.assertLess(r['coordinateCorrectionOnly']['maxAbsDeg'],.03)
  self.assertLess(r['methods']['centralProjected']['rmsDeg'],.0003)
  self.assertLess(r['methods']['centralProjected']['maxAbsDeg'],.012)
  for v in r['shiftTestsCentralProjected'].values():self.assertGreater(v['rmsDeg'],1)
 def test_worst_cell_manual_estimator_and_raw_geotiff(self):
  r=self.report;p=r['largestDifferences'][0]
  path=RAW/'Site01_final_adj_5mpp_surf.tif'
  self.assertEqual(digest(path),r['sourceHashes']['dem'])
  with rasterio.open(path) as src:
   row,col=src.index(p['xM'],p['yM'])
   self.assertEqual([row,col],[p['sourceRow'],p['sourceCol']])
   h=src.read(1,window=rasterio.windows.Window(col-1,row-1,3,3)).astype(float)
  np.testing.assert_array_equal(h,np.array(p['native3x3ElevationM']))
  x,y=np.meshgrid([-5,0,5],[5,0,-5]);A=np.column_stack([x.ravel(),y.ravel(),np.ones(9)])
  fit=np.linalg.lstsq(A,h.ravel(),rcond=None)[0]
  factor=(1+(p['xM']**2+p['yM']**2)/(4*1737400**2))/(1+h[1,1]/1737400)
  slope=np.degrees(np.arctan(np.hypot(*fit[:2])*factor))
  central=np.degrees(np.arctan(np.hypot((h[1,2]-h[1,0])/10,(h[0,1]-h[2,1])/10)))
  self.assertAlmostEqual(slope,p['olsSlopeDeg'],places=8)
  self.assertAlmostEqual(central,p['centralProjectedSlopeDeg'],places=8)
  self.assertGreater(p['cropEdgeDistancePixels'],400)
  self.assertLess(abs(central-p['officialSlopeDeg']),.001)
 def test_error_frequency_and_directional_hazard_counts(self):
  r=self.report;s=r['methods']['ols3Physical']
  self.assertEqual(s['count'],1601**2)
  self.assertEqual(s['exceedances']['5']['count'],1183)
  self.assertEqual(s['exceedances']['10']['count'],45)
  for t in r['thresholdComparisons']:
   self.assertEqual(t['slopeOnlyDisagreementCount'],t['appMeetsOfficialExceeds']+t['appExceedsOfficialMeets'])
   self.assertLessEqual(t['combinedCriteriaDisagreementCount'],t['slopeOnlyDisagreementCount'])
  self.assertEqual(r['centralRoundingBound']['beyondBoundCount'],164)
  self.assertFalse(r['centralRoundingBound']['fractionWithinFloat32RoundingBound']==1)

if __name__=='__main__':unittest.main()
