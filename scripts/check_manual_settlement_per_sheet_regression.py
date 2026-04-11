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
    for section in sections:
        for key in ('ks2SheetId', 'linkedKs2SheetId', 'sheetId', 'ks2SheetIndex', 'linkedSheetIndex'):
            section.pop(key, None)
        section['ks2SheetId'] = sheet_ids[1]

    data.setdefault('xml', {})['settlement'] = {
        'manualRows': [
            {
                'source': 'manual',
                'kind': 'claim',
                'kindCode': '01',
                'amount': 125000.0,
                'documentRef': 'MAN-01 от 01.02.2026',
                'comment': 'Ручное требование только для первого листа',
                'ks2SheetId': sheet_ids[0],
                'isPrimary': True,
            },
            {
                'source': 'manual',
                'kind': 'withhold',
                'kindCode': '36',
                'amount': 77000.0,
                'documentRef': 'MAN-36 от 02.02.2026',
                'customKindText': 'Иное удержание по согласованию сторон',
                'comment': 'Ручное удержание только для второго листа',
                'ks2SheetId': sheet_ids[1],
                'isPrimary': True,
            },
        ]
    }
    return data


def expect_projection_to_filter_manual_rows():
    data = build_payload()

    first_sheet = project_payload_to_single_ks2_sheet(copy.deepcopy(data), 0)
    second_sheet = project_payload_to_single_ks2_sheet(copy.deepcopy(data), 1)

    first_manual_rows = ((first_sheet.get('xml') or {}).get('settlement') or {}).get('manualRows') or []
    second_manual_rows = ((second_sheet.get('xml') or {}).get('settlement') or {}).get('manualRows') or []
    if len(first_manual_rows) != 1 or first_manual_rows[0].get('kindCode') != '01':
        raise AssertionError(f'Unexpected first-sheet manual rows: {first_manual_rows!r}')
    if len(second_manual_rows) != 1 or second_manual_rows[0].get('kindCode') != '36':
        raise AssertionError(f'Unexpected second-sheet manual rows: {second_manual_rows!r}')

    first_representative = ((first_sheet.get('xml') or {}).get('settlement') or {}).get('representativeRow') or {}
    second_representative = ((second_sheet.get('xml') or {}).get('settlement') or {}).get('representativeRow') or {}
    if first_representative.get('kindCode') != '01':
        raise AssertionError(f'Expected first-sheet representative row 01, got {first_representative!r}')
    if second_representative.get('kindCode') != '36':
        raise AssertionError(f'Expected second-sheet representative row 36, got {second_representative!r}')

    exports = build_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    if len(exports) != 2:
        raise AssertionError(f'Expected 2 per-sheet XML exports, got {len(exports)}')

    first_export = next((item for item in exports if int(item.get('sheetIndex', -1)) == 0), None)
    second_export = next((item for item in exports if int(item.get('sheetIndex', -1)) == 1), None)
    if first_export is None or second_export is None:
        raise AssertionError('Per-sheet XML exports not found')

    first_xml = ensure_valid_against_xsd(render_xml_bytes(first_export['tree']), first_export['filename'])
    second_xml = ensure_valid_against_xsd(render_xml_bytes(second_export['tree']), second_export['filename'])

    if not first_xml.xpath('.//СвОРасч/УчетТребУдерж/ВидТреб[text()="01"]'):
        raise AssertionError('Expected first per-sheet XML to keep only manual claim row 01')
    if not first_xml.xpath('.//СвОРасч/УчетТребУдерж/ДокПодтСумУд/ТипИдДок[@НомерДок="MAN-01"][@ДатаДок="01.02.2026"]'):
        raise AssertionError('Expected first per-sheet XML to keep manual document MAN-01 / 01.02.2026')

    if not second_xml.xpath('.//СвОРасч/УчетТребУдерж/ВидУдерж[text()="36"]'):
        raise AssertionError('Expected second per-sheet XML to keep manual withhold row 36 as representative')
    if not second_xml.xpath('.//СвОРасч/УчетТребУдерж/ИнВидУдерж[text()="Иное удержание по согласованию сторон"]'):
        raise AssertionError('Expected second per-sheet XML to keep custom text for code 36')
    if not second_xml.xpath('.//СвОРасч/УчетТребУдерж/ДокПодтСумУд/ТипИдДок[@НомерДок="MAN-36"][@ДатаДок="02.02.2026"]'):
        raise AssertionError('Expected second per-sheet XML to keep manual document MAN-36 / 02.02.2026')

    print(f"{first_export['filename']}: VALID, representative=01, manualRows=1")
    print(f"{second_export['filename']}: VALID, representative=36, manualRows=1")


def expect_missing_manual_binding_to_fail():
    invalid = build_payload()
    invalid['xml']['settlement']['manualRows'][0].pop('ks2SheetId', None)

    try:
        project_payload_to_single_ks2_sheet(invalid, 0)
    except ValueError as exc:
        payload = json.loads(str(exc))
        errors = payload.get('validationErrors') or []
        if not any(error.get('path') == 'xml.settlement.manualRows.0.ks2SheetId' for error in errors):
            raise AssertionError(f'Expected validation error for missing manual settlement ks2SheetId, got {errors!r}')
        print('Missing manual-row ks2SheetId: correctly rejected before per-sheet projection')
        return

    raise AssertionError('Expected per-sheet projection to reject manual settlement row without ks2SheetId')


def main():
    expect_projection_to_filter_manual_rows()
    expect_missing_manual_binding_to_fail()
    print('OK: manual per-sheet settlement regression passed')


if __name__ == '__main__':
    main()
