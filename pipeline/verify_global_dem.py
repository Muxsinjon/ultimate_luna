"""Independently reproduce the shipped global grid from the official LOLA PDS source.

Requires numpy and requests. Downloads are cached; HTTPS certificate verification stays on.
python pipeline/verify_global_dem.py --cache pipeline/raw/global-validation --report report.json
This verifies the source reduction, not the accuracy of individual LOLA measurements.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re

import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/'


def verify(cache: Path) -> dict:
    cache.mkdir(parents=True, exist_ok=True)
    for name in ('LDEM_16.LBL', 'LDEM_16.IMG'):
        path = cache / name
        if not path.exists():
            response = requests.get(SOURCE + name, timeout=120)
            response.raise_for_status()
            path.write_bytes(response.content)
    label = (cache / 'LDEM_16.LBL').read_text()

    def field(name: str) -> str:
        match = re.search(r'^\s*' + name + r'\s*=\s*([^\r\n]+)', label, re.M)
        if match is None:
            raise ValueError(f'PDS label is missing {name}')
        return match.group(1).strip().strip('"')

    expected_label = {
        'PRODUCT_ID': 'LDEM_16', 'LINES': '2880', 'LINE_SAMPLES': '5760',
        'SAMPLE_TYPE': 'LSB_INTEGER', 'SAMPLE_BITS': '16', 'SCALING_FACTOR': '0.5',
        'OFFSET': '1737400.', 'POSITIVE_LONGITUDE_DIRECTION': 'EAST',
        'MAP_PROJECTION_TYPE': 'SIMPLE CYLINDRICAL',
    }
    for name, value in expected_label.items():
        if field(name) != value:
            raise ValueError(f'Unexpected source {name}: {field(name)}')
    source_bytes = (cache / 'LDEM_16.IMG').read_bytes()
    heights = np.frombuffer(source_bytes, dtype='<i2').reshape(2880, 5760).astype('float32') * 0.5
    expected = np.round(heights.reshape(720, 4, 1440, 4).mean(axis=(1, 3))).astype('<i2')
    shipped = ROOT / 'web/public/data/dem_global.bin'
    meta = json.loads(shipped.with_suffix('.json').read_text())
    if (meta['rows'], meta['cols'], meta['ppd']) != (720, 1440, 4):
        raise ValueError('Unexpected browser grid dimensions')
    actual = np.frombuffer(shipped.read_bytes(), dtype='<i2').reshape(720, 1440)
    report = {
        'source': SOURCE + 'LDEM_16.IMG', 'label': SOURCE + 'LDEM_16.LBL',
        'source_sha256': hashlib.sha256(source_bytes).hexdigest(),
        'shipped_sha256': hashlib.sha256(shipped.read_bytes()).hexdigest(),
        'source_frame': field('COORDINATE_SYSTEM_NAME'),
        'method': '0.5 m/DN, 4x4 block mean, nearest integer metre; 16 to 4 pixels/degree',
        'samples': int(actual.size), 'all_exact': bool(np.array_equal(actual, expected)),
        'max_difference_m': int(np.max(np.abs(actual.astype(int) - expected.astype(int)))),
        'range_m': [int(actual.min()), int(actual.max())],
    }
    if not report['all_exact']:
        raise ValueError(f'Global grid disagrees with NASA source: {report}')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / 'pipeline/raw/global-validation')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = verify(args.cache)
    result = json.dumps(report, indent=2) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(result)
    print(result)
