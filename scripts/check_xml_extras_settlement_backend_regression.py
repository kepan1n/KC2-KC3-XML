#!/usr/bin/env python3
from __future__ import annotations

import copy
import sys
from pathlib import Path

from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
P_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABP_1_971_01_01_00_03.xsd'
Z_XSD_PATH = ROOT / 'nalog docs' / 'ON_AKTREZRABZ.xsd'
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


def build_xml_extras_payload() -> dict:
    data = load_json(MULTI_JSON)
    legacy_xml = copy.deepcopy(data.get('xml') or {})

    for index, sheet in enumerate(data.get('ks2Sheets', []), start=1):
        sheet['id'] = f'xml-extras-ks2-{index}'

    sheet_ids = [sheet['id'] for sheet in data.get('ks2Sheets', [])]
    if len(sheet_ids) != 2:
        raise AssertionError(f'Expected 2 KS2 sheets in fixture, got {len(sheet_ids)}')

    sections = data.get('holdbacks', {}).get('sections', [])
    assignments = [sheet_ids[0], sheet_ids[1], sheet_ids[1]]
    for index, section in enumerate(sections):
        for key in ('ks2SheetId', 'linkedKs2SheetId', 'sheetId', 'ks2SheetIndex', 'linkedSheetIndex'):
            section.pop(key, None)
        section['ks2SheetId'] = assignments[index] if index < len(assignments) else sheet_ids[-1]

    data['documentContext'] = copy.deepcopy(data.get('documentContext') or data.get('common') or {})
    data['xmlP'] = {
        'generated': copy.deepcopy(legacy_xml.get('generated') or {}),
        'constants': copy.deepcopy(legacy_xml.get('constants') or {}),
        'manual': copy.deepcopy(legacy_xml.get('manual') or {}),
        'traceableGoods': copy.deepcopy(legacy_xml.get('traceableGoods') or []),
    }
    data['xmlZ'] = {
        'manual': {},
    }
    data['xmlExtras'] = {
        'traceableGoods': copy.deepcopy(legacy_xml.get('traceableGoods') or []),
        'settlementRows': [
            {
                'source': 'manual',
                'kind': 'claim',
                'kindCode': '01',
                'amount': 125000.0,
                'documentRef': 'XML-EXTRAS-01 от 03.02.2026',
                'comment': 'Только первый лист',
                'ks2SheetId': sheet_ids[0],
                'isPrimary': True,
            },
            {
                'source': 'manual',
                'kind': 'withhold',
                'kindCode': '36',
                'amount': 77000.0,
                'documentRef': 'XML-EXTRAS-36 от 04.02.2026',
                'customKindText': 'Иное удержание из xmlExtras',
                'comment': 'Только второй лист',
                'ks2SheetId': sheet_ids[1],
                'isPrimary': True,
            },
        ],
    }
    data.pop('common', None)
    data.pop('xml', None)
    return data


def expect_contractor_exports_from_xml_extras_only():
    data = build_xml_extras_payload()
    exports = build_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    if len(exports) != 2:
        raise AssertionError(f'Expected 2 contractor exports, got {len(exports)}')

    expected = {
        0: {
            'claim': '01',
            'doc_number': 'XML-EXTRAS-01',
            'doc_date': '03.02.2026',
        },
        1: {
            'withhold': '36',
            'other_text': 'Иное удержание из xmlExtras',
            'doc_number': 'XML-EXTRAS-36',
            'doc_date': '04.02.2026',
        },
    }

    for item in exports:
        sheet_index = int(item['sheetIndex'])
        root = ensure_valid_against_xsd(render_xml_bytes(item['tree']), P_XSD_PATH, item['filename'])
        settlement_item = root.find('./Документ/СвОРасч/УчетТребУдерж')
        if settlement_item is None:
            raise AssertionError(f'Sheet {sheet_index}: missing УчетТребУдерж block')

        claim = settlement_item.findtext('ВидТреб')
        withhold = settlement_item.findtext('ВидУдерж')
        info = expected[sheet_index]
        if 'claim' in info:
            if claim != info['claim'] or withhold is not None:
                raise AssertionError(
                    f"Sheet {sheet_index}: xmlExtras claim row must survive per-sheet projection, got claim={claim!r}, withhold={withhold!r}"
                )
        else:
            other_text = settlement_item.findtext('ИнВидУдерж')
            if withhold != info['withhold'] or other_text != info['other_text']:
                raise AssertionError(
                    f"Sheet {sheet_index}: xmlExtras withhold row must survive per-sheet projection, got withhold={withhold!r}, other={other_text!r}"
                )

        doc = settlement_item.find('./ДокПодтСумУд/ТипИдДок')
        if doc is None:
            raise AssertionError(f'Sheet {sheet_index}: missing supporting settlement document')
        if doc.get('НомерДок') != info['doc_number'] or doc.get('ДатаДок') != info['doc_date']:
            raise AssertionError(
                f"Sheet {sheet_index}: expected settlement doc {info['doc_number']!r} / {info['doc_date']!r}, got {doc.get('НомерДок')!r} / {doc.get('ДатаДок')!r}"
            )

        print(f"contractor[{sheet_index}]: xmlExtras settlement rows projected correctly")


def expect_customer_pair_still_builds_without_common_and_xml():
    data = build_xml_extras_payload()
    exports = build_customer_xml_exports_by_ks2_sheet(copy.deepcopy(data))
    if len(exports) != 2:
        raise AssertionError(f'Expected 2 customer exports, got {len(exports)}')
    for item in exports:
        ensure_valid_against_xsd(render_xml_bytes(item['tree']), Z_XSD_PATH, item['filename'])
        print(f"customer[{int(item['sheetIndex'])}]: valid Z export without legacy common/xml")


def main():
    expect_contractor_exports_from_xml_extras_only()
    expect_customer_pair_still_builds_without_common_and_xml()
    print('OK: xmlExtras settlement backend regression passed')


if __name__ == '__main__':
    main()
