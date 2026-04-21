#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
P_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'
Z_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABZ.xsd'
SMALL_SAMPLE_JSON = ROOT / 'output' / 'small-sample-export.json'
MULTI_JSON = ROOT / 'output' / 'multi-ks2-test-export.json'

sys.path.insert(0, str(ROOT / 'scripts'))
from generate_customer_xml_from_export import build_customer_xml_exports_by_ks2_sheet  # noqa: E402
from generate_xml_from_export import build_xml_exports_by_ks2_sheet, load_json  # noqa: E402
from z_xsd_compat import normalize_document_for_xsd  # noqa: E402


def render_xml_bytes(tree: ET._ElementTree) -> bytes:
    return ET.tostring(tree, encoding='windows-1251', xml_declaration=True, pretty_print=True)


def ensure_valid_against_xsd(xml_bytes: bytes, xsd_path: Path, label: str) -> ET._Element:
    schema = ET.XMLSchema(ET.parse(str(xsd_path)))
    xml_doc = ET.fromstring(xml_bytes)
    xml_doc = normalize_document_for_xsd(xml_doc, xsd_path)
    if not schema.validate(xml_doc):
        errors = '\n'.join(f'line {err.line}: {err.message}' for err in schema.error_log)
        raise AssertionError(f'{label}: INVALID against XSD\n{errors}')
    return xml_doc


def contractor_id_from_tree(tree: ET._ElementTree) -> str:
    root = tree.getroot()
    return str(root.get('ИдФайл') or '').strip()


def referenced_contractor_id(customer_tree: ET._ElementTree) -> str:
    root = customer_tree.getroot()
    node = root.find('./Документ/ИдИнфПодр')
    return str(node.get('ИдФайлИнфПодр') if node is not None else '').strip()


def build_bound_multi_payload() -> dict:
    data = load_json(MULTI_JSON)
    for index, sheet in enumerate(data.get('ks2Sheets', []), start=1):
        sheet['id'] = f'test-ks2-{index}'

    sheet_ids = [sheet['id'] for sheet in data.get('ks2Sheets', [])]
    if len(sheet_ids) != 2:
        raise AssertionError(f'Expected 2 KS2 sheets in fixture, got {len(sheet_ids)}')

    sections = data.get('holdbacks', {}).get('sections', [])
    assignments = [sheet_ids[0], sheet_ids[1], sheet_ids[1]]
    for index, section in enumerate(sections):
        for key in ('ks2SheetId', 'linkedKs2SheetId', 'sheetId', 'ks2SheetIndex', 'linkedSheetIndex'):
            section.pop(key, None)
        section['ks2SheetId'] = assignments[index] if index < len(assignments) else sheet_ids[-1]

    data.setdefault('xml', {}).setdefault('settlement', {})['manualRows'] = [
        {
            'source': 'manual',
            'kind': 'claim',
            'kindCode': '01',
            'amount': 125000.0,
            'documentRef': 'PAIR-01 от 03.02.2026',
            'comment': 'Только первый лист',
            'ks2SheetId': sheet_ids[0],
            'isPrimary': True,
        },
        {
            'source': 'manual',
            'kind': 'withhold',
            'kindCode': '36',
            'amount': 77000.0,
            'documentRef': 'PAIR-36 от 04.02.2026',
            'customKindText': 'Иное удержание для второго листа',
            'comment': 'Только второй лист',
            'ks2SheetId': sheet_ids[1],
            'isPrimary': True,
        },
    ]
    return data


def expect_single_sheet_pair():
    data = load_json(SMALL_SAMPLE_JSON)
    contractor_exports = build_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    customer_exports = build_customer_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    if len(contractor_exports) != 1 or len(customer_exports) != 1:
        raise AssertionError('Expected one P and one Z export for single-sheet sample')

    contractor_xml = ensure_valid_against_xsd(render_xml_bytes(contractor_exports[0]['tree']), P_XSD_PATH, contractor_exports[0]['filename'])
    customer_xml = ensure_valid_against_xsd(render_xml_bytes(customer_exports[0]['tree']), Z_XSD_PATH, customer_exports[0]['filename'])

    contractor_id = contractor_xml.get('ИдФайл')
    referenced_node = customer_xml.find('./Документ/ИдИнфПодр')
    referenced_id = referenced_node.get('ИдФайлИнфПодр') if referenced_node is not None else None
    if contractor_id != referenced_id:
        raise AssertionError(f'Single-sheet customer XML must reference contractor XML id {contractor_id!r}, got {referenced_id!r}')

    print(f"single-sheet: VALID pair {contractor_exports[0]['filename']} + {customer_exports[0]['filename']}")


def expect_multi_sheet_pairs():
    data = build_bound_multi_payload()
    contractor_exports = build_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    customer_exports = build_customer_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    if len(contractor_exports) != 2 or len(customer_exports) != 2:
        raise AssertionError(f'Expected 2 P and 2 Z exports, got {len(contractor_exports)} and {len(customer_exports)}')

    customer_by_sheet = {int(item['sheetIndex']): item for item in customer_exports}
    for contractor_item in contractor_exports:
        sheet_index = int(contractor_item['sheetIndex'])
        customer_item = customer_by_sheet.get(sheet_index)
        if customer_item is None:
            raise AssertionError(f'Missing customer export for sheet {sheet_index}')

        contractor_tree = ensure_valid_against_xsd(render_xml_bytes(contractor_item['tree']), P_XSD_PATH, contractor_item['filename'])
        customer_tree = ensure_valid_against_xsd(render_xml_bytes(customer_item['tree']), Z_XSD_PATH, customer_item['filename'])

        contractor_id = contractor_tree.get('ИдФайл')
        referenced_node = customer_tree.find('./Документ/ИдИнфПодр')
        referenced_id = referenced_node.get('ИдФайлИнфПодр') if referenced_node is not None else None
        if contractor_id != referenced_id:
            raise AssertionError(
                f'Sheet {sheet_index}: customer XML must reference contractor XML id {contractor_id!r}, got {referenced_id!r}'
            )

        customer_doc = customer_tree.find('./Документ/СодФХЖ4')
        expected_doc_number = str((customer_item['projected'].get('ks2Sheets') or [{}])[0].get('document', {}).get('number') or '')
        actual_doc_number = customer_doc.get('НомПостДок') if customer_doc is not None else None
        if expected_doc_number and expected_doc_number != actual_doc_number:
            raise AssertionError(
                f'Sheet {sheet_index}: customer XML must use per-sheet document number {expected_doc_number!r}, got {actual_doc_number!r}'
            )

        print(f"multi-sheet[{sheet_index}]: VALID pair {contractor_item['filename']} + {customer_item['filename']}")


def main():
    expect_single_sheet_pair()
    expect_multi_sheet_pairs()
    print('OK: customer per-sheet pair regression passed')


if __name__ == '__main__':
    main()
