#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
P_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'
Z_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABZ.xsd'
SAMPLE_PATH = ROOT / 'variants' / 'modern-light' / 'data' / 'sample-data.json'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_customer_xml_from_export import build_customer_xml_exports_by_ks2_sheet  # noqa: E402
from generate_xml_from_export import build_xml_exports_by_ks2_sheet  # noqa: E402


def serialize_xml_tree(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def validate_exports(exports, schema_path: Path, label: str):
    schema = ET.XMLSchema(ET.parse(str(schema_path)))
    if not exports:
        raise AssertionError(f'Expected at least one {label} export, got none')
    for item in exports:
        xml_bytes = serialize_xml_tree(item['tree'])
        document = ET.fromstring(xml_bytes)
        if not schema.validate(document):
            last_error = schema.error_log.last_error
            raise AssertionError(
                f"{label} sample regression failed for {item['filename']}: {last_error.message if last_error else 'XSD validation error'}"
            )


def main():
    payload = json.loads(SAMPLE_PATH.read_text(encoding='utf-8'))
    ks2_sheets = payload.get('ks2Sheets') or []
    if len(ks2_sheets) != 1:
        raise AssertionError(f'Expected exactly 1 active ks2 sheet in sample-data.json, got {len(ks2_sheets)}')

    contractor_exports = build_xml_exports_by_ks2_sheet(payload)
    customer_exports = build_customer_xml_exports_by_ks2_sheet(payload)

    if len(contractor_exports) != 1:
        raise AssertionError(f'Expected exactly 1 contractor P export, got {len(contractor_exports)}')
    if len(customer_exports) != 1:
        raise AssertionError(f'Expected exactly 1 customer Z export, got {len(customer_exports)}')

    validate_exports(contractor_exports, P_XSD_PATH, 'contractor P')
    validate_exports(customer_exports, Z_XSD_PATH, 'customer Z')

    print('OK: modern-light sample pair regression passed (single-sheet P + Z)')


if __name__ == '__main__':
    main()
