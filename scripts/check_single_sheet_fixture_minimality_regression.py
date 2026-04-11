#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = [
    ROOT / 'saved-forms' / 'small-sample.json',
    ROOT / 'variants' / 'modern-light' / 'data' / 'sample-data.json',
]


def assert_no_single_sheet_binding_noise(path: Path):
    data = json.loads(path.read_text(encoding='utf-8'))
    ks2_sheets = data.get('ks2Sheets') or []
    if len(ks2_sheets) != 1:
        raise AssertionError(f'{path.name}: expected exactly 1 active ks2 sheet, got {len(ks2_sheets)}')

    legacy_extra = ((data.get('legacy') or {}).get('extraKs2Sheets') or [])
    if legacy_extra:
        raise AssertionError(f'{path.name}: expected no extra legacy ks2 sheets, got {len(legacy_extra)}')

    ks3_rows = (((data.get('ks3') or {}).get('rows')) or [])
    if ks3_rows:
        raise AssertionError(f'{path.name}: expected no active KS-3 rows, got {len(ks3_rows)}')

    holdback_sections = ((data.get('holdbacks') or {}).get('sections') or [])
    for index, section in enumerate(holdback_sections, 1):
        if 'ks2SheetId' in section:
            raise AssertionError(f'{path.name}: holdback section #{index} still contains redundant ks2SheetId')

    for bucket_name in ['xmlP', 'xml']:
        bucket = data.get(bucket_name) or {}
        settlement = bucket.get('settlement') or {}
        for index, row in enumerate(settlement.get('manualRows') or [], 1):
            if 'ks2SheetId' in row:
                raise AssertionError(f'{path.name}: {bucket_name}.settlement.manualRows[{index - 1}] still contains redundant ks2SheetId')


def main():
    for path in FIXTURES:
        assert_no_single_sheet_binding_noise(path)
    print(f'OK: single-sheet fixture minimality regression passed ({len(FIXTURES)} fixtures)')


if __name__ == '__main__':
    main()
