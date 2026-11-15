"""Reproducible slope-discrepancy investigation; read-only scientific inputs.
No production slope/roughness asset is altered. Statistics cover the full 8 km crop.
"""
import json
import numpy as np
import rasterio
from scipy.ndimage import correlate
from pyproj import Transformer
from terrain_site01 import RAW,OUT,ROOT,digest,CRS_POLAR,EXPECTED_SHA256
from hazard_site01 import plane_metrics


def stats(e):
 v=e[np.isfinite(e)];a=np.abs(v)
 return {'count':int(v.size),'biasDeg':float(v.mean()),'rmsDeg':float(np.sqrt(np.mean(v*v))),
         'maxAbsDeg':float(a.max()),'absolutePercentilesDeg':{str(p):float(np.percentile(a,p)) for p in [50,90,95,99,99.9,99.99]},
         'exceedances':{str(t):{'count':int((a>t).sum()),'percent':float(np.mean(a>t)*100)} for t in [.1,.5,1,2,5,10]}}


def investigate():
 m=json.loads((OUT/'terrain.json').read_text());shape=(1601,1601)
 dem=RAW/'Site01_final_adj_5mpp_surf.tif';official=RAW/'Site01_final_adj_5mpp_slp.tif'
 assert digest(dem)==EXPECTED_SHA256['surf']
 assert digest(official)=='3a90035a4946b4a04b7332c52f0b2b1cff71648bd8c105e14d8a7e15c6bcfe8e'
 with rasterio.open(dem) as src, rasterio.open(official) as ref:
  assert src.transform==ref.transform and src.crs==ref.crs and src.shape==ref.shape
  r,c=src.index(m['x0'],m['y0']);w=rasterio.windows.Window(c,r,1601,1601)
  z=src.read(1,window=rasterio.windows.Window(c-3,r-3,1607,1607)).astype(float)
  nasa=ref.read(1,window=w).astype(float)
  shifted={}
  for dr,dc in [(-1,0),(1,0),(0,-1),(0,1)]:
   shifted[f'row{dr:+d}_col{dc:+d}']=ref.read(1,window=rasterio.windows.Window(c+dc,r+dr,1601,1601)).astype(float)
  metadata={'sourceShape':list(src.shape),'transform':list(src.transform)[:6],'crsWkt':src.crs.to_wkt(),
            'sameGrid':True,'sourceNativeCropOrigin':[r,c],'cropShape':list(shape),
            'cropNoDataDEM':int((~np.isfinite(z[3:-3,3:-3])).sum()),'cropNoDataOfficialSlope':int((~np.isfinite(nasa)).sum()),
            'haloAllFinite':bool(np.isfinite(z).all()),'minimumCropDistanceFromNativeBoundaryPixels':min(r,c,src.height-(r+1601),src.width-(c+1601)),
            'resampling':'None. All methods read the same native Float32 pixel centres and exact integer windows.'}
 xx,yy=np.meshgrid(m['x0']+np.arange(1601)*5,m['y0']-np.arange(1601)*5)
 factor=(1+(xx*xx+yy*yy)/(4*m['radiusM']**2))/(1+z[3:-3,3:-3]/m['radiusM'])
 a,b,_=plane_metrics(z,n=3);g=np.hypot(a[3:-3,3:-3],b[3:-3,3:-3])
 ols=np.degrees(np.arctan(g*factor));ols_raw=np.degrees(np.arctan(g))
 kx=np.array([[0,0,0],[-1,0,1],[0,0,0]],float)/10
 ky=np.array([[0,1,0],[0,0,0],[0,-1,0]],float)/10
 dx=correlate(z,kx)[3:-3,3:-3];dy=correlate(z,ky)[3:-3,3:-3]
 central=np.degrees(np.arctan(np.hypot(dx,dy)))
 central_corrected=np.degrees(np.arctan(np.hypot(dx,dy)*factor))
 hx=np.array([[-1,0,1],[-2,0,2],[-1,0,1]],float)/40
 hy=np.array([[1,2,1],[0,0,0],[-1,-2,-1]],float)/40
 horn=np.degrees(np.arctan(np.hypot(correlate(z,hx)[3:-3,3:-3],correlate(z,hy)[3:-3,3:-3])))
 methods={'ols3Physical':ols,'ols3Projected':ols_raw,'centralProjected':central,'centralPhysical':central_corrected,'hornProjected':horn}
 for n in [5,7]:
  aa,bb,_=plane_metrics(z,n=n)
  methods[f'ols{n}Physical']=np.degrees(np.arctan(np.hypot(aa[3:-3,3:-3],bb[3:-3,3:-3])*factor))
 result={'sourceHashes':{'dem':digest(dem),'officialSlope':digest(official)},'metadata':metadata,
         'methods':{name:stats(v-nasa) for name,v in methods.items()},
         'coordinateCorrectionOnly':stats(ols-ols_raw),'coordinateScaleRange':[float(factor.min()),float(factor.max())],
         'shiftTestsCentralProjected':{name:stats(central-ref) for name,ref in shifted.items()}}
 e=ols-nasa
 # Separate the displayed crop rim from interior; no native-raster edge is in this crop.
 rim=np.zeros(shape,bool);rim[:3]=True;rim[-3:]=True;rim[:,:3]=True;rim[:,-3:]=True
 result['cropBoundaryComparisons']={'rim3Pixels':stats(e[rim]),'interior':stats(e[~rim])}
 rough_grid=np.fromfile(OUT/'hazards/roughness.u16',dtype='<u2').reshape(shape)*.001
 inverse=Transformer.from_crs(CRS_POLAR,CRS_POLAR.geodetic_crs,always_xy=True)
 def location(flat):
  row,col=np.unravel_index(int(flat),shape);x=m['x0']+col*5;y=m['y0']-row*5
  lon,lat=inverse.transform(x,y)
  patch=z[row+2:row+5,col+2:col+5]
  return {'cropRow':int(row),'cropCol':int(col),'sourceRow':r+int(row),'sourceCol':c+int(col),
          'xM':x,'yM':y,'latitudeDeg':lat,'eastLongitudeDeg':lon%360,
          'roughnessRmsM':float(rough_grid[row,col]),'olsSlopeDeg':float(ols[row,col]),'officialSlopeDeg':float(nasa[row,col]),
          'centralProjectedSlopeDeg':float(central[row,col]),'centralResidualDeg':float(central[row,col]-nasa[row,col]),'differenceDeg':float(e[row,col]),
          'cropEdgeDistancePixels':int(min(row,col,1600-row,1600-col)),
          'native3x3ElevationM':patch.tolist()}
 result['largestDifferences']=[location(i) for i in np.argpartition(np.abs(e).ravel(),-20)[-20:][np.argsort(-np.abs(e).ravel()[np.argpartition(np.abs(e).ravel(),-20)[-20:]])]]
 result['centralResidualMaximum']=location(np.argmax(np.abs(central-nasa)))
 # Frequency in 1 km nominal projected bins, to locate spatial concentrations.
 result['spatialBins']=[]
 for row in range(8):
  for col in range(8):
   block=e[row*200:(row+1)*200 if row<7 else 1601,col*200:(col+1)*200 if col<7 else 1601]
   result['spatialBins'].append({'row':row,'col':col,'count':int(block.size),'over5Deg':int((abs(block)>5).sum()),'maxAbsDeg':float(abs(block).max())})
 # Compare actual rounded app data with the official slope at identical centres.
 app=np.fromfile(OUT/'hazards/slope.u16',dtype='<u2').reshape(shape)*.001
 rough=np.fromfile(OUT/'hazards/roughness.u16',dtype='<u2').reshape(shape)*.001
 result['thresholdComparisons']=[]
 for threshold in [2,5,10,15,20,30]:
  app_pass=app<=threshold;nasa_pass=nasa<=threshold
  result['thresholdComparisons'].append({'maximumSlopeDeg':threshold,'samples':int(app.size),
   'slopeOnlyDisagreementCount':int((app_pass!=nasa_pass).sum()),'slopeOnlyDisagreementPct':float(np.mean(app_pass!=nasa_pass)*100),
   'appMeetsOfficialExceeds':int((app_pass&~nasa_pass).sum()),'appExceedsOfficialMeets':int((~app_pass&nasa_pass).sum()),
   'withRoughnessMaximumM':.3,'combinedCriteriaDisagreementCount':int(((app_pass!=nasa_pass)&(rough<=.3)).sum()),
   'combinedCriteriaDisagreementPctOfAllSamples':float(np.mean((app_pass!=nasa_pass)&(rough<=.3))*100)})
 # Bound the contribution of source Float32 height rounding alone; not all residuals need be attributable to it.
 ulp=np.spacing(z.astype('float32')).astype(float)
 bx=(ulp[3:-3,4:-2]+ulp[3:-3,2:-4])/20
 by=(ulp[4:-2,3:-3]+ulp[2:-4,3:-3])/20
 bound=np.degrees(np.hypot(bx,by))+np.spacing(nasa.astype('float32')).astype(float)/2
 beyond=np.abs(central-nasa)>bound+1e-10
 result['centralRoundingBound']={'fractionWithinFloat32RoundingBound':float(np.mean(~beyond)),
                                'beyondBoundCount':int(beyond.sum()),'officialZeroAmongBeyond':int((beyond&(nasa==0)).sum()),'officialSlopeRangeAmongBeyondDeg':[float(nasa[beyond].min()),float(nasa[beyond].max())],'note':'Residuals outside this bound cannot be attributed solely to final DEM/slope Float32 rounding. Exact NASA implementation/provenance has not been confirmed.'}
 result['interpretation']={'dominantCause':'Estimator/stencil weighting: 9-point equal-weight fitted plane versus a near-matching 4-neighbour central gradient.',
 'notEquivalence':'Central-difference match is empirical, not proof of NASA implementation. Remaining maximum residual and source processing are not fully explained.',
 'productionDecision':'Keep independently validated OLS science unchanged; label OLS explicitly, report estimator-sensitive criteria and preserve full 5 m analysis.'}
 target=ROOT/'docs/data/SITE01_SLOPE_DISCREPANCY.json';target.write_text(json.dumps(result,indent=2)+'\n')
 print('Saved',target)
 print(json.dumps({'ols':result['methods']['ols3Physical'],'central':result['methods']['centralProjected'],
                   'coordinate':result['coordinateCorrectionOnly'],'largest':result['largestDifferences'][0],
                   'thresholds':result['thresholdComparisons'],'rounding':result['centralRoundingBound']},indent=2))
 return result

if __name__=='__main__':investigate()
