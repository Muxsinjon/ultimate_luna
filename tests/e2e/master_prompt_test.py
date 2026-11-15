"""Acceptance additions for Prompt.txt: real global elevation, accessible core tools, data corruption and shared model."""
import argparse,json,os,re
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser();p.add_argument('base',nargs='?',default='http://localhost:4191/');p.add_argument('--evidence',type=Path,default=Path('pipeline/out/master-prompt'));a=p.parse_args();a.evidence.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None,args=['--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1440,'height':1000});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(a.base+'#ws=home&ui=simple')
 expect(page.get_by_role('heading',name='LunaWindow — Find the Right Place and Time to Land on the Moon')).to_be_visible()
 for label in ['Explore landing sites','Plan a lunar mission','Try the guided demo']:
  el=page.get_by_role('button',name=label,exact=True);expect(el).to_be_in_viewport()
 page.screenshot(path=str(a.evidence/'welcome.png'))
 page.get_by_role('button',name='Explore landing sites',exact=True).click()
 canvas=page.get_by_test_id('moon-globe').locator('canvas')
 expect(canvas).to_have_attribute('data-terrain','LOLA LDEM_16',timeout=60000)
 lo,hi=json.loads(canvas.get_attribute('data-elevation-range'));assert -12000<lo<-5000 and 5000<hi<12000,(lo,hi)
 expect(page.get_by_test_id('global-terrain-source')).to_contain_text('true vertical scale')
 expect(page.get_by_role('radiogroup',name='Visibility model')).to_be_visible()
 page.locator('.science-details > summary').click()
 expect(page.get_by_role('img',name=re.compile('^Sun elevation for both sites'))).to_be_visible()
 expect(page.get_by_role('img',name=re.compile('^Earth elevation for both sites'))).to_be_visible()
 page.get_by_role('button',name='Next hour',exact=True).click()
 expect(page.locator('.science-details')).to_have_attribute('open','')
 page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(a.evidence/'compare.png'),full_page=True)
 page.get_by_role('radio',name='Geometric 0°',exact=True).click()
 page.get_by_role('button',name='Inspect in Surface View',exact=True).click()
 expect(page.locator('.sv-view')).to_be_visible()
 expect(page.get_by_role('radio',name='3D first person (5 m terrain)')).to_be_disabled()
 expect(page.get_by_text('Geometric mode uses the 0° horizon panorama',exact=False)).to_be_visible()
 page.get_by_role('button',name='Mission Window Finder',exact=True).click()
 expect(page.get_by_text('Maximum communication blackout',exact=True)).to_be_visible()
 expect(page.get_by_text('Maximum uninterrupted darkness',exact=True)).to_be_visible()
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
 page.screenshot(path=str(a.evidence/'finder-phone.png'),full_page=True)
 assert not errors,errors
 # Fresh context: damaged data must stop computation, and retry must recover after restoring bytes.
 page=b.new_page()
 def corrupt(route):
  r=route.fetch();buf=bytearray(r.body());buf[0]^=1
  route.fulfill(response=r,body=bytes(buf))
 page.route('**/data/ephem.bin',corrupt)
 page.goto(a.base+'#ws=compare')
 expect(page.get_by_role('alert')).to_contain_text('Integrity check failed for ephem.bin',timeout=30000)
 expect(page.get_by_test_id('moon-globe')).to_have_count(0)
 page.unroute('**/data/ephem.bin');page.get_by_role('button',name='Try again',exact=True).click()
 expect(page.get_by_test_id('moon-globe').locator('canvas')).to_have_attribute('data-terrain','LOLA LDEM_16',timeout=60000)
 print('PASS exact welcome entry, measured global geometry, simple scientific charts and requirements, shared geometric surface model, mobile, corruption rejection and retry')
 b.close()
