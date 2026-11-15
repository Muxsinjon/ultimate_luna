"""Redesign: download NASA imagery for the 3D story scene, resize, and record provenance.

Outputs web/public/textures/*.jpg (<= 2048 px) and textures.json (source URL, SHA-256 of the downloaded file, credit).
All sources are NASA public-domain imagery; positions on each map are the real ones (equirectangular, longitude 0 at the
centre for the Moon and Earth; equatorial RA/Dec for the stars).
"""
import hashlib, io, json
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None
OUT = Path(__file__).resolve().parent.parent / 'web/public/textures'
RAW = Path(__file__).resolve().parent / 'raw/textures'
SVS = 'https://svs.gsfc.nasa.gov/vis/a000000'
SOURCES = {
    'moon_color.jpg': (f'{SVS}/a004700/a004720/lroc_color_poles_2k.tif', (2048, 1024),
                       'NASA SVS CGI Moon Kit (LRO LROC WAC colour mosaic, poles filled), svs.gsfc.nasa.gov/4720'),
    'moon_height.jpg': (f'{SVS}/a004700/a004720/ldem_3_8bit.jpg', (1024, 512),
                        'NASA SVS CGI Moon Kit (LRO LOLA elevation, 8-bit), svs.gsfc.nasa.gov/4720'),
    'stars.jpg': (f'{SVS}/a004800/a004851/hiptyc_2020_4k_print.jpg', (2048, 1024),
                  'NASA SVS Deep Star Maps 2020 (Hipparcos-2 and Tycho-2 catalogues), svs.gsfc.nasa.gov/4851'),
    'earth.jpg': (f'{SVS}/a003600/a003615/flat_earth_Largest_still.0330.jpg', (4096, 2048),
                  'NASA SVS 3615 Earth with clouds (Greg Shirah, NASA GSFC Scientific Visualization Studio), svs.gsfc.nasa.gov/3615'),
    'earth_night.jpg': ('https://svs.gsfc.nasa.gov/vis/a030000/a030000/a030028/earthatnight2012_print.jpg', (2048, 1024),
                        'NASA Earth Observatory / SVS Black Marble 2012 (Suomi NPP VIIRS city lights), svs.gsfc.nasa.gov/30028'),
    'sun.jpg': ('https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0304.jpg', (1024, 1024),
                'NASA/SDO and the AIA science team (AIA 304 Å, retrieved image)'),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    meta = {'generated': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'files': {}}
    for name, (url, size, credit) in SOURCES.items():
        raw = RAW / url.rsplit('/', 1)[-1]
        if not raw.exists():
            r = requests.get(url, timeout=600)
            r.raise_for_status()
            raw.write_bytes(r.content)
        data = raw.read_bytes()
        im = Image.open(io.BytesIO(data))
        if im.mode not in ('RGB', 'L'):
            # 16-bit TIFFs: scale to 8-bit
            im = im.point(lambda v: v / 256) if im.mode.startswith('I') else im
            im = im.convert('RGB')
        if name == 'sun.jpg':  # crop to the disc: drops the caption strip, keeps the limb
            w, h = im.size
            m = int(w * 0.07)
            im = im.crop((m, m, w - m, h - m))
        im = im.resize(size, Image.LANCZOS)
        # display-only tone adjustments (no geometric change): stretch the pale 16-bit Moon, lift faint stars
        if name == 'moon_color.jpg':
            im = ImageOps.autocontrast(im, cutoff=0.5)
        if name == 'stars.jpg':
            im = im.point(lambda v: min(255, int(255 * (v / 255) ** 0.6)))
        im.save(OUT / name, quality=85 if name != 'stars.jpg' else 90, optimize=True, progressive=True)
        meta['files'][name] = {'source': url, 'sourceSha256': hashlib.sha256(data).hexdigest(), 'size': list(size),
                               'credit': credit, 'bytes': (OUT / name).stat().st_size}
        print(name, size, (OUT / name).stat().st_size)
    (OUT / 'textures.json').write_text(json.dumps(meta, indent=1))


if __name__ == '__main__':
    main()
