"""Source-resolution local terrain screening. No 20 m mesh-derived science.

3x3 least-squares plane slope (15 m pixel support); 5x5 detrended height RMS
(25 m pixel support). Regular 5 m source centres; full neighbourhood required.
"""
import json
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin
from scipy.ndimage import correlate
from terrain_site01 import RAW, OUT, ROOT, inspect, digest, EXPECTED_SHA256, PGDA, fetch


def plane_metrics(z, spacing=5., n=5):
    z=np.asarray(z,dtype=np.float64)
    coord=(np.arange(n)-n//2)*spacing
    x,y=np.meshgrid(coord,-coord)
    ones=np.ones((n,n));count=correlate(np.isfinite(z).astype(float),ones,mode='constant',cval=0)
    v=np.where(np.isfinite(z),z,0)
    # Subtract a constant to avoid catastrophic cancellation in second moments.
    reference=float(np.median(v[np.isfinite(z)])) if np.isfinite(z).any() else 0
    v=np.where(np.isfinite(z),z-reference,0)
    mean=correlate(v,ones,mode='constant',cval=0)/(n*n)
    a=correlate(v,x,mode='constant',cval=0)/np.sum(x*x)
    b=correlate(v,y,mode='constant',cval=0)/np.sum(y*y)
    variance=correlate(v*v,ones,mode='constant',cval=0)/(n*n)-mean*mean-(a*a*np.sum(x*x)+b*b*np.sum(y*y))/(n*n)
    rms=np.sqrt(np.maximum(0,variance))
    a[count!=n*n]=np.nan;b[count!=n*n]=np.nan;rms[count!=n*n]=np.nan
    return a,b,rms


def build():
    m=json.loads((OUT/'terrain.json').read_text())
    path=RAW/'Site01_final_adj_5mpp_surf.tif'
    fetch(PGDA+path.name,path)
    assert digest(path)==EXPECTED_SHA256['surf'];inspect(path)
    with rasterio.open(path) as src:
        r,c=src.index(m['x0'],m['y0'])
        # Halo enables complete source support at the display crop boundary.
        z=src.read(1,window=rasterio.windows.Window(c-2,r-2,1605,1605),masked=True).filled(np.nan).astype(float)
        transform=src.window_transform(rasterio.windows.Window(c,r,1601,1601));crs=src.crs
    a,b,_=plane_metrics(z,n=3);_,_,rough=plane_metrics(z,n=5)
    a=a[2:-2,2:-2];b=b[2:-2,2:-2];rough=rough[2:-2,2:-2]
    xx,yy=np.meshgrid(m['x0']+np.arange(1601)*5,m['y0']-np.arange(1601)*5)
    k=1+(xx*xx+yy*yy)/(4*m['radiusM']**2)
    # Conformal projection distances -> local physical horizontal distances at terrain radius.
    factor=k/(1+z[2:-2,2:-2]/m['radiusM'])
    slope=np.degrees(np.arctan(np.hypot(a,b)*factor))
    result={'version':1,'width':1601,'height':1601,'x0':m['x0'],'y0':m['y0'],'dx':5,'dy':-5,
            'sourceSha256':digest(path),'slopeSupportM':15,'roughnessSupportM':25,'quantum':.001,'noData':65535,
            'method':'3x3 OLS plane slope; 5x5 OLS detrended radial-height RMS; complete native 5 m neighbourhoods; slope uses stereographic/elevation scale correction',
            'assets':{},'points':[]}
    out=OUT/'hazards';out.mkdir(exist_ok=True)
    scientific=ROOT/'pipeline/out/hazards';scientific.mkdir(parents=True,exist_ok=True)
    for name,arr in [('slope',slope),('roughness',rough)]:
        if np.nanmax(arr)>65.534:raise ValueError('Quantization range exceeded')
        encoded=np.full(arr.shape,65535,dtype='<u2');valid=np.isfinite(arr)
        encoded[valid]=np.rint(arr[valid]*1000).astype('<u2')
        file=out/(name+'.u16');file.write_bytes(encoded.tobytes())
        with rasterio.open(scientific/(name+'.tif'),'w',driver='GTiff',width=1601,height=1601,count=1,dtype='float32',crs=crs,transform=transform,nodata=np.nan,compress='deflate') as dst:dst.write(arr.astype('float32'),1)
        result['assets'][name]={'file':file.name,'sha256':digest(file),'units':'degrees' if name=='slope' else 'm','min':float(np.nanmin(arr)),'max':float(np.nanmax(arr))}
    official=RAW/'Site01_final_adj_5mpp_slp.tif'
    fetch(PGDA+official.name,official)
    if digest(official)!='3a90035a4946b4a04b7332c52f0b2b1cff71648bd8c105e14d8a7e15c6bcfe8e':
        raise ValueError('Official slope source changed; review the product before updating its observed hash')
    official_metadata=inspect(official)
    with rasterio.open(official) as src:
        with rasterio.open(path) as original:
            assert src.transform==original.transform and src.shape==original.shape
        ref=src.read(1,window=rasterio.windows.Window(c,r,1601,1601),masked=True).filled(np.nan)
    residual=slope-ref;v=np.isfinite(residual)
    result['officialComparison']={'metadata':official_metadata,'url':PGDA+official.name,'sha256':digest(official),'rmsDifferenceDeg':float(np.sqrt(np.mean(residual[v]**2))),'maxAbsDifferenceDeg':float(np.max(np.abs(residual[v]))),'note':'Different slope estimators/support may differ; official product is a comparison, not substituted ground truth.'}
    # Independent per-window numpy least-squares reference at representative native centres.
    errors=[]
    for row,col in [(0,0),(100,200),(800,800),(1600,1600),(913,1101)]:
        vals={}
        for n,key in [(3,'slope'),(5,'roughness')]:
            q=n//2;local=z[row+2-q:row+2+q+1,col+2-q:col+2+q+1]
            x,y=np.meshgrid((np.arange(n)-q)*5,-(np.arange(n)-q)*5)
            A=np.column_stack([x.ravel(),y.ravel(),np.ones(n*n)])
            coef=np.linalg.lstsq(A,local.ravel(),rcond=None)[0]
            value=np.degrees(np.arctan(np.hypot(*coef[:2])*factor[row,col])) if key=='slope' else np.sqrt(np.mean((local.ravel()-A@coef)**2))
            actual=(slope if key=='slope' else rough)[row,col];errors.append(abs(float(actual-value)));vals[key]=float(actual)
        result['points'].append({'row':row,'col':col,**vals})
    result['independentMaxDifference']=max(errors)
    (out/'hazards.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    return result

if __name__=='__main__':build()
