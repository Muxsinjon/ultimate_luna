"""Independent Rasterio/PyProj reference values for browser and TypeScript acceptance.

Computes fractional-pixel expectations from the original 5 m GeoTIFF, not the
exported 20 m binary. No network access or changes to production assets.
"""
import json
from pathlib import Path
import numpy as np
import rasterio
from pyproj import CRS, Transformer
from terrain_site01 import RAW, OUT, digest

ROOT = Path(__file__).resolve().parents[1]

class SourceReference:
    def __init__(self):
        self.meta = json.loads((OUT / 'terrain.json').read_text())
        self.path = RAW / self.meta['sources']['surf']['file']
        if digest(self.path) != self.meta['sources']['surf']['sha256']:
            raise ValueError('Native source hash mismatch')
        with rasterio.open(self.path) as src:
            self.native = src.read(1)
            self.transform = src.transform
            crs = CRS(src.crs)
            self.forward = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
            self.inverse = Transformer.from_crs(crs, crs.geodetic_crs, always_xy=True)
        self.c0 = round((self.meta['x0'] - self.transform.c) / self.transform.a - .5)
        self.r0 = round((self.meta['y0'] - self.transform.f) / self.transform.e - .5)
        self.coarse = self.native[self.r0:self.r0+1601:4, self.c0:self.c0+1601:4]

    @staticmethod
    def interpolations(grid, row, col):
        r = max(0, min(grid.shape[0]-2, int(np.floor(row))))
        c = max(0, min(grid.shape[1]-2, int(np.floor(col))))
        fr, fc = row-r, col-c
        a,b,d,e = [float(v) for v in (grid[r,c],grid[r,c+1],grid[r+1,c],grid[r+1,c+1])]
        bilinear = (a*(1-fc)+b*fc)*(1-fr)+(d*(1-fc)+e*fc)*fr
        triangle = a*(1-fc-fr)+b*fc+d*fr if fc+fr <= 1 else b*(1-fr)+d*(1-fc)+e*(fc+fr-1)
        return bilinear, triangle

    def at(self, lat, lon):
        x,y = self.forward.transform(lon, lat)
        nr = (y-self.transform.f)/self.transform.e-.5
        nc = (x-self.transform.c)/self.transform.a-.5
        mr,mc = (nr-self.r0)/4,(nc-self.c0)/4
        if not (-1e-7<=mr<=400+1e-7 and -1e-7<=mc<=400+1e-7):
            raise ValueError('Point outside verified subset')
        native,_ = self.interpolations(self.native,nr,nc)
        bilinear,triangle = self.interpolations(self.coarse,mr,mc)
        return {'lat':lat,'lon':lon%360,'x':x,'y':y,'native5mBilinearM':native,
                'mesh20mBilinearM':bilinear,'mesh20mTriangleM':triangle}

    def verify_pick(self, lat, lon, elevation):
        p = self.at(lat,lon)
        p.update(renderedElevationM=elevation,
                 renderedMinusNativeM=elevation-p['native5mBilinearM'],
                 renderedMinusSourceTriangleM=elevation-p['mesh20mTriangleM'])
        # Actual sphere/ENU triangles differ slightly from a planar projected DEM triangle.
        if abs(p['renderedMinusSourceTriangleM']) > .01:
            raise AssertionError(p)
        # Observed global decimation max + conservative numerical/interpolation margin.
        bound = self.meta['decimationResidualM']['maxAbs'] + .02
        if abs(p['renderedMinusNativeM']) > bound:
            raise AssertionError(p)
        return p


def main():
    ref = SourceReference()
    rng = np.random.default_rng(20261114)
    points = [ref.at(ref.meta['origin']['lat'],ref.meta['origin']['lon'])]
    for r,c in rng.uniform(0.01,399.99,(100,2)):
        lon,lat = ref.inverse.transform(ref.meta['x0']+c*20,ref.meta['y0']-r*20)
        points.append(ref.at(lat,lon))
    out = {'sourceSha256':ref.meta['sources']['surf']['sha256'],
           'method':'Rasterio native 5 m pixels; independent PyProj geographic projection; fractional sample interpolation',
           'points':points,
           'maxBilinearDifferenceFromNativeM':max(abs(p['mesh20mBilinearM']-p['native5mBilinearM']) for p in points),
           'maxTriangleDifferenceFromNativeM':max(abs(p['mesh20mTriangleM']-p['native5mBilinearM']) for p in points)}
    path = ROOT/'docs/data/SITE01_SAMPLE_REFERENCE.json'
    path.write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps({k:v for k,v in out.items() if k!='points'}))
    print('Verified reference points:',len(points))

if __name__=='__main__': main()
