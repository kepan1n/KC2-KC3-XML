#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

from split_legacy_multi_sheet_form import split_state_into_single_sheet_forms  # noqa: E402


def build_payload() -> dict:
    return {
        'meta': {
            'description': 'Legacy compatibility regression payload',
        },
        'common': {},
        'ks2Sheets': [
            {
                'id': 'sheet-1',
                'title': 'КС-2 №1',
                'documentNumber': '1',
                'document': {'number': '1', 'date': '2026-04-01'},
                'rows': [],
            },
            {
                'id': 'sheet-2',
                'title': 'КС-2 №2',
                'documentNumber': '2',
                'document': {'number': '2', 'date': '2026-04-02'},
                'rows': [],
            },
        ],
        'ks3': {
            'rows': [
                {'name': 'legacy ks3 row should be dropped by splitter'},
            ],
        },
        'holdbacks': {
            'sections': [
                {
                    'name': 'Раздел 1',
                    'ks2SheetId': 'sheet-1',
                    'comment': 'sheet-1 section',
                    'subitems': [
                        {
                            'advanceDoc': 'A-1',
                            'ks2SheetId': 'sheet-1',
                            'comment': 'sheet-1 subitem',
                        }
                    ],
                },
                {
                    'name': 'Раздел 2',
                    'ks2SheetId': 'sheet-2',
                    'comment': 'sheet-2 section',
                    'subitems': [
                        {
                            'advanceDoc': 'A-2',
                            'ks2SheetId': 'sheet-2',
                            'comment': 'sheet-2 subitem',
                        }
                    ],
                },
            ],
        },
        'xmlP': {
            'settlement': {
                'manualRows': [
                    {
                        'kindCode': '31',
                        'amount': 100,
                        'ks2SheetId': 'sheet-1',
                        'documentRef': 'ref-1',
                    },
                    {
                        'kindCode': '32',
                        'amount': 200,
                        'ks2SheetId': 'sheet-2',
                        'documentRef': 'ref-2',
                    },
                ],
            },
        },
    }


def main():
    split_forms = split_state_into_single_sheet_forms(build_payload())
    if len(split_forms) != 2:
        raise AssertionError(f'Expected 2 split single-sheet forms, got {len(split_forms)}')

    forms_by_sheet_id = {}
    for form in split_forms:
        ks2_sheets = form.get('ks2Sheets') or []
        if len(ks2_sheets) != 1:
            raise AssertionError(f'Expected exactly 1 active ks2 sheet per split form, got {len(ks2_sheets)}')
        sheet_id = ks2_sheets[0].get('id')
        forms_by_sheet_id[sheet_id] = form

    for sheet_id, expected_doc in [('sheet-1', 'ref-1'), ('sheet-2', 'ref-2')]:
        form = forms_by_sheet_id.get(sheet_id)
        if not form:
            raise AssertionError(f'Missing split form for {sheet_id}')
        ks3_rows = (((form.get('ks3') or {}).get('rows')) or [])
        if ks3_rows:
            raise AssertionError(f'{sheet_id}: expected splitter to drop active KS-3 rows, got {len(ks3_rows)}')
        holdback_rows = ((form.get('holdbacks') or {}).get('rows') or [])
        if len(holdback_rows) < 2:
            raise AssertionError(f'{sheet_id}: expected holdback rows restored from legacy sections, got {len(holdback_rows)}')
        settlement_rows = ((form.get('xmlExtras') or {}).get('settlementRows') or [])
        if len(settlement_rows) != 1:
            raise AssertionError(f'{sheet_id}: expected exactly 1 manual settlement row restored from xmlP/xml, got {len(settlement_rows)}')
        if settlement_rows[0].get('documentRef') != expected_doc:
            raise AssertionError(
                f"{sheet_id}: expected restored manual settlement row documentRef={expected_doc!r}, got {settlement_rows[0].get('documentRef')!r}"
            )

    print('OK: legacy splitter compatibility regression passed')


if __name__ == '__main__':
    main()
