"""Reproducible real NASA Site01 terrain + NASA Trek LROC WAC context imagery.

All HTTPS uses system TLS trust. Raw files are cached, source hashes recorded.
Native GeoTIFF pixel centres are decimated 4x (5 -> 20 m) without invented heights.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import ssl
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
from rasterio.windows import Window
from pyproj import CRS, Transformer
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'pipeline/raw/Site01'
OUT = ROOT / 'web/public/data/terrain/site01'
PGDA = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/'
TREK = 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/'
R = 1737400
CRS_POLAR = CRS.from_proj4(f'+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R={R} +units=m +no_defs')
SITE = {'lat': -89.53432, 'lon': 209.94767}
# Observed over verified NASA HTTPS in this implementation, not publisher-issued checksums.
EXPECTED_SHA256 = {
 'surf': '3ba7b97cb00a2bcf21189c3aeb535f65afc21207154ab9f0d43c5bdc1f7e747e',
 'toterr': 'cf2cf52f52d2aa51e60d058010d10b0ebfb1d3e920f5a2b9a46eb6c51054ab1c',
}


def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def fetch(url, path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_suffix(path.suffix + '.part')
        try:
            with requests.get(url, timeout=(30, 120), stream=True,
                              verify=ssl.get_default_verify_paths().cafile or True) as response:
                response.raise_for_status()
                headers = {k: response.headers[k] for k in ['Content-Type', 'Content-Length', 'ETag', 'Last-Modified'] if k in response.headers}
                with part.open('wb') as out:
                    for chunk in response.iter_content(1024 * 1024):
                        out.write(chunk)
                part.replace(path)
                path.with_suffix(path.suffix + '.http.json').write_text(json.dumps({'url': url, 'status': response.status_code, 'headers': headers}, indent=2))
        finally:
            part.unlink(missing_ok=True)
    return {'url': url, 'file': path.name, 'sha256': digest(path), 'bytes': path.stat().st_size}


def inspect(path):
    with rasterio.open(path) as src:
        crs = CRS(src.crs)
        # Source WKT uses an unnamed datum; compare projection numerically as well as radii/units.
        forward = Transformer.from_crs(CRS_POLAR.geodetic_crs, crs, always_xy=True)
        canonical = Transformer.from_crs(CRS_POLAR.geodetic_crs, CRS_POLAR, always_xy=True)
        lon, lat = [0, 90, 180, 270, SITE['lon']], [-89, -88, -87, -86, SITE['lat']]
        actual, expected = np.array(forward.transform(lon, lat)), np.array(canonical.transform(lon, lat))
        same = (crs.is_projected and abs(crs.ellipsoid.semi_major_metre-R)<1e-6
                and abs(crs.ellipsoid.semi_minor_metre-R)<1e-6
                and all(abs(axis.unit_conversion_factor-1)<1e-12 for axis in crs.axis_info)
                and np.allclose(actual, expected, rtol=0, atol=1e-6))
        if src.driver != 'GTiff' or src.count != 1 or not same:
            raise ValueError('Expected one-band lunar south-polar stereographic GeoTIFF on 1737.4 km sphere')
        if src.res != (5., 5.) or src.scales != (1.,) or src.offsets != (0.,):
            raise ValueError('Unexpected source resolution or scale/offset; investigate before processing')
        return {'width': src.width, 'height': src.height, 'dtype': src.dtypes[0],
                'resolutionM': list(src.res), 'boundsM': list(src.bounds), 'transform': list(src.transform)[:6],
                'crsWkt': src.crs.to_wkt(), 'noData': 'NaN' if src.nodata is not None and math.isnan(src.nodata) else src.nodata,
                'unitsMetadata': list(src.units), 'scales': list(src.scales), 'offsets': list(src.offsets), 'tags': src.tags()}


def build_dem(out=OUT):
    out.mkdir(parents=True, exist_ok=True)
    sources = {}
    for kind in ['surf', 'toterr']:
        filename = f'Site01_final_adj_5mpp_{kind}.tif'
        sources[kind] = fetch(PGDA + filename, RAW / filename)
        if sources[kind]['sha256'] != EXPECTED_SHA256[kind]:
            raise ValueError('Source bytes changed; investigate the NASA product before updating the recorded checksum')
        sources[kind]['metadata'] = inspect(RAW / filename)
    if sources['surf']['metadata']['transform'] != sources['toterr']['metadata']['transform']:
        raise ValueError('Uncertainty grid is not co-registered with DEM')
    transform = Transformer.from_crs(CRS_POLAR.geodetic_crs, CRS_POLAR, always_xy=True)
    x, y = transform.transform(SITE['lon'], SITE['lat'])
    with rasterio.open(RAW / sources['surf']['file']) as src:
        row, col = src.index(x, y)
        r0, c0 = row - 800, col - 800
        if min(r0, c0) < 0 or r0 + 1601 > src.height or c0 + 1601 > src.width:
            raise ValueError('Requested 8 km subset exceeds real source coverage')
        x0, y0 = src.xy(r0, c0)
    manifest = {'version': 1, 'width': 401, 'height': 401, 'x0': x0, 'y0': y0,
                'dx': 20., 'dy': -20., 'radiusM': R, 'origin': SITE,
                'projection': 'south-polar-stereographic', 'frame': 'MOON_ME / DE421 (PGDA)',
                'heightDatum': 'metres above the 1737400 m lunar reference sphere',
                'sourceResolutionM': 5, 'sources': sources, 'assets': {}, 'imagery': None,
                'uncertaintyNote': 'PGDA total Z RMS error, including interpolation. About 90% of native 5 m pixels are interpolated. Pixel spacing is not accuracy.'}
    for kind, filename in [('surf', 'elevation.f32'), ('toterr', 'uncertainty.f32')]:
        with rasterio.open(RAW / sources[kind]['file']) as src:
            grid = src.read(1, window=Window(c0, r0, 1601, 1601), masked=True).filled(np.nan)[::4, ::4].astype('<f4')
            if grid.shape != (401, 401):
                raise ValueError('Incomplete grid')
            if kind == 'toterr' and np.any(grid[np.isfinite(grid)] < 0):
                raise ValueError('Negative RMS uncertainty')
            (out / filename).write_bytes(grid.tobytes())
            manifest['assets'][kind] = {'file': filename, 'sha256': digest(out / filename),
                'validSamples': int(np.isfinite(grid).sum()), 'min': float(np.nanmin(grid)),
                'max': float(np.nanmax(grid)), 'median': float(np.nanmedian(grid))}
    # Quantify triangulation/decimation residual against the real native 5 m grid (not ground truth).
    with rasterio.open(RAW / sources['surf']['file']) as src:
        native = src.read(1, window=Window(c0,r0,1601,1601), masked=True).filled(np.nan)
    coarse = native[::4,::4]
    rr,cc = np.meshgrid(np.arange(1601)/4,np.arange(1601)/4,indexing='ij')
    r=np.minimum(rr.astype(int),399);c=np.minimum(cc.astype(int),399)
    fr,fc=rr-r,cc-c
    a,b,d,e=coarse[r,c],coarse[r,c+1],coarse[r+1,c],coarse[r+1,c+1]
    model=np.where(fc+fr<=1,a*(1-fc-fr)+b*fc+d*fr,b*(1-fr)+d*(1-fc)+e*(fc+fr-1))
    residual=(model-native)[np.isfinite(model)&np.isfinite(native)]
    manifest['decimationResidualM']={'against':'native 5 m DEM samples, not independent ground truth',
        'rms':float(np.sqrt(np.mean(residual**2))),'p95Abs':float(np.percentile(np.abs(residual),95)),
        'maxAbs':float(np.max(np.abs(residual))),'samples':int(residual.size)}
    # Independent native-source samples across the crop, plus exact curated coordinate.
    inverse = Transformer.from_crs(CRS_POLAR, CRS_POLAR.geodetic_crs, always_xy=True)
    checks = []
    with rasterio.open(RAW / sources['surf']['file']) as src:
        for r, c in [(0,0),(0,400),(200,200),(400,0),(400,400),(173,279)]:
            px, py = x0+c*20, y0-r*20
            lon, lat = inverse.transform(px, py)
            backx, backy = transform.transform(lon, lat)
            checks.append({'row':r, 'col':c, 'lat':lat, 'lon':lon % 360,
                           'elevationM': float(next(src.sample([(px,py)]))[0]),
                           'projectionErrorM': math.hypot(backx-px, backy-py)})
        manifest['alignment'] = {'checkpoints': checks, 'siteX':x, 'siteY':y, 'siteSourceRow':row, 'siteSourceCol':col,
                                 'siteNativeElevationM':float(next(src.sample([(x,y)]))[0])}
    (out / 'terrain.json').write_text(json.dumps(manifest, indent=2, allow_nan=False)+'\n')
    return manifest


def build_imagery(m, out=OUT):
    """Warp real NASA Trek WAC tiles to exact mesh vertex bounds, not a guessed JPEG overlay."""
    cap = RAW / 'WMTSCapabilities.xml'
    provenance = fetch(TREK+'WMTSCapabilities.xml', cap)
    metadata = RAW/'wac-metadata.xml'
    metadata_source = fetch('https://trek.nasa.gov/moon/TrekWS/rest/cat/metadata/stream?label=LRO_WAC_Mosaic_Global_303ppd_v02', metadata)
    metadata_xml = ET.parse(metadata).getroot()
    # Verify the imagery metadata's geographic units and lunar reference radius, not just tile positions.
    if abs(float(metadata_xml.findtext('.//semiaxis')) - R) > .001 or metadata_xml.findtext('.//geogunit') != 'Decimal degrees':
        raise ValueError('Imagery reference system differs from the expected lunar sphere')
    provenance['metadata'] = metadata_source
    provenance['sourceAbsoluteAccuracy'] = metadata_xml.findtext('.//horizpar')
    ns={'w':'http://www.opengis.net/wmts/1.0','o':'http://www.opengis.net/ows/1.1'}
    xml=ET.parse(cap).getroot()
    matrix=next(el for el in xml.findall('.//w:TileMatrix',ns) if el.find('o:Identifier',ns).text=='8')
    nx,ny=[int(float(matrix.find('w:'+k,ns).text)) for k in ['MatrixWidth','MatrixHeight']]
    if (nx,ny)!=(512,256) or matrix.find('w:TopLeftCorner',ns).text.strip()!='-180.0 90.0':
        raise ValueError('NASA Trek tile matrix changed; inspect capabilities')
    inv=Transformer.from_crs(CRS_POLAR,CRS_POLAR.geodetic_crs,always_xy=True)
    # Sample the entire target grid to handle curved geographic boundaries, not just corners.
    xx,yy=np.meshgrid(np.linspace(m['x0'],m['x0']+8000,513),np.linspace(m['y0'],m['y0']-8000,513))
    lon,lat=inv.transform(xx,yy)
    if lon.max()-lon.min()>180:
        raise ValueError('Crop crosses longitude wrap; split source mosaic explicitly')
    tc=np.floor((lon+180)/360*nx).astype(int);tr=np.floor((90-lat)/180*ny).astype(int)
    # One tile halo for interpolation at the crop boundary.
    c0,c1=max(0,int(tc.min())-1),min(nx-1,int(tc.max())+1)
    r0,r1=max(0,int(tr.min())-1),min(ny-1,int(tr.max())+1)
    if (c1-c0+1)*(r1-r0+1)>300:
        raise ValueError('Excessive tile acquisition')
    def tile(rc):
        r,c=rc
        path=RAW/'wac'/f'8_{r}_{c}.jpg'
        source=fetch(TREK+f'default/default028mm/8/{r}/{c}.jpg',path)
        image=np.asarray(Image.open(path).convert('L'))
        if image.shape!=(256,256): raise ValueError('Invalid WMTS tile dimensions')
        return r,c,image,source
    mosaic=np.zeros(((r1-r0+1)*256,(c1-c0+1)*256),dtype='uint8')
    sources=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for r,c,img,source in pool.map(tile,[(r,c) for r in range(r0,r1+1) for c in range(c0,c1+1)]):
            mosaic[(r-r0)*256:(r-r0+1)*256,(c-c0)*256:(c-c0+1)*256]=img;sources.append(source)
    spacing=360/(nx*256)
    src_transform=from_origin(-180+c0*256*spacing,90-r0*256*spacing,spacing,spacing)
    # Texture edges coincide with the outer vertex centres. UV (0,1) is north-west.
    target_transform=from_origin(m['x0'],m['y0'],8000/1024,8000/1024)
    image=np.zeros((1024,1024),dtype='uint8')
    reproject(mosaic,image,src_transform=src_transform,src_crs=CRS_POLAR.geodetic_crs.to_wkt(),
              dst_transform=target_transform,dst_crs=CRS_POLAR.to_wkt(),resampling=Resampling.bilinear,num_threads=2)
    if image.max()==image.min(): raise ValueError('No useful real imagery in crop')
    Image.fromarray(image).save(out/'lroc-wac.jpg',quality=92)
    provenance.update(tiles=sources, matrix=8, geographicDegreesPerPixel=spacing,
                      srcTransform=list(src_transform)[:6],textureTransform=list(target_transform)[:6],
                      targetBounds=[m['x0'],m['y0']-8000,m['x0']+8000,m['y0']],
                      textureSize=[1024,1024], sourceFrame='Moon 2000 / lunar geographic, NASA Trek EPSG:104903',
                      registration='Projection alignment verified mathematically. No independent image/DEM landmark residual or frame correction measured; WAC context is not NAC precision imagery.')
    (out/'imagery-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    m['imagery']={'file':'lroc-wac.jpg','sha256':digest(out/'lroc-wac.jpg'),
                  'title':'LROC WAC global mosaic (NASA Trek, 303 pixels/degree)',
                  'url':TREK+'WMTSCapabilities.xml','provenance':'imagery-provenance.json',
                  'note':'Real WAC context imagery, ~100 m nominal source, with dark polar areas. Source metadata quotes 12–300 m absolute accuracy. Map-projected onto the DEM; no independent landmark residual or subpixel co-registration measured. Observed shadows are baked into the mosaic and do not reflect mission time.'}
    (out/'terrain.json').write_text(json.dumps(m,indent=2,allow_nan=False)+'\n')
    return m


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--imagery',action='store_true');a=p.parse_args()
    m=build_dem()
    if a.imagery: build_imagery(m)
    print(json.dumps({'output':str(OUT),'assets':m['assets'],'imagery':m['imagery']},indent=2))
