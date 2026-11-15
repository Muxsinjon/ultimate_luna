"""Milestone 2 acceptance against independent Float32 scientific GeoTIFFs."""
import json,os,re,hashlib
from pathlib import Path
import numpy as np
import rasterio
from pyproj import CRS,Transformer
from playwright.sync_api import sync_playwright,expect
import sys
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:4173/'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or ('/usr/bin/chromium' if os.path.exists('/usr/bin/chromium') else None),headless=True,args=['--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1440,'height':1000});errors=[];failed=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('requestfailed',lambda r:failed.append(r.url))
 page.goto(base+'#ui=full&ws=terrain&a=connecting-ridge&sv=A')
 canvas=page.locator('.terrain-canvas canvas');expect(canvas).to_be_visible(timeout=30000)
 expect(page.get_by_label('Analysis layer')).to_be_visible(timeout=30000)
 expect(page.get_by_test_id('slope-method-warning')).to_contain_text('not NASA')
 expect(page.get_by_test_id('slope-method-warning')).to_contain_text('15.245°')
 page.get_by_label('Latitude (degrees)',exact=True).fill('-89.53432');page.get_by_label('East longitude (degrees)',exact=True).fill('209.94767');page.get_by_role('button',name='Inspect coordinates',exact=True).click()
 point=page.get_by_test_id('hazard-point');expect(point).to_contain_text('Slope')
 camera=canvas.get_attribute('data-camera')
 previous=hashlib.sha256(canvas.screenshot()).hexdigest()
 for layer in ['slope','roughness','hazard','elevation']:
  page.get_by_label('Analysis layer').select_option(layer)
  expect(canvas).to_have_attribute('data-analysis-layer',layer,timeout=20000)
  assert canvas.get_attribute('data-camera')==camera,'Layer switch reset camera'
  current=hashlib.sha256(canvas.screenshot()).hexdigest();assert current!=previous,'Layer failed to change rendered pixels';previous=current
 page.get_by_label('Analysis layer').select_option('hazard')
 page.get_by_label('Maximum slope',exact=True).fill('0');page.get_by_label('Maximum roughness',exact=True).fill('0')
 expect(point).to_contain_text('Exceeds selected terrain criteria')
 page.get_by_label('Maximum slope',exact=True).fill('90');page.get_by_label('Maximum roughness',exact=True).fill('10')
 expect(point).to_contain_text('Meets selected terrain criteria')
 summary=page.get_by_test_id('footprint-summary');expect(summary).to_contain_text('100.0%')
 count=int(summary.get_attribute('data-total'))
 page.get_by_label('Footprint radius').fill('200');expect(summary).not_to_have_attribute('data-total',str(count))
 page.get_by_label('Footprint radius').fill('100')
 # Independent sampling from generated full-precision georeferenced scientific rasters.
 observed={k:float(point.get_attribute('data-'+k)) for k in ['slope','roughness']};differences={};summary_differences={}
 for key in observed:
  with rasterio.open('pipeline/out/hazards/'+key+'.tif') as src:
   f=Transformer.from_crs(CRS(src.crs).geodetic_crs,src.crs,always_xy=True)
   x,y=f.transform(209.94767,-89.53432)
   expected=float(next(src.sample([(x,y)]))[0]);differences[key]=abs(observed[key]-expected)
   assert differences[key]<=.000501,(key,observed[key],expected)
 # Independent disk sample count at permissive thresholds, with outside coverage tracked.
 with rasterio.open('pipeline/out/hazards/slope.tif') as src:
  rr,cc=np.mgrid[:src.height,:src.width];xx=src.transform.c+(cc+.5)*5;yy=src.transform.f-(rr+.5)*5
  h=float(page.get_by_test_id('terrain-readout').get_attribute('data-elevation-m'))
  scale=(1+(x*x+y*y)/(4*1737400**2))/(1+h/1737400)
  mask=(xx-x)**2+(yy-y)**2<=(100*scale)**2
  expected_count=int(mask.sum())
  assert int(summary.get_attribute('data-total'))==expected_count
  assert int(summary.get_attribute('data-meets'))==expected_count
  for key in ['slope','roughness']:
   with rasterio.open('pipeline/out/hazards/'+key+'.tif') as scientific:values=scientific.read(1)[mask]
   for label,fn in [('min',np.min),('mean',np.mean),('max',np.max)]:
    expected=float(fn(values.astype(float)));reported=float(summary.get_attribute('data-'+key+'-'+label))
    summary_differences[key+'_'+label]=abs(reported-expected)
    assert summary_differences[key+'_'+label]<=.000501
 page.screenshot(path='pipeline/out/hazards/footprint-centre.png',full_page=True)
 page.get_by_label('Maximum slope',exact=True).fill('');expect(point).to_contain_text('Insufficient or unavailable data')
 page.get_by_label('Maximum slope',exact=True).fill('10')
 # Centre exactly at coverage corner -> partial circular footprint, not an arbitrary square.
 m=json.load(open('web/public/data/terrain/site01/hazards/hazards.json'))
 with rasterio.open('pipeline/out/hazards/slope.tif') as src:
  inv=Transformer.from_crs(src.crs,CRS(src.crs).geodetic_crs,always_xy=True);lon,lat=inv.transform(m['x0'],m['y0'])
 page.get_by_label('Latitude (degrees)',exact=True).fill(str(lat));page.get_by_label('East longitude (degrees)',exact=True).fill(str(lon%360));page.get_by_role('button',name='Inspect coordinates',exact=True).click()
 expect(summary).not_to_have_attribute('data-valid',summary.get_attribute('data-total'))
 page.screenshot(path='pipeline/out/hazards/acceptance-desktop.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path='pipeline/out/hazards/acceptance-mobile.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
 # A missing scientific asset must not destroy the terrain viewer; retry recovers.
 page.route('**/hazards/hazards.json',lambda route:route.fulfill(status=503,body='unavailable'))
 page.reload();expect(page.get_by_role('alert')).to_contain_text('Scientific hazard metadata unavailable',timeout=30000)
 expect(canvas).to_be_visible()
 page.unroute('**/hazards/hazards.json');page.get_by_role('button',name='Retry analysis',exact=True).click();expect(page.get_by_label('Analysis layer')).to_be_visible(timeout=30000)
 # Keep existing mission capabilities available.
 page.get_by_role('button',name='Explore & Compare',exact=True).click();expect(page.get_by_label('Site A status')).to_be_visible()
 assert not errors,errors;assert not failed,failed
 Path('docs/data/MILESTONE2_BROWSER_VALIDATION.json').write_text(json.dumps({'observed':observed,'maxDifferenceFromFloat32Rasters':differences,'independent100mDiskSamples':expected_count,'cameraPreserved':True,'footprintSummaryDifferences':summary_differences},indent=2)+'\n')
 print('PASS layers/camera, thresholds, selected scientific values, circular footprint counts, clipped coverage, invalid criteria, mobile, planner; differences:',differences)
 b.close()
