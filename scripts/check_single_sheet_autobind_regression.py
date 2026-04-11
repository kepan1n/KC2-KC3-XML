#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODERN_LIGHT_SAMPLE = ROOT / 'variants' / 'modern-light' / 'data' / 'sample-data.json'
PRIMER_PATH = ROOT / 'saved-forms' / 'primer-zapolneniya.json'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_customer_xml_from_export import build_customer_xml_exports_by_ks2_sheet  # noqa: E402
from generate_xml_from_export import build_xml_exports_by_ks2_sheet  # noqa: E402
from single_sheet_state_helpers import strip_redundant_single_sheet_bindings  # noqa: E402
from split_legacy_multi_sheet_form import split_state_into_single_sheet_forms  # noqa: E402


def assert_single_sheet_exports(payload: dict, label: str):
    contractor_exports = build_xml_exports_by_ks2_sheet(payload)
    customer_exports = build_customer_xml_exports_by_ks2_sheet(payload)
    if len(contractor_exports) != 1:
        raise AssertionError(f'{label}: expected exactly 1 contractor P export, got {len(contractor_exports)}')
    if len(customer_exports) != 1:
        raise AssertionError(f'{label}: expected exactly 1 customer Z export, got {len(customer_exports)}')


def main():
    sample = json.loads(MODERN_LIGHT_SAMPLE.read_text(encoding='utf-8'))
    assert_single_sheet_exports(strip_redundant_single_sheet_bindings(sample), 'modern-light sample without explicit ks2SheetId')

    primer = json.loads(PRIMER_PATH.read_text(encoding='utf-8'))
    split_forms = split_state_into_single_sheet_forms(primer)
    if not split_forms:
        raise AssertionError('Expected split single-sheet forms from primer-zapolneniya')

    for index, form in enumerate(split_forms, 1):
        assert_single_sheet_exports(
            strip_redundant_single_sheet_bindings(form),
            f'split form #{index} without explicit ks2SheetId',
        )

    print(f'OK: single-sheet autobind regression passed ({1 + len(split_forms)} checked states)')


if __name__ == '__main__':
    main()
