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


def ensure_valid_against_xsd(xml_bytes: bytes, label: str):
    schema = ET.XMLSchema(ET.parse(str(XSD_PATH)))
    xml_doc = ET.fromstring(xml_bytes)
    if not schema.validate(xml_doc):
        errors = '\n'.join(f'line {err.line}: {err.message}' for err in schema.error_log)
        raise AssertionError(f'{label}: INVALID against XSD\n{errors}')


def build_bound_payload() -> dict:
    data = load_json(INPUT_JSON)
    sheet_ids = []
    for index, sheet in enumerate(data.get('ks2Sheets', []), start=1):
        sheet['id'] = f'test-ks2-{index}'
        sheet_ids.append(sheet['id'])
    if len(sheet_ids) != 2:
        raise AssertionError(f'Expected 2 KS2 sheets in fixture, got {len(sheet_ids)}')

    sections = data.get('holdbacks', {}).get('sections', [])
    if len(sections) < 3:
        raise AssertionError(f'Expected at least 3 holdback sections in fixture, got {len(sections)}')

    assignments = [sheet_ids[1], sheet_ids[0], sheet_ids[1]]
    for index, section in enumerate(sections):
        for key in ('ks2SheetId', 'linkedKs2SheetId', 'sheetId', 'ks2SheetIndex', 'linkedSheetIndex'):
            section.pop(key, None)
        section['ks2SheetId'] = assignments[index] if index < len(assignments) else sheet_ids[0]

    sections[0]['name'] = 'КС-2 №1 по названию, но должна уйти во второй XML по явному ks2SheetId'
    sections[1]['name'] = 'КС-2 №2 по названию, но должна уйти в первый XML по явному ks2SheetId'
    sections[2]['name'] = 'Еще одна строка второго XML, даже если текст похож на первый лист'

    return data


def expect_projection_by_explicit_sheet_id():
    data = build_bound_payload()

    first_sheet = project_payload_to_single_ks2_sheet(copy.deepcopy(data), 0)
    second_sheet = project_payload_to_single_ks2_sheet(copy.deepcopy(data), 1)

    first_names = [section.get('name') for section in first_sheet.get('holdbacks', {}).get('sections', [])]
    second_names = [section.get('name') for section in second_sheet.get('holdbacks', {}).get('sections', [])]

    if first_names != ['КС-2 №2 по названию, но должна уйти в первый XML по явному ks2SheetId']:
        raise AssertionError(f'First sheet projection mismatch: {first_names!r}')
    if second_names != [
        'КС-2 №1 по названию, но должна уйти во второй XML по явному ks2SheetId',
        'Еще одна строка второго XML, даже если текст похож на первый лист',
    ]:
        raise AssertionError(f'Second sheet projection mismatch: {second_names!r}')

    exports = build_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    if len(exports) != 2:
        raise AssertionError(f'Expected 2 per-sheet XML exports, got {len(exports)}')

    for item in exports:
        xml_bytes = render_xml_bytes(item['tree'])
        ensure_valid_against_xsd(xml_bytes, item['filename'])
        print(f"{item['filename']}: VALID, sheetIndex={item['sheetIndex']}")


def expect_missing_binding_to_fail():
    invalid = build_bound_payload()
    section = invalid.get('holdbacks', {}).get('sections', [])[0]
    for key in ('ks2SheetId', 'linkedKs2SheetId', 'sheetId', 'ks2SheetIndex', 'linkedSheetIndex'):
        section.pop(key, None)

    try:
        project_payload_to_single_ks2_sheet(invalid, 0)
    except ValueError as exc:
        payload = json.loads(str(exc))
        errors = payload.get('validationErrors') or []
        if not errors:
            raise AssertionError('Expected validationErrors for missing ks2SheetId')
        if errors[0].get('path') != 'holdbacks.sections.0.ks2SheetId':
            raise AssertionError(f'Unexpected validation path: {errors!r}')
        print('Missing ks2SheetId: correctly rejected before per-sheet projection')
        return

    raise AssertionError('Expected per-sheet projection to reject a holdback section without ks2SheetId')


def main():
    expect_projection_by_explicit_sheet_id()
    expect_missing_binding_to_fail()
    print('OK: holdback ks2SheetId regression passed')


if __name__ == '__main__':
    main()
