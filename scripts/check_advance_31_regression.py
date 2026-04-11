#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
INPUT_JSON = ROOT / 'output' / 'multi-ks2-test-export.json'
XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_xml_from_export import (  # noqa: E402
    build_xml_exports_by_ks2_sheet,
    load_json,
    project_payload_to_single_ks2_sheet,
)


def render_xml_bytes(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def ensure_valid_against_xsd(xml_bytes: bytes, label: str) -> ET._Element:
    schema = ET.XMLSchema(ET.parse(str(XSD_PATH)))
    xml_doc = ET.fromstring(xml_bytes)
    if not schema.validate(xml_doc):
        errors = '\n'.join(f'line {err.line}: {err.message}' for err in schema.error_log)
        raise AssertionError(f'{label}: INVALID against XSD\n{errors}')
    return xml_doc


def build_payload() -> dict:
    data = load_json(INPUT_JSON)
    for index, sheet in enumerate(data.get('ks2Sheets', []), start=1):
        sheet['id'] = f'test-ks2-{index}'

    sheet_ids = [sheet['id'] for sheet in data.get('ks2Sheets', [])]
    if len(sheet_ids) != 2:
        raise AssertionError(f'Expected 2 KS2 sheets in fixture, got {len(sheet_ids)}')

    sections = data.get('holdbacks', {}).get('sections', [])
    if len(sections) < 3:
        raise AssertionError(f'Expected at least 3 holdback sections in fixture, got {len(sections)}')

    assignments = [sheet_ids[0], sheet_ids[0], sheet_ids[1]]
    for index, section in enumerate(sections):
        for key in ('ks2SheetId', 'linkedKs2SheetId', 'sheetId', 'ks2SheetIndex', 'linkedSheetIndex'):
            section.pop(key, None)
        section['ks2SheetId'] = assignments[index]

    return data


def main():
    data = build_payload()
    projected = project_payload_to_single_ks2_sheet(copy.deepcopy(data), 1)
    settlement = ((projected.get('xml') or {}).get('settlement') or {})

    rows = settlement.get('settlementRows') or []
    if [row.get('kindCode') for row in rows] != ['32', '31', '31', '31']:
        raise AssertionError(f'Unexpected settlement rows for code 31 projection: {rows!r}')

    first_advance = rows[1]
    if first_advance.get('documentNumber') != '871':
        raise AssertionError(f'Expected first 31 document number 871, got {first_advance!r}')
    if first_advance.get('documentDate') != '12.08.2025':
        raise AssertionError(f'Expected first 31 document date 12.08.2025, got {first_advance!r}')
    if settlement.get('representativeRow', {}).get('kindCode') != '32':
        raise AssertionError(f'Expected representative row 32, got {settlement.get("representativeRow")!r}')
    if round(float(settlement.get('totalAdvanceClose') or 0), 2) <= 0:
        raise AssertionError(f'Expected positive totalAdvanceClose, got {settlement.get("totalAdvanceClose")!r}')

    exports = build_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    second_export = next((item for item in exports if int(item.get('sheetIndex', -1)) == 1), None)
    if second_export is None:
        raise AssertionError('Second per-sheet XML export not found')

    xml_doc = ensure_valid_against_xsd(render_xml_bytes(second_export['tree']), second_export['filename'])
    if not xml_doc.xpath('.//СвОРасч/УчетТребУдерж/ВидУдерж[text()="32"]'):
        raise AssertionError('Expected XSD-ready representative row to stay on code 32')
    if not xml_doc.xpath('.//СвОРасч/УчетТребУдерж/ДокПодтСумУд/ТипИдДок[@НомерДок="871"][@ДатаДок="12.08.2025"]'):
        raise AssertionError('Expected supporting document to reuse the first informative 31 document (871 от 12.08.2025)')
    if not xml_doc.xpath('.//ИнфПолСвОРасч/ТекстИнф[@Идентиф="AVANS_DOC_NO"][@Значение="871"]'):
        raise AssertionError('Expected richer AVANS_DOC_NO info block for code 31 rows')
    if not xml_doc.xpath('.//ИнфПолСвОРасч/ТекстИнф[@Идентиф="AVANS_DOC_DATE"][@Значение="12.08.2025"]'):
        raise AssertionError('Expected richer AVANS_DOC_DATE info block for code 31 rows')

    print(f"{second_export['filename']}: VALID, settlementRows={len(rows)}, representative=32, firstAdvance=871/12.08.2025")
    print('OK: advance code 31 regression passed')


if __name__ == '__main__':
    main()
