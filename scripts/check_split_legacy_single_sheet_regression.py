#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT_JSON = ROOT / 'saved-forms' / 'primer-zapolneniya.json'

sys.path.insert(0, str(ROOT / 'scripts'))
from split_legacy_multi_sheet_form import split_state_into_single_sheet_forms  # noqa: E402


def resolve_sheet_id(row: dict) -> str:
    return str(row.get('ks2SheetId') or row.get('linkedKs2SheetId') or row.get('sheetId') or '').strip()


def main():
    source = json.loads(INPUT_JSON.read_text(encoding='utf-8'))
    outputs = split_state_into_single_sheet_forms(source)
    source_sheet_count = len(source.get('ks2Sheets') or [])
    if len(outputs) != source_sheet_count:
        raise AssertionError(f'Expected {source_sheet_count} split forms, got {len(outputs)}')

    total_holdback_rows = 0
    for index, item in enumerate(outputs):
        state = item['state']
        sheets = state.get('ks2Sheets') or []
        if len(sheets) != 1:
            raise AssertionError(f'Split form {index} must contain exactly one KS-2 sheet, got {len(sheets)}')
        if (state.get('legacy') or {}).get('extraKs2Sheets'):
            raise AssertionError(f'Split form {index} must not keep active legacy extra sheets')
        if ((state.get('ui') or {}).get('activePane')) != 'ks2:0':
            raise AssertionError(f'Split form {index} should open on ks2:0, got {state.get("ui", {}).get("activePane")!r}')

        single_sheet_id = str((sheets[0] or {}).get('id') or '')
        if not single_sheet_id:
            raise AssertionError(f'Split form {index} must keep a valid sheet id')

        holdback_rows = ((state.get('holdbacks') or {}).get('rows') or [])
        total_holdback_rows += len(holdback_rows)
        for row in holdback_rows:
            row_sheet_id = resolve_sheet_id(row)
            if row_sheet_id and row_sheet_id != single_sheet_id:
                raise AssertionError(
                    f'Split form {index} contains holdback row bound to another sheet: {row_sheet_id!r} != {single_sheet_id!r}'
                )

        settlement_rows = ((state.get('xmlExtras') or {}).get('settlementRows') or [])
        for row in settlement_rows:
            row_sheet_id = resolve_sheet_id(row)
            if row_sheet_id and row_sheet_id != single_sheet_id:
                raise AssertionError(
                    f'Split form {index} contains settlement row bound to another sheet: {row_sheet_id!r} != {single_sheet_id!r}'
                )

    if total_holdback_rows <= 0:
        raise AssertionError('Expected splitter to preserve holdback rows across outputs')

    print(f'OK: split {len(outputs)} single-sheet forms from {INPUT_JSON.name}')


if __name__ == '__main__':
    main()
