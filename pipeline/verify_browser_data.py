"""Pin shipped scientific inputs to the application bundle. Run after intentionally regenerating data.
--check verifies the recorded bytes; hashes establish integrity, not scientific ground truth.
"""
from pathlib import Path
import argparse, hashlib, json
ROOT = Path(__file__).resolve().parents[1]
FILES = ['ephem.json', 'ephem.bin', 'sites.json', 'validation.json', 'dem_global.json', 'dem_global.bin', 'dem_polar.json', 'dem_polar.bin', 'pgda_sun.bin', 'pgda_earth.bin']
MANIFEST = ROOT / 'web/src/lib/dataChecksums.json'
def manifest():
    return {name: hashlib.sha256((ROOT / 'web/public/data' / name).read_bytes()).hexdigest() for name in FILES}
if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--check', action='store_true'); a = p.parse_args()
    actual = manifest()
    if a.check:
        if json.loads(MANIFEST.read_text()) != actual: raise SystemExit('Scientific data changed: verify provenance, then regenerate the checksum manifest.')
        print(f'PASS {len(FILES)} shipped scientific files match their pinned SHA-256 checksums')
    else:
        MANIFEST.write_text(json.dumps(actual, indent=2) + '\n')
