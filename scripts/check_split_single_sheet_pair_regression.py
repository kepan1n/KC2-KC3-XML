#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
P_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'
Z_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABZ.xsd'
PRIMER_PATH = ROOT / 'saved-forms' / 'primer-zapolneniya.json'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_customer_xml_from_export import build_customer_xml_exports_by_ks2_sheet  # noqa: E402
from generate_xml_from_export import build_xml_exports_by_ks2_sheet  # noqa: E402
from split_legacy_multi_sheet_form import split_state_into_single_sheet_forms  # noqa: E402
from z_xsd_compat import normalize_document_for_xsd  # noqa: E402


def serialize_xml_tree(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def validate_exports(exports, schema_path: Path, label: str):
    schema = ET.XMLSchema(ET.parse(str(schema_path)))
    if not exports:
        raise AssertionError(f'Expected at least one {label} export, got none')
    for item in exports:
        xml_bytes = serialize_xml_tree(item['tree'])
        document = ET.fromstring(xml_bytes)
        document = normalize_document_for_xsd(document, schema_path)
        if not schema.validate(document):
            last_error = schema.error_log.last_error
            raise AssertionError(
                f"{label} split regression failed for {item['filename']}: {last_error.message if last_error else 'XSD validation error'}"
            )


def main():
    payload = json.loads(PRIMER_PATH.read_text(encoding='utf-8'))
    split_forms = split_state_into_single_sheet_forms(payload)
    if len(split_forms) < 2:
        raise AssertionError(f'Expected multiple split single-sheet forms from primer-zapolneniya, got {len(split_forms)}')

    for index, form in enumerate(split_forms, 1):
        ks2_sheets = form.get('ks2Sheets') or []
        if len(ks2_sheets) != 1:
            raise AssertionError(f'split form #{index}: expected exactly 1 active ks2 sheet, got {len(ks2_sheets)}')

        legacy_extra = ((form.get('legacy') or {}).get('extraKs2Sheets') or [])
        if legacy_extra:
            raise AssertionError(f'split form #{index}: expected no extra legacy ks2 sheets, got {len(legacy_extra)}')

        ks3_rows = (((form.get('ks3') or {}).get('rows')) or [])
        if ks3_rows:
            raise AssertionError(f'split form #{index}: expected no active KS-3 rows after splitting, got {len(ks3_rows)}')

        for section in ((form.get('holdbacks') or {}).get('sections') or []):
            if 'ks2SheetId' in section:
                raise AssertionError(f"split form #{index}: holdback section still carries redundant ks2SheetId in single-sheet output")
        for bucket_name in ['xmlP', 'xml']:
            bucket = form.get(bucket_name) or {}
            settlement = bucket.get('settlement') or {}
            for row in settlement.get('manualRows') or []:
                if 'ks2SheetId' in row:
                    raise AssertionError(f"split form #{index}: manual settlement row still carries redundant ks2SheetId in single-sheet output")

        contractor_exports = build_xml_exports_by_ks2_sheet(form)
        customer_exports = build_customer_xml_exports_by_ks2_sheet(form)

        if len(contractor_exports) != 1:
            raise AssertionError(f'split form #{index}: expected exactly 1 contractor P export, got {len(contractor_exports)}')
        if len(customer_exports) != 1:
            raise AssertionError(f'split form #{index}: expected exactly 1 customer Z export, got {len(customer_exports)}')

        validate_exports(contractor_exports, P_XSD_PATH, 'contractor P')
        validate_exports(customer_exports, Z_XSD_PATH, 'customer Z')

    print(f'OK: split single-sheet pair regression passed ({len(split_forms)} forms)')


if __name__ == '__main__':
    main()
