"""Real Site01 rendered acceptance checks. External font TLS failures are reported separately."""
import argparse
import hashlib
from pathlib import Path
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from verify_site01_acceptance import SourceReference
from playwright.sync_api import sync_playwright, expect

p=argparse.ArgumentParser();p.add_argument('base',nargs='?',default='http://127.0.0.1:4173/');p.add_argument('--executable');p.add_argument('--screenshots',type=Path,default=Path('pipeline/out/terrain-screenshots'));a=p.parse_args();a.screenshots.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path=a.executable,args=['--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1440,'height':1000})
 errors=[];failures=[];console=[];external_requests=[]
 page.on('request',lambda r:external_requests.append(r.url) if r.url.startswith(('http://','https://')) and not r.url.startswith(a.base) else None)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('requestfailed',lambda r:failures.append((r.url,r.failure)))
 page.on('console',lambda m:console.append((m.type,m.text)) if m.type in ('error','warning') else None)
 page.goto(a.base+'#ui=full&ws=terrain&a=connecting-ridge&sv=A')
 canvas=page.locator('.terrain-canvas canvas');expect(canvas).to_be_visible(timeout=30000)
 expect(page.locator('.terrain-quality')).to_contain_text('5 m source pixels')
 expect(page.get_by_label('Terrain appearance')).to_have_value('elevation')
 expect(page.get_by_test_id('registration-warning')).to_contain_text('registration is unverified')
 before=canvas.screenshot()
 for label in ['Zoom in','Zoom out','Rotate right','Pan right']:
  page.get_by_role('button',name=label,exact=True).click();after=canvas.screenshot()
  assert hashlib.sha256(before).digest()!=hashlib.sha256(after).digest(),label+' did not change rendered pixels'
  before=after
 page.get_by_role('button',name='Reset camera').click()
 box=canvas.bounding_box();canvas.click(position={'x':box['width']/2,'y':box['height']/2})
 expect(page.get_by_test_id('terrain-readout')).to_contain_text('m elevation')
 source=SourceReference();verified_picks=[]
 # Check actual ray picks against independent original-GeoTIFF sampling.
 for fx,fy in [(.5,.5),(.4,.45),(.6,.45),(.45,.6),(.6,.6)]:
  canvas.click(position={'x':box['width']*fx,'y':box['height']*fy})
  output=page.get_by_test_id('terrain-readout')
  lat=float(output.get_attribute('data-lat'));lon=float(output.get_attribute('data-lon'));h=float(output.get_attribute('data-elevation-m'))
  verified_picks.append(source.verify_pick(lat,lon,h))
 assert len({(p['lat'],p['lon']) for p in verified_picks})==5,'Each screen point must produce a distinct ray hit'
 Path('docs/data/SITE01_BROWSER_PICKS.json').write_text(json.dumps({'sourceSha256':source.meta['sources']['surf']['sha256'],'toleranceAgainstSourceTriangleM':.01,'picks':verified_picks},indent=2)+'\n')
 readout=page.get_by_test_id('terrain-readout').inner_text()
 page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5);page.mouse.down();page.mouse.move(box['x']+box['width']*.6,box['y']+box['height']*.55,steps=12);page.mouse.up()
 assert page.get_by_test_id('terrain-readout').inner_text()==readout,'drag unexpectedly picked terrain'
 page.get_by_label('Latitude (degrees)',exact=True).fill('-89.53432');page.get_by_label('East longitude (degrees)',exact=True).fill('209.94767');page.get_by_role('button',name='Inspect coordinates').click()
 expect(page.get_by_test_id('terrain-readout')).to_contain_text('-89.53432° latitude, 209.94767° E')
 expect(page.get_by_text('Source height uncertainty (RMS):',exact=False)).to_contain_text('m')
 output=page.get_by_test_id('terrain-readout')
 form_reference=source.at(float(output.get_attribute('data-lat')),float(output.get_attribute('data-lon')))
 form_reference['displayedModelElevationM']=float(output.get_attribute('data-elevation-m'))
 assert abs(form_reference['displayedModelElevationM']-form_reference['mesh20mBilinearM'])<.00001
 Path('docs/data/SITE01_BROWSER_PICKS.json').write_text(json.dumps({'sourceSha256':source.meta['sources']['surf']['sha256'],'toleranceAgainstSourceTriangleM':.01,'picks':verified_picks,'coordinateEntry':form_reference},indent=2)+'\n')
 page.screenshot(path=str(a.screenshots/'terrain-desktop.png'),full_page=True)
 page.get_by_label('Terrain appearance').select_option('imagery')
 expect(canvas).to_have_attribute('data-appearance','imagery',timeout=15000)
 page.screenshot(path=str(a.screenshots/'terrain-lroc.png'),full_page=True)
 page.get_by_label('Terrain appearance').select_option('elevation')
 expect(canvas).to_have_attribute('data-appearance','elevation')
 page.get_by_role('button',name='Use selected point as Site A').click()
 expect(page.get_by_label('Site A',exact=True)).to_have_value('custom:-89.5343,209.9477',timeout=20000)
 page.get_by_role('button',name='Explore & Compare',exact=True).click();expect(page.get_by_label('Site A status')).to_contain_text('Custom spot')
 page.get_by_role('button',name='3D Terrain',exact=True).click();expect(canvas).to_be_visible()
 page.get_by_label('Latitude (degrees)',exact=True).fill('0');page.get_by_label('East longitude (degrees)',exact=True).fill('0');page.get_by_role('button',name='Inspect coordinates').click();expect(page.get_by_role('alert')).to_contain_text('outside valid terrain coverage')
 page.get_by_label('Site A',exact=True).select_option('apollo-11');expect(canvas).to_have_count(0)
 page.get_by_role('button',name='Show Connecting Ridge').click();expect(canvas).to_be_visible()
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(a.screenshots/'terrain-mobile.png'),full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'Mobile overflow'
 # Asset corruption must fail visibly and retry recover with a verified asset.
 def corrupt(route):
  response=route.fetch();m=response.json();m['assets']['surf']['sha256']='0'*64;route.fulfill(response=response,json=m)
 page.route('**/terrain/site01/terrain.json',corrupt);page.reload();expect(page.get_by_role('alert')).to_contain_text('checksum mismatch',timeout=20000)
 page.unroute('**/terrain/site01/terrain.json',corrupt);page.get_by_role('button',name='Retry terrain loading').click();expect(canvas).to_be_visible(timeout=20000)
 page.get_by_label('Terrain appearance').select_option('imagery')
 expect(canvas).to_have_attribute('data-appearance','imagery',timeout=15000)
 # let the 5 m analysis layers finish downloading so the reload does not abort in-flight requests
 expect(page.get_by_test_id('slope-method-warning')).to_be_visible(timeout=30000)
 page.reload()
 expect(page.get_by_label('Terrain appearance')).to_have_value('elevation')
 expect(canvas).to_have_attribute('data-appearance','elevation',timeout=20000)
 assert not errors,errors
 local=[f for f in failures if f[0].startswith(a.base)];assert not local,local
 driver_warnings=[m for m in console if m[0]=='warning' and 'GPU stall due to ReadPixels' in m[1]]
 unexpected=[m for m in console if m not in driver_warnings];assert not unexpected,unexpected
 print('PASS real mesh rendering, orbit/zoom/pan/reset, ray picking, drag rejection, coordinates/RMS, LROC texture, planner integration, coverage, mobile layout and checksum recovery')
 assert not failures, failures
 assert not external_requests, external_requests
 # Local licensed fonts must load without any external network request.
 page.evaluate("async () => { for (const spec of ['400 16px Barlow', '500 16px Barlow', '600 16px Barlow', '600 16px \"Barlow Semi Condensed\"']) { const loaded = await document.fonts.load(spec); if (!loaded.length) throw new Error('Font unavailable: ' + spec); } }")
 fonts=page.evaluate("async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family) }")
 assert 'Barlow' in fonts and 'Barlow Semi Condensed' in fonts, fonts
 assert not failures and not external_requests and not errors,(failures,external_requests,errors)
 if driver_warnings:print('Software-renderer screenshot warnings:',len(driver_warnings))
 b.close()
