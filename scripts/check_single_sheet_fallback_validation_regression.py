#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'
PRIMER_PATH = ROOT / 'saved-forms' / 'primer-zapolneniya.json'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_xml_from_export import build_xml_exports_by_ks2_sheet  # noqa: E402

FALLBACK_MANUAL_KEYS = [
    'contractorInn',
    'customerInn',
    'developerPostalIndex',
    'developerRegionCode',
    'estimateVersionCode',
    'supplementDocType',
    'supplementDocNumber',
    'supplementDocDate',
]


def main():
    schema = ET.XMLSchema(ET.parse(str(XSD_PATH)))
    payload = json.loads(PRIMER_PATH.read_text(encoding='utf-8'))
    mutated = copy.deepcopy(payload)

    for bucket_name in ['xmlP', 'xml']:
        bucket = mutated.setdefault(bucket_name, {})
        manual = bucket.setdefault('manual', {})
        for key in FALLBACK_MANUAL_KEYS:
            manual[key] = ''

    exports = build_xml_exports_by_ks2_sheet(mutated)
    if not exports:
        raise AssertionError('Expected per-sheet contractor exports, got none')

    for item in exports:
        xml_bytes = ET.tostring(item['tree'], encoding='windows-1251', xml_declaration=True)
        document = ET.fromstring(xml_bytes)
        if not schema.validate(document):
            last_error = schema.error_log.last_error
            raise AssertionError(
                f"Fallback regression failed for {item['filename']}: {last_error.message if last_error else 'XSD validation error'}"
            )

    print(f'OK: single-sheet fallback validation regression passed ({len(exports)} contractor XML files)')


if __name__ == '__main__':
    main()
