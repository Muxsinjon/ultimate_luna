"""Redesign: real star positions for the 3D scenes from NASA HEASARC's copy of the Yale Bright Star Catalogue (BSC5).

Writes web/public/textures/stars_bsc5.json: [ra_deg, dec_deg, vmag, b_v] per star (J2000), brighter than mag 6.5.
"""
import gzip, hashlib, json
from pathlib import Path
import requests

URL = 'https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz'
OUT = Path(__file__).resolve().parent.parent / 'web/public/textures/stars_bsc5.json'
raw = requests.get(URL, timeout=120).content
text = gzip.decompress(raw).decode('latin-1')
fields = None
rows = []
for line in text.splitlines():
    if line.startswith('line[1]'):
        fields = line.split('=', 1)[1].split()
    elif fields and '|' in line and not line.startswith(('#', 'field', 'table', 'line', '<')):
        v = dict(zip(fields, line.split('|')))
        try:
            ra, dec, mag = float(v['ra']), float(v['dec']), float(v['vmag'])
        except (KeyError, ValueError):
            continue
        bv = float(v['bv_color']) if v.get('bv_color', '').strip() else 0.6
        if mag <= 6.5:
            rows.append([round(ra, 3), round(dec, 3), round(mag, 2), round(bv, 2)])
OUT.write_text(json.dumps({'source': URL, 'sourceSha256': hashlib.sha256(raw).hexdigest(),
                           'catalogue': 'Yale Bright Star Catalogue 5th ed. (BSC5), NASA HEASARC; J2000 RA/Dec (deg), V mag, B-V',
                           'stars': rows}, separators=(',', ':')))
print(len(rows), 'stars', OUT.stat().st_size, 'bytes; fields', fields[:12] if fields else None)
